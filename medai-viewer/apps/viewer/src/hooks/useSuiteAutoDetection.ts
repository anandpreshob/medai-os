import { useEffect } from 'react';
import { useViewerStore, useSuiteStore, inferSuiteFromStudy } from '@medai/core';
import type { StudyMetadata } from '@medai/core';

/**
 * useSuiteAutoDetection Hook
 *
 * Automatically detects and configures the appropriate clinical suite
 * based on the loaded image and PACS study metadata.
 *
 * This hook monitors changes to the active image, loaded images, and PACS study
 * information. When new data is available and the suite mode is set to 'auto',
 * it extracts relevant DICOM metadata and uses the suite detection algorithm
 * to determine the most appropriate clinical workflow suite.
 *
 * The detection considers:
 * - DICOM modality (CT, MR, PT, RTPLAN, etc.)
 * - Body part examined
 * - Study and series descriptions
 * - Protocol name
 *
 * @example
 * ```tsx
 * function ViewerPage() {
 *   // Enable auto-detection in the viewer
 *   useSuiteAutoDetection();
 *
 *   return <ViewerLayout />;
 * }
 * ```
 *
 * @remarks
 * - Detection always runs to populate lastDetectedSuiteId
 * - Active suite is updated if mode is 'auto' or if activeSuiteId is still 'auto'
 * - Requires either an active image or a PACS study to be loaded
 * - Results are logged to console for debugging
 * - Detection results are stored in the suite store via setDetectionResult
 */
export function useSuiteAutoDetection(): void {
  // Get viewer state
  const activeImageId = useViewerStore((state) => state.activeImageId);
  const images = useViewerStore((state) => state.images);
  const pacsStudy = useViewerStore((state) => state.pacsStudy);

  // Get suite state
  const setDetectionResult = useSuiteStore((state) => state.setDetectionResult);

  useEffect(() => {
    // Always run detection to populate lastDetectedSuiteId
    // The store will decide whether to update activeSuiteId based on mode

    // Need either an active image or a PACS study to detect from
    const hasActiveImage = activeImageId && images.has(activeImageId);
    const hasPacsStudy = pacsStudy !== null;

    if (!hasActiveImage && !hasPacsStudy) {
      return;
    }

    // Extract metadata from the active image
    // Note: ImageMetadata from loaders/types.ts may not have all DICOM fields,
    // so we access them cautiously with type assertion for extended metadata
    let imageMetadata: StudyMetadata | null = null;

    if (hasActiveImage) {
      const activeImage = images.get(activeImageId);
      if (activeImage?.metadata) {
        // Cast to unknown first, then to a record for safe property access
        // Some loaders may populate additional DICOM fields beyond the base interface
        const meta = activeImage.metadata as unknown as Record<string, unknown>;
        imageMetadata = {
          modality: typeof meta.modality === 'string' ? meta.modality : undefined,
          bodyPartExamined: typeof meta.bodyPartExamined === 'string' ? meta.bodyPartExamined : undefined,
          seriesDescription: typeof meta.seriesDescription === 'string' ? meta.seriesDescription : undefined,
          studyDescription: typeof meta.studyDescription === 'string' ? meta.studyDescription : undefined,
          protocolName: typeof meta.protocolName === 'string' ? meta.protocolName : undefined,
        };
      }
    }

    // Convert PACS study to the format expected by inferSuiteFromStudy
    const pacsStudyInfo = pacsStudy
      ? {
          studyInstanceUID: pacsStudy.studyInstanceUID,
          studyDescription: pacsStudy.studyDescription,
          modality: pacsStudy.modality,
          series: pacsStudy.series?.map((s) => ({
            seriesInstanceUID: s.seriesInstanceUID,
            seriesDescription: s.seriesDescription,
            modality: s.modality,
          })),
        }
      : null;

    // Run suite detection
    const result = inferSuiteFromStudy(imageMetadata, pacsStudyInfo);

    // Log detection info for debugging
    console.log('[SuiteAutoDetection] Detection result:', {
      suiteId: result.suiteId,
      confidence: result.confidence.toFixed(2),
      matchedCriteria: result.matchedCriteria,
      source: {
        hasImageMetadata: imageMetadata !== null,
        hasPacsStudy: pacsStudyInfo !== null,
      },
    });

    // Update the suite store with detection result
    setDetectionResult(result.suiteId, result.confidence, result.matchedCriteria);
  }, [activeImageId, images, pacsStudy, setDetectionResult]);
}

export default useSuiteAutoDetection;
