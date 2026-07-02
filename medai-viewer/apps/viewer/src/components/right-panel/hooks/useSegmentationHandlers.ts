import { useState, useCallback, useRef } from 'react';
import { toast } from '@medai/ui';
import {
  useSegmentationStore,
  useViewerStore,
  Segment,
  loadLabelFile,
  generateLabelInfo,
  validateLabelDimensions,
  exportLabelAsNifti,
} from '@medai/core';
import {
  createMultiLayerSegmentationFromResult,
  createSegmentVolume,
  setActiveSegmentIndex as setActiveSegmentIndexInCornerstone,
  setActiveSegmentationInCornerstone,
  getLabelmapDataForExport,
  removeSegmentation as removeSegmentationFromCornerstone,
  mergeLabelmapData,
  mergeMultiLayerLabelmapData,
} from '../../../lib/cornerstone';
import { SEGMENT_COLORS, hexToRgba } from '../types';
import type { MergeDialogChoice } from '../components/MergeReplaceDialog';

interface UseSegmentationHandlersProps {
  toolGroupId: string;
}

export function useSegmentationHandlers({ toolGroupId }: UseSegmentationHandlersProps) {
  const [isLoadingLabel, setIsLoadingLabel] = useState(false);
  const [isCreatingSegmentation, setIsCreatingSegmentation] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const pendingLabelFileRef = useRef<File | null>(null);

  const { images, activeImageId } = useViewerStore();
  const {
    segmentations,
    activeSegmentationId,
    addSegmentation,
    addSegment,
    setActiveSegmentation,
    setActiveSegmentIndex,
    removeSegmentation,
  } = useSegmentationStore();

  const activeImage = activeImageId ? images.get(activeImageId) : undefined;

  // Handle creating a new empty segmentation or adding a new segment
  // Each segment gets its own volume (binary mask) to enable true overlap
  const handleCreateSegmentation = useCallback(async () => {
    if (!activeImage) {
      toast.error('No image loaded', 'Please load an image before creating a segmentation.');
      return;
    }

    setIsCreatingSegmentation(true);
    const referenceVolumeId = `localVolume:${activeImage.imageId}`;

    try {
      // If we already have an active segmentation, add a new segment to it
      if (activeSegmentationId) {
        const activeSegmentation = segmentations.find((s) => s.id === activeSegmentationId);
        if (activeSegmentation) {
          const nextSegmentIndex = activeSegmentation.segments.length + 1;
          const colorIndex = (nextSegmentIndex - 1) % SEGMENT_COLORS.length;
          const colorHex = SEGMENT_COLORS[colorIndex];
          const colorRgba = hexToRgba(colorHex);

          // Create a separate volume for this segment (binary mask)
          const segmentVolume = await createSegmentVolume(
            referenceVolumeId,
            activeSegmentationId,
            nextSegmentIndex,
            toolGroupId,
            colorRgba
          );

          const segment: Segment = {
            segmentIndex: nextSegmentIndex,
            label: `Segment ${nextSegmentIndex}`,
            color: colorHex,
            visible: true,
            locked: false,
            volumeId: segmentVolume.volumeId,
            cornerstoneSegmentationId: segmentVolume.cornerstoneSegmentationId,
          };
          addSegment(activeSegmentationId, segment);

          // Set the new segment as active - activate its Cornerstone segmentation
          setActiveSegmentIndex(nextSegmentIndex);
          setActiveSegmentationInCornerstone(segmentVolume.cornerstoneSegmentationId, toolGroupId);
          setActiveSegmentIndexInCornerstone(segmentVolume.cornerstoneSegmentationId, 1); // Binary mask uses index 1

          toast.success('Segment added', `Added Segment ${nextSegmentIndex}. Use brush to paint.`);
          setIsCreatingSegmentation(false);
          return;
        }
      }

      // No active segmentation - create a new one with its first segment
      const segmentationId = `manual-seg-${Date.now()}`;
      const colorHex = SEGMENT_COLORS[0];
      const colorRgba = hexToRgba(colorHex);

      // Create a volume for the first segment
      const segmentVolume = await createSegmentVolume(
        referenceVolumeId,
        segmentationId,
        1, // First segment
        toolGroupId,
        colorRgba
      );

      // Add parent segmentation to store (referenceVolumeId instead of volumeId)
      addSegmentation({
        id: segmentationId,
        label: `Manual Segmentation ${segmentations.length + 1}`,
        referenceVolumeId: referenceVolumeId,
        segments: [],
        status: 'draft',
      });

      // Add initial segment with its own volume
      const segment: Segment = {
        segmentIndex: 1,
        label: 'Segment 1',
        color: colorHex,
        visible: true,
        locked: false,
        volumeId: segmentVolume.volumeId,
        cornerstoneSegmentationId: segmentVolume.cornerstoneSegmentationId,
      };
      addSegment(segmentationId, segment);
      setActiveSegmentation(segmentationId);

      // Sync Cornerstone's internal active segmentation - use the segment's CS segmentation
      setActiveSegmentationInCornerstone(segmentVolume.cornerstoneSegmentationId, toolGroupId);
      setActiveSegmentIndex(1);
      setActiveSegmentIndexInCornerstone(segmentVolume.cornerstoneSegmentationId, 1); // Binary mask uses index 1

      console.log('[useSegmentationHandlers] New segmentation created with separate volume:', segmentationId, 'segment volumeId:', segmentVolume.volumeId);

      toast.success('Segmentation created', 'You can now use the brush tool to paint.');
    } catch (err) {
      console.error('[useSegmentationHandlers] Failed to create segmentation:', err);
      toast.error('Failed', err instanceof Error ? err.message : 'Could not create segmentation.');
    } finally {
      setIsCreatingSegmentation(false);
    }
  }, [activeImage, segmentations, activeSegmentationId, addSegmentation, addSegment, setActiveSegmentation, setActiveSegmentIndex, toolGroupId]);

  // Handle loading label file - creates new segmentation with multi-layer support
  const handleLoadLabelAsNew = useCallback(async (file: File) => {
    if (!activeImage) {
      toast.error('No image loaded', 'Please load an image before loading a label file.');
      return;
    }

    setIsLoadingLabel(true);

    try {
      console.log('[useSegmentationHandlers] Loading label file as new (multi-layer):', file.name);
      const loadedLabel = await loadLabelFile(file);

      // Validate dimensions match
      if (!validateLabelDimensions(loadedLabel.metadata, activeImage.metadata)) {
        toast.error(
          'Dimension mismatch',
          `Label dimensions (${loadedLabel.metadata.width}x${loadedLabel.metadata.height}x${loadedLabel.metadata.depth}) don't match image dimensions (${activeImage.metadata.width}x${activeImage.metadata.height}x${activeImage.metadata.depth}).`
        );
        return;
      }

      // Generate label info
      const labels = generateLabelInfo(loadedLabel.metadata.uniqueLabels);

      // Create segmentation in store (multi-layer mode uses referenceVolumeId)
      const segmentationId = loadedLabel.labelId;
      const referenceVolumeId = `localVolume:${activeImage.imageId}`;

      addSegmentation({
        id: segmentationId,
        label: file.name,
        referenceVolumeId: referenceVolumeId, // Multi-layer: reference image, not shared volume
        segments: [],
        status: 'draft',
      });

      // Create multi-layer segmentation volumes (one per label)
      const segmentVolumeMap = await createMultiLayerSegmentationFromResult(
        loadedLabel.labelData,
        labels,
        referenceVolumeId,
        toolGroupId,
        segmentationId,
        loadedLabel.metadata.dataType
      );

      // Add segments with their volume info
      labels.forEach((label) => {
        const volumeInfo = segmentVolumeMap.get(label.index);
        const segment: Segment = {
          segmentIndex: label.index,
          label: label.name,
          color: label.color,
          visible: true,
          locked: false,
          volumeId: volumeInfo?.volumeId,
          cornerstoneSegmentationId: volumeInfo?.cornerstoneSegmentationId,
        };
        addSegment(segmentationId, segment);
      });

      setActiveSegmentation(segmentationId);

      // For multi-layer mode, activate the first segment's Cornerstone segmentation
      const firstLabel = labels.find(l => l.index !== 0);
      if (firstLabel) {
        const firstVolumeInfo = segmentVolumeMap.get(firstLabel.index);
        if (firstVolumeInfo) {
          setActiveSegmentationInCornerstone(firstVolumeInfo.cornerstoneSegmentationId);
        }
      }

      toast.success('Label loaded', `Successfully loaded ${file.name} with ${labels.length} segments (multi-layer).`);
    } catch (err) {
      console.error('[useSegmentationHandlers] Failed to load label:', err);
      toast.error('Load failed', err instanceof Error ? err.message : 'Failed to load label file.');
    } finally {
      setIsLoadingLabel(false);
    }
  }, [activeImage, addSegmentation, addSegment, setActiveSegmentation, toolGroupId]);

  // Handle merging label file into existing segmentation (supports multi-layer mode)
  const handleMergeLabel = useCallback(async (file: File) => {
    if (!activeImage || !activeSegmentationId) {
      toast.error('No segmentation', 'No active segmentation to merge into.');
      return;
    }

    setIsLoadingLabel(true);

    try {
      console.log('[useSegmentationHandlers] Merging label file into existing:', file.name);
      const loadedLabel = await loadLabelFile(file);

      // Validate dimensions match
      if (!validateLabelDimensions(loadedLabel.metadata, activeImage.metadata)) {
        toast.error(
          'Dimension mismatch',
          `Label dimensions don't match image dimensions.`
        );
        return;
      }

      const labels = generateLabelInfo(loadedLabel.metadata.uniqueLabels);
      const activeSegmentation = segmentations.find(s => s.id === activeSegmentationId);

      if (!activeSegmentation) {
        toast.error('Merge failed', 'Could not find active segmentation.');
        return;
      }

      // Check if we're in multi-layer mode (any segment has its own volumeId)
      const isMultiLayer = activeSegmentation.segments.some(s => s.volumeId && s.cornerstoneSegmentationId);

      if (isMultiLayer || activeSegmentation.referenceVolumeId) {
        // Multi-layer mode: use the new merge function
        const referenceVolumeId = activeSegmentation.referenceVolumeId || `localVolume:${activeImage.imageId}`;

        const newSegmentVolumeMap = await mergeMultiLayerLabelmapData(
          activeSegmentationId,
          loadedLabel.labelData,
          labels,
          activeSegmentation.segments,
          referenceVolumeId,
          toolGroupId,
          loadedLabel.metadata.dataType
        );

        // Add any new segments that were created
        labels.forEach((label) => {
          const existingSegment = activeSegmentation.segments.find(s => s.segmentIndex === label.index);
          if (!existingSegment) {
            const volumeInfo = newSegmentVolumeMap.get(label.index);
            const segment: Segment = {
              segmentIndex: label.index,
              label: label.name,
              color: label.color,
              visible: true,
              locked: false,
              volumeId: volumeInfo?.volumeId,
              cornerstoneSegmentationId: volumeInfo?.cornerstoneSegmentationId,
            };
            addSegment(activeSegmentationId, segment);
          }
        });

        toast.success('Merged', `Merged ${file.name} into existing segmentation (multi-layer).`);
      } else {
        // Legacy mode: use the original merge function
        const success = mergeLabelmapData(activeSegmentationId, loadedLabel.labelData, loadedLabel.metadata.dataType);

        if (success) {
          // Add any new segments that don't exist yet
          labels.forEach((label) => {
            const existingSegment = activeSegmentation.segments.find(s => s.segmentIndex === label.index);
            if (!existingSegment) {
              const segment: Segment = {
                segmentIndex: label.index,
                label: label.name,
                color: label.color,
                visible: true,
                locked: false,
              };
              addSegment(activeSegmentationId, segment);
            }
          });

          toast.success('Merged', `Merged ${file.name} into existing segmentation.`);
        } else {
          toast.error('Merge failed', 'Could not merge label data.');
        }
      }
    } catch (err) {
      console.error('[useSegmentationHandlers] Failed to merge label:', err);
      toast.error('Merge failed', err instanceof Error ? err.message : 'Failed to merge label file.');
    } finally {
      setIsLoadingLabel(false);
    }
  }, [activeImage, activeSegmentationId, segmentations, addSegment, toolGroupId]);

  // Handle replacing existing segmentation with new label
  const handleReplaceLabel = useCallback(async (file: File) => {
    if (!activeImage) return;

    // Remove all existing segmentations from Cornerstone and store
    segmentations.forEach((seg) => {
      removeSegmentationFromCornerstone(toolGroupId, seg.id);
      removeSegmentation(seg.id);
    });

    // Load the new segmentation
    await handleLoadLabelAsNew(file);
  }, [activeImage, segmentations, removeSegmentation, handleLoadLabelAsNew, toolGroupId]);

  // Handle merge dialog choices
  const handleMergeDialogChoice = useCallback((choice: MergeDialogChoice) => {
    setShowMergeDialog(false);
    const file = pendingLabelFileRef.current;

    if (!file || choice === 'cancel') {
      pendingLabelFileRef.current = null;
      return;
    }

    if (choice === 'merge') {
      handleMergeLabel(file);
    } else if (choice === 'replace') {
      handleReplaceLabel(file);
    }

    pendingLabelFileRef.current = null;
  }, [handleMergeLabel, handleReplaceLabel]);

  // Handle label file selection
  const handleLabelFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if there's an existing segmentation
      if (activeSegmentationId && segmentations.length > 0) {
        // Show merge/replace dialog
        pendingLabelFileRef.current = file;
        setShowMergeDialog(true);
      } else {
        // No existing segmentation, just load it
        handleLoadLabelAsNew(file);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [activeSegmentationId, segmentations.length, handleLoadLabelAsNew]);

  // Handle exporting the active segmentation
  const handleExportLabel = useCallback(async () => {
    if (!activeSegmentationId) {
      toast.error('No segmentation', 'No segmentation to export.');
      return;
    }

    const activeSegmentation = segmentations.find((s) => s.id === activeSegmentationId);
    if (!activeSegmentation) {
      toast.error('Not found', 'Active segmentation not found.');
      return;
    }

    try {
      const labelmapData = getLabelmapDataForExport(activeSegmentationId);
      if (!labelmapData) {
        toast.error('Export failed', 'Could not get labelmap data for export.');
        return;
      }

      const filename = `${activeSegmentation.label.replace(/[^a-zA-Z0-9]/g, '_')}.nii.gz`;

      await exportLabelAsNifti(
        labelmapData.scalarData,
        labelmapData.dimensions,
        labelmapData.spacing,
        labelmapData.origin,
        labelmapData.direction,
        { filename }
      );

      toast.success('Export complete', `Saved ${filename}`);
    } catch (err) {
      console.error('[useSegmentationHandlers] Export failed:', err);
      toast.error('Export failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [activeSegmentationId, segmentations]);

  return {
    isLoadingLabel,
    isCreatingSegmentation,
    showMergeDialog,
    handleCreateSegmentation,
    handleLabelFileSelect,
    handleExportLabel,
    handleMergeDialogChoice,
  };
}
