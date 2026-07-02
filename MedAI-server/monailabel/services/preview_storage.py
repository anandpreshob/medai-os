# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Preview Storage Service - Temporary storage for preview segmentations.

Handles storage of preview segmentations before user confirmation,
with TTL-based cleanup and quick retrieval for the confirmation flow.
"""

import asyncio
import hashlib
import io
import logging
import os
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class PreviewMetadata:
    """Metadata for a preview segmentation."""

    preview_id: str
    session_id: str
    model_used: str
    created_at: datetime
    expires_at: datetime
    labels: List[Dict[str, Any]]
    prompt_used: Optional[str] = None
    inference_time_ms: float = 0.0
    confidence: Optional[float] = None
    thumbnail_path: Optional[str] = None
    source_image_id: Optional[str] = None
    is_3d: bool = False
    shape: Optional[Tuple[int, ...]] = None
    dtype: str = "uint8"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "preview_id": self.preview_id,
            "session_id": self.session_id,
            "model_used": self.model_used,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "labels": self.labels,
            "prompt_used": self.prompt_used,
            "inference_time_ms": self.inference_time_ms,
            "confidence": self.confidence,
            "thumbnail_path": self.thumbnail_path,
            "source_image_id": self.source_image_id,
            "is_3d": self.is_3d,
            "shape": self.shape,
            "dtype": self.dtype,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PreviewMetadata":
        """Create from dictionary."""
        return cls(
            preview_id=data["preview_id"],
            session_id=data["session_id"],
            model_used=data["model_used"],
            created_at=datetime.fromisoformat(data["created_at"]),
            expires_at=datetime.fromisoformat(data["expires_at"]),
            labels=data.get("labels", []),
            prompt_used=data.get("prompt_used"),
            inference_time_ms=data.get("inference_time_ms", 0.0),
            confidence=data.get("confidence"),
            thumbnail_path=data.get("thumbnail_path"),
            source_image_id=data.get("source_image_id"),
            is_3d=data.get("is_3d", False),
            shape=tuple(data["shape"]) if data.get("shape") else None,
            dtype=data.get("dtype", "uint8"),
        )


@dataclass
class PreviewEntry:
    """A preview entry with metadata and data reference."""

    metadata: PreviewMetadata
    data_path: str  # Path to numpy file
    _data_cache: Optional[np.ndarray] = field(default=None, repr=False)

    @property
    def is_expired(self) -> bool:
        """Check if preview has expired."""
        return datetime.utcnow() > self.metadata.expires_at

    def load_data(self) -> Optional[np.ndarray]:
        """Load segmentation data from disk."""
        if self._data_cache is not None:
            return self._data_cache

        try:
            if os.path.exists(self.data_path):
                self._data_cache = np.load(self.data_path)["data"]
                return self._data_cache
        except Exception as e:
            logger.error(f"Failed to load preview data from {self.data_path}: {e}")

        return None

    def clear_cache(self) -> None:
        """Clear cached data to free memory."""
        self._data_cache = None


class PreviewStorageService:
    """
    Manages temporary storage for preview segmentations.

    Features:
    - In-memory metadata with disk-backed data
    - TTL-based automatic cleanup
    - Quick retrieval by preview ID
    - Thumbnail generation
    - Memory-efficient data caching
    """

    def __init__(
        self,
        storage_dir: Optional[str] = None,
        default_ttl_minutes: int = 30,
        max_previews: int = 100,
        cleanup_interval_minutes: int = 5,
    ):
        """
        Initialize the preview storage service.

        Args:
            storage_dir: Directory for storing preview data (temp if None)
            default_ttl_minutes: Default TTL for previews
            max_previews: Maximum number of previews to keep
            cleanup_interval_minutes: How often to run cleanup
        """
        self._storage_dir = storage_dir or tempfile.mkdtemp(prefix="medai_previews_")
        self._default_ttl = timedelta(minutes=default_ttl_minutes)
        self._max_previews = max_previews
        self._cleanup_interval = timedelta(minutes=cleanup_interval_minutes)

        self._previews: Dict[str, PreviewEntry] = {}
        self._session_index: Dict[str, List[str]] = {}  # session_id -> preview_ids
        self._last_cleanup = datetime.utcnow()
        self._lock = asyncio.Lock()

        # Ensure storage directory exists
        os.makedirs(self._storage_dir, exist_ok=True)

        logger.info(
            f"PreviewStorageService initialized: "
            f"dir={self._storage_dir}, ttl={default_ttl_minutes}min, max={max_previews}"
        )

    def generate_preview_id(self) -> str:
        """Generate a unique preview ID."""
        return f"prev_{uuid.uuid4().hex[:12]}_{int(time.time())}"

    async def store_preview(
        self,
        session_id: str,
        segmentation_data: np.ndarray,
        model_used: str,
        labels: List[Dict[str, Any]],
        prompt_used: Optional[str] = None,
        inference_time_ms: float = 0.0,
        confidence: Optional[float] = None,
        source_image_id: Optional[str] = None,
        ttl_minutes: Optional[int] = None,
    ) -> PreviewMetadata:
        """
        Store a preview segmentation.

        Args:
            session_id: Viewer session ID
            segmentation_data: Numpy array of segmentation mask
            model_used: Name of the model used
            labels: List of label info dicts
            prompt_used: Text prompt if any
            inference_time_ms: Inference time
            confidence: Model confidence
            source_image_id: Source image ID
            ttl_minutes: Custom TTL (uses default if None)

        Returns:
            PreviewMetadata for the stored preview
        """
        async with self._lock:
            # Run cleanup if needed
            await self._maybe_cleanup()

            # Check capacity
            if len(self._previews) >= self._max_previews:
                await self._cleanup_oldest()

            preview_id = self.generate_preview_id()
            now = datetime.utcnow()
            ttl = timedelta(minutes=ttl_minutes) if ttl_minutes else self._default_ttl

            # Save data to disk
            data_path = os.path.join(self._storage_dir, f"{preview_id}.npz")
            np.savez_compressed(data_path, data=segmentation_data)

            # Generate thumbnail
            thumbnail_path = await self._generate_thumbnail(
                preview_id, segmentation_data, labels
            )

            # Create metadata
            metadata = PreviewMetadata(
                preview_id=preview_id,
                session_id=session_id,
                model_used=model_used,
                created_at=now,
                expires_at=now + ttl,
                labels=labels,
                prompt_used=prompt_used,
                inference_time_ms=inference_time_ms,
                confidence=confidence,
                thumbnail_path=thumbnail_path,
                source_image_id=source_image_id,
                is_3d=segmentation_data.ndim == 3,
                shape=segmentation_data.shape,
                dtype=str(segmentation_data.dtype),
            )

            # Create entry
            entry = PreviewEntry(metadata=metadata, data_path=data_path)
            self._previews[preview_id] = entry

            # Update session index
            if session_id not in self._session_index:
                self._session_index[session_id] = []
            self._session_index[session_id].append(preview_id)

            logger.info(
                f"Stored preview {preview_id} for session {session_id}, "
                f"shape={segmentation_data.shape}, labels={len(labels)}"
            )

            return metadata

    async def get_preview(self, preview_id: str) -> Optional[Tuple[PreviewMetadata, np.ndarray]]:
        """
        Get a preview by ID.

        Args:
            preview_id: Preview ID to retrieve

        Returns:
            Tuple of (metadata, data) or None if not found/expired
        """
        entry = self._previews.get(preview_id)

        if entry is None:
            return None

        if entry.is_expired:
            await self._remove_preview(preview_id)
            return None

        data = entry.load_data()
        if data is None:
            await self._remove_preview(preview_id)
            return None

        return entry.metadata, data

    async def get_preview_metadata(self, preview_id: str) -> Optional[PreviewMetadata]:
        """Get preview metadata only (without loading data)."""
        entry = self._previews.get(preview_id)

        if entry is None:
            return None

        if entry.is_expired:
            await self._remove_preview(preview_id)
            return None

        return entry.metadata

    async def get_session_previews(self, session_id: str) -> List[PreviewMetadata]:
        """Get all previews for a session."""
        preview_ids = self._session_index.get(session_id, [])
        results = []

        for preview_id in preview_ids:
            metadata = await self.get_preview_metadata(preview_id)
            if metadata:
                results.append(metadata)

        return results

    async def delete_preview(self, preview_id: str) -> bool:
        """
        Delete a preview (user rejection).

        Args:
            preview_id: Preview ID to delete

        Returns:
            True if deleted, False if not found
        """
        return await self._remove_preview(preview_id)

    async def confirm_preview(self, preview_id: str) -> Optional[Tuple[PreviewMetadata, np.ndarray]]:
        """
        Confirm and retrieve preview data for saving.

        This retrieves the data and removes it from preview storage
        (it should be saved to permanent storage after this).

        Args:
            preview_id: Preview ID to confirm

        Returns:
            Tuple of (metadata, data) or None if not found
        """
        result = await self.get_preview(preview_id)

        if result is not None:
            # Remove from preview storage (will be saved permanently)
            await self._remove_preview(preview_id, delete_files=False)

        return result

    async def extend_ttl(self, preview_id: str, additional_minutes: int = 15) -> bool:
        """
        Extend the TTL of a preview.

        Args:
            preview_id: Preview ID
            additional_minutes: Minutes to add to TTL

        Returns:
            True if extended, False if not found
        """
        entry = self._previews.get(preview_id)

        if entry is None or entry.is_expired:
            return False

        entry.metadata.expires_at += timedelta(minutes=additional_minutes)
        return True

    def get_thumbnail_url(self, preview_id: str) -> Optional[str]:
        """Get the URL/path for a preview thumbnail."""
        entry = self._previews.get(preview_id)
        if entry and entry.metadata.thumbnail_path:
            return entry.metadata.thumbnail_path
        return None

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics."""
        now = datetime.utcnow()
        active_count = sum(1 for e in self._previews.values() if not e.is_expired)

        # Calculate storage size
        total_size = 0
        for entry in self._previews.values():
            if os.path.exists(entry.data_path):
                total_size += os.path.getsize(entry.data_path)

        return {
            "total_previews": len(self._previews),
            "active_previews": active_count,
            "sessions_with_previews": len(self._session_index),
            "storage_dir": self._storage_dir,
            "total_size_mb": total_size / (1024 * 1024),
            "max_previews": self._max_previews,
            "default_ttl_minutes": self._default_ttl.total_seconds() / 60,
        }

    async def cleanup_expired(self) -> int:
        """
        Clean up all expired previews.

        Returns:
            Number of previews removed
        """
        async with self._lock:
            expired_ids = [
                pid for pid, entry in self._previews.items()
                if entry.is_expired
            ]

            for pid in expired_ids:
                await self._remove_preview(pid)

            if expired_ids:
                logger.info(f"Cleaned up {len(expired_ids)} expired previews")

            self._last_cleanup = datetime.utcnow()
            return len(expired_ids)

    async def cleanup_session(self, session_id: str) -> int:
        """
        Clean up all previews for a session.

        Args:
            session_id: Session ID to clean up

        Returns:
            Number of previews removed
        """
        preview_ids = self._session_index.get(session_id, []).copy()

        for pid in preview_ids:
            await self._remove_preview(pid)

        return len(preview_ids)

    def shutdown(self) -> None:
        """Clean up on shutdown."""
        # Clean up all previews
        for entry in self._previews.values():
            entry.clear_cache()
            try:
                if os.path.exists(entry.data_path):
                    os.remove(entry.data_path)
                if entry.metadata.thumbnail_path and os.path.exists(entry.metadata.thumbnail_path):
                    os.remove(entry.metadata.thumbnail_path)
            except Exception as e:
                logger.warning(f"Error cleaning up preview files: {e}")

        self._previews.clear()
        self._session_index.clear()

        logger.info("PreviewStorageService shutdown complete")

    async def _remove_preview(self, preview_id: str, delete_files: bool = True) -> bool:
        """Remove a preview and clean up files."""
        entry = self._previews.pop(preview_id, None)

        if entry is None:
            return False

        # Remove from session index
        session_id = entry.metadata.session_id
        if session_id in self._session_index:
            self._session_index[session_id] = [
                pid for pid in self._session_index[session_id]
                if pid != preview_id
            ]
            if not self._session_index[session_id]:
                del self._session_index[session_id]

        # Clear memory cache
        entry.clear_cache()

        # Delete files
        if delete_files:
            try:
                if os.path.exists(entry.data_path):
                    os.remove(entry.data_path)
                if entry.metadata.thumbnail_path and os.path.exists(entry.metadata.thumbnail_path):
                    os.remove(entry.metadata.thumbnail_path)
            except Exception as e:
                logger.warning(f"Error deleting preview files: {e}")

        return True

    async def _maybe_cleanup(self) -> None:
        """Run cleanup if enough time has passed."""
        if datetime.utcnow() - self._last_cleanup > self._cleanup_interval:
            await self.cleanup_expired()

    async def _cleanup_oldest(self) -> None:
        """Remove oldest previews when at capacity."""
        # Sort by creation time
        sorted_entries = sorted(
            self._previews.items(),
            key=lambda x: x[1].metadata.created_at
        )

        # Remove oldest 20%
        to_remove = max(1, len(sorted_entries) // 5)
        for preview_id, _ in sorted_entries[:to_remove]:
            await self._remove_preview(preview_id)

        logger.info(f"Removed {to_remove} oldest previews due to capacity")

    async def _generate_thumbnail(
        self,
        preview_id: str,
        data: np.ndarray,
        labels: List[Dict[str, Any]],
    ) -> Optional[str]:
        """
        Generate a thumbnail image for the preview.

        Args:
            preview_id: Preview ID
            data: Segmentation data
            labels: Label info

        Returns:
            Path to thumbnail file or None
        """
        try:
            # Get middle slice for 3D data
            if data.ndim == 3:
                slice_idx = data.shape[0] // 2
                slice_data = data[slice_idx]
            else:
                slice_data = data

            # Create colored visualization
            height, width = slice_data.shape[:2]

            # Simple downsampling for thumbnail
            max_size = 128
            scale = min(max_size / height, max_size / width)
            new_h, new_w = int(height * scale), int(width * scale)

            # Create RGB thumbnail
            thumbnail = np.zeros((new_h, new_w, 3), dtype=np.uint8)

            # Color each label
            label_colors = {
                label["label_id"]: self._hex_to_rgb(label.get("color", "#FF6B6B"))
                for label in labels
            }

            # Downsample and color
            for y in range(new_h):
                for x in range(new_w):
                    orig_y = int(y / scale)
                    orig_x = int(x / scale)
                    label_val = slice_data[orig_y, orig_x]
                    if label_val > 0 and label_val in label_colors:
                        thumbnail[y, x] = label_colors[label_val]

            # Save as PNG using basic approach (avoiding PIL dependency)
            thumbnail_path = os.path.join(self._storage_dir, f"{preview_id}_thumb.npy")
            np.save(thumbnail_path, thumbnail)

            return thumbnail_path

        except Exception as e:
            logger.warning(f"Failed to generate thumbnail: {e}")
            return None

    def _hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """Convert hex color to RGB tuple."""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


# Global instance
_preview_storage: Optional[PreviewStorageService] = None


def get_preview_storage() -> PreviewStorageService:
    """Get or create the global preview storage instance."""
    global _preview_storage

    if _preview_storage is None:
        _preview_storage = PreviewStorageService()

    return _preview_storage


def reset_preview_storage() -> None:
    """Reset the preview storage (for testing)."""
    global _preview_storage

    if _preview_storage is not None:
        _preview_storage.shutdown()

    _preview_storage = None
