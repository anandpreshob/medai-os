# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
Save Annotation Tool - Save preview segmentation to final format.

MCP tool that saves confirmed preview segmentations to various formats
including NIfTI, DICOM-SEG, PNG, and can upload to PACS.
"""

import hashlib
import logging
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from ..schemas.annotation_schemas import (
    SaveAnnotationInput,
    SaveAnnotationOutput,
    SavedFileInfo,
)
from .base_tool import MCPTool

logger = logging.getLogger(__name__)


class SaveAnnotationTool(MCPTool):
    """
    MCP tool for saving confirmed preview segmentations.

    Saves segmentation data to various formats and optionally
    uploads to PACS for clinical workflow integration.
    """

    name = "save_annotation"
    description = (
        "Save a confirmed segmentation to a file. Use this after the user has "
        "reviewed and accepted a segmentation preview. Supports NIfTI (.nii.gz), "
        "DICOM-SEG, and PNG formats. Can save locally or upload to PACS."
    )
    input_schema = SaveAnnotationInput
    output_schema = SaveAnnotationOutput

    def __init__(self):
        super().__init__()
        self._preview_storage = None
        self._export_service = None
        self._pacs_client = None
        self._output_dir = None

    def _get_preview_storage(self):
        """Lazy-load the preview storage service."""
        if self._preview_storage is None:
            from ...services.preview_storage import get_preview_storage
            self._preview_storage = get_preview_storage()
        return self._preview_storage

    def _get_export_service(self):
        """Lazy-load the export service."""
        if self._export_service is None:
            try:
                from ...services.export import get_export_service
                self._export_service = get_export_service()
            except ImportError:
                logger.warning("Export service not available, using fallback")
        return self._export_service

    def _get_pacs_client(self):
        """Lazy-load the PACS client."""
        if self._pacs_client is None:
            try:
                from ...services.pacs import get_pacs_client
                self._pacs_client = get_pacs_client()
            except ImportError:
                logger.warning("PACS client not available")
        return self._pacs_client

    def _get_output_dir(self) -> str:
        """Get the output directory for saved files."""
        if self._output_dir is None:
            # Use environment variable or default
            self._output_dir = os.environ.get(
                "MEDAI_OUTPUT_DIR",
                os.path.join(tempfile.gettempdir(), "medai_output")
            )
            os.makedirs(self._output_dir, exist_ok=True)
        return self._output_dir

    async def execute(self, input_data: SaveAnnotationInput) -> SaveAnnotationOutput:
        """
        Execute save annotation operation.

        Args:
            input_data: Save parameters

        Returns:
            Result with saved file information
        """
        start_time = time.time()

        try:
            # Get preview from storage
            preview_storage = self._get_preview_storage()
            result = await preview_storage.confirm_preview(input_data.preview_id)

            if result is None:
                return SaveAnnotationOutput(
                    saved_files=[],
                    pacs_uid=None,
                    pacs_series_uid=None,
                    segmentation_id=f"error_{uuid.uuid4().hex[:8]}",
                    success=False,
                    message=f"Preview not found or expired: {input_data.preview_id}",
                )

            metadata, segmentation_data = result

            # Filter labels if specified
            if input_data.labels_to_save:
                segmentation_data = self._filter_labels(
                    segmentation_data, input_data.labels_to_save
                )

            # Generate segmentation ID
            segmentation_id = f"seg_{uuid.uuid4().hex[:12]}"

            saved_files: List[SavedFileInfo] = []
            pacs_uid = None
            pacs_series_uid = None

            # Build filename prefix
            if input_data.filename_prefix:
                prefix = input_data.filename_prefix
            else:
                # Use label names from metadata
                label_names = [l.get("label_name", "seg") for l in metadata.labels[:3]]
                prefix = "_".join(label_names)

            # Save to local if requested
            if input_data.destination in ("local", "both"):
                local_files = await self._save_local(
                    segmentation_data,
                    metadata,
                    input_data.format,
                    prefix,
                    input_data.include_metadata,
                )
                saved_files.extend(local_files)

            # Save to PACS if requested
            # Note: PACS requires DICOM format, so we convert to DICOM-SEG regardless of requested format
            if input_data.destination in ("pacs", "both"):
                pacs_result = await self._save_to_pacs(
                    segmentation_data,
                    metadata,
                    input_data.include_metadata,
                )
                if pacs_result:
                    pacs_uid = pacs_result.get("sop_instance_uid")
                    pacs_series_uid = pacs_result.get("series_uid")
                    # If user requested NIfTI but saved to PACS, also save NIfTI locally for convenience
                    if input_data.format == "nifti" and input_data.destination == "pacs":
                        local_files = await self._save_local(
                            segmentation_data,
                            metadata,
                            "nifti",
                            prefix,
                            input_data.include_metadata,
                        )
                        saved_files.extend(local_files)
                        logger.info("Also saved NIfTI locally since PACS requires DICOM-SEG format")

            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(
                f"Saved annotation {segmentation_id}: "
                f"format={input_data.format}, files={len(saved_files)}, "
                f"pacs={'yes' if pacs_uid else 'no'}, time={elapsed_ms:.1f}ms"
            )

            return SaveAnnotationOutput(
                saved_files=saved_files,
                pacs_uid=pacs_uid,
                pacs_series_uid=pacs_series_uid,
                segmentation_id=segmentation_id,
                success=True,
                message=f"Successfully saved {len(saved_files)} file(s)",
            )

        except Exception as e:
            logger.exception(f"Save annotation failed: {e}")
            return SaveAnnotationOutput(
                saved_files=[],
                pacs_uid=None,
                pacs_series_uid=None,
                segmentation_id=f"error_{uuid.uuid4().hex[:8]}",
                success=False,
                message=f"Save failed: {str(e)}",
            )

    def _filter_labels(
        self, data: np.ndarray, labels_to_keep: List[int]
    ) -> np.ndarray:
        """Filter segmentation to only include specified labels."""
        filtered = np.zeros_like(data)
        for label_id in labels_to_keep:
            filtered[data == label_id] = label_id
        return filtered

    async def _save_local(
        self,
        data: np.ndarray,
        metadata: Any,
        format: str,
        prefix: str,
        include_metadata: bool,
    ) -> List[SavedFileInfo]:
        """Save segmentation to local file."""
        saved_files = []
        output_dir = self._get_output_dir()

        if format == "nifti":
            saved_files.extend(
                await self._save_nifti(data, metadata, prefix, output_dir, include_metadata)
            )
        elif format == "dicom-seg":
            saved_files.extend(
                await self._save_dicom_seg(data, metadata, prefix, output_dir, include_metadata)
            )
        elif format == "png":
            saved_files.extend(
                await self._save_png(data, metadata, prefix, output_dir)
            )
        elif format == "npz":
            saved_files.extend(
                await self._save_npz(data, metadata, prefix, output_dir, include_metadata)
            )

        return saved_files

    async def _save_nifti(
        self,
        data: np.ndarray,
        metadata: Any,
        prefix: str,
        output_dir: str,
        include_metadata: bool,
    ) -> List[SavedFileInfo]:
        """Save as NIfTI format."""
        try:
            import nibabel as nib

            filename = f"{prefix}_{metadata.preview_id}.nii.gz"
            filepath = os.path.join(output_dir, filename)

            # Create NIfTI image
            # Use identity affine if not available
            affine = np.eye(4)

            # Create header with metadata
            nii_img = nib.Nifti1Image(data.astype(np.uint8), affine)

            if include_metadata:
                # Add description with model info
                nii_img.header["descrip"] = f"MedAI:{metadata.model_used}".encode()[:80]

            nib.save(nii_img, filepath)

            file_size = os.path.getsize(filepath)
            checksum = self._compute_checksum(filepath)

            return [
                SavedFileInfo(
                    path=filepath,
                    format="nifti",
                    size_bytes=file_size,
                    checksum=checksum,
                )
            ]

        except ImportError:
            logger.warning("nibabel not available, falling back to npz")
            return await self._save_npz(data, metadata, prefix, output_dir, include_metadata)

    async def _save_dicom_seg(
        self,
        data: np.ndarray,
        metadata: Any,
        prefix: str,
        output_dir: str,
        include_metadata: bool,
    ) -> List[SavedFileInfo]:
        """Save as DICOM-SEG format."""
        export_service = self._get_export_service()

        if export_service is not None:
            try:
                result = await export_service.export_dicom_seg(
                    segmentation_data=data,
                    labels=metadata.labels,
                    model_info=metadata.model_used if include_metadata else None,
                    output_dir=output_dir,
                    filename_prefix=prefix,
                )

                return [
                    SavedFileInfo(
                        path=result["path"],
                        format="dicom-seg",
                        size_bytes=result["size_bytes"],
                        checksum=result.get("checksum"),
                    )
                ]
            except Exception as e:
                logger.error(f"DICOM-SEG export failed: {e}")

        # Fallback: save as NIfTI with DICOM metadata in sidecar
        logger.warning("DICOM-SEG export not available, saving as NIfTI")
        return await self._save_nifti(data, metadata, prefix, output_dir, include_metadata)

    async def _save_png(
        self,
        data: np.ndarray,
        metadata: Any,
        prefix: str,
        output_dir: str,
    ) -> List[SavedFileInfo]:
        """Save as PNG images (one per slice for 3D)."""
        saved_files = []

        try:
            from PIL import Image

            # Define label colors
            label_colors = {}
            for label_info in metadata.labels:
                label_id = label_info.get("label_id", 1)
                color_hex = label_info.get("color", "#FF6B6B")
                label_colors[label_id] = self._hex_to_rgb(color_hex)

            if data.ndim == 3:
                # Save each slice
                for i in range(data.shape[0]):
                    slice_data = data[i]
                    filename = f"{prefix}_{metadata.preview_id}_slice{i:04d}.png"
                    filepath = os.path.join(output_dir, filename)

                    img = self._create_colored_image(slice_data, label_colors)
                    img.save(filepath)

                    saved_files.append(
                        SavedFileInfo(
                            path=filepath,
                            format="png",
                            size_bytes=os.path.getsize(filepath),
                            checksum=None,
                        )
                    )
            else:
                # Single 2D image
                filename = f"{prefix}_{metadata.preview_id}.png"
                filepath = os.path.join(output_dir, filename)

                img = self._create_colored_image(data, label_colors)
                img.save(filepath)

                saved_files.append(
                    SavedFileInfo(
                        path=filepath,
                        format="png",
                        size_bytes=os.path.getsize(filepath),
                        checksum=self._compute_checksum(filepath),
                    )
                )

        except ImportError:
            logger.warning("PIL not available for PNG export")

        return saved_files

    async def _save_npz(
        self,
        data: np.ndarray,
        metadata: Any,
        prefix: str,
        output_dir: str,
        include_metadata: bool,
    ) -> List[SavedFileInfo]:
        """Save as compressed numpy format."""
        filename = f"{prefix}_{metadata.preview_id}.npz"
        filepath = os.path.join(output_dir, filename)

        save_dict = {"data": data}

        if include_metadata:
            save_dict["metadata"] = {
                "model_used": metadata.model_used,
                "labels": metadata.labels,
                "created_at": metadata.created_at.isoformat(),
                "prompt_used": metadata.prompt_used,
                "confidence": metadata.confidence,
            }

        np.savez_compressed(filepath, **save_dict)

        return [
            SavedFileInfo(
                path=filepath,
                format="npz",
                size_bytes=os.path.getsize(filepath),
                checksum=self._compute_checksum(filepath),
            )
        ]

    async def _save_to_pacs(
        self,
        data: np.ndarray,
        metadata: Any,
        include_metadata: bool,
    ) -> Optional[Dict[str, str]]:
        """Upload segmentation to PACS."""
        pacs_client = self._get_pacs_client()

        if pacs_client is None:
            logger.warning("PACS client not available")
            return None

        try:
            # First export as DICOM-SEG
            temp_dir = tempfile.mkdtemp(prefix="pacs_upload_")
            export_service = self._get_export_service()

            if export_service is not None:
                dicom_files = await export_service.export_dicom_seg(
                    segmentation_data=data,
                    labels=metadata.labels,
                    model_info=metadata.model_used if include_metadata else None,
                    output_dir=temp_dir,
                    filename_prefix="upload",
                )

                # Upload to PACS
                result = await pacs_client.store(dicom_files["path"])

                return {
                    "sop_instance_uid": result.get("sop_instance_uid"),
                    "series_uid": result.get("series_uid"),
                }

        except Exception as e:
            logger.error(f"PACS upload failed: {e}")

        return None

    def _create_colored_image(
        self, data: np.ndarray, label_colors: Dict[int, tuple]
    ):
        """Create a colored PIL image from label mask."""
        from PIL import Image

        height, width = data.shape
        rgb_image = np.zeros((height, width, 4), dtype=np.uint8)

        for label_id, color in label_colors.items():
            mask = data == label_id
            rgb_image[mask, :3] = color
            rgb_image[mask, 3] = 180  # Semi-transparent

        return Image.fromarray(rgb_image, mode="RGBA")

    def _hex_to_rgb(self, hex_color: str) -> tuple:
        """Convert hex color to RGB tuple."""
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def _compute_checksum(self, filepath: str) -> str:
        """Compute MD5 checksum of file."""
        hash_md5 = hashlib.md5()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
