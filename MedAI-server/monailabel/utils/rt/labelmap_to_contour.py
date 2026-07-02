"""
Labelmap to Contour Extractor

Extracts contours from 3D labelmaps for RTSTRUCT export.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

try:
    from skimage.measure import find_contours
except ImportError:
    find_contours = None

try:
    from shapely.geometry import Polygon
    from shapely.simplify import simplify
except ImportError:
    Polygon = None
    simplify = None

from .rtstruct_parser import ContourSlice
from .contour_to_labelmap import CTSeriesInfo

logger = logging.getLogger(__name__)


@dataclass
class ExtractedContour:
    """An extracted contour ready for RTSTRUCT export."""

    label_name: str
    label_value: int
    color: Tuple[int, int, int]
    contours: List[ContourSlice]

    @property
    def slice_count(self) -> int:
        return len(self.contours)


class LabelmapToContourExtractor:
    """
    Extracts contours from 3D labelmaps using marching squares.

    Converts segmentation labelmaps back to polygon contours for
    RTSTRUCT export.
    """

    def __init__(
        self,
        ct_info: CTSeriesInfo,
        simplify_tolerance: float = 0.5,
        min_points: int = 3,
    ):
        """
        Initialize the extractor.

        Args:
            ct_info: CT series information for coordinate transformation
            simplify_tolerance: Tolerance for contour simplification (mm)
            min_points: Minimum points for a valid contour
        """
        if find_contours is None:
            raise ImportError(
                "scikit-image is required. Install with: pip install scikit-image"
            )

        self.ct_info = ct_info
        self.simplify_tolerance = simplify_tolerance
        self.min_points = min_points
        self._affine = self._compute_affine()

    def _compute_affine(self) -> np.ndarray:
        """Compute the affine matrix for IJK to LPS transformation."""
        spacing = np.diag(list(self.ct_info.spacing) + [1])
        origin = np.eye(4)
        origin[:3, 3] = self.ct_info.origin

        direction = np.eye(4)
        direction[:3, :3] = self.ct_info.direction

        return origin @ direction @ spacing

    def ijk_to_lps(self, points: np.ndarray) -> np.ndarray:
        """
        Transform points from IJK (voxel) to LPS (world) coordinates.

        Args:
            points: Nx3 array of IJK coordinates

        Returns:
            Nx3 array of LPS coordinates
        """
        ones = np.ones((points.shape[0], 1))
        points_h = np.hstack([points, ones])
        lps_h = (self._affine @ points_h.T).T
        return lps_h[:, :3]

    def _simplify_contour(self, points: np.ndarray) -> np.ndarray:
        """
        Simplify a contour using Douglas-Peucker algorithm.

        Args:
            points: Nx2 array of contour points

        Returns:
            Simplified Nx2 array
        """
        if Polygon is None or self.simplify_tolerance <= 0:
            return points

        if len(points) < 4:
            return points

        try:
            # Create polygon and simplify
            poly = Polygon(points)
            simplified = poly.simplify(self.simplify_tolerance, preserve_topology=True)

            if simplified.is_empty:
                return points

            # Extract exterior coordinates
            coords = np.array(simplified.exterior.coords[:-1])  # Remove closing point
            return coords
        except Exception as e:
            logger.warning(f"Contour simplification failed: {e}")
            return points

    def extract_slice_contours(
        self,
        slice_mask: np.ndarray,
        slice_idx: int,
        sop_instance_uid: str = "",
    ) -> List[ContourSlice]:
        """
        Extract contours from a single slice mask.

        Args:
            slice_mask: 2D binary mask (Y, X)
            slice_idx: Index of this slice in the volume
            sop_instance_uid: Referenced SOP Instance UID

        Returns:
            List of ContourSlice objects
        """
        if slice_mask.max() == 0:
            return []

        # Find contours at 0.5 level (marching squares)
        contours_2d = find_contours(slice_mask.astype(float), 0.5)

        result = []
        for contour_2d in contours_2d:
            if len(contour_2d) < self.min_points:
                continue

            # contour_2d is (N, 2) with (row, col) = (y, x)
            # Simplify the contour
            simplified = self._simplify_contour(contour_2d)

            if len(simplified) < self.min_points:
                continue

            # Convert to IJK coordinates (x, y, z)
            # Note: contour_2d is (y, x), we need (x, y, z)
            ijk_points = np.zeros((len(simplified), 3))
            ijk_points[:, 0] = simplified[:, 1]  # x = col
            ijk_points[:, 1] = simplified[:, 0]  # y = row
            ijk_points[:, 2] = slice_idx

            # Transform to LPS world coordinates
            lps_points = self.ijk_to_lps(ijk_points)

            # Get z-position from first point
            z_position = lps_points[0, 2]

            result.append(
                ContourSlice(
                    referenced_sop_instance_uid=sop_instance_uid,
                    contour_data=lps_points,
                    contour_type="CLOSED_PLANAR",
                    z_position=z_position,
                )
            )

        return result

    def extract_label_contours(
        self,
        labelmap: np.ndarray,
        label_value: int,
        label_name: str = "Structure",
        color: Tuple[int, int, int] = (255, 0, 0),
        sop_instance_uids: Optional[Dict[int, str]] = None,
    ) -> ExtractedContour:
        """
        Extract contours for a single label value.

        Args:
            labelmap: 3D labelmap array (Z, Y, X)
            label_value: The label value to extract
            label_name: Name for the structure
            color: RGB color tuple
            sop_instance_uids: Optional map of slice index to SOP UID

        Returns:
            ExtractedContour with all slices
        """
        all_contours = []

        # Process each slice
        for z in range(labelmap.shape[0]):
            slice_mask = (labelmap[z] == label_value).astype(np.uint8)

            # Get SOP Instance UID for this slice
            sop_uid = ""
            if sop_instance_uids and z in sop_instance_uids:
                sop_uid = sop_instance_uids[z]

            slice_contours = self.extract_slice_contours(slice_mask, z, sop_uid)
            all_contours.extend(slice_contours)

        logger.info(
            f"Extracted {len(all_contours)} contour slices for '{label_name}'"
        )

        return ExtractedContour(
            label_name=label_name,
            label_value=label_value,
            color=color,
            contours=all_contours,
        )

    def extract_all_labels(
        self,
        labelmap: np.ndarray,
        label_names: Dict[int, str],
        label_colors: Optional[Dict[int, Tuple[int, int, int]]] = None,
        sop_instance_uids: Optional[Dict[int, str]] = None,
    ) -> List[ExtractedContour]:
        """
        Extract contours for all labels in a labelmap.

        Args:
            labelmap: 3D labelmap array (Z, Y, X)
            label_names: Map of label values to names
            label_colors: Optional map of label values to colors
            sop_instance_uids: Optional map of slice index to SOP UID

        Returns:
            List of ExtractedContour objects
        """
        results = []

        # Find unique label values (excluding background 0)
        unique_labels = np.unique(labelmap)
        unique_labels = unique_labels[unique_labels > 0]

        for label_value in unique_labels:
            label_name = label_names.get(int(label_value), f"Structure_{label_value}")

            # Get color
            if label_colors and int(label_value) in label_colors:
                color = label_colors[int(label_value)]
            else:
                # Default colors based on index
                default_colors = [
                    (255, 0, 0),
                    (0, 255, 0),
                    (0, 0, 255),
                    (255, 255, 0),
                    (255, 0, 255),
                    (0, 255, 255),
                    (255, 128, 0),
                    (128, 0, 255),
                ]
                color = default_colors[int(label_value) % len(default_colors)]

            extracted = self.extract_label_contours(
                labelmap,
                int(label_value),
                label_name,
                color,
                sop_instance_uids,
            )

            if extracted.slice_count > 0:
                results.append(extracted)

        logger.info(f"Extracted contours for {len(results)} labels")
        return results


def labelmap_to_contours(
    labelmap: np.ndarray,
    ct_info: CTSeriesInfo,
    label_names: Dict[int, str],
    label_colors: Optional[Dict[int, Tuple[int, int, int]]] = None,
    simplify_tolerance: float = 0.5,
) -> List[ExtractedContour]:
    """
    Convenience function to extract contours from a labelmap.

    Args:
        labelmap: 3D labelmap array (Z, Y, X)
        ct_info: CT series information
        label_names: Map of label values to names
        label_colors: Optional map of label values to colors
        simplify_tolerance: Tolerance for contour simplification (mm)

    Returns:
        List of ExtractedContour objects
    """
    extractor = LabelmapToContourExtractor(ct_info, simplify_tolerance)
    return extractor.extract_all_labels(labelmap, label_names, label_colors)
