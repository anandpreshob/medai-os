"""
RTSTRUCT Builder

Creates valid DICOM RTSTRUCT datasets from labelmaps.
"""

import datetime
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

try:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
    from pydicom.sequence import Sequence
    from pydicom.uid import generate_uid, ImplicitVRLittleEndian
except ImportError:
    pydicom = None
    Dataset = None

from .labelmap_to_contour import ExtractedContour, LabelmapToContourExtractor
from .contour_to_labelmap import CTSeriesInfo

logger = logging.getLogger(__name__)


@dataclass
class ROIExport:
    """Configuration for exporting a single ROI."""

    label_name: str
    label_value: int
    roi_type: str  # GTV, CTV, PTV, ORGAN, EXTERNAL, etc.
    color: Tuple[int, int, int]
    interpreted_type: str = "ORGAN"  # RTSS ROIInterpretedType
    generation_algorithm: str = "SEMIAUTOMATIC"


@dataclass
class CTSliceInfo:
    """Information about a single CT slice."""

    sop_instance_uid: str
    sop_class_uid: str
    slice_index: int
    z_position: float


class RTStructBuilder:
    """
    Builder for creating DICOM RTSTRUCT datasets.

    Creates valid RTSTRUCT files that can be imported into treatment
    planning systems.
    """

    # DICOM UIDs
    RT_STRUCT_SOP_CLASS_UID = "1.2.840.10008.5.1.4.1.1.481.3"
    CT_SOP_CLASS_UID = "1.2.840.10008.5.1.4.1.1.2"

    def __init__(
        self,
        ct_info: CTSeriesInfo,
        ct_series_uid: str,
        ct_study_uid: str,
        ct_frame_of_reference_uid: str,
        ct_slices: Optional[List[CTSliceInfo]] = None,
    ):
        """
        Initialize the builder.

        Args:
            ct_info: CT series geometry information
            ct_series_uid: Series Instance UID of the referenced CT
            ct_study_uid: Study Instance UID of the referenced CT
            ct_frame_of_reference_uid: Frame of Reference UID
            ct_slices: Optional list of CT slice information
        """
        if pydicom is None:
            raise ImportError(
                "pydicom is required. Install with: pip install pydicom"
            )

        self.ct_info = ct_info
        self.ct_series_uid = ct_series_uid
        self.ct_study_uid = ct_study_uid
        self.ct_frame_of_reference_uid = ct_frame_of_reference_uid
        self.ct_slices = ct_slices or []

        # Generate UIDs for this RTSTRUCT
        self.rtstruct_sop_instance_uid = generate_uid()
        self.rtstruct_series_uid = generate_uid()

    def _create_file_meta(self) -> FileMetaDataset:
        """Create the file meta information."""
        file_meta = FileMetaDataset()
        file_meta.MediaStorageSOPClassUID = self.RT_STRUCT_SOP_CLASS_UID
        file_meta.MediaStorageSOPInstanceUID = self.rtstruct_sop_instance_uid
        file_meta.TransferSyntaxUID = ImplicitVRLittleEndian
        file_meta.ImplementationClassUID = generate_uid()
        file_meta.ImplementationVersionName = "MedAI_RT_1.0"
        return file_meta

    def _create_structure_set_roi(
        self,
        roi_number: int,
        roi_name: str,
        generation_algorithm: str = "SEMIAUTOMATIC",
    ) -> Dataset:
        """Create a StructureSetROI item."""
        roi = Dataset()
        roi.ROINumber = roi_number
        roi.ReferencedFrameOfReferenceUID = self.ct_frame_of_reference_uid
        roi.ROIName = roi_name
        roi.ROIGenerationAlgorithm = generation_algorithm
        return roi

    def _create_roi_contour(
        self,
        roi_number: int,
        color: Tuple[int, int, int],
        contours: List,  # List[ContourSlice]
    ) -> Dataset:
        """Create an ROIContour item with all contour sequences."""
        roi_contour = Dataset()
        roi_contour.ROIDisplayColor = list(color)
        roi_contour.ReferencedROINumber = roi_number

        # Create contour sequence
        contour_sequence = []
        for contour_slice in contours:
            contour_item = Dataset()

            # Flatten contour data to x1,y1,z1,x2,y2,z2,...
            points = contour_slice.contour_data
            flat_data = points.flatten().tolist()
            contour_item.ContourData = flat_data
            contour_item.ContourGeometricType = contour_slice.contour_type
            contour_item.NumberOfContourPoints = len(points)

            # Reference the CT image
            if contour_slice.referenced_sop_instance_uid:
                image_seq = Dataset()
                image_seq.ReferencedSOPClassUID = self.CT_SOP_CLASS_UID
                image_seq.ReferencedSOPInstanceUID = (
                    contour_slice.referenced_sop_instance_uid
                )
                contour_item.ContourImageSequence = Sequence([image_seq])

            contour_sequence.append(contour_item)

        roi_contour.ContourSequence = Sequence(contour_sequence)
        return roi_contour

    def _create_rt_roi_observation(
        self,
        observation_number: int,
        roi_number: int,
        roi_type: str,
        interpreted_type: str = "ORGAN",
    ) -> Dataset:
        """Create an RTROIObservation item."""
        observation = Dataset()
        observation.ObservationNumber = observation_number
        observation.ReferencedROINumber = roi_number
        observation.RTROIInterpretedType = interpreted_type
        observation.ROIInterpreter = ""
        return observation

    def _create_referenced_frame_of_reference(self) -> Dataset:
        """Create the ReferencedFrameOfReference sequence."""
        frame_ref = Dataset()
        frame_ref.FrameOfReferenceUID = self.ct_frame_of_reference_uid

        # RT Referenced Study Sequence
        study_ref = Dataset()
        study_ref.ReferencedSOPClassUID = "1.2.840.10008.3.1.2.3.1"  # Detached Study
        study_ref.ReferencedSOPInstanceUID = self.ct_study_uid

        # RT Referenced Series Sequence
        series_ref = Dataset()
        series_ref.SeriesInstanceUID = self.ct_series_uid

        # Contour Image Sequence - reference all CT slices
        contour_images = []
        for slice_info in self.ct_slices:
            img_ref = Dataset()
            img_ref.ReferencedSOPClassUID = slice_info.sop_class_uid
            img_ref.ReferencedSOPInstanceUID = slice_info.sop_instance_uid
            contour_images.append(img_ref)

        if contour_images:
            series_ref.ContourImageSequence = Sequence(contour_images)

        study_ref.RTReferencedSeriesSequence = Sequence([series_ref])
        frame_ref.RTReferencedStudySequence = Sequence([study_ref])

        return frame_ref

    def build(
        self,
        extracted_contours: List[ExtractedContour],
        roi_configs: Optional[Dict[int, ROIExport]] = None,
        patient_name: str = "Anonymous",
        patient_id: str = "0000",
        structure_set_label: str = "MedAI_Structures",
        structure_set_name: str = "MedAI Auto-Segmentation",
    ) -> FileDataset:
        """
        Build a complete RTSTRUCT dataset.

        Args:
            extracted_contours: List of ExtractedContour objects
            roi_configs: Optional mapping of label values to ROIExport configs
            patient_name: Patient name for the RTSTRUCT
            patient_id: Patient ID for the RTSTRUCT
            structure_set_label: Label for the structure set
            structure_set_name: Name for the structure set

        Returns:
            Complete FileDataset ready to be saved
        """
        # Create the file dataset
        ds = FileDataset(
            "", {}, file_meta=self._create_file_meta(), preamble=b"\x00" * 128
        )

        # Patient Module
        ds.PatientName = patient_name
        ds.PatientID = patient_id
        ds.PatientBirthDate = ""
        ds.PatientSex = ""

        # General Study Module
        ds.StudyInstanceUID = self.ct_study_uid
        ds.StudyDate = datetime.datetime.now().strftime("%Y%m%d")
        ds.StudyTime = datetime.datetime.now().strftime("%H%M%S")
        ds.ReferringPhysicianName = ""
        ds.StudyID = ""
        ds.AccessionNumber = ""

        # RT Series Module
        ds.SeriesInstanceUID = self.rtstruct_series_uid
        ds.SeriesDate = datetime.datetime.now().strftime("%Y%m%d")
        ds.SeriesTime = datetime.datetime.now().strftime("%H%M%S")
        ds.SeriesDescription = structure_set_name
        ds.SeriesNumber = 1
        ds.Modality = "RTSTRUCT"
        ds.Manufacturer = "MedAI"
        ds.ManufacturerModelName = "MedAI Viewer"
        ds.InstitutionName = ""
        ds.StationName = ""

        # General Equipment Module
        ds.SoftwareVersions = "1.0"

        # Structure Set Module
        ds.StructureSetLabel = structure_set_label
        ds.StructureSetName = structure_set_name
        ds.StructureSetDate = datetime.datetime.now().strftime("%Y%m%d")
        ds.StructureSetTime = datetime.datetime.now().strftime("%H%M%S")

        # SOP Common Module
        ds.SOPClassUID = self.RT_STRUCT_SOP_CLASS_UID
        ds.SOPInstanceUID = self.rtstruct_sop_instance_uid
        ds.InstanceCreationDate = datetime.datetime.now().strftime("%Y%m%d")
        ds.InstanceCreationTime = datetime.datetime.now().strftime("%H%M%S")

        # Build ROI sequences
        structure_set_roi_seq = []
        roi_contour_seq = []
        rt_roi_observations_seq = []

        for idx, extracted in enumerate(extracted_contours, start=1):
            # Get config if provided
            config = None
            if roi_configs and extracted.label_value in roi_configs:
                config = roi_configs[extracted.label_value]

            roi_name = config.label_name if config else extracted.label_name
            roi_type = config.roi_type if config else "ORGAN"
            color = config.color if config else extracted.color
            generation_algorithm = (
                config.generation_algorithm if config else "SEMIAUTOMATIC"
            )
            interpreted_type = config.interpreted_type if config else "ORGAN"

            # Structure Set ROI
            ss_roi = self._create_structure_set_roi(
                roi_number=idx,
                roi_name=roi_name,
                generation_algorithm=generation_algorithm,
            )
            structure_set_roi_seq.append(ss_roi)

            # ROI Contour
            roi_contour = self._create_roi_contour(
                roi_number=idx,
                color=color,
                contours=extracted.contours,
            )
            roi_contour_seq.append(roi_contour)

            # RT ROI Observation
            observation = self._create_rt_roi_observation(
                observation_number=idx,
                roi_number=idx,
                roi_type=roi_type,
                interpreted_type=interpreted_type,
            )
            rt_roi_observations_seq.append(observation)

        # Add sequences to dataset
        ds.StructureSetROISequence = Sequence(structure_set_roi_seq)
        ds.ROIContourSequence = Sequence(roi_contour_seq)
        ds.RTROIObservationsSequence = Sequence(rt_roi_observations_seq)

        # Referenced Frame of Reference Sequence
        ds.ReferencedFrameOfReferenceSequence = Sequence(
            [self._create_referenced_frame_of_reference()]
        )

        logger.info(
            f"Built RTSTRUCT with {len(extracted_contours)} ROIs, "
            f"SOP UID: {self.rtstruct_sop_instance_uid}"
        )

        return ds

    def save(
        self,
        ds: FileDataset,
        output_path: Union[str, Path],
    ) -> Path:
        """
        Save the RTSTRUCT to a file.

        Args:
            ds: The FileDataset to save
            output_path: Path to save the file

        Returns:
            Path to the saved file
        """
        output_path = Path(output_path)
        ds.save_as(str(output_path))
        logger.info(f"Saved RTSTRUCT to: {output_path}")
        return output_path


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
    output_path: Optional[Union[str, Path]] = None,
    patient_name: str = "Anonymous",
    patient_id: str = "0000",
    simplify_tolerance: float = 0.5,
) -> Tuple[FileDataset, Optional[Path]]:
    """
    Convenience function to build an RTSTRUCT from a labelmap.

    Args:
        labelmap: 3D labelmap array (Z, Y, X)
        ct_info: CT series geometry information
        label_names: Map of label values to structure names
        ct_series_uid: Series Instance UID of the referenced CT
        ct_study_uid: Study Instance UID of the referenced CT
        ct_frame_of_reference_uid: Frame of Reference UID
        label_colors: Optional map of label values to RGB colors
        roi_types: Optional map of label values to ROI types
        ct_slices: Optional list of CT slice information
        output_path: Optional path to save the RTSTRUCT
        patient_name: Patient name
        patient_id: Patient ID
        simplify_tolerance: Tolerance for contour simplification

    Returns:
        Tuple of (FileDataset, output_path or None)
    """
    # Extract contours from labelmap
    extractor = LabelmapToContourExtractor(ct_info, simplify_tolerance)
    extracted_contours = extractor.extract_all_labels(
        labelmap, label_names, label_colors
    )

    # Build ROI configs
    roi_configs = {}
    for label_value, name in label_names.items():
        color = (255, 0, 0)
        if label_colors and label_value in label_colors:
            color = label_colors[label_value]

        roi_type = "ORGAN"
        if roi_types and label_value in roi_types:
            roi_type = roi_types[label_value]

        # Infer interpreted type from name or type
        interpreted_type = "ORGAN"
        name_upper = name.upper()
        if any(t in name_upper for t in ["GTV", "GROSS"]):
            interpreted_type = "GTV"
        elif any(t in name_upper for t in ["CTV", "CLINICAL"]):
            interpreted_type = "CTV"
        elif any(t in name_upper for t in ["PTV", "PLANNING"]):
            interpreted_type = "PTV"
        elif "EXTERNAL" in name_upper or "BODY" in name_upper:
            interpreted_type = "EXTERNAL"

        roi_configs[label_value] = ROIExport(
            label_name=name,
            label_value=label_value,
            roi_type=roi_type,
            color=color,
            interpreted_type=interpreted_type,
        )

    # Build RTSTRUCT
    builder = RTStructBuilder(
        ct_info=ct_info,
        ct_series_uid=ct_series_uid,
        ct_study_uid=ct_study_uid,
        ct_frame_of_reference_uid=ct_frame_of_reference_uid,
        ct_slices=ct_slices,
    )

    ds = builder.build(
        extracted_contours=extracted_contours,
        roi_configs=roi_configs,
        patient_name=patient_name,
        patient_id=patient_id,
    )

    # Save if output path provided
    saved_path = None
    if output_path:
        saved_path = builder.save(ds, output_path)

    return ds, saved_path
