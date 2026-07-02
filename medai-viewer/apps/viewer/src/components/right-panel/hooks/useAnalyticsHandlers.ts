import { useCallback } from 'react';
import { toast } from '@medai/ui';
import { useAnalyticsStore, useSegmentationStore, useViewerStore, AnalyticsService } from '@medai/core';
import { getCombinedLabelmapForAnalytics, getImageVolumeForAnalytics } from '../../../lib/cornerstone';

export function useAnalyticsHandlers() {
  const { images, activeImageId } = useViewerStore();
  const { segmentations, activeSegmentationId } = useSegmentationStore();
  const {
    volumetricsResult,
    radiomicsResult,
    isComputingVolumetrics,
    isComputingRadiomics,
    setVolumetricsResult,
    setRadiomicsResult,
    setComputingVolumetrics,
    setComputingRadiomics,
    setVolumetricsError,
    setRadiomicsError,
    openModal: openAnalyticsModal,
  } = useAnalyticsStore();

  const activeImage = activeImageId ? images.get(activeImageId) : undefined;

  // Handle computing volumetrics
  const handleComputeVolumetrics = useCallback(async () => {
    console.log('[MedAI Analytics] Computing volumetrics...', { activeSegmentationId, activeImage: activeImage?.imageId });

    const currentSegmentation = segmentations.find(s => s.id === activeSegmentationId);
    if (!activeSegmentationId || !activeImage || !currentSegmentation) {
      const reason = !activeSegmentationId ? 'No segmentation selected' :
                     !activeImage ? 'No image loaded' : 'Segmentation not found';
      toast.error('Cannot compute volumetrics', `${reason}. Please load an image and create a segmentation first.`);
      console.error('[MedAI Analytics] Missing requirements:', { activeSegmentationId, hasImage: !!activeImage, hasSegmentation: !!currentSegmentation });
      return;
    }

    console.log('[MedAI Analytics] Segmentation found:', { id: currentSegmentation.id, segments: currentSegmentation.segments.length });
    setComputingVolumetrics(true);
    setVolumetricsError(null);

    try {
      // Get combined labelmap data (handles multi-layer segmentation)
      console.log('[MedAI Analytics] Getting labelmap data...');
      const labelmapData = getCombinedLabelmapForAnalytics(activeSegmentationId, currentSegmentation.segments);
      if (!labelmapData) {
        throw new Error('Could not get segmentation labelmap data. Check browser console for details.');
      }
      console.log('[MedAI Analytics] Labelmap data ready:', { dimensions: labelmapData.dimensions, spacing: labelmapData.spacing });

      // Build segment labels from store
      const segmentLabels: Record<string, string> = {};
      currentSegmentation.segments.forEach(seg => {
        segmentLabels[seg.segmentIndex.toString()] = seg.label;
      });

      // Call analytics service via proxy
      const analyticsService = new AnalyticsService('/api/monai');
      const result = await analyticsService.computeVolumetrics(labelmapData.niftiData, {
        segmentLabels,
        spacing: labelmapData.spacing as [number, number, number],
      });

      setVolumetricsResult(result);
      openAnalyticsModal('volumetrics');
      toast.success('Volumetrics computed', `Found ${result.volumetrics.segments.length} segment(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Volumetrics computation failed';
      setVolumetricsError(message);
      toast.error('Volumetrics failed', message);
    } finally {
      setComputingVolumetrics(false);
    }
  }, [activeSegmentationId, activeImage, segmentations, setComputingVolumetrics, setVolumetricsError, setVolumetricsResult, openAnalyticsModal]);

  // Handle computing radiomics
  const handleComputeRadiomics = useCallback(async () => {
    console.log('[MedAI Analytics] Computing radiomics...', { activeSegmentationId, activeImage: activeImage?.imageId });

    const currentSegmentation = segmentations.find(s => s.id === activeSegmentationId);
    if (!activeSegmentationId || !activeImage || !currentSegmentation) {
      const reason = !activeSegmentationId ? 'No segmentation selected' :
                     !activeImage ? 'No image loaded' : 'Segmentation not found';
      toast.error('Cannot compute radiomics', `${reason}. Please load an image and create a segmentation first.`);
      console.error('[MedAI Analytics] Missing requirements:', { activeSegmentationId, hasImage: !!activeImage, hasSegmentation: !!currentSegmentation });
      return;
    }

    console.log('[MedAI Analytics] Segmentation found:', { id: currentSegmentation.id, segments: currentSegmentation.segments.length });
    setComputingRadiomics(true);
    setRadiomicsError(null);

    try {
      // Get image volume data
      console.log('[MedAI Analytics] Getting image volume data...');
      const imageData = getImageVolumeForAnalytics(activeImage.imageId);
      if (!imageData) {
        throw new Error('Could not get image volume data. Check browser console for details.');
      }
      console.log('[MedAI Analytics] Image data ready:', { dimensions: imageData.dimensions });

      // Get combined labelmap data (handles multi-layer segmentation)
      console.log('[MedAI Analytics] Getting labelmap data...');
      const labelmapData = getCombinedLabelmapForAnalytics(activeSegmentationId, currentSegmentation.segments);
      if (!labelmapData) {
        throw new Error('Could not get segmentation labelmap data. Check browser console for details.');
      }
      console.log('[MedAI Analytics] Labelmap data ready:', { dimensions: labelmapData.dimensions });

      // Build segment labels from store
      const segmentLabels: Record<string, string> = {};
      currentSegmentation.segments.forEach(seg => {
        segmentLabels[seg.segmentIndex.toString()] = seg.label;
      });

      // Call analytics service via proxy
      const analyticsService = new AnalyticsService('/api/monai');
      const result = await analyticsService.computeRadiomics(imageData.niftiData, labelmapData.niftiData, {
        segmentLabels,
      });

      setRadiomicsResult(result);
      openAnalyticsModal('radiomics');
      toast.success('Radiomics computed', `Extracted ${result.metadata.feature_count} features in ${result.metadata.computation_time_seconds.toFixed(1)}s`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Radiomics computation failed';
      setRadiomicsError(message);
      toast.error('Radiomics failed', message);
    } finally {
      setComputingRadiomics(false);
    }
  }, [activeSegmentationId, activeImage, segmentations, setComputingRadiomics, setRadiomicsError, setRadiomicsResult, openAnalyticsModal]);

  return {
    volumetricsResult,
    radiomicsResult,
    isComputingVolumetrics,
    isComputingRadiomics,
    hasResults: !!(volumetricsResult || radiomicsResult),
    handleComputeVolumetrics,
    handleComputeRadiomics,
    openAnalyticsModal,
  };
}
