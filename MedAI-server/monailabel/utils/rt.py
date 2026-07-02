# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0

"""
RT Structure Utilities

Utilities for parsing and creating DICOM RTSTRUCT files.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np

try:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset
    from pydicom.sequence import Sequence
    from pydicom.uid import generate_uid, PYDICOM_ROOT_UID
except ImportError:
    pydicom = None

try:
    from skimage import measure
except ImportError:
    measure = None

logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes
# ============================================================================


@dataclass
class CTSeriesInfo:
    """Information about a CT series geometry."""

    shape: Tuple[int, int, int]  # Z, Y, X
    spacing: Tuple[float, float, float]  # X, Y, Z spacing in mm
    origin: Tuple[float, float, float]  # X, Y, Z origin in mm
    direction: np.ndarray  # 3x3 direction matrix
    slice_positions: List[float]  # Z positions of each slice


@dataclass
class CTSliceInfo:
    """Information about a single CT slice."""

    sop_instance_uid: str
    sop_class_uid: str
    slice_index: int
    z_position: float


@dataclass
class ROIContour:
    """Contour data for a single ROI."""

    roi_number: int
    roi_name: str
    roi_type: str  # e.g., "ORGAN", "PTV", "CTV", "GTV"
    color: Tuple[int, int, int]  # RGB color
    contours: List[Dict]  # List of {z_position, points: [(x,y), ...]}
    slice_count: int = 0
    total_points: int = 0

    def get_color_hex(self) -> str:
        """Get color as hex string."""
        return "#{:02x}{:02x}{:02x}".format(*self.color)


@dataclass
class ROIExport:
    """Export settings for an ROI."""

    label_value: int
    label_name: str
    roi_type: str = "ORGAN"
    color: Tuple[int, int, int] = (255, 0, 0)
    interpreted_type: str = "ORGAN"


# ============================================================================
# RTStructParser - Parse RTSTRUCT DICOM files
# ============================================================================


class RTStructParser:
    """Parse DICOM RTSTRUCT files."""

    def __init__(self, filepath: str):
        if pydicom is None:
            raise ImportError("pydicom is required for RTSTRUCT parsing")

        self.filepath = filepath
        self.dataset: Optional[Dataset] = None
        self._rois: List[ROIContour] = []
        self.referenced_series_uid: Optional[str] = None
        self.frame_of_reference_uid: Optional[str] = None

    def load(self) -> None:
        """Load and parse the RTSTRUCT file."""
        self.dataset = pydicom.dcmread(self.filepath)
        self._parse_rois()
        self._parse_references()

    def _parse_references(self) -> None:
        """Parse referenced series and frame of reference."""
        ds = self.dataset

        # Get frame of reference
        if hasattr(ds, "ReferencedFrameOfReferenceSequence"):
            ref_for = ds.ReferencedFrameOfReferenceSequence[0]
            self.frame_of_reference_uid = str(
                getattr(ref_for, "FrameOfReferenceUID", "")
            )

            # Get referenced series from RT Referenced Study Sequence
            if hasattr(ref_for, "RTReferencedStudySequence"):
                rt_ref_study = ref_for.RTReferencedStudySequence[0]
                if hasattr(rt_ref_study, "RTReferencedSeriesSequence"):
                    rt_ref_series = rt_ref_study.RTReferencedSeriesSequence[0]
                    self.referenced_series_uid = str(
                        getattr(rt_ref_series, "SeriesInstanceUID", "")
                    )

    def _parse_rois(self) -> None:
        """Parse ROI contours from the dataset."""
        ds = self.dataset
        self._rois = []

        # Build ROI info lookup from StructureSetROISequence
        roi_info = {}
        if hasattr(ds, "StructureSetROISequence"):
            for roi in ds.StructureSetROISequence:
                roi_num = int(roi.ROINumber)
                roi_info[roi_num] = {
                    "name": getattr(roi, "ROIName", f"ROI_{roi_num}"),
                    "type": getattr(roi, "ROIGenerationAlgorithm", "UNKNOWN"),
                }

        # Build color lookup from ROIContourSequence
        roi_colors = {}
        contour_data = {}

        if hasattr(ds, "ROIContourSequence"):
            for roi_contour in ds.ROIContourSequence:
                roi_num = int(roi_contour.ReferencedROINumber)

                # Get color (default to red)
                color = (255, 0, 0)
                if hasattr(roi_contour, "ROIDisplayColor"):
                    c = roi_contour.ROIDisplayColor
                    color = (int(c[0]), int(c[1]), int(c[2]))
                roi_colors[roi_num] = color

                # Get contours
                contours = []
                total_points = 0

                if hasattr(roi_contour, "ContourSequence"):
                    for contour in roi_contour.ContourSequence:
                        if not hasattr(contour, "ContourData"):
                            continue

                        # Parse 3D contour points
                        data = contour.ContourData
                        points = []
                        z_pos = None

                        for i in range(0, len(data), 3):
                            x, y, z = float(data[i]), float(data[i + 1]), float(data[i + 2])
                            points.append((x, y))
                            if z_pos is None:
                                z_pos = z

                        if points and z_pos is not None:
                            contours.append({"z_position": z_pos, "points": points})
                            total_points += len(points)

                contour_data[roi_num] = {
                    "contours": contours,
                    "total_points": total_points,
                }

        # Get ROI type from RTROIObservationsSequence
        roi_types = {}
        if hasattr(ds, "RTROIObservationsSequence"):
            for obs in ds.RTROIObservationsSequence:
                roi_num = int(obs.ReferencedROINumber)
                roi_types[roi_num] = getattr(obs, "RTROIInterpretedType", "ORGAN")

        # Build final ROI list
        for roi_num, info in roi_info.items():
            contours = contour_data.get(roi_num, {}).get("contours", [])
            total_points = contour_data.get(roi_num, {}).get("total_points", 0)

            self._rois.append(
                ROIContour(
                    roi_number=roi_num,
                    roi_name=info["name"],
                    roi_type=roi_types.get(roi_num, "ORGAN"),
                    color=roi_colors.get(roi_num, (255, 0, 0)),
                    contours=contours,
                    slice_count=len(contours),
                    total_points=total_points,
                )
            )

    def get_roi_contours(self) -> List[ROIContour]:
        """Get parsed ROI contours."""
        if not self._rois:
            self.load()
        return self._rois


# ============================================================================
# ContourToLabelmapConverter - Convert contours to 3D labelmaps
# ============================================================================


class ContourToLabelmapConverter:
    """Convert RTSTRUCT contours to 3D labelmaps."""

    def __init__(self, ct_info: CTSeriesInfo):
        self.ct_info = ct_info

    def convert_all_rois(
        self, rois: List[ROIContour]
    ) -> Tuple[np.ndarray, Dict[int, str]]:
        """
        Convert all ROIs to a single labelmap.

        Returns:
            labelmap: 3D numpy array with label values
            label_map: Dict mapping label value to ROI name
        """
        shape = self.ct_info.shape  # Z, Y, X
        labelmap = np.zeros(shape, dtype=np.uint8)
        label_map = {}

        for label_value, roi in enumerate(rois, start=1):
            self._fill_roi_contours(labelmap, roi, label_value)
            label_map[label_value] = roi.roi_name

        return labelmap, label_map

    def _fill_roi_contours(
        self, labelmap: np.ndarray, roi: ROIContour, label_value: int
    ) -> None:
        """Fill a single ROI's contours into the labelmap."""
        shape = self.ct_info.shape
        spacing = self.ct_info.spacing
        origin = self.ct_info.origin
        slice_positions = self.ct_info.slice_positions

        for contour in roi.contours:
            z_pos = contour["z_position"]
            points = contour["points"]

            if not points:
                continue

            # Find closest slice index
            slice_idx = self._find_slice_index(z_pos, slice_positions)
            if slice_idx is None or slice_idx < 0 or slice_idx >= shape[0]:
                continue

            # Convert physical points to pixel coordinates
            pixel_points = []
            for x, y in points:
                px = int(round((x - origin[0]) / spacing[0]))
                py = int(round((y - origin[1]) / spacing[1]))
                pixel_points.append((px, py))

            # Fill polygon
            self._fill_polygon(labelmap[slice_idx], pixel_points, label_value)

    def _find_slice_index(
        self, z_pos: float, slice_positions: List[float]
    ) -> Optional[int]:
        """Find the closest slice index for a Z position."""
        if not slice_positions:
            return None

        min_dist = float("inf")
        best_idx = None

        for i, sp in enumerate(slice_positions):
            dist = abs(z_pos - sp)
            if dist < min_dist:
                min_dist = dist
                best_idx = i

        return best_idx

    def _fill_polygon(
        self, slice_2d: np.ndarray, points: List[Tuple[int, int]], label_value: int
    ) -> None:
        """Fill a polygon in a 2D slice using scanline algorithm."""
        if len(points) < 3:
            return

        # Get bounding box
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        min_x, max_x = max(0, min(xs)), min(slice_2d.shape[1] - 1, max(xs))
        min_y, max_y = max(0, min(ys)), min(slice_2d.shape[0] - 1, max(ys))

        # Simple scanline fill
        for y in range(min_y, max_y + 1):
            intersections = []
            n = len(points)

            for i in range(n):
                x1, y1 = points[i]
                x2, y2 = points[(i + 1) % n]

                if y1 == y2:
                    continue

                if y1 > y2:
                    x1, y1, x2, y2 = x2, y2, x1, y1

                if y1 <= y < y2:
                    x_intersect = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                    intersections.append(x_intersect)

            intersections.sort()

            for i in range(0, len(intersections) - 1, 2):
                x_start = int(max(min_x, intersections[i]))
                x_end = int(min(max_x, intersections[i + 1]))
                for x in range(x_start, x_end + 1):
                    if 0 <= x < slice_2d.shape[1] and 0 <= y < slice_2d.shape[0]:
                        slice_2d[y, x] = label_value


