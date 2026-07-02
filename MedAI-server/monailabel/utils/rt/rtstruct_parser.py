"""
RTSTRUCT Parser

Parses DICOM RTSTRUCT files to extract ROI contours.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

try:
    import pydicom
    from pydicom.dataset import Dataset
except ImportError:
    pydicom = None
    Dataset = None

logger = logging.getLogger(__name__)


@dataclass
class ContourSlice:
    """A single contour slice (one z-plane)."""

    referenced_sop_instance_uid: str
    contour_data: np.ndarray  # Shape: (N, 3) - N points with x, y, z
    contour_type: str = "CLOSED_PLANAR"
    z_position: Optional[float] = None


@dataclass
class ROIContour:
    """
    A complete ROI contour with all slices.

    Attributes:
        roi_number: The ROI number from the RTSTRUCT
        roi_name: The structure name
        roi_type: The interpreted type (GTV, CTV, PTV, ORGAN, etc.)
        color: RGB color tuple (0-255)
        contours: List of contour slices
        observation_label: Optional ROI Observation label
        generation_algorithm: How the ROI was generated
    """

    roi_number: int
    roi_name: str
    roi_type: str
    color: Tuple[int, int, int]
    contours: List[ContourSlice] = field(default_factory=list)
    observation_label: Optional[str] = None
    generation_algorithm: str = "MANUAL"

    @property
    def slice_count(self) -> int:
        """Number of slices with contours."""
        return len(self.contours)

    @property
    def total_points(self) -> int:
        """Total number of contour points across all slices."""
        return sum(len(c.contour_data) for c in self.contours)

    def get_color_hex(self) -> str:
        """Get color as hex string."""
        return "#{:02X}{:02X}{:02X}".format(*self.color)


class RTStructParser:
    """
    Parser for DICOM RTSTRUCT files.

    Extracts ROI contours from RTSTRUCT and provides access to
    structure metadata.
    """

    def __init__(self, rtstruct_path: Union[str, Path]):
        """
        Initialize parser with RTSTRUCT file path.

        Args:
            rtstruct_path: Path to the RTSTRUCT DICOM file
        """
        if pydicom is None:
            raise ImportError(
                "pydicom is required for RTSTRUCT parsing. "
                "Install with: pip install pydicom"
            )

        self.rtstruct_path = Path(rtstruct_path)
        self._dataset: Optional[Dataset] = None
        self._roi_contours: Optional[List[ROIContour]] = None

        # Metadata
        self._frame_of_reference_uid: Optional[str] = None
        self._referenced_study_uid: Optional[str] = None
        self._referenced_series_uid: Optional[str] = None

    def load(self) -> None:
        """Load the RTSTRUCT file."""
        logger.info(f"Loading RTSTRUCT from: {self.rtstruct_path}")
        self._dataset = pydicom.dcmread(str(self.rtstruct_path))

        # Verify this is an RTSTRUCT
        if self._dataset.Modality != "RTSTRUCT":
            raise ValueError(
                f"File is not an RTSTRUCT. Modality: {self._dataset.Modality}"
            )

        # Extract frame of reference
        if hasattr(self._dataset, "ReferencedFrameOfReferenceSequence"):
            ref_frame = self._dataset.ReferencedFrameOfReferenceSequence[0]
            self._frame_of_reference_uid = ref_frame.FrameOfReferenceUID

            # Get referenced series
            if hasattr(ref_frame, "RTReferencedStudySequence"):
                ref_study = ref_frame.RTReferencedStudySequence[0]
                self._referenced_study_uid = ref_study.ReferencedSOPInstanceUID
                if hasattr(ref_study, "RTReferencedSeriesSequence"):
                    ref_series = ref_study.RTReferencedSeriesSequence[0]
                    self._referenced_series_uid = ref_series.SeriesInstanceUID

    @property
    def dataset(self) -> Dataset:
        """Get the DICOM dataset."""
        if self._dataset is None:
            self.load()
        return self._dataset

    @property
    def frame_of_reference_uid(self) -> Optional[str]:
        """Get the frame of reference UID."""
        if self._dataset is None:
            self.load()
        return self._frame_of_reference_uid

    @property
    def referenced_series_uid(self) -> Optional[str]:
        """Get the referenced CT series UID."""
        if self._dataset is None:
            self.load()
        return self._referenced_series_uid

    def get_roi_contours(self) -> List[ROIContour]:
        """
        Parse and return all ROI contours.

        Returns:
            List of ROIContour objects
        """
        if self._roi_contours is not None:
            return self._roi_contours

        if self._dataset is None:
            self.load()

        self._roi_contours = []

        # Build ROI info map from StructureSetROISequence
        roi_info: Dict[int, Dict] = {}
        if hasattr(self._dataset, "StructureSetROISequence"):
            for roi in self._dataset.StructureSetROISequence:
                roi_info[roi.ROINumber] = {
                    "name": roi.ROIName,
                    "generation_algorithm": getattr(
                        roi, "ROIGenerationAlgorithm", "MANUAL"
                    ),
                }

        # Get observation info from RTROIObservationsSequence
        roi_observations: Dict[int, Dict] = {}
        if hasattr(self._dataset, "RTROIObservationsSequence"):
            for obs in self._dataset.RTROIObservationsSequence:
                roi_observations[obs.ReferencedROINumber] = {
                    "interpreted_type": getattr(obs, "RTROIInterpretedType", "ORGAN"),
                    "observation_label": getattr(obs, "ROIObservationLabel", None),
                }

        # Parse ROI contours
        if hasattr(self._dataset, "ROIContourSequence"):
            for roi_contour in self._dataset.ROIContourSequence:
                roi_num = roi_contour.ReferencedROINumber

                # Get ROI info
                info = roi_info.get(roi_num, {"name": f"ROI_{roi_num}"})
                obs = roi_observations.get(roi_num, {})

                # Get color
                if hasattr(roi_contour, "ROIDisplayColor"):
                    color = tuple(int(c) for c in roi_contour.ROIDisplayColor)
                else:
                    color = (255, 0, 0)  # Default red

                # Parse contour slices
                contours = []
                if hasattr(roi_contour, "ContourSequence"):
                    for contour in roi_contour.ContourSequence:
                        # Get contour data (x, y, z triplets)
                        if hasattr(contour, "ContourData"):
                            data = np.array(contour.ContourData, dtype=np.float64)
                            # Reshape to (N, 3)
                            points = data.reshape(-1, 3)

                            # Get referenced image
                            ref_uid = ""
                            if hasattr(contour, "ContourImageSequence"):
                                ref_uid = contour.ContourImageSequence[
                                    0
                                ].ReferencedSOPInstanceUID

                            # Get z position from first point
                            z_pos = points[0, 2] if len(points) > 0 else None

                            contours.append(
                                ContourSlice(
                                    referenced_sop_instance_uid=ref_uid,
                                    contour_data=points,
                                    contour_type=getattr(
                                        contour, "ContourGeometricType", "CLOSED_PLANAR"
                                    ),
                                    z_position=z_pos,
                                )
                            )

                # Determine ROI type
                roi_type = obs.get("interpreted_type", "ORGAN")
                roi_name = info.get("name", f"ROI_{roi_num}")

                # Override type based on name if it looks like a target
                name_upper = roi_name.upper()
                if name_upper.startswith("GTV"):
                    roi_type = "GTV"
                elif name_upper.startswith("CTV"):
                    roi_type = "CTV"
                elif name_upper.startswith("PTV"):
                    roi_type = "PTV"
                elif name_upper.startswith("ITV"):
                    roi_type = "ITV"

                self._roi_contours.append(
                    ROIContour(
                        roi_number=roi_num,
                        roi_name=roi_name,
                        roi_type=roi_type,
                        color=color,
                        contours=contours,
                        observation_label=obs.get("observation_label"),
                        generation_algorithm=info.get("generation_algorithm", "MANUAL"),
                    )
                )

        logger.info(
            f"Parsed {len(self._roi_contours)} ROI contours from RTSTRUCT"
        )
        return self._roi_contours

    def get_roi_names(self) -> List[str]:
        """Get list of ROI names."""
        return [roi.roi_name for roi in self.get_roi_contours()]

    def get_roi_by_name(self, name: str) -> Optional[ROIContour]:
        """Get an ROI contour by name."""
        for roi in self.get_roi_contours():
            if roi.roi_name == name:
                return roi
        return None

    def get_roi_by_number(self, number: int) -> Optional[ROIContour]:
        """Get an ROI contour by number."""
        for roi in self.get_roi_contours():
            if roi.roi_number == number:
                return roi
        return None

    def to_dict(self) -> Dict:
        """
        Convert parsed RTSTRUCT to dictionary for JSON serialization.
        """
        return {
            "frame_of_reference_uid": self._frame_of_reference_uid,
            "referenced_series_uid": self._referenced_series_uid,
            "roi_count": len(self.get_roi_contours()),
            "rois": [
                {
                    "roi_number": roi.roi_number,
                    "roi_name": roi.roi_name,
                    "roi_type": roi.roi_type,
                    "color": roi.get_color_hex(),
                    "slice_count": roi.slice_count,
                    "total_points": roi.total_points,
                }
                for roi in self.get_roi_contours()
            ],
        }


def parse_rtstruct(rtstruct_path: Union[str, Path]) -> List[ROIContour]:
    """
    Convenience function to parse an RTSTRUCT file.

    Args:
        rtstruct_path: Path to the RTSTRUCT file

    Returns:
        List of ROIContour objects
    """
    parser = RTStructParser(rtstruct_path)
    return parser.get_roi_contours()
