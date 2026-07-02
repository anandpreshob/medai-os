# Analytics Features: Volumetrics and Radiomics

> **Version:** 1.0.0
> **Added:** January 9, 2026

---

## Overview

MedAI Viewer includes built-in analytics capabilities for quantitative analysis of segmentations. After creating or loading a segmentation, users can compute:

1. **Volumetrics** - Volume measurements and instance detection using connected components analysis
2. **Radiomics** - Comprehensive feature extraction using PyRadiomics (~120 features)

Both features require the MedAI Server backend to be running and connected.

---

## Volumetrics

### What It Does

Volumetrics calculates precise volume measurements for each segment in your segmentation mask, with automatic instance detection using 3D connected component analysis.

### Metrics Computed

For each segment:
- **Total Volume** - Combined volume of all instances (in mm³ and cm³)
- **Instance Count** - Number of separate connected regions (e.g., multiple tumors)
- **Per-Instance Details**:
  - Volume (mm³ and cm³)
  - Voxel count
  - Centroid coordinates (i, j, k indices)
  - Bounding box

### How It Works

1. The segmentation mask is sent to the backend server
2. Scipy's `ndimage.label()` performs 3D connected component labeling (26-connectivity)
3. Volume is calculated as: `voxel_count × voxel_volume` where voxel_volume = spacing[x] × spacing[y] × spacing[z]
4. Results are returned and displayed in the Analytics Modal

### Use Cases

- Measure tumor burden across multiple lesions
- Track volume changes over time
- Count and measure individual metastases
- Quantify organ volumes

---

## Radiomics

### What It Does

Radiomics extracts quantitative imaging features from the source image within each segmented region. These features can be used for machine learning, biomarker discovery, and research analysis.

### Feature Classes (~120 features total)

| Class | Features | Description |
|-------|----------|-------------|
| **First Order** | 19 | Intensity distribution statistics (mean, std, skewness, kurtosis, entropy, etc.) |
| **Shape (3D)** | 16 | Geometric properties (volume, surface area, sphericity, elongation, etc.) |
| **GLCM** | 24 | Gray Level Co-occurrence Matrix - texture patterns based on pixel pair relationships |
| **GLRLM** | 16 | Gray Level Run Length Matrix - consecutive pixels with same intensity |
| **GLSZM** | 16 | Gray Level Size Zone Matrix - connected regions of same intensity |
| **NGTDM** | 5 | Neighbouring Gray Tone Difference Matrix - intensity differences from neighbors |
| **GLDM** | 14 | Gray Level Dependence Matrix - voxel dependencies within distance |

### Key Features by Category

**First Order Statistics:**
- Energy, Entropy, Uniformity
- Mean, Median, Standard Deviation, Variance
- Skewness, Kurtosis
- Minimum, Maximum, Range
- Percentiles (10th, 90th)

**Shape Features:**
- Mesh/Voxel Volume
- Surface Area, Surface-to-Volume Ratio
- Sphericity, Compactness
- Maximum 3D/2D Diameters
- Major/Minor/Least Axis Lengths
- Elongation, Flatness

**Texture Features (GLCM, GLRLM, GLSZM, NGTDM, GLDM):**
- Contrast, Correlation, Homogeneity
- Joint Energy, Joint Entropy
- Run/Zone Emphasis patterns
- Gray Level Non-Uniformity
- Dependence patterns

### How It Works

1. Both source image and segmentation mask are sent to the backend
2. PyRadiomics feature extractor processes each segment
3. Features are organized by class and returned as structured JSON
4. Results are displayed in expandable sections in the Analytics Modal

### Use Cases

- Radiomic signature development for prognosis/diagnosis
- Texture analysis for tumor characterization
- Feature extraction for machine learning models
- Quantitative biomarker research

---

## Using the Analytics Features

### Prerequisites

1. An image must be loaded in the viewer
2. A segmentation must be created (manual or AI-generated) with at least one segment
3. MedAI Server must be running and connected (for radiomics, pyradiomics must be installed)

### Step-by-Step

