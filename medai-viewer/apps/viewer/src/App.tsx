import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, Toaster, toast } from '@medai/ui';
import { LoaderRegistry, useViewerStore, isFeatureEnabled } from '@medai/core';
import {
  NiftiLoader,
  NrrdLoader,
  MhaLoader,
  StandardImageLoader,
  TiffLoader,
  DicomLoader,
} from '@medai/itk-loader';
import { StudyBrowserPage } from './pages/StudyBrowserPage';
import { ViewerPage } from './pages/ViewerPage';
import { UploadPage } from './pages/UploadPage';
import { ReportPage } from './pages/ReportPage';
import { AnalyticsModal } from './components/AnalyticsModal';
import { initCornerstone } from './lib/cornerstone';

export function App() {
  const [initStatus, setInitStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [initError, setInitError] = useState<string | null>(null);
  const { initPersistence, restorePersistedImages } = useViewerStore();

  useEffect(() => {
    // Register image loaders - 3D volumetric formats
    LoaderRegistry.register(new NiftiLoader());
    LoaderRegistry.register(new NrrdLoader());
    LoaderRegistry.register(new MhaLoader());

    // Register image loaders - 2D formats
    LoaderRegistry.register(new StandardImageLoader());
    LoaderRegistry.register(new TiffLoader());
    LoaderRegistry.register(new DicomLoader());

    console.log('[MedAI] Viewer initialized');
    console.log('[MedAI] Registered loaders:', LoaderRegistry.getAllLoaders().map(l => l.name));

    // Pre-initialize Cornerstone3D early so errors are visible sooner
    console.log('[MedAI] Pre-initializing Cornerstone3D...');
    initCornerstone()
      .then(async () => {
        console.log('[MedAI] Cornerstone3D pre-initialization successful');

        // Initialize persistence and restore any persisted state
        console.log('[MedAI] Initializing persistence...');
        const persistenceOk = await initPersistence();
        if (persistenceOk) {
          console.log('[MedAI] Restoring persisted images...');
          await restorePersistedImages();
        }

        setInitStatus('success');
      })
      .catch((err) => {
        console.error('[MedAI] Cornerstone3D pre-initialization failed:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setInitStatus('error');
        setInitError(errorMsg);
        toast.error('Initialization Error', `Failed to initialize rendering engine: ${errorMsg}`);
      });
  }, [initPersistence, restorePersistedImages]);

  return (
    <ThemeProvider defaultMode="dark">
      <div className="h-screen w-screen overflow-hidden">
        <Routes>
          <Route path="/" element={<StudyBrowserPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer" element={<ViewerPage />} />
          {isFeatureEnabled('reports') && <Route path="/report" element={<ReportPage />} />}
        </Routes>
        <AnalyticsModal />
        <Toaster />
        {initStatus === 'error' && (
          <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-red-900/90 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-lg">
            <p className="font-semibold">Initialization Error</p>
            <p className="text-sm mt-1">{initError}</p>
            <p className="text-xs mt-2 text-red-200">Check browser console (F12) for details</p>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}
