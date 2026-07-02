/**
 * MedAI Suites - Registry
 *
 * Central registry of all suite configurations. Each suite defines
 * a domain-specific workflow bundle with UI, tools, models, and analytics.
 */

import type {
  SuiteId,
  SuiteConfig,
  SuiteTabConfig,
  SuitePanelConfig,
  SuiteDetectionHints,
  SuiteLongitudinalConfig,
  LayoutPreset,
  ExportFormat,
} from './types';
import type { FeatureId } from '../features/types';
import { isFeatureEnabled } from '../features/registry';

// ============================================================================
// PHASE 1 SUITES - Active Development
// ============================================================================

/**
 * Oncology Suite Configuration
 *
 * Provides AI-assisted tumor analysis, volumetrics, and response assessment
 * for radiologists, oncologists, and clinical researchers.
 *
 * @see /docs/suites/ONCOLOGY_SUITE_PRD.md
 */
export const ONCOLOGY_SUITE: SuiteConfig = {
  id: 'oncology',
  name: 'Oncology',
  description: 'Tumor analysis, volumetrics, and response assessment',
  icon: 'Target',

  // === Layout & Tools ===
  defaultLayout: 'fourUp' as LayoutPreset,

  wlPresets: [
    'ct-soft-tissue', // W:400 C:40
    'ct-lung', // W:1500 C:-600
    'ct-liver', // W:150 C:30
    'ct-bone', // W:2000 C:300
    'mr-t1', // W:500 C:250
    'mr-t2', // W:500 C:250
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Crosshairs',
    'Length',
    'RectangleROI',
    'EllipticalROI',
    'Brush',
    'Eraser',
    'Lasso',
    'RectFill',
  ],

  // === MONAI Label Integration ===
  monaiTasks: ['tumor_segmentation', 'organ_segmentation'],
  preferredModels: ['TotalSegmentator', 'nnInteractive', 'MedSAM2', 'BiomedParse'],

  // === Analytics & Export ===
  metricsPanelId: 'oncology-metrics',
  enabledMetrics: ['volume', 'diameter', 'recist', 'radiomics', 'lesion_count'],
  allowedExports: ['nifti', 'csv', 'json', 'dicom-seg'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
    {
      id: 'oncology-metrics',
      label: 'Metrics',
      component: 'OncologyMetricsTab',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'oncology-metrics', component: 'OncologyMetricsPanel', order: 2 },
    { id: 'analytics', component: 'AnalyticsPanel', order: 3 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: ['CT', 'MR', 'PT'],
    bodyParts: ['LIVER', 'LUNG', 'CHEST', 'ABDOMEN', 'PELVIS', 'WHOLE BODY'],
    descriptionKeywords: ['tumor', 'mass', 'lesion', 'oncology', 'cancer', 'metasta'],
    protocolKeywords: ['staging', 'restaging', 'follow-up', 'surveillance'],
  } as SuiteDetectionHints,

  // === Longitudinal Support ===
  supportsLongitudinal: true,
  longitudinalConfig: {
    defaultLongitudinalLayout: 'longitudinal-2' as LayoutPreset,
    maxTimepoints: 4,
    trackableMetrics: ['volume', 'diameter', 'recist', 'lesion_count'],
    enableResponseAssessment: true,
    enableLesionTracking: true,
  } as SuiteLongitudinalConfig,
};

/**
 * Radiation Therapy (RT) Suite Configuration
 *
 * Provides AI-assisted structure contouring and RTSTRUCT import/export
 * for radiation oncologists, dosimetrists, and RT planning teams.
 *
 * @see /docs/suites/RT_SUITE_PRD.md
 */
export const RT_SUITE: SuiteConfig = {
  id: 'rt',
  name: 'Radiation Therapy',
  description: 'RT structure contouring and RTSTRUCT export',
  icon: 'Radiation',

  // === Layout & Tools ===
  defaultLayout: 'threePlusOne' as LayoutPreset, // 3 MPR + smaller 3D

  wlPresets: [
    'ct-soft-tissue', // W:400 C:40
    'ct-lung', // W:1500 C:-600
    'ct-bone', // W:2000 C:300
    'ct-brain', // W:80 C:40
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Crosshairs',
    'Brush',
    'Eraser',
    'Lasso',
    'RectFill',
    'RectOutline',
    'Contour',
    'Interpolation',
  ],

  // === MONAI Label Integration ===
  monaiTasks: ['organ_at_risk', 'gtv_ctv'],
  preferredModels: ['TotalSegmentator', 'nnInteractive'],

  // === Analytics & Export ===
  metricsPanelId: 'rt-structures',
  enabledMetrics: ['volume', 'structure_volumes'],
  allowedExports: ['rtstruct', 'nifti', 'mesh', 'csv'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
    {
      id: 'rt-structures',
      label: 'RT Struct',
      component: 'RTStructuresTab',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'rt-structures', component: 'RTStructuresPanel', order: 2 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: ['CT', 'RTPLAN', 'RTDOSE', 'RTSTRUCT'],
    bodyParts: ['HEAD', 'BRAIN', 'CHEST', 'PELVIS', 'ABDOMEN'],
    descriptionKeywords: ['rt', 'radiation', 'planning', 'therapy', 'contour', 'oar'],
    protocolKeywords: ['treatment', 'plan', 'simulation', 'rt sim'],
  } as SuiteDetectionHints,
};

/**
 * Auto Suite Configuration (Default/Generic)
 *
 * Generic suite used when no specific clinical domain is detected.
 * Provides all tools and a balanced configuration for general imaging.
 */
export const AUTO_SUITE: SuiteConfig = {
  id: 'auto',
  name: 'Auto',
  description: 'Automatic mode - adapts to loaded study',
  icon: 'Wand2',

  // === Layout & Tools ===
  defaultLayout: 'fourUp' as LayoutPreset,

  wlPresets: [
    'ct-soft-tissue',
    'ct-lung',
    'ct-liver',
    'ct-bone',
    'ct-brain',
    'mr-t1',
    'mr-t2',
    'mr-flair',
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Crosshairs',
    'Length',
    'RectangleROI',
    'EllipticalROI',
    'Brush',
    'Eraser',
    'Lasso',
    'RectFill',
  ],

  // === MONAI Label Integration ===
  monaiTasks: ['organ_segmentation', 'interactive_segmentation'],
  preferredModels: ['TotalSegmentator', 'nnInteractive', 'MedSAM2'],

  // === Analytics & Export ===
  metricsPanelId: 'general-metrics',
  enabledMetrics: ['volume', 'diameter'],
  allowedExports: ['nifti', 'csv', 'json', 'dicom-seg'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'analytics', component: 'AnalyticsPanel', order: 2 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  // Auto suite matches everything with lowest priority
  detectionHints: {
    modalities: [],
    bodyParts: [],
    descriptionKeywords: [],
    protocolKeywords: [],
  } as SuiteDetectionHints,
};

// ============================================================================
// PHASE 2-3 SUITES - Placeholders
// ============================================================================

/**
 * Neurology Suite Configuration (Phase 2)
 *
 * Provides AI-assisted brain lesion analysis, MS lesion tracking,
 * stroke assessment, and brain volumetrics for neurologists,
 * neuroradiologists, and neurosurgeons.
 *
 * Features:
 * - Brain parcellation and structure segmentation
 * - MS lesion detection and tracking
 * - Stroke lesion identification (DWI/ADC analysis)
 * - Brain volumetrics (atrophy analysis)
 * - Tumor grading support
 *
 * @see /docs/suites/NEUROLOGY_SUITE_PRD.md
 */
export const NEUROLOGY_SUITE: SuiteConfig = {
  id: 'neurology',
  name: 'Neurology',
  description: 'Brain lesion analysis, MS tracking, and neuroimaging workflows',
  icon: 'Brain',

  // === Layout & Tools ===
  defaultLayout: 'fourUp' as LayoutPreset,

  // Additional layout presets for multi-sequence workflows
  additionalLayouts: [
    'sequence-2x2',     // 2x2 grid for T1/T2/FLAIR/DWI
    'sequence-1x4',     // 1x4 row for sequence comparison
    'fusion-main',      // Large fused main + sequence strip
    'dwi-adc-compare',  // Side-by-side DWI/ADC comparison
  ],

  wlPresets: [
    'ct-brain', // W:80 C:40 - standard brain CT
    'ct-stroke', // W:40 C:40 - narrow window for stroke
    'mr-t1', // T1-weighted
    'mr-t2', // T2-weighted
    'mr-flair', // FLAIR for white matter lesions
    'mr-dwi', // Diffusion weighted
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Crosshairs',
    'Length',
    'EllipticalROI',
    'Brush',
    'Eraser',
    'Lasso',
    'RectFill',
    'ProbMap', // Probability map overlay for lesion detection
  ],

  // === MONAI Label Integration ===
  monaiTasks: [
    'brain_parcellation', // FreeSurfer-like parcellation
    'brain_tumor', // GBM, meningioma, etc.
    'ms_lesion', // Multiple sclerosis lesions
    'stroke_lesion', // Acute/chronic stroke
    'white_matter_hyperintensity', // WMH detection
  ],
  preferredModels: ['BiomedParse', 'nnInteractive', 'SynthSeg'],

  // === Disease-Specific Modes ===
  modes: [
    {
      id: 'general',
      name: 'General Neuro',
      preferredTasks: ['brain_parcellation', 'brain_tumor'],
      defaultLayout: 'fourUp' as LayoutPreset,
    },
    {
      id: 'ms_protocol',
      name: 'MS Protocol',
      preferredTasks: ['ms_lesion', 'brain_parcellation'],
      defaultLayout: 'sequence-2x2',
      emphasizedRegions: ['periventricular', 'juxtacortical', 'infratentorial'],
    },
    {
      id: 'dementia',
      name: 'Dementia',
      preferredTasks: ['brain_parcellation'],
      defaultLayout: 'fourUp' as LayoutPreset,
      emphasizedRegions: ['hippocampus', 'temporal', 'ventricles'],
    },
    {
      id: 'stroke',
      name: 'Stroke',
      preferredTasks: ['stroke_lesion'],
      defaultLayout: 'dwi-adc-compare',
      emphasizedRegions: ['dwi_lesion', 'adc_lesion'],
    },
  ],

  // === Analytics & Export ===
  metricsPanelId: 'neuro-metrics',
  enabledMetrics: [
    'volume',
    'lesion_count',
    'lesion_load', // Total lesion volume
    'brain_volumetrics', // Regional brain volumes
    'atrophy_index', // Brain atrophy measurement
    'laterality', // Left/right hemisphere comparison
    'icv_normalized', // ICV-normalized volumes
    'asymmetry_index', // L/R asymmetry
    'lesion_location', // MS-style lesion location
  ],
  allowedExports: ['nifti', 'csv', 'json', 'dicom-seg', 'ms-trial-table'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
    {
      id: 'neuro-metrics',
      label: 'Neuro',
      component: 'NeuroMetricsTab',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'neuro-mode-selector', component: 'NeuroModeSelector', order: 2 },
    { id: 'neuro-metrics', component: 'NeurologyMetricsPanel', order: 3 },
    { id: 'icv-normalization', component: 'ICVNormalizationBanner', order: 4 },
    { id: 'asymmetry-indices', component: 'AsymmetryIndicesPanel', order: 5 },
    { id: 'regional-grouping', component: 'RegionalGroupingPanel', order: 6 },
    { id: 'lesion-location', component: 'LesionLocationBreakdown', order: 7 },
    { id: 'ms-protocol', component: 'MSProtocolPanel', order: 8, showForModes: ['ms_protocol'] },
    { id: 'dementia', component: 'DementiaPanel', order: 9, showForModes: ['dementia'] },
    { id: 'stroke', component: 'StrokePanel', order: 10, showForModes: ['stroke'] },
    { id: 'top-changes', component: 'TopChangesPanel', order: 11 },
    { id: 'lesion-tracking', component: 'LesionTrackingPanel', order: 12 },
    { id: 'qc', component: 'NeuroQCPanel', order: 13 },
    { id: 'sequence-selector', component: 'SequenceSelectorPanel', order: 14 },
    { id: 'fusion-controls', component: 'FusionControlsPanel', order: 15 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: ['MR', 'CT'],
    bodyParts: ['HEAD', 'BRAIN', 'NECK'],
    descriptionKeywords: [
      'brain',
      'neuro',
      'stroke',
      'ms',
      'multiple sclerosis',
      'lesion',
      'white matter',
      'glioma',
      'glioblastoma',
      'meningioma',
      'tumor',
      'flair',
      'dwi',
      'adc',
      'perfusion',
      'mra',
    ],
    protocolKeywords: ['brain', 'head', 'neuro', 'dwi', 'flair', 'stroke', 'epilepsy'],
  } as SuiteDetectionHints,

  // === Longitudinal Support ===
  supportsLongitudinal: true,
  longitudinalConfig: {
    defaultLongitudinalLayout: 'longitudinal-2' as LayoutPreset,
    maxTimepoints: 4,
    trackableMetrics: ['volume', 'lesion_count', 'lesion_load', 'brain_volumetrics', 'atrophy_index'],
    enableResponseAssessment: false,
    enableLesionTracking: true,
  } as SuiteLongitudinalConfig,
};

/**
 * Cardiology Suite Configuration (Phase 3)
 *
 * Provides AI-assisted cardiac imaging analysis including chamber
 * segmentation, ejection fraction, calcium scoring, and coronary
 * artery visualization for cardiologists, radiologists, and
 * cardiac imaging specialists.
 *
 * Features:
 * - Cardiac chamber segmentation (LV, RV, LA, RA, myocardium)
 * - Ejection fraction calculation (LVEF, RVEF)
 * - Calcium scoring (Agatston score)
 * - Coronary artery visualization
 * - Wall motion analysis
 * - Pericardial/pleural effusion detection
 *
 * @see /docs/suites/CARDIOLOGY_SUITE_PRD.md
 */
export const CARDIOLOGY_SUITE: SuiteConfig = {
  id: 'cardiology',
  name: 'Cardiology',
  description: 'Cardiac function, coronary analysis, and calcium scoring',
  icon: 'Heart',

  // === Layout & Tools ===
  defaultLayout: 'fourUp' as LayoutPreset,

  wlPresets: [
    'ct-soft-tissue', // W:400 C:40 - general cardiac
    'ct-angio', // W:600 C:300 - coronary CTA
    'ct-calcium', // W:130 C:90 - calcium scoring window
    'ct-lung', // W:1500 C:-600 - pericardial/pleural
    'mr-cardiac-cine', // Cardiac cine MRI
    'mr-t1-mapping', // T1 mapping
    'mr-t2-mapping', // T2 mapping (edema)
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Crosshairs',
    'Length',
    'EllipticalROI',
    'AreaROI',
    'Brush',
    'Eraser',
    'Lasso',
    'RectFill',
    'CalciumROI', // Calcium scoring ROI
    'Angle', // For valve angles
  ],

  // === MONAI Label Integration ===
  monaiTasks: [
    'cardiac_chambers', // LV, RV, LA, RA segmentation
    'myocardium', // Myocardial segmentation
    'coronary_arteries', // Coronary vessel segmentation
    'aorta', // Aorta and great vessels
    'pericardium', // Pericardial segmentation
    'calcium_detection', // Coronary calcium detection
  ],
  preferredModels: ['TotalSegmentator', 'nnInteractive', 'BiomedParse'],

  // === Analytics & Export ===
  metricsPanelId: 'cardiac-metrics',
  enabledMetrics: [
    'volume', // Chamber volumes
    'ejection_fraction', // LVEF, RVEF
    'calcium_score', // Agatston score
    'wall_thickness', // Myocardial wall thickness
    'mass', // Myocardial mass
    'strain', // Myocardial strain (if cine available)
    'regurgitation', // Valve regurgitation fraction
  ],
  allowedExports: ['nifti', 'csv', 'json', 'dicom-seg', 'mesh'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
    {
      id: 'cardiac-metrics',
      label: 'Cardiac',
      component: 'CardiacMetricsTab',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'cardiac-metrics', component: 'CardiacMetricsPanel', order: 2 },
    { id: 'cardiac-function', component: 'CardiacFunctionPanel', order: 3 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: ['CT', 'MR', 'US'],
    bodyParts: ['CHEST', 'HEART', 'THORAX'],
    descriptionKeywords: [
      'cardiac',
      'heart',
      'coronary',
      'cta',
      'calcium',
      'calcium score',
      'agatston',
      'aorta',
      'ejection',
      'lvef',
      'rvef',
      'chamber',
      'ventricle',
      'atrium',
      'myocardium',
      'pericardium',
      'valve',
      'stenosis',
      'cine',
      'perfusion',
      'viability',
    ],
    protocolKeywords: [
      'cardiac',
      'coronary',
      'heart',
      'cta',
      'calcium score',
      'cac',
      'cardiac cine',
      'cardiac function',
      'lge',
      'perfusion',
    ],
  } as SuiteDetectionHints,
};

/**
 * Surgical Planning Suite Configuration (Phase 2)
 *
 * Provides advanced 3D visualization and surgical planning tools
 * for surgeons, radiologists, and surgical navigation teams.
 *
 * Features:
 * - High-quality 3D surface rendering
 * - Surgical corridor planning
 * - Distance and angle measurements
 * - Vessel and anatomy visualization
 * - Export to 3D printing formats (STL, OBJ, GLB)
 * - Virtual surgical approach simulation
 *
 * @see /docs/suites/SURGICAL_SUITE_PRD.md
 */
export const SURGICAL_SUITE: SuiteConfig = {
  id: 'surgical',
  name: 'Surgical Planning',
  description: '3D visualization, surgical corridors, and 3D printing export',
  icon: 'Scissors',

  // === Layout & Tools ===
  defaultLayout: 'big3D' as LayoutPreset, // Large 3D + 1-2 MPR views

  wlPresets: [
    'ct-soft-tissue', // W:400 C:40
    'ct-bone', // W:2000 C:300 - for orthopedic planning
    'ct-angio', // W:600 C:300 - vascular visualization
    'ct-muscle', // W:400 C:50
    'mr-t1', // Soft tissue contrast
    'mr-t2', // Fluid/pathology
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Crosshairs',
    'Length',
    'Angle',
    'CobbAngle', // Spine surgery
    'Brush',
    'Eraser',
    'Lasso',
    'RectFill',
    'Ruler3D', // 3D measurements
    'Corridor', // Surgical corridor planning
  ],

  // === MONAI Label Integration ===
  monaiTasks: [
    'organ_segmentation', // General anatomy
    'vessel_segmentation', // Vascular planning
    'bone_segmentation', // Orthopedic planning
    'spine_segmentation', // Spine surgery
    'liver_segments', // Liver resection planning
  ],
  preferredModels: ['TotalSegmentator', 'nnInteractive', 'MedSAM2'],

  // === Analytics & Export ===
  metricsPanelId: 'surgical-metrics',
  enabledMetrics: [
    'volume',
    'diameter',
    'distance',
    'angle',
    'surface_area', // For resection planning
    'resection_volume', // Estimated removal volume
  ],
  allowedExports: ['nifti', 'mesh', 'stl', 'obj', 'glb', 'ply'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
    {
      id: 'surgical-planning',
      label: '3D Plan',
      component: 'SurgicalPlanningTab',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'surgical-planning', component: 'SurgicalPlanningPanel', order: 2 },
    { id: '3d-export', component: 'MeshExportPanel', order: 3 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: ['CT', 'MR'],
    bodyParts: ['SPINE', 'PELVIS', 'EXTREMITY', 'LIVER', 'KIDNEY'],
    descriptionKeywords: [
      'surgical',
      'planning',
      'pre-op',
      'preoperative',
      '3d',
      'reconstruction',
      'resection',
      'approach',
      'navigation',
      'orthopedic',
      'spine',
      'hepatectomy',
      'nephrectomy',
    ],
    protocolKeywords: ['surgical', 'planning', 'pre-op', 'navigation', '3d recon'],
  } as SuiteDetectionHints,
};

// ============================================================================
// CHEST X-RAY SUITE
// ============================================================================

/**
 * Chest X-Ray Suite Configuration
 *
 * Provides AI-powered chest X-ray analysis with MedGemma detection,
 * bounding box visualization, and agentic report generation.
 *
 * Features:
 * - AI detection with bounding box overlay (MedGemma 4B)
 * - Structured findings panel
 * - Agentic report generation workflow
 * - Single view layout optimized for 2D images
 *
 * @see /docs/suites/CHESTXRAY_SUITE_PRD.md
 */
export const CHESTXRAY_SUITE: SuiteConfig = {
  id: 'chestxray',
  name: 'Chest X-Ray',
  description: 'AI-assisted chest X-ray analysis with detection and reporting',
  icon: 'Stethoscope',
  requiredFeatures: ['chestxray'],

  // === Layout & Tools ===
  defaultLayout: 'singleView' as LayoutPreset,

  wlPresets: [
    'xray-default',      // W:2048 C:1024 - standard chest X-ray
    'xray-lung',         // W:3000 C:500 - lung parenchyma
    'xray-mediastinum',  // W:500 C:50 - mediastinal structures
    'xray-bone',         // W:2500 C:480 - ribs, spine
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Length',
    'EllipticalROI',
    'RectangleROI',
  ],

  // === MONAI Label Integration ===
  monaiTasks: ['chestxray_detection'],
  preferredModels: ['MedGemma'],

  // === Analytics & Export ===
  metricsPanelId: 'chestxray-findings',
  enabledMetrics: ['detection_count', 'confidence_scores'],
  allowedExports: ['json', 'csv', 'png'] as ExportFormat[],

  // === RightPanel Configuration ===
  // Detection tab + Ask MedAI for clinical decision support
  tabs: [
    {
      id: 'detection',
      label: 'Detection',
      component: 'ChestXrayDetectionTab',
      icon: 'Scan',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'detections', component: 'DetectionsPanel', order: 1 },
    { id: 'findings', component: 'FindingsPanel', order: 2 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: ['CR', 'DX', 'XR'],
    bodyParts: ['CHEST'],
    descriptionKeywords: [
      'chest',
      'cxr',
      'pa',
      'ap',
      'lateral',
      'x-ray',
      'xray',
      'portable',
      'radiograph',
      'thorax',
    ],
    protocolKeywords: [
      'chest',
      'portable',
      'pa chest',
      'ap chest',
      'chest 2 view',
      'chest single view',
      'cxr',
    ],
  } as SuiteDetectionHints,

  // === Longitudinal Support ===
  supportsLongitudinal: true,
  longitudinalConfig: {
    defaultLongitudinalLayout: 'comparison' as LayoutPreset,
    maxTimepoints: 3,
    trackableMetrics: ['detection_count', 'finding_progression'],
    enableResponseAssessment: false,
    enableLesionTracking: false,
  } as SuiteLongitudinalConfig,
};

// ============================================================================
// MEDICAL IMAGE ANNOTATION SUITE
// ============================================================================

/**
 * Medical Image Annotation Suite Configuration
 *
 * Purpose-built for professional medical image annotation workflows.
 * Provides CVAT/V7-style annotation capabilities with AI-assisted tools
 * (BiomedParse, SAM), batch processing, multi-format export, and
 * agentic conversational annotation.
 *
 * Target users:
 * - Medical Annotation Startups (building training datasets for AI)
 * - Research Centers (annotating data for medical imaging research)
 * - Imaging CROs (managing multi-site annotation projects)
 *
 * @see /docs/suites/MEDICAL_IMAGE_ANNOTATION_SUITE_PRD.md
 */
export const ANNOTATION_SUITE: SuiteConfig = {
  id: 'annotation',
  name: 'Medical Annotation',
  description: 'AI-assisted medical image annotation with batch processing and multi-format export',
  icon: 'PenTool',

  // === Layout & Tools ===
  defaultLayout: 'singleView' as LayoutPreset,

  wlPresets: [
    'ct-soft-tissue',
    'ct-lung',
    'ct-bone',
    'ct-brain',
    'mr-t1',
    'mr-t2',
    'xray-default',
  ],

  enabledTools: [
    'WindowLevel',
    'Zoom',
    'Pan',
    'Brush',
    'Eraser',
    'Polygon',
    'Polyline',
    'SmartBrush',
    'Rectangle',
    'Length',
    'LassoFill',
  ],

  // === MONAI Label Integration ===
  monaiTasks: ['segmentation', 'smart_segment'],
  preferredModels: ['BiomedParse', 'SAM'],

  // === Analytics & Export ===
  metricsPanelId: 'annotation-stats',
  enabledMetrics: ['annotation_count', 'segment_count', 'coverage'],
  allowedExports: ['nifti', 'dicom-seg', 'rtstruct', 'json', 'png', 'csv'] as ExportFormat[],

  // === RightPanel Configuration ===
  tabs: [
    {
      id: 'auto-segmentation',
      label: 'Auto-Seg',
      component: 'AutoSegmentationTab',
    },
    {
      id: 'smart-edit',
      label: 'SmartEdit',
      component: 'SmartEditTab',
    },
    {
      id: 'annotations',
      label: 'Annotations',
      component: 'AnnotationsTab',
      icon: 'PenTool',
    },
    {
      id: 'export',
      label: 'Export',
      component: 'ExportTab',
      icon: 'Download',
    },
  ] as SuiteTabConfig[],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'annotation-history', component: 'AnnotationHistoryPanel', order: 2 },
    { id: 'batch', component: 'BatchProcessPanel', order: 3 },
  ] as SuitePanelConfig[],

  // === Auto-detection ===
  detectionHints: {
    modalities: [],
    bodyParts: [],
    descriptionKeywords: [],
    protocolKeywords: [],
  } as SuiteDetectionHints,

  // === Longitudinal Support ===
  supportsLongitudinal: false,
};

// ============================================================================
// REGISTRY
// ============================================================================

/**
 * Central registry of all suite configurations.
 *
 * Maps SuiteId to its full configuration. Use helper functions
 * below for common operations.
 */
export const SUITES_REGISTRY: Record<SuiteId, SuiteConfig> = {
  auto: AUTO_SUITE,
  oncology: ONCOLOGY_SUITE,
  rt: RT_SUITE,
  neurology: NEUROLOGY_SUITE,
  cardiology: CARDIOLOGY_SUITE,
  surgical: SURGICAL_SUITE,
  chestxray: CHESTXRAY_SUITE,
  annotation: ANNOTATION_SUITE,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a suite configuration by ID.
 *
 * @param id - The suite identifier
 * @returns The suite configuration, or AUTO_SUITE if not found
 *
 * @example
 * ```typescript
 * const suite = getSuite('oncology');
 * console.log(suite.name); // 'Oncology'
 * ```
 */
/**
 * Default feature requirements by component name. Applies to every suite's
 * tabs/panels unless an entry sets its own `requiredFeatures` explicitly.
 * Components not listed here are part of the basic viewer (always shown).
 */
const COMPONENT_FEATURE_REQUIREMENTS: Record<string, FeatureId[]> = {
  AutoSegmentationTab: ['monai-segmentation'],
  SmartEditTab: ['monai-segmentation'],
  ChestXrayDetectionTab: ['chestxray'],
  DetectionsPanel: ['chestxray'],
  AnalyticsPanel: ['analytics'],
  BatchProcessPanel: ['batch'],
};

function entryFeaturesSatisfied(entry: { component: string; requiredFeatures?: FeatureId[] }): boolean {
  const required = entry.requiredFeatures ?? COMPONENT_FEATURE_REQUIREMENTS[entry.component];
  if (!required || required.length === 0) return true;
  return required.every((id) => isFeatureEnabled(id));
}

/**
 * Whether a suite itself is available under the current feature flags
 */
export function isSuiteAvailable(suite: SuiteConfig): boolean {
  if (!suite.requiredFeatures || suite.requiredFeatures.length === 0) return true;
  return suite.requiredFeatures.every((id) => isFeatureEnabled(id));
}

/**
 * Strip tabs/panels whose required features are disabled
 */
function filterSuiteForFeatures(suite: SuiteConfig): SuiteConfig {
  const tabs = suite.tabs.filter(entryFeaturesSatisfied);
  const panels = suite.panels.filter(entryFeaturesSatisfied);
  if (tabs.length === suite.tabs.length && panels.length === suite.panels.length) {
    return suite;
  }
  return { ...suite, tabs, panels };
}

export function getSuite(id: SuiteId): SuiteConfig {
  const suite = SUITES_REGISTRY[id] ?? AUTO_SUITE;
  return filterSuiteForFeatures(isSuiteAvailable(suite) ? suite : AUTO_SUITE);
}

/**
 * Get all enabled suites.
 *
 * Returns suites that are actively implemented and ready for use.
 *
 * @returns Array of enabled suite configurations
 *
 * @example
 * ```typescript
 * const enabled = getEnabledSuites();
 * // Returns: [AUTO_SUITE, ONCOLOGY_SUITE, RT_SUITE, NEUROLOGY_SUITE, SURGICAL_SUITE]
 * ```
 */
export function getEnabledSuites(): SuiteConfig[] {
  const enabledIds: SuiteId[] = ['auto', 'oncology', 'rt', 'neurology', 'cardiology', 'surgical', 'chestxray', 'annotation'];
  return enabledIds
    .map((id) => SUITES_REGISTRY[id])
    .filter(isSuiteAvailable)
    .map(filterSuiteForFeatures);
}

/**
 * List all available suite IDs.
 *
 * @returns Array of all suite identifiers
 *
 * @example
 * ```typescript
 * const ids = listSuiteIds();
 * // Returns: ['auto', 'oncology', 'rt', 'neurology', 'cardiology', 'surgical']
 * ```
 */
export function listSuiteIds(): SuiteId[] {
  return Object.keys(SUITES_REGISTRY) as SuiteId[];
}

/**
 * Check if a suite ID is valid.
 *
 * @param id - The string to check
 * @returns True if the ID is a valid SuiteId
 *
 * @example
 * ```typescript
 * isValidSuiteId('oncology'); // true
 * isValidSuiteId('invalid'); // false
 * ```
 */
export function isValidSuiteId(id: string): id is SuiteId {
  return id in SUITES_REGISTRY;
}

/**
 * Get suite configurations that match a modality.
 *
 * @param modality - DICOM modality (e.g., 'CT', 'MR', 'RTSTRUCT')
 * @returns Array of suites that support the modality
 *
 * @example
 * ```typescript
 * const suites = getSuitesByModality('RTSTRUCT');
 * // Returns: [RT_SUITE]
 * ```
 */
export function getSuitesByModality(modality: string): SuiteConfig[] {
  const upperModality = modality.toUpperCase();
  return Object.values(SUITES_REGISTRY).filter((suite) =>
    suite.detectionHints.modalities.includes(upperModality)
  );
}
