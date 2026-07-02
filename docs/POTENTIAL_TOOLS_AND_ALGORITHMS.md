# Potential Tools and Algorithms for MedAI Viewer

This document catalogs tools and algorithms from Cornerstone.js and related libraries that could be implemented in the MedAI viewer.

---

## Table of Contents
1. [Currently Implemented](#currently-implemented)
2. [Cornerstone.js Tools (Not Implemented)](#cornerstonejs-tools-not-implemented)
3. [Advanced Segmentation Algorithms](#advanced-segmentation-algorithms)
4. [External Library Integrations](#external-library-integrations)
5. [Implementation Priority](#implementation-priority)

---

## Currently Implemented

### Navigation Tools
| Tool | Description |
|------|-------------|
| PanTool | Pan/move the image view |
| ZoomTool | Zoom in/out functionality |
| StackScrollMouseWheelTool | Scroll through image stacks |
| WindowLevelTool | Adjust brightness/contrast |
| CrosshairsTool | Crosshairs overlay synced across viewports |

### Measurement Tools
| Tool | Description |
|------|-------------|
| LengthTool | Measure distance between two points |
| RectangleROITool | Rectangular region with area/statistics |

### Segmentation Tools
| Tool | Description |
|------|-------------|
| SegmentationDisplayTool | Display segmentation overlays |
| BrushTool | Paint/brush segmentation editing |
| CircleScissorsTool | Circle-based segmentation |
| RectangleScissorsTool | Rectangle-based segmentation |
| SphereScissorsTool | Sphere-based 3D segmentation |
| LassoFillTool (custom) | Freehand polygon fill |

### AI-Powered Segmentation (Integrated)
| Tool/Model | Description |
|------------|-------------|
| ProbeMONAILabelTool | Point-based MONAI Label SmartEdit prompts |
| RectangleMONAILabelTool | Bounding box MONAI Label prompts |
| FreehandMONAILabelTool | Freehand/lasso MONAI Label prompts |
| SAM3 | Segment Anything Model 3 for interactive segmentation |
| TotalSegmentator | Automatic multi-organ CT/MR segmentation (104 structures) |
| BiomedParse | Text-prompted medical image segmentation |

---

## Cornerstone.js Tools (Not Implemented)

### Annotation/Measurement Tools

| Tool | Description | Priority | Use Case |
|------|-------------|----------|----------|
| **ProbeTool** | Display voxel values (HU for CT, SUV for PET) at cursor | High | Essential for radiologists to inspect tissue density |
| **DragProbeTool** | Draggable probe to examine values across regions | Medium | Explore intensity profiles |
| **AngleTool** | Measure angles between two lines | High | Joint angles, anatomical landmarks |
| **CobbAngleTool** | Specialized for scoliosis/spine curvature | Medium | Orthopedic/spine imaging |
| **BidirectionalTool** | Measure width AND length simultaneously | High | Standard for lesion measurement (RECIST) |
| **HeightTool** | Vertical distance measurement | Low | Specific vertical measurements |
| **EllipticalROITool** | Elliptical region of interest | High | Better fit for many anatomical structures |
| **CircleROITool** | Circular region of interest | Medium | Simpler alternative to ellipse |
| **SplineROITool** | Smooth curved ROI using splines | Medium | Complex curved annotations |
| **PlanarFreehandROITool** | Freehand drawing for ROI | Medium | Arbitrary shape ROI |
| **ArrowAnnotateTool** | Arrow with text labels | High | Mark and label findings |

### Contour Segmentation Tools

| Tool | Description | Priority | Use Case |
|------|-------------|----------|----------|
| **LivewireContourTool** | Intelligent edge-following contour | High | Semi-automatic contour tracing |
| **LivewireContourSegmentationTool** | Livewire for segmentation creation | High | Assisted segmentation |
| **SplineContourSegmentationTool** | Smooth spline-based boundaries | Medium | Smooth organ boundaries |
| **PlanarFreehandContourSegmentationTool** | Freehand to segmentation | Medium | Quick manual segmentation |

### Advanced Segmentation Tools

| Tool | Description | Priority | Use Case |
|------|-------------|----------|----------|
| **PaintFillTool** | Flood fill / paint bucket | High | Fill connected regions quickly |
| **RectangleROIThresholdTool** | Threshold segmentation in rectangle | Medium | Quick threshold-based selection |
| **CircleROIStartEndThresholdTool** | Range thresholding in circle | Medium | Threshold with circular ROI |
| **SegmentSelectTool** | Select/toggle individual segments | Medium | Multi-label management |
| **SculptorTool** | Sculpt segmentation boundaries | Medium | Refine segmentation edges |

### Visualization/Overlay Tools

| Tool | Description | Priority | Use Case |
|------|-------------|----------|----------|
| **MagnifyTool** | Magnification lens at cursor | Medium | Detail inspection |
| **AdvancedMagnifyTool** | Advanced magnification options | Low | Custom magnification shapes |
| **OrientationMarkerTool** | Anatomical labels (R/L, A/P, H/F) | High | Essential for orientation |
| **OverlayGridTool** | Grid overlay | Low | Alignment reference |
| **ScaleOverlayTool** | Distance scale ruler | High | Visual size reference |
| **ReferenceLinesTool** | Reference lines across viewports | Medium | Cross-reference slices |

### Navigation Tools

| Tool | Description | Priority | Use Case |
|------|-------------|----------|----------|
| **TrackballRotateTool** | 3D trackball rotation | Medium | Intuitive 3D navigation |
| **PlanarRotateTool** | Rotate image in 2D | Low | Align oblique images |
| **VolumeRotateMouseWheelTool** | Scroll wheel 3D rotation | Low | Alternative 3D control |
| **MIPJumpToClickTool** | Jump through MIP layers | Medium | MIP navigation |

### Utility Tools

| Tool | Description | Priority | Use Case |
|------|-------------|----------|----------|
| **AnnotationEraserTool** | Delete annotations | High | Clean up annotations |
| **ReferenceCursors** | Synced cursors across viewports | Medium | Multi-viewport correlation |
| **KeyImageTool** | Mark key images | Medium | Flag important findings |

---

## Advanced Segmentation Algorithms

### Native to Cornerstone.js
Cornerstone.js does NOT include advanced segmentation algorithms natively. The following require external libraries or custom implementation.

### Region-Based Algorithms

| Algorithm | Description | Available In | Complexity |
|-----------|-------------|--------------|------------|
| **Region Growing** | Flood fill based on intensity similarity, expands from seed points | ITK, OpenCV.js, Custom JS | Medium |
| **GrowCut** | Cellular automaton segmentation, user draws object/background | OHIF Extension (WebGPU) | Medium |
| **Watershed** | Marker-based segmentation using gradient as topographic surface | OpenCV.js, ITK | Medium |
| **Connected Components** | Label connected regions by intensity | OpenCV.js, Custom JS | Low |

### Edge-Based Algorithms

| Algorithm | Description | Available In | Complexity |
|-----------|-------------|--------------|------------|
| **Snake / Active Contours** | Contours that evolve to fit edges, minimizes energy function | ITK (Geodesic Active Contour) | High |
| **Level Set Methods** | Implicit contour evolution, handles topology changes | ITK | High |
| **Livewire / Intelligent Scissors** | Edge-following path finding for contour tracing | Cornerstone.js (LivewireContourTool) | Medium |

### Threshold-Based Algorithms

| Algorithm | Description | Available In | Complexity |
|-----------|-------------|--------------|------------|
| **Global Thresholding** | Simple intensity threshold | Custom JS | Low |
| **Otsu's Method** | Automatic threshold selection | ITK, OpenCV (limited JS) | Low |
| **Adaptive Thresholding** | Local threshold based on neighborhood | OpenCV.js | Medium |
| **Hysteresis Thresholding** | Two-threshold method (high/low) | Custom JS | Low |

### Morphological Operations

| Operation | Description | Available In | Use Case |
|-----------|-------------|--------------|----------|
| **Erosion** | Shrink foreground regions | OpenCV.js, ITK | Remove small noise |
| **Dilation** | Expand foreground regions | OpenCV.js, ITK | Fill small holes |
| **Opening** | Erosion followed by dilation | OpenCV.js, ITK | Remove noise, preserve shape |
| **Closing** | Dilation followed by erosion | OpenCV.js, ITK | Fill holes, preserve shape |
| **Morphological Gradient** | Difference between dilation and erosion | OpenCV.js | Edge detection |

### AI-Based Segmentation (Already Implemented in MedAI)

| Model | Description | Status | Notes |
|-------|-------------|--------|-------|
| **MONAI Label** | NVIDIA's medical AI framework | **Implemented** | SmartEdit with point/box/lasso prompts |
| **SAM3** | Segment Anything Model 3 | **Implemented** | Interactive segmentation |
| **TotalSegmentator** | Multi-organ CT/MR segmentation | **Implemented** | 104 anatomical structures |
| **BiomedParse** | Multi-modal medical image parsing | **Implemented** | Text-prompted segmentation |

### Additional AI Models (Available in OHIF)

| Model | Description | Available In | Notes |
|-------|-------------|--------------|-------|
| **SAM2** | Meta's Segment Anything Model 2 | OHIF v3.10+ | Treats 3D as video frames |
| **MedSAM2** | Medical specialization of SAM2 | OHIF v3.10+ | Trained on 450k medical volumes |
| **nnInteractive** | Interactive framework | OHIF v3.10+ | Alternative to MONAI Label |

### Graph-Based Algorithms

| Algorithm | Description | Available In | Complexity |
|-----------|-------------|--------------|------------|
| **Graph Cut** | Min-cut/max-flow optimization | Server-side only | High |
| **Random Walker** | Probabilistic segmentation from seeds | Server-side only | High |
| **GrabCut** | Interactive foreground extraction | OpenCV.js | Medium |

---

## External Library Integrations

### OpenCV.js
**Website:** https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html

**Available Algorithms:**
- Watershed segmentation
- GrabCut
- Morphological operations (erosion, dilation, opening, closing)
- Contour detection
- Thresholding (basic)
- k-means clustering

**Integration Notes:**
- Pure JavaScript, runs in browser
- ~8MB library size
- Good for post-processing segmentations

### ITK-WASM (ITK.js)
**Website:** https://wasm.itk.org/

**Available Algorithms:**
- Region growing
- Level set methods (Geodesic Active Contour, Chan-Vese)
- Fast marching method
- Morphological operations
- Advanced filtering

**Integration Notes:**
- WebAssembly-based, high performance
- More complex integration
- Comprehensive medical imaging algorithms

### VTK.js
**Website:** https://kitware.github.io/vtk-js/

**Available Features:**
- 3D visualization
- Volume rendering
- Surface extraction (marching cubes)
- Contouring

**Integration Notes:**
- Already used by Cornerstone3D for rendering
- Focus is visualization, not segmentation algorithms

---

## Implementation Priority

### Phase 1: Essential Tools (High Priority)
1. **ProbeTool** - Voxel value inspection
2. **AngleTool** - Angle measurement
3. **BidirectionalTool** - Lesion measurement
4. **EllipticalROITool** - Ellipse ROI
5. **OrientationMarkerTool** - Orientation labels
6. **ScaleOverlayTool** - Scale reference
7. **ArrowAnnotateTool** - Annotations with labels
8. **AnnotationEraserTool** - Delete annotations

### Phase 2: Advanced Segmentation (Medium Priority)
1. **LivewireContourTool** - Smart contour tracing
2. **PaintFillTool** - Flood fill segmentation
3. **Region Growing** - Custom implementation or OpenCV.js
4. **Morphological Operations** - Via OpenCV.js
5. **GrowCut** - OHIF extension or custom WebGPU

### Phase 3: Specialized Tools (Lower Priority)
1. **CobbAngleTool** - Spine measurement
2. **MagnifyTool** - Magnification lens
3. **TrackballRotateTool** - 3D navigation
4. **Watershed** - Via OpenCV.js
5. **Level Set Methods** - Via ITK-WASM

### Already Completed: AI Integration
MedAI already has comprehensive AI-based segmentation:
- **MONAI Label** - Interactive SmartEdit with point/box/lasso prompts
- **SAM3** - Segment Anything Model for interactive segmentation
- **TotalSegmentator** - Automatic multi-organ segmentation (104 structures)
- **BiomedParse** - Text-prompted segmentation

---

## Resources

### Documentation
- [Cornerstone.js Tools](https://www.cornerstonejs.org/docs/concepts/cornerstone-tools/tools/)
- [Cornerstone.js Segmentation](https://www.cornerstonejs.org/docs/concepts/cornerstone-tools/segmentation/)
- [OHIF Viewer](https://docs.ohif.org/)
- [OpenCV.js Tutorials](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- [ITK Software Guide](https://itk.org/ITKSoftwareGuide/html/Book2/ITKSoftwareGuide-Book2ch4.html)

### GitHub Repositories
- [Cornerstone3D](https://github.com/cornerstonejs/cornerstone3D)
- [OHIF Viewer](https://github.com/OHIF/Viewers)
- [OHIF GrowCut Extension](https://github.com/nicholasrwx/ohif-cornerstone-spherical-growcut-extension)
- [ITK-WASM](https://github.com/InsightSoftwareConsortium/itk-wasm)

---

*Last updated: January 2026*
