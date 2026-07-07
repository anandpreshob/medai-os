// Types
export * from './loaders/types';

// Loaders
export * from './loaders/LoaderRegistry';

// Schemas
export * from './schemas/oncologyExportSchema';
export * from './schemas/sessionArtifactSchema';

// Services
export * from './services/MonaiLabelClient';
export * from './services/InferenceService';
export * from './services/SegmentationOverlayService';
export * from './services/LabelLoaderService';
export * from './services/LabelExportService';
export * from './services/SessionManager';
export * from './services/AnalyticsService';
export { DICOMWebClient, type DicomStudy, type DicomSeries, type QidoSearchParams } from './services/DICOMWebClient';
export * from './services/OrthancUploadService';
export * from './services/OrthancAttachmentService';
export * from './services/AutoDetectionService';
export * from './services/ReportGenerationService';
export * from './services/PersistenceService';
export * from './services/TriageService';
export * from './services/ChestXrayDetectionService';
export * from './services/RegistrationService';
export * from './services/SegmentationPropagationService';
export * from './services/DICOMSegExportService';
export * from './services/OncologyExportService';
export * from './services/SessionExportService';
export * from './services/AuditService';
export { ChatService, type ChatRequest, type ChatResponse, type ChatStreamChunk, type EvidenceRequest } from './services/ChatService';
export { AgentService, type AgentEvent, type AgentHealth } from './services/AgentService';

// Stores
export * from './stores/viewerStore';
export * from './stores/recentFilesStore';
export {
  useMonaiStore,
  type Model,
  type MonaiState,
  type ConnectionStatus as MonaiConnectionStatus,
} from './stores/monaiStore';
export * from './stores/segmentationStore';
export * from './stores/analyticsStore';
export { useStudyBrowserStore, type PacsStudy, type LocalStudy, type UnifiedStudy, type SearchFilters, type StudyBrowserState } from './stores/studyBrowserStore';
export * from './stores/suiteStore';
export * from './stores/findingsStore';
export * from './stores/reportStore';
export * from './stores/triageStore';
export * from './stores/detectionStore';
export * from './stores/provenanceStore';
export { useChatStore, type ChatSource, type ChatMessage, type ChatConversation, type ChatState, type ChatSourceType, type ActionCard, type ActionCardType, type SegmentationLabel } from './stores/chatStore';
export * from './stores/batchProcessingStore';
export * from './stores/panelVisibilityStore';

// Batch Processing Types
export * from './hooks/useBatchJobSocket';

// Auto Detection Types and Utilities (hook implementation in viewer app)
export type { UseStoredDetectionOptions, UseStoredDetectionResult } from './hooks/useStoredDetection';
export { preloadStoredDetections, loadStoredDetectionForInstance } from './hooks/useStoredDetection';

// Longitudinal Sessioning
export * from './stores/longitudinalTypes';
export * from './stores/longitudinalStore';

// Lesion Correspondence
export * from './stores/lesionCorrespondenceTypes';
export * from './stores/lesionCorrespondenceStore';

// RECIST 1.1 Workflow
export * from './stores/recistTypes';
export * from './stores/recistStore';
export * from './utils/recistMetrics';

// Features (boot-time flags gating optional capabilities)
export * from './features';

// Suites
export * from './suites';

// Utils
export * from './utils/fileFormatDetector';
export * from './utils/longitudinalMetrics';
export * from './utils/suvComputation';
export * from './utils/lesionMatchingAlgorithm';
export * from './utils/sliceInterpolation';

// Module 1: Enhanced Annotation Tools
export * from './stores/annotationHistoryStore';
export * from './stores/clipboardStore';

// Neurology Suite
export * from './stores/neuroSequenceTypes';
// Disambiguate: both lesionCorrespondenceTypes and neuroSequenceTypes declare a
// RegistrationResult; the lesion-correspondence one is the canonical export.
export type { RegistrationResult } from './stores/lesionCorrespondenceTypes';
export * from './stores/neuroSequenceStore';
export * from './stores/neuroModeTypes';
export * from './stores/neuroModeStore';
export * from './stores/qcStore';
export * from './schemas/neurologyExportSchema';
