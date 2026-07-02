import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { bootFeatures } from './lib/bootFeatures';
import './styles/globals.css';

// Expose stores and functions for testing
import { useViewerStore, useSegmentationStore, loadLabelFile, generateLabelInfo, validateLabelDimensions, LoaderRegistry } from '@medai/core';
import { createMultiLayerSegmentationFromResult } from './lib/cornerstone';
import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

if (typeof window !== 'undefined') {
  (window as any).useViewerStore = useViewerStore;
  (window as any).useSegmentationStore = useSegmentationStore;
  (window as any).loadLabelFile = loadLabelFile;
  (window as any).generateLabelInfo = generateLabelInfo;
  (window as any).validateLabelDimensions = validateLabelDimensions;
  (window as any).createMultiLayerSegmentationFromResult = createMultiLayerSegmentationFromResult;
  (window as any).LoaderRegistry = LoaderRegistry;
  (window as any).cornerstone3D = cornerstone3D;
  (window as any).cornerstoneTools = cornerstoneTools;
}

// Resolve feature flags (env + optional /config.json) before first render so
// suite/tab filtering sees the final state.
bootFeatures().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
