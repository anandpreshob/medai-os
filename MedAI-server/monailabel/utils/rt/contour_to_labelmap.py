"""
Contour to Labelmap Converter

Converts RTSTRUCT contours to 3D labelmaps.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

try:
    from skimage.draw import polygon as draw_polygon
except ImportError:
    draw_polygon = None

try:
    import nibabel as nib
except ImportError:
    nib = None

from .rtstruct_parser import ROIContour, ContourSlice

logger = logging.getLogger(__name__)


@dataclass
class CTSeriesInfo:
    """
    Information about the CT series for coordinate transformation.

    Attributes:
        shape: Volume shape (Z, Y, X)
        spacing: Voxel spacing in mm (X, Y, Z)
        origin: Volume origin in LPS coordinates (X, Y, Z)
        direction: 3x3 direction cosine matrix
        slice_positions: List of z-positions for each slice
        sop_instance_uids: Map of z-position to SOP Instance UID
    """

    shape: Tuple[int, int, int]  # (Z, Y, X)
    spacing: Tuple[float, float, float]  # (X, Y, Z)
    origin: Tuple[float, float, float]  # (X, Y, Z)
    direction: np.ndarray  # 3x3 direction matrix
    slice_positions: List[float]
    sop_instance_uids: Dict[str, float] = None  # UID -> z-position

    @classmethod
    def from_nifti(cls, nifti_path: Union[str, Path]) -> "CTSeriesInfo":
        """
        Create CTSeriesInfo from a NIfTI file.

        Args:
            nifti_path: Path to the NIfTI file

        Returns:
            CTSeriesInfo instance
        """
        if nib is None:
            raise ImportError("nibabel is required. Install with: pip install nibabel")

        img = nib.load(str(nifti_path))
        header = img.header
        affine = img.affine

        # Get shape (stored as X, Y, Z in NIfTI, we want Z, Y, X)
        shape = img.shape
        if len(shape) == 3:
            shape = (shape[2], shape[1], shape[0])
        else:
            raise ValueError(f"Expected 3D volume, got shape: {img.shape}")

        # Get spacing from header
        spacing = tuple(header.get_zooms()[:3])

        # Get origin from affine (first 3 elements of last column)
        origin = tuple(affine[:3, 3])

        # Get direction from affine
        direction = affine[:3, :3] / np.array(spacing)

        # Calculate slice positions
        z_count = shape[0]
        z_spacing = spacing[2]
        z_origin = origin[2]
        slice_positions = [z_origin + i * z_spacing for i in range(z_count)]

        return cls(
            shape=shape,
            spacing=spacing,
            origin=origin,
            direction=direction,
            slice_positions=slice_positions,
        )


class ContourToLabelmapConverter:
    """
    Converts RTSTRUCT contours to 3D labelmaps.

    Uses polygon filling to rasterize contours onto a 3D volume.
    """

    def __init__(self, ct_info: CTSeriesInfo):
        """
        Initialize the converter.

        Args:
            ct_info: CT series information for coordinate transformation
        """
        if draw_polygon is None:
            raise ImportError(
                "scikit-image is required. Install with: pip install scikit-image"
            )

        self.ct_info = ct_info
        self._inverse_affine = self._compute_inverse_affine()

    def _compute_inverse_affine(self) -> np.ndarray:
        """Compute the inverse affine for LPS to IJK transformation."""
        # Build affine matrix from CT info
        spacing = np.diag(list(self.ct_info.spacing) + [1])
        origin = np.eye(4)
        origin[:3, 3] = self.ct_info.origin

        # If direction is identity, simplified calculation
        direction = np.eye(4)
        direction[:3, :3] = self.ct_info.direction

        affine = origin @ direction @ spacing
        return np.linalg.inv(affine)

    def lps_to_ijk(self, points: np.ndarray) -> np.ndarray:
        """
        Transform points from LPS (world) coordinates to IJK (voxel) coordinates.

        Args:
            points: Nx3 array of LPS coordinates

        Returns:
            Nx3 array of IJK coordinates
        """
        # Add homogeneous coordinate
        ones = np.ones((points.shape[0], 1))
        points_h = np.hstack([points, ones])

        # Apply inverse affine
        ijk_h = (self._inverse_affine @ points_h.T).T

        # Return without homogeneous coordinate
        return ijk_h[:, :3]

    def _find_slice_index(self, z_position: float, tolerance: float = 0.5) -> Optional[int]:
        """
        Find the slice index for a given z-position.

        Args:
            z_position: Z coordinate in world space
            tolerance: Tolerance in mm for matching slice positions

        Returns:
            Slice index, or None if not found
        """
        for i, slice_z in enumerate(self.ct_info.slice_positions):
            if abs(slice_z - z_position) < tolerance:
                return i

        # If no exact match, try nearest slice
        distances = [abs(z - z_position) for z in self.ct_info.slice_positions]
        min_dist = min(distances)
        if min_dist < self.ct_info.spacing[2] * 1.5:  # Within 1.5 slice spacing
            return distances.index(min_dist)

        return None

    def fill_contour_slice(
        self,
        contour: ContourSlice,
        labelmap: np.ndarray,
        label_value: int,
    ) -> bool:
        """
        Fill a single contour slice into the labelmap.

        Args:
            contour: The contour slice to fill
            labelmap: 3D labelmap array to modify (Z, Y, X)
            label_value: The label value to fill with

        Returns:
            True if successfully filled, False otherwise
        """
        if len(contour.contour_data) < 3:
            logger.warning(f"Contour has < 3 points, skipping")
            return False

        # Get z-position and find slice index
        z_pos = contour.z_position
        if z_pos is None:
            z_pos = contour.contour_data[0, 2]

        slice_idx = self._find_slice_index(z_pos)
        if slice_idx is None:
            logger.warning(f"No matching slice for z={z_pos:.2f}")
            return False

        # Transform contour points to IJK
        ijk_points = self.lps_to_ijk(contour.contour_data)

        # Get X and Y coordinates (in image space)
        x_coords = ijk_points[:, 0]
        y_coords = ijk_points[:, 1]

        # Clip to valid range
        x_coords = np.clip(x_coords, 0, self.ct_info.shape[2] - 1)
        y_coords = np.clip(y_coords, 0, self.ct_info.shape[1] - 1)

        # Fill polygon
        try:
            rr, cc = draw_polygon(y_coords, x_coords, shape=labelmap.shape[1:])
            labelmap[slice_idx, rr, cc] = label_value
            return True
        except Exception as e:
            logger.warning(f"Failed to fill contour at slice {slice_idx}: {e}")
            return False

    def convert_roi(
        self,
        roi: ROIContour,
        label_value: int = 1,
    ) -> np.ndarray:
        """
        Convert a single ROI contour to a 3D labelmap.

        Args:
            roi: The ROI contour to convert
            label_value: The label value to use

        Returns:
            3D numpy array labelmap
        """
        # Create empty labelmap
        labelmap = np.zeros(self.ct_info.shape, dtype=np.uint8)

        # Fill each contour slice
        filled_count = 0
        for contour in roi.contours:
            if self.fill_contour_slice(contour, labelmap, label_value):
                filled_count += 1

        logger.info(
            f"Converted ROI '{roi.roi_name}': {filled_count}/{len(roi.contours)} slices"
        )

        return labelmap

    def convert_all_rois(
        self,
        rois: List[ROIContour],
    ) -> Tuple[np.ndarray, Dict[int, str]]:
        """
        Convert all ROI contours to a single multi-label labelmap.

        Args:
            rois: List of ROI contours

        Returns:
            Tuple of (labelmap, label_map) where label_map maps label values to names
        """
        # Create empty labelmap
        labelmap = np.zeros(self.ct_info.shape, dtype=np.uint8)
        label_map: Dict[int, str] = {}

        # Convert each ROI with incrementing label values
        for i, roi in enumerate(rois, start=1):
            roi_mask = self.convert_roi(roi, label_value=1)
            # Add to combined labelmap (later ROIs overwrite earlier)
            labelmap[roi_mask > 0] = i
            label_map[i] = roi.roi_name

        logger.info(f"Converted {len(rois)} ROIs to multi-label labelmap")

        return labelmap, label_map


def contour_to_labelmap(
    rois: List[ROIContour],
    ct_info: CTSeriesInfo,
) -> Tuple[np.ndarray, Dict[int, str]]:
    """
    Convenience function to convert ROI contours to labelmap.

    Args:
        rois: List of ROI contours from RTSTRUCT
        ct_info: CT series information

    Returns:
        Tuple of (labelmap, label_map)
    """
    converter = ContourToLabelmapConverter(ct_info)
    return converter.convert_all_rois(rois)
