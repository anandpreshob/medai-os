import React, { useEffect, useRef } from 'react';
import { TopBar } from '../components/TopBar';
import { Toolbar } from '../components/Toolbar';
import { LeftPanel } from '../components/LeftPanel';
import { ViewportArea } from '../components/ViewportArea';
import { RightPanel } from '../components/RightPanel';
import { StatusBar } from '../components/StatusBar';
import { useSuiteAutoDetection } from '../hooks/useSuiteAutoDetection';
import {
  useViewerStore,
  useDetectionStore,
  autoDetectionService,
  AutoDetectionService,
  isFeatureEnabled,
} from '@medai/core';

/**
 * Load stored AI detections from Orthanc for the active PACS image.
 * Extracts the StudyInstanceUID from the imageId, finds Orthanc instances,
 * and populates the detection store if results exist.
 */
function useLoadStoredDetections() {
  const activeImageId = useViewerStore((s) => s.activeImageId);
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isFeatureEnabled('chestxray')) return;
    if (!activeImageId || !activeImageId.startsWith('pacs:')) return;
    if (loadedRef.current.has(activeImageId)) return;

    // Check if detections already in store
    const existing = useDetectionStore.getState().getDetectionsForImage(activeImageId);
    if (existing.length > 0) {
      loadedRef.current.add(activeImageId);
      return;
    }

    // Extract study UID from imageId format: pacs:{studyUID}:{seriesUID}
    const parts = activeImageId.split(':');
    if (parts.length < 2) return;
    const studyUID = parts[1];

    loadedRef.current.add(activeImageId);

    (async () => {
      try {
        const { detections } = await autoDetectionService.getStudyDetections(studyUID);
        if (detections.length > 0) {
          // Get stored result for description/processingTime from first instance
          const stored = await autoDetectionService.getStudyDetections(studyUID);
          useDetectionStore.getState().setDetections(activeImageId, detections);
          console.log(`[MainLayout] Loaded ${detections.length} stored detections for ${activeImageId}`);
        }
      } catch (err) {
        console.warn('[MainLayout] Failed to load stored detections:', err);
      }
    })();
  }, [activeImageId]);
}

export function MainLayout() {
  // Enable automatic suite detection based on loaded image metadata
  useSuiteAutoDetection();
  // Load stored AI detections from Orthanc for the active image
  useLoadStoredDetections();

  return (
    <div className="h-screen flex flex-col bg-background-primary">
      {/* Top Bar - 56px */}
      <TopBar />

      {/* Toolbar - 48px */}
      <Toolbar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - 280px */}
        <LeftPanel />

        {/* Viewport Area - Flex grow */}
        <ViewportArea />

        {/* Right Panel - 320px */}
        <RightPanel />
      </div>

      {/* Status Bar - 24px */}
      <StatusBar />
    </div>
  );
}
