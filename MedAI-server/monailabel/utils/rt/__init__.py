"""
MedAI RT Utilities

Utilities for DICOM RTSTRUCT import and export.
"""

from .rtstruct_parser import RTStructParser, ROIContour, ContourSlice, parse_rtstruct
from .contour_to_labelmap import contour_to_labelmap, ContourToLabelmapConverter, CTSeriesInfo
from .labelmap_to_contour import labelmap_to_contours, LabelmapToContourExtractor, ExtractedContour
from .rtstruct_builder import RTStructBuilder, ROIExport, CTSliceInfo, build_rtstruct

__all__ = [
    # Parser
    "RTStructParser",
    "ROIContour",
    "ContourSlice",
    "parse_rtstruct",
    # Contour to labelmap
    "contour_to_labelmap",
    "ContourToLabelmapConverter",
    "CTSeriesInfo",
    # Labelmap to contour
    "labelmap_to_contours",
    "LabelmapToContourExtractor",
    "ExtractedContour",
    # Builder
    "RTStructBuilder",
    "ROIExport",
    "CTSliceInfo",
    "build_rtstruct",
]