1. **Load an image** - Drag and drop or use the file browser
2. **Create/load a segmentation** - Use AI models or manual tools
3. **Locate the Analytics panel** - Appears in the right sidebar when a segmentation exists
4. **Click "Volumetrics" or "Radiomics"** - Computation runs on the server
5. **View results** - Modal displays with tabbed interface
6. **Export data** - Use CSV or JSON export buttons

### Results Modal

The Analytics Modal has two tabs:

**Volumetrics Tab:**
- Image metadata (dimensions, spacing, voxel volume)
- Expandable cards for each segment showing:
  - Total volume and instance count
  - Table of individual instances with volumes and centroids

**Radiomics Tab:**
- Computation metadata (PyRadiomics version, feature count, time)
- Expandable cards for each segment with:
  - Collapsible sections for each feature class
  - Feature name and value pairs

### Exporting Results

Both tabs support export:
- **CSV** - Spreadsheet-compatible format for further analysis
- **JSON** - Structured format preserving hierarchy

---

## Technical Details

### Backend Endpoints

```
POST /analytics/volumetrics
POST /analytics/radiomics
```

### Request Format

Both endpoints accept multipart form data:
- `image_file` (radiomics only) - Source image in NIfTI format
- `mask_file` - Segmentation mask in NIfTI format
- `params` - JSON string with segment labels and settings

### Response Format

**Volumetrics:**
```json
{
  "volumetrics": {
    "segments": [
      {
        "segment_index": 1,
        "label": "Tumor",
        "total_volume_mm3": 15234.5,
        "total_volume_cm3": 15.23,
        "instance_count": 3,
        "instances": [
          {
            "instance_id": 1,
            "volume_mm3": 8000.0,
            "volume_cm3": 8.0,
            "voxel_count": 12500,
            "centroid_ijk": [128, 120, 45],
            "bounding_box": [[100, 90, 30], [156, 150, 60]]
          }
        ]
      }
    ]
  },
  "metadata": {
    "image_dimensions": [256, 256, 128],
    "voxel_spacing_mm": [0.5, 0.5, 1.0],
    "voxel_volume_mm3": 0.25,
    "total_mask_voxels": 60936
  }
}
```

**Radiomics:**
```json
{
  "segments": [
    {
      "segment_index": 1,
      "label": "Tumor",
      "features": {
        "firstorder": {
          "Mean": 45.6,
          "Entropy": 4.56,
          ...
        },
        "shape": {
          "VoxelVolume": 15234.5,
          "Sphericity": 0.78,
          ...
        },
        "glcm": { ... },
        "glrlm": { ... },
        "glszm": { ... },
        "ngtdm": { ... },
        "gldm": { ... }
      }
    }
  ],
  "metadata": {
    "pyradiomics_version": "3.0.1",
    "feature_count": 120,
    "computation_time_seconds": 12.5
  }
}
```

### Server Requirements

The MedAI Server requires these Python packages for analytics:
- `scipy` - For connected component analysis
- `pyradiomics>=3.0.1` - For radiomics feature extraction
- `SimpleITK>=2.0.0` - For image processing (pyradiomics dependency)

These are included in the server's requirements.txt.

---

## Troubleshooting

### "Cannot compute volumetrics/radiomics"
- Ensure an image is loaded
- Ensure a segmentation exists with at least one segment
- Check that MedAI Server is running and connected

### "Volumetrics/Radiomics failed" error
- Check server logs for detailed error messages
- Verify pyradiomics is installed on the server
- Ensure the segmentation mask has valid segment labels (non-zero values)

### Slow radiomics computation
- Radiomics can take 10-60 seconds depending on image size and segment count
- Large volumes or many segments increase computation time
- Consider using a subset of features if speed is critical

### Missing features in radiomics
- Some features may be undefined for very small segments
- Check the server logs for warnings about failed feature extraction

---

## References

- [PyRadiomics Documentation](https://pyradiomics.readthedocs.io/)
- [IBSI Feature Definitions](https://arxiv.org/abs/1612.07003)
- [Connected Component Labeling](https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.label.html)
