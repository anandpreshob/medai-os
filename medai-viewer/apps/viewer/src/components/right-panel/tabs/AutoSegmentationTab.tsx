import React, { useState, useEffect, useMemo } from 'react';
import { Cpu, Loader2 } from 'lucide-react';
import { Button } from '@medai/ui';
import { OrganSelector } from '../../OrganSelector';
import { getModelDimensionality, isModelCompatibleWithModality } from '../types';
import type { TabProps } from '../types';

export function AutoSegmentationTab({
  isConnected,
  hasImage,
  models,
  activeModel,
  onModelChange,
  onRun,
  isInferring,
  error,
  is2DImage,
  imageModality,
  textPrompt,
  setTextPrompt,
}: TabProps) {
  // State for TotalSegmentator organ selection
  const [selectedOrgans, setSelectedOrgans] = useState<string[]>([]);

  // Check if current model is BiomedParse or TotalSegmentator
  const isBiomedParse = activeModel?.toLowerCase().includes('biomedparse');
  const isTotalSegmentator = activeModel?.toLowerCase().includes('totalsegmentator');

  // Get the current model object for TotalSegmentator labels
  const currentModel = useMemo(
    () => models.find((m) => m.name === activeModel),
    [models, activeModel]
  );

  // Get available organs based on modality (CT vs MR)
  const availableOrgans = useMemo(() => {
    if (!isTotalSegmentator || !currentModel) return {};
    // Return CT or MR labels based on image modality
    if (imageModality?.toUpperCase() === 'MR') {
      return currentModel.mrLabels || {};
    }
    return currentModel.ctLabels || {};
  }, [isTotalSegmentator, currentModel, imageModality]);

  // Reset selected organs when model changes
  useEffect(() => {
    if (!isTotalSegmentator) {
      setSelectedOrgans([]);
    }
  }, [isTotalSegmentator, activeModel]);

  // Filter to segmentation-type models, then by dimensionality and modality
  const segmentationModels = models
    .filter((m) => m.type === 'segmentation' || m.type === 'deepgrow' || m.type === 'deepedit')
    .filter((m) => {
      // For 3D images, also check modality compatibility
      if (!is2DImage) {
        return isModelCompatibleWithModality(m, imageModality);
      }
      // For 2D images, only show 2D-compatible models
      const dim = getModelDimensionality(m.name);
      return dim === '2D' || dim === 'both';
    });

  // For BiomedParse, require a text prompt
  const canRun = isConnected && hasImage && activeModel && !isInferring &&
    (!isBiomedParse || textPrompt.trim().length > 0);

  const handleRun = () => {
    if (isBiomedParse && textPrompt.trim()) {
      onRun({ textPrompt: textPrompt.trim() });
    } else if (isTotalSegmentator) {
      onRun({
        modality: imageModality,
        roi_subset: selectedOrgans.length > 0 ? selectedOrgans : undefined,
      });
    } else {
      onRun();
    }
  };

  // Get instructions based on model type
  const getInstructions = () => {
    if (!hasImage) {
      return 'Load an image first to run segmentation.';
    }
    if (isBiomedParse) {
      return 'Enter text prompts for organs/structures to segment, then click Run.';
    }
    if (isTotalSegmentator) {
      const organCount = Object.keys(availableOrgans).length;
      const modalityLabel = imageModality?.toUpperCase() === 'MR' ? 'MR' : 'CT';
      return `TotalSegmentator (${modalityLabel}): ${organCount} anatomical structures. Select specific organs or run with all.`;
    }
    return 'Fully automated segmentation without any user prompt. Select a model and click Run.';
  };

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <div>
        <label className="text-text-secondary text-xs mb-1 block">Model</label>
        <select
          className="w-full bg-background-tertiary text-text-primary rounded px-3 py-2 text-sm border border-border-default disabled:opacity-50 disabled:cursor-not-allowed"
          value={activeModel || ''}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!isConnected || models.length === 0}
          data-testid="model-select"
        >
          {!isConnected && <option value="">Connect to server first</option>}
          {isConnected && models.length === 0 && <option value="">No models available</option>}
          {segmentationModels.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      {/* Text Prompt Input (only for BiomedParse) */}
      {isBiomedParse && (
        <div>
          <label className="text-text-secondary text-xs mb-1 block">
            Text Prompt
          </label>
          <input
            type="text"
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            placeholder="e.g., liver spleen or liver, kidney, spleen"
            className="w-full bg-background-tertiary text-text-primary rounded px-3 py-2 text-sm border border-border-default focus:border-primary focus:outline-none"
            data-testid="biomedparse-text-prompt"
          />
          <p className="text-text-muted text-xs mt-1">
            Enter organs separated by spaces or commas for separate labels
          </p>
        </div>
      )}

      {/* Organ Selection (only for TotalSegmentator) */}
      {isTotalSegmentator && Object.keys(availableOrgans).length > 0 && (
        <OrganSelector
          availableOrgans={availableOrgans}
          selectedOrgans={selectedOrgans}
          onSelectionChange={setSelectedOrgans}
          disabled={!isConnected || isInferring}
        />
      )}

      {/* Instructions */}
      <p className="text-text-muted text-xs">
        {getInstructions()}
      </p>

      {/* Error Message */}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Run Button */}
      <Button
        className="w-full"
        disabled={!canRun}
        onClick={handleRun}
        data-testid="run-segmentation-button"
      >
        {isInferring ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Cpu className="h-4 w-4 mr-2" />
            Run Segmentation
          </>
        )}
      </Button>
    </div>
  );
}