# ============================================================================
# build_rtstruct - Create RTSTRUCT files from labelmaps
# ============================================================================


def build_rtstruct(
    labelmap: np.ndarray,
    ct_info: CTSeriesInfo,
    label_names: Dict[int, str],
    ct_series_uid: str,
    ct_study_uid: str,
    ct_frame_of_reference_uid: str,
    label_colors: Optional[Dict[int, Tuple[int, int, int]]] = None,
    roi_types: Optional[Dict[int, str]] = None,
    ct_slices: Optional[List[CTSliceInfo]] = None,
    output_path: Optional[str] = None,
    patient_name: str = "Anonymous",
    patient_id: str = "0000",
    simplify_tolerance: float = 0.5,
) -> Tuple[Dataset, str]:
    """
    Build an RTSTRUCT DICOM file from a labelmap.

    Args:
        labelmap: 3D numpy array (Z, Y, X) with integer labels
        ct_info: CT geometry information
        label_names: Dict mapping label value to name
        ct_series_uid: Referenced CT series UID
        ct_study_uid: Referenced CT study UID
        ct_frame_of_reference_uid: Frame of reference UID
        label_colors: Optional dict mapping label to RGB color
        roi_types: Optional dict mapping label to ROI type
        ct_slices: Optional list of CT slice info for references
        output_path: Output file path (temp file if None)
        patient_name: Patient name for DICOM header
        patient_id: Patient ID for DICOM header
        simplify_tolerance: Contour simplification tolerance in mm

    Returns:
        Tuple of (dataset, saved_path)
    """
    if pydicom is None:
        raise ImportError("pydicom is required for RTSTRUCT creation")

    if measure is None:
        raise ImportError("scikit-image is required for contour extraction")

    # Default colors and types
    if label_colors is None:
        label_colors = {}
    if roi_types is None:
        roi_types = {}

    default_colors = [
        (255, 0, 0),
        (0, 255, 0),
        (0, 0, 255),
        (255, 255, 0),
        (255, 0, 255),
        (0, 255, 255),
        (128, 0, 0),
        (0, 128, 0),
    ]

    # Create file metadata
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.481.3"  # RT Structure Set
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = "1.2.840.10008.1.2.1"  # Explicit VR Little Endian
    file_meta.ImplementationClassUID = PYDICOM_ROOT_UID

    # Create dataset
    ds = FileDataset(
        output_path or "rtstruct.dcm",
        {},
        file_meta=file_meta,
        preamble=b"\0" * 128,
    )

    # Patient module
    ds.PatientName = patient_name
    ds.PatientID = patient_id
    ds.PatientBirthDate = ""
    ds.PatientSex = ""

    # General study module
    ds.StudyInstanceUID = ct_study_uid
    ds.StudyDate = datetime.now().strftime("%Y%m%d")
    ds.StudyTime = datetime.now().strftime("%H%M%S")
    ds.ReferringPhysicianName = ""
    ds.StudyID = "1"
    ds.AccessionNumber = ""

    # RT Series module
    ds.SeriesInstanceUID = generate_uid()
    ds.SeriesNumber = "1"
    ds.SeriesDescription = "MedAI Structure Set"
    ds.Modality = "RTSTRUCT"

    # General equipment module
    ds.Manufacturer = "MedAI"
    ds.InstitutionName = "MedAI"
    ds.ManufacturerModelName = "MedAI Auto-Segmentation"

    # SOP Common module
    ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.481.3"
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceCreationDate = ds.StudyDate
    ds.InstanceCreationTime = ds.StudyTime

    # Structure Set module
    ds.StructureSetLabel = "MedAI_Structures"
    ds.StructureSetName = "MedAI Auto-Segmentation"
    ds.StructureSetDate = ds.StudyDate
    ds.StructureSetTime = ds.StudyTime

    # Referenced Frame of Reference Sequence
    ref_for = Dataset()
    ref_for.FrameOfReferenceUID = ct_frame_of_reference_uid

    # RT Referenced Study Sequence
    rt_ref_study = Dataset()
    rt_ref_study.ReferencedSOPClassUID = "1.2.840.10008.3.1.2.3.2"  # Study Component
    rt_ref_study.ReferencedSOPInstanceUID = ct_study_uid

    # RT Referenced Series Sequence
    rt_ref_series = Dataset()
    rt_ref_series.SeriesInstanceUID = ct_series_uid

    # Contour Image Sequence (references to CT slices)
    contour_images = []
    if ct_slices:
        for slice_info in ct_slices:
            ci = Dataset()
            ci.ReferencedSOPClassUID = slice_info.sop_class_uid
            ci.ReferencedSOPInstanceUID = slice_info.sop_instance_uid
            contour_images.append(ci)

    rt_ref_series.ContourImageSequence = Sequence(contour_images)
    rt_ref_study.RTReferencedSeriesSequence = Sequence([rt_ref_series])
    ref_for.RTReferencedStudySequence = Sequence([rt_ref_study])
    ds.ReferencedFrameOfReferenceSequence = Sequence([ref_for])

    # Structure Set ROI Sequence
    structure_set_rois = []
    roi_contour_seq = []
    roi_observations_seq = []

    roi_number = 0
    for label_value, label_name in label_names.items():
        roi_number += 1

        # Get color
        color = label_colors.get(
            label_value, default_colors[(roi_number - 1) % len(default_colors)]
        )

        # Get ROI type
        roi_type = roi_types.get(label_value, "ORGAN")

        # Structure Set ROI
        ss_roi = Dataset()
        ss_roi.ROINumber = roi_number
        ss_roi.ReferencedFrameOfReferenceUID = ct_frame_of_reference_uid
        ss_roi.ROIName = label_name
        ss_roi.ROIGenerationAlgorithm = "AUTOMATIC"
        structure_set_rois.append(ss_roi)

        # ROI Contour
        roi_contour = Dataset()
        roi_contour.ROIDisplayColor = list(color)
        roi_contour.ReferencedROINumber = roi_number

        # Extract contours from labelmap
        contour_seq = _extract_contours(
            labelmap,
            label_value,
            ct_info,
            ct_slices,
            simplify_tolerance,
        )
        roi_contour.ContourSequence = Sequence(contour_seq)
        roi_contour_seq.append(roi_contour)

        # RT ROI Observations
        roi_obs = Dataset()
        roi_obs.ObservationNumber = roi_number
        roi_obs.ReferencedROINumber = roi_number
        roi_obs.RTROIInterpretedType = roi_type
        roi_obs.ROIInterpreter = ""
        roi_observations_seq.append(roi_obs)

    ds.StructureSetROISequence = Sequence(structure_set_rois)
    ds.ROIContourSequence = Sequence(roi_contour_seq)
    ds.RTROIObservationsSequence = Sequence(roi_observations_seq)

    # Save file
    if output_path is None:
        import tempfile

        output_path = tempfile.mktemp(suffix=".dcm")

    ds.save_as(output_path)
    logger.info(f"Saved RTSTRUCT to {output_path}")

    return ds, output_path


