/**
 * BatchProcessingPanel - Main container for batch processing workflow
 *
 * Provides tabbed interface for:
 * - Select Files: Choose files for batch processing
 * - Processing: Monitor batch job progress
 * - Review: Accept/reject results
 * - Export: Configure and export results
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Files,
  Play,
  CheckCircle,
  Download,
  Loader2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { Panel, Button, Spinner, toast } from '@medai/ui';
import {
  useBatchProcessingStore,
  useMonaiStore,
} from '@medai/core';
import { useBatchJobSocket } from '../hooks/useBatchJobSocket';
import { BatchFileSelector } from './batch/BatchFileSelector';
import { BatchProgressTracker } from './batch/BatchProgressTracker';
import { BatchResultsGrid } from './batch/BatchResultsGrid';
import { BatchExportSection } from './batch/BatchExportSection';

interface BatchProcessingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId = 'select' | 'processing' | 'review' | 'export';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export function BatchProcessingPanel({ isOpen, onClose }: BatchProcessingPanelProps) {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Store state
  const {
    currentJob,
    activeTab,
    selectedFileIds,
    setActiveTab,
    createJob,
    startJob,
    cancelJob,
    getSelectedFiles,
    getResultStats,
  } = useBatchProcessingStore();

  const { models, connectionStatus, client } = useMonaiStore();

  // WebSocket connection for real-time updates
  const { connect, disconnect, isConnected } = useBatchJobSocket({
    onConnect: () => {
      console.log('[BatchProcessingPanel] WebSocket connected');
    },
    onDisconnect: () => {
      console.log('[BatchProcessingPanel] WebSocket disconnected');
    },
    onError: (error) => {
      console.error('[BatchProcessingPanel] WebSocket error:', error);
      toast.error('Connection Error', 'Lost connection to batch processing server');
    },
  });

  // Initialize selected model
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      // Prefer BiomedParse or segmentation models
      const biomedParse = models.find((m) => m.name.toLowerCase().includes('biomedparse'));
      const segModel = models.find((m) => m.type === 'segmentation');
      setSelectedModel(biomedParse?.name || segModel?.name || models[0].name);
    }
  }, [models, selectedModel]);

  // Connect WebSocket when job starts
  useEffect(() => {
    if (currentJob && currentJob.status === 'processing') {
      connect(currentJob.id);
    }
    return () => {
      disconnect();
    };
  }, [currentJob?.id, currentJob?.status, connect, disconnect]);

  const isConnectedToServer = connectionStatus === 'connected';
  const selectedFiles = getSelectedFiles();
  const resultStats = getResultStats();

  // Tab configuration
  const tabs: TabConfig[] = [
    {
      id: 'select',
      label: 'Select Files',
      icon: <Files className="w-4 h-4" />,
    },
    {
      id: 'processing',
      label: 'Processing',
      icon: currentJob?.status === 'processing' ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Play className="w-4 h-4" />
      ),
      disabled: !currentJob,
    },
    {
      id: 'review',
      label: `Review${resultStats.total > 0 ? ` (${resultStats.total})` : ''}`,
      icon: <CheckCircle className="w-4 h-4" />,
      disabled: !currentJob || currentJob.results.length === 0,
    },
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="w-4 h-4" />,
      disabled: !currentJob || resultStats.accepted === 0,
    },
  ];

  /**
   * Start batch processing
   */
  const handleStartBatch = useCallback(async () => {
    if (!isConnectedToServer) {
      toast.error('Not Connected', 'Please connect to the server first');
      return;
    }

    if (selectedFiles.length === 0) {
      toast.error('No Files Selected', 'Please select at least one file');
      return;
    }

    if (!selectedModel) {
      toast.error('No Model Selected', 'Please select a model');
      return;
    }

    // Create and start the job
    const jobId = createJob(selectedModel, prompt || undefined);
    if (jobId) {
      startJob(jobId);
      toast.success('Batch Started', `Processing ${selectedFiles.length} files`);

      // Connect WebSocket for real-time updates
      connect(jobId);

      // In a real implementation, we would call the backend API here
      // For now, we'll simulate progress updates
      simulateBatchProcessing(jobId);
    }
  }, [isConnectedToServer, selectedFiles, selectedModel, prompt, createJob, startJob, connect]);

  /**
   * Simulate batch processing (placeholder for actual API call)
   */
  const simulateBatchProcessing = async (jobId: string) => {
    const store = useBatchProcessingStore.getState();
    const files = store.currentJob?.files || [];

    for (let i = 0; i < files.length; i++) {
      // Check if job was cancelled
      const currentState = useBatchProcessingStore.getState();
      if (currentState.currentJob?.status === 'cancelled') {
        break;
      }

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Add result
      const file = files[i];
      useBatchProcessingStore.getState().addResult(jobId, {
        id: `result-${file.id}`,
        fileId: file.id,
        fileName: file.name,
        status: 'pending',
        thumbnailUrl: file.thumbnailUrl,
        labels: [
          { name: 'Liver', color: '#ff6b6b', count: 1 },
          { name: 'Spleen', color: '#4ecdc4', count: 1 },
        ],
        processingTime: 1200 + Math.random() * 800,
        confidence: 0.85 + Math.random() * 0.1,
      });

      // Update progress
      useBatchProcessingStore.getState().updateJobProgress(
        jobId,
        ((i + 1) / files.length) * 100,
        i + 1,
        file.name
      );

      // Update estimated time
      const remaining = (files.length - i - 1) * 1.5;
      useBatchProcessingStore.getState().setEstimatedTime(jobId, remaining);
    }

    // Complete job
    useBatchProcessingStore.getState().completeJob(jobId);
    toast.success('Batch Complete', `Processed ${files.length} files`);
  };

  /**
   * Cancel current batch job
   */
  const handleCancelBatch = useCallback(() => {
    if (currentJob) {
      cancelJob(currentJob.id);
      disconnect();
      toast.info('Batch Cancelled', 'Processing has been stopped');
    }
  }, [currentJob, cancelJob, disconnect]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-gradient-to-b from-background-secondary to-background-primary border border-border-subtle rounded-2xl shadow-2xl w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-background-tertiary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 flex items-center justify-center">
              <Files className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Batch Processing</h2>
              <p className="text-xs text-text-muted">
                {currentJob
                  ? `Job: ${currentJob.id.slice(0, 8)}... | ${currentJob.status}`
                  : 'Process multiple files with AI segmentation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-background-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-6 py-3 border-b border-border-subtle bg-background-tertiary/20">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200
                ${activeTab === tab.id
                  ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20'
                  : tab.disabled
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                }
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Model and Prompt Selection - shown on select tab */}
          {activeTab === 'select' && (
            <div className="mb-6 space-y-4">
              {/* Model Selection */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  AI Model
                </label>
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  disabled={!isConnectedToServer}
                  className={`
                    w-full flex items-center justify-between px-4 py-3 rounded-lg
                    bg-background-tertiary border border-border-subtle
                    text-text-primary text-sm
                    transition-all duration-200
                    ${isConnectedToServer
                      ? 'hover:border-accent-primary/40 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                    }
                  `}
                >
                  <span>{selectedModel || 'Select a model...'}</span>
                  <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showModelDropdown && isConnectedToServer && (
                  <div className="absolute z-10 w-full mt-1 py-1 bg-background-elevated border border-border-default rounded-lg shadow-xl">
                    {models.map((model) => (
                      <button
                        key={model.name}
                        onClick={() => {
                          setSelectedModel(model.name);
                          setShowModelDropdown(false);
                        }}
                        className={`
                          w-full px-4 py-2 text-left text-sm
                          transition-colors
                          ${selectedModel === model.name
                            ? 'bg-accent-primary/10 text-accent-primary'
                            : 'text-text-primary hover:bg-background-hover'
                          }
                        `}
                      >
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-text-muted">{model.type}</div>
                      </button>
                    ))}
                    {models.length === 0 && (
                      <div className="px-4 py-3 text-sm text-text-muted text-center">
                        No models available
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Prompt Input */}
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Segmentation Prompt (Optional)
                </label>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., liver segmentation, tumor detection..."
                  className="
                    w-full px-4 py-3 rounded-lg
                    bg-background-tertiary border border-border-subtle
                    text-text-primary text-sm placeholder:text-text-muted
                    focus:outline-none focus:border-accent-primary/40
                    transition-colors
                  "
                />
              </div>

              {/* Connection Status */}
              {!isConnectedToServer && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-warning/10 border border-accent-warning/20">
                  <AlertCircle className="w-4 h-4 text-accent-warning" />
                  <span className="text-sm text-accent-warning">
                    Please connect to the server to start batch processing
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'select' && (
            <BatchFileSelector />
          )}

          {activeTab === 'processing' && currentJob && (
            <BatchProgressTracker
              job={currentJob}
              onCancel={handleCancelBatch}
            />
          )}

          {activeTab === 'review' && currentJob && (
            <BatchResultsGrid />
          )}

          {activeTab === 'export' && currentJob && (
            <BatchExportSection />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle bg-background-tertiary/20">
          <div className="text-sm text-text-muted">
            {activeTab === 'select' && (
              <>Selected: {selectedFileIds.size} files</>
            )}
            {activeTab === 'processing' && currentJob && (
              <>Progress: {Math.round(currentJob.progress)}%</>
            )}
            {activeTab === 'review' && (
              <>
                Accepted: {resultStats.accepted} | Rejected: {resultStats.rejected} | Pending: {resultStats.pending}
              </>
            )}
            {activeTab === 'export' && (
              <>Ready to export: {resultStats.accepted} results</>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>

            {activeTab === 'select' && (
              <Button
                onClick={handleStartBatch}
                disabled={selectedFileIds.size === 0 || !isConnectedToServer}
              >
                <Play className="w-4 h-4 mr-2" />
                Start Batch Processing
              </Button>
            )}

            {activeTab === 'review' && resultStats.pending > 0 && (
              <Button
                variant="success"
                onClick={() => useBatchProcessingStore.getState().acceptAllResults()}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Accept All
              </Button>
            )}

            {activeTab === 'export' && (
              <Button
                onClick={() => setActiveTab('export')}
                disabled={resultStats.accepted === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export Results
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BatchProcessingPanel;