def _extract_contours(
    labelmap: np.ndarray,
    label_value: int,
    ct_info: CTSeriesInfo,
    ct_slices: Optional[List[CTSliceInfo]],
    simplify_tolerance: float,
) -> List[Dataset]:
    """Extract contours from a labelmap for a specific label value."""
    contour_datasets = []
    shape = labelmap.shape  # Z, Y, X
    spacing = ct_info.spacing
    origin = ct_info.origin
    slice_positions = ct_info.slice_positions

    # Build slice lookup
    slice_lookup = {}
    if ct_slices:
        for cs in ct_slices:
            slice_lookup[cs.slice_index] = cs

    for z_idx in range(shape[0]):
        slice_2d = labelmap[z_idx]
        mask = (slice_2d == label_value).astype(np.uint8)

        if not mask.any():
            continue

        # Find contours using scikit-image
        contours = measure.find_contours(mask, 0.5)

        for contour in contours:
            if len(contour) < 3:
                continue

            # Simplify contour if tolerance > 0
            if simplify_tolerance > 0:
                contour = _simplify_contour(contour, simplify_tolerance / spacing[0])

            # Convert to physical coordinates
            z_pos = slice_positions[z_idx] if z_idx < len(slice_positions) else origin[2] + z_idx * spacing[2]

            contour_data = []
            for point in contour:
                # point is (row, col) = (y, x)
                y_px, x_px = point
                x_mm = origin[0] + x_px * spacing[0]
                y_mm = origin[1] + y_px * spacing[1]
                contour_data.extend([x_mm, y_mm, z_pos])

            # Create contour dataset
            c_ds = Dataset()
            c_ds.ContourGeometricType = "CLOSED_PLANAR"
            c_ds.NumberOfContourPoints = len(contour)
            c_ds.ContourData = contour_data

            # Add contour image reference if available
            if z_idx in slice_lookup:
                ci = Dataset()
                ci.ReferencedSOPClassUID = slice_lookup[z_idx].sop_class_uid
                ci.ReferencedSOPInstanceUID = slice_lookup[z_idx].sop_instance_uid
                c_ds.ContourImageSequence = Sequence([ci])

            contour_datasets.append(c_ds)

    return contour_datasets


def _simplify_contour(contour: np.ndarray, tolerance: float) -> np.ndarray:
    """Simplify a contour using Ramer-Douglas-Peucker algorithm."""
    if len(contour) <= 3:
        return contour

    # Simple distance-based decimation
    simplified = [contour[0]]
    for i in range(1, len(contour)):
        dist = np.linalg.norm(contour[i] - simplified[-1])
        if dist >= tolerance:
            simplified.append(contour[i])

    return np.array(simplified) if len(simplified) >= 3 else contour
