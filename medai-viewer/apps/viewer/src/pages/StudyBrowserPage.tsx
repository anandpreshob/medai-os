import React, { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Activity, Search, RefreshCw, Upload, Sun, Moon, Settings, User,
  Calendar, Layers, FileText, ArrowRight, Filter, HardDrive, Globe, X,
  LayoutGrid, List, MapPin, AlertTriangle, GitCompare
} from 'lucide-react';
import {
  DICOMWebClient,
  useStudyBrowserStore,
  useTriageStore,
  getTriageService,
  prepareStudiesForTriage,
  useLongitudinalStore,
  autoDetectionService,
  isFeatureEnabled,
  type PacsStudy,
  type UnifiedStudy,
  type TriagedStudy,
  type DetectionFinding,
} from '@medai/core';
import { TriageControlBar } from '../components/TriageControlBar';
import { SortableStudyCard } from '../components/SortableStudyCard';
import { PriorityBadge } from '../components/PriorityBadge';

/**
 * StudyBrowserPage - Landing page for browsing and selecting studies
 *
 * Features:
 * - Combined view of PACS studies and locally uploaded files
 * - Full search by patient name, ID, date range, modality
 * - Study cards showing patient info, modality, description
 * - Click to open in viewer
 */

// Modality badge colors
const MODALITY_COLORS: Record<string, string> = {
  CT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  MR: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  US: 'bg-green-500/20 text-green-400 border-green-500/30',
  XR: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  PT: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  NM: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CR: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  DX: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  MG: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  default: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const COMMON_MODALITIES = ['CT', 'MR', 'US', 'XR', 'PT', 'CR', 'DX', 'MG'];

// Urgency badge colors
const URGENCY_COLORS: Record<string, string> = {
  STAT: 'bg-red-500/20 text-red-400 border-red-500/30',
  URGENT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  SEMI_URGENT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ROUTINE: 'bg-green-500/20 text-green-400 border-green-500/30',
};

// Location badge colors (by category)
const getLocationColor = (location: string): string => {
  const loc = location.toUpperCase();
  if (['ICU', 'ER', 'TRAUMA', 'OR', 'CCU'].includes(loc)) {
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  }
  if (['ED', 'PACU', 'INPATIENT'].includes(loc)) {
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  }
  if (['FLOOR', 'OBSERVATION', 'CARDIOLOGY'].includes(loc)) {
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  }
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30'; // OUTPATIENT, CLINIC, SCREENING
};

// Create DICOMWeb client instance
const dicomClient = new DICOMWebClient();

type ViewMode = 'grid' | 'list';

export function StudyBrowserPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [detectionStatus, setDetectionStatus] = useState<string | null>(null);

  // Triage store
  const {
    triagedStudies,
    isTriaging,
    viewMode: triageViewMode,
    stats: triageStats,
    setTriagedStudies,
    reorderStudy,
    setTriaging,
    setTriageError,
    getOrderedStudies,
  } = useTriageStore();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get state and actions from store
  const {
    isLoading,
    error,
    filters,
    pacsConnected,
    setPacsStudies,
    setLoading,
    setError,
    setFilters,
    clearFilters,
    setPacsConnected,
    getFilteredStudies,
  } = useStudyBrowserStore();

  // Format date from YYYYMMDD to readable format
  const formatDate = (date: string) => {
    if (!date || date.length !== 8) return date;
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    return `${month}/${day}/${year}`;
  };

  // Build date range string for QIDO query
  const buildDateRange = (from: string | null, to: string | null): string | undefined => {
    if (!from && !to) return undefined;
    if (from && to) return `${from}-${to}`;
    if (from) return `${from}-`;
    return `-${to}`;
  };

  // Fetch studies from PACS
  const fetchStudies = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // First test connection
      const connected = await dicomClient.testConnection();
      setPacsConnected(connected);

      if (!connected) {
        // If PACS not connected, just show local studies
        setPacsStudies([]);
        return;
      }

      // Build search params from filters
      const searchParams: Parameters<typeof dicomClient.searchStudies>[0] = {
        limit: 100,
      };

      if (filters.query) {
        searchParams.PatientName = filters.query;
      }
      if (filters.modalities.length > 0) {
        searchParams.ModalitiesInStudy = filters.modalities.join(',');
      }
      if (filters.dateFrom || filters.dateTo) {
        searchParams.StudyDate = buildDateRange(filters.dateFrom, filters.dateTo);
      }

      const studies = await dicomClient.searchStudies(searchParams);

      // Enrich studies with clinical context (location, urgency)
      const enrichedStudies = await dicomClient.enrichStudiesWithClinicalContext(studies);

      // Add source field to each study
      const studiesWithSource: PacsStudy[] = enrichedStudies.map(s => ({
        ...s,
        source: 'pacs' as const,
      }));

      setPacsStudies(studiesWithSource);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch studies';
      setError(message);
      console.error('[StudyBrowser] Failed to fetch studies:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.query, filters.modalities, filters.dateFrom, filters.dateTo, setLoading, setError, setPacsStudies, setPacsConnected]);

  // Initial fetch on mount
  useEffect(() => {
    fetchStudies();
  }, []);

  // Handle study selection
  const handleStudyClick = useCallback((study: UnifiedStudy) => {
    if (study.source === 'pacs') {
      const pacsStudy = study as PacsStudy;
      navigate(`/viewer?studyUID=${encodeURIComponent(pacsStudy.studyInstanceUID)}`);
    } else {
      navigate('/viewer', { state: { localStudyId: study.id } });
    }
  }, [navigate]);

  // Handle search
  const handleSearch = useCallback(() => {
    fetchStudies();
  }, [fetchStudies]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  // Toggle modality filter
  const toggleModality = (mod: string) => {
    const current = filters.modalities;
    const updated = current.includes(mod)
      ? current.filter((m) => m !== mod)
      : [...current, mod];
    setFilters({ modalities: updated });
  };

  const hasActiveFilters = filters.modalities.length > 0 || filters.source !== 'all' || !!filters.query;

  // Get filtered studies from store
  const filteredStudies = getFilteredStudies();

  // Handle drag end for reordering triaged studies
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      reorderStudy(active.id as string, over.id as string);
    }
  }, [reorderStudy]);

  // Handle triage button click
  const handleTriageClick = useCallback(async () => {
    const pacsStudies = filteredStudies.filter(s => s.source === 'pacs') as PacsStudy[];

    if (pacsStudies.length === 0) {
      setTriageError('No PACS studies to triage');
      return;
    }

    setTriaging(true);
    setDetectionStatus(null);

    try {
      // Run AI detections on X-ray studies
      const xrayModalities = ['CR', 'DX', 'XR'];
      const xrayStudies = pacsStudies.filter(s =>
        s.modalities.some(m => xrayModalities.includes(m.toUpperCase()))
      );
      const detectionsMap = new Map<string, DetectionFinding[]>();

      if (xrayStudies.length > 0 && isFeatureEnabled('chestxray')) {
        const medgemmaAvailable = await autoDetectionService.isMedGemmaAvailable();

        if (medgemmaAvailable) {
          for (let i = 0; i < xrayStudies.length; i++) {
            const uid = xrayStudies[i].studyInstanceUID;

            // Check cache/stored first
            const { detections: existing, allDetected } = await autoDetectionService.getStudyDetections(uid);

            if (allDetected) {
              if (existing.length > 0) {
                detectionsMap.set(uid, existing.map(d => ({
                  label: d.label, confidence: d.confidence,
                  x_min: d.x_min, y_min: d.y_min, x_max: d.x_max, y_max: d.y_max,
                })));
              }
            } else {
              setDetectionStatus(`Running AI detection (${i + 1}/${xrayStudies.length})...`);
              const detections = await autoDetectionService.runDetectionsForStudy(uid);
              const all = [...existing, ...detections];
              if (all.length > 0) {
                detectionsMap.set(uid, all.map(d => ({
                  label: d.label, confidence: d.confidence,
                  x_min: d.x_min, y_min: d.y_min, x_max: d.x_max, y_max: d.y_max,
                })));
              }
            }
          }
        }
      }

      // Triage with detections
      const triageService = getTriageService();
      const studyInputs = prepareStudiesForTriage(
        pacsStudies,
        detectionsMap.size > 0 ? detectionsMap : undefined
      );

      const response = await triageService.triageStudies({
        studies: studyInputs,
        useLLM: true,
      });

      if (!response.success) {
        throw new Error(response.error || 'Triage failed');
      }

      setTriagedStudies(response.triagedStudies, {
        totalProcessed: response.totalProcessed,
        statCount: response.statCount,
        urgentCount: response.urgentCount,
        semiUrgentCount: response.semiUrgentCount,
        routineCount: response.routineCount,
      });

      // Switch to triaged view after successful triage
      useTriageStore.getState().setViewMode('triaged');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Triage failed';
      console.error('[StudyBrowser] Triage failed:', error);
      setTriageError(message);
    } finally {
      setTriaging(false);
      setDetectionStatus(null);
    }
  }, [filteredStudies, setTriaging, setTriagedStudies, setTriageError]);

  // Get ordered studies based on triage view mode
  const orderedTriagedStudies = getOrderedStudies();
  const showTriagedView = triageViewMode === 'triaged' && triageStats.totalProcessed > 0;

  // Handle starting a longitudinal session from a study
  const handleStartLongitudinalSession = useCallback((study: PacsStudy) => {
    // Detect anatomy from study description or modality
    const detectAnatomy = (s: PacsStudy): string => {
      const desc = (s.studyDescription || '').toLowerCase();
      if (desc.includes('chest') || desc.includes('thorax') || desc.includes('lung')) return 'Chest';
      if (desc.includes('brain') || desc.includes('head')) return 'Brain';
      if (desc.includes('abdomen') || desc.includes('liver')) return 'Abdomen';
      if (desc.includes('breast') || desc.includes('mammo')) return 'Breast';
      if (desc.includes('spine') || desc.includes('lumbar') || desc.includes('cervical')) return 'Spine';
      if (desc.includes('pelvis') || desc.includes('hip')) return 'Pelvis';
      // Default based on modality
      if (s.modalities.includes('MG')) return 'Breast';
      if (s.modalities.includes('CT') || s.modalities.includes('MR')) return 'Unknown';
      return 'Unknown';
    };

    const { createSession, addTimepoint, setActiveSession } = useLongitudinalStore.getState();

    // Create new longitudinal session
    const sessionId = createSession({
      patientId: study.patientID,
      patientName: study.patientName,
      modality: study.modalities[0] || 'Unknown',
      anatomy: detectAnatomy(study),
      description: `Longitudinal study for ${study.patientName || study.patientID}`,
    });

    // Add current study as first timepoint (baseline)
    addTimepoint(sessionId, {
      label: 'Baseline',
      imageId: `pacs:${study.studyInstanceUID}`, // Will be updated when study loads
      acquisitionDateTime: study.studyDate,
      studyInstanceUID: study.studyInstanceUID,
      studyDate: study.studyDate,
      studyDescription: study.studyDescription,
    });

    // Navigate to viewer with longitudinal session active
    navigate(`/viewer?studyUID=${encodeURIComponent(study.studyInstanceUID)}&longitudinal=${sessionId}`);
  }, [navigate]);

  return (
    <div className="h-screen bg-background-primary text-text-primary flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 flex-shrink-0 bg-gradient-to-r from-background-secondary to-background-tertiary/80 border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-10 h-10 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-xl flex items-center justify-center shadow-md group-hover:shadow-glow transition-all duration-300">
                <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="absolute -inset-1 rounded-xl bg-accent-primary/20 opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-text-primary font-bold text-lg tracking-tight leading-none">
                MedAI
              </span>
              <span className="text-accent-primary text-[10px] font-semibold uppercase tracking-[0.2em]">
                Study Browser
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/upload')}
              className="flex items-center gap-2 px-4 py-2.5 bg-background-tertiary/50 hover:bg-background-hover border border-border-subtle hover:border-border-emphasis rounded-xl text-sm font-medium transition-all duration-200"
            >
              <Upload className="w-4 h-4" />
              Upload Local Files
            </button>

            <div className="w-px h-8 bg-gradient-to-b from-transparent via-border-emphasis to-transparent mx-1" />

            <div className="flex items-center gap-1 bg-background-tertiary/30 rounded-lg p-1">
              <button className="p-2 hover:bg-background-hover rounded-lg transition-colors">
                <Sun className="w-4 h-4 text-text-muted hover:text-text-primary" />
              </button>
              <button className="p-2 hover:bg-background-hover rounded-lg transition-colors">
                <Settings className="w-4 h-4 text-text-muted hover:text-text-primary" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-text-muted group-focus-within:text-accent-primary transition-colors" />
              </div>
              <input
                type="text"
                value={filters.query}
                onChange={(e) => setFilters({ query: e.target.value })}
                onKeyDown={handleKeyDown}
                placeholder="Search by patient name, ID, or description..."
                className="w-full h-12 pl-12 pr-12 bg-background-tertiary/50 border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/20 focus:bg-background-tertiary transition-all duration-200"
              />
              {filters.query && (
                <button
                  onClick={() => setFilters({ query: '' })}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-muted hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary hover:shadow-glow-sm rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 btn-shine"
            >
              <Search className="w-4 h-4" />
              Search
            </button>

            <button
              onClick={fetchStudies}
              disabled={isLoading}
              className="p-3 bg-background-tertiary/50 hover:bg-background-hover border border-border-subtle rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-text-muted ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filter Panel */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Source filter */}
            <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
              {[
                { value: 'all', label: 'All', icon: Filter },
                { value: 'pacs', label: 'PACS', icon: Globe },
                { value: 'local', label: 'Local', icon: HardDrive },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setFilters({ source: value as 'all' | 'pacs' | 'local' })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    filters.source === value
                      ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                      : 'text-text-muted hover:text-text-primary hover:bg-background-hover border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Modality filters */}
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-text-muted mr-1" />
              {COMMON_MODALITIES.map((mod) => (
                <button
                  key={mod}
                  onClick={() => toggleModality(mod)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                    filters.modalities.includes(mod)
                      ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40 shadow-sm'
                      : 'bg-background-tertiary/50 text-text-muted border-border-subtle hover:border-border-emphasis hover:text-text-secondary'
                  }`}
                >
                  {mod}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  clearFilters();
                  fetchStudies();
                }}
                className="text-xs text-text-muted hover:text-accent-primary transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Triage Control Bar - requires the triage feature */}
        {isFeatureEnabled('triage') && (
          <div className="mb-6">
            <TriageControlBar
              onTriageClick={handleTriageClick}
              disabled={isLoading || filteredStudies.length === 0}
              studyCount={filteredStudies.filter(s => s.source === 'pacs').length}
              statusMessage={detectionStatus}
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-accent-error-muted border border-accent-error/30 rounded-xl text-accent-error text-sm animate-slide-up">
            {error}
          </div>
        )}

        {/* Results count and view toggle */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-text-muted">
            {showTriagedView
              ? `${orderedTriagedStudies.length} studies prioritized`
              : `${filteredStudies.length} ${filteredStudies.length === 1 ? 'study' : 'studies'} found`
            }
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-lg p-1 border border-border-subtle/50">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                  : 'text-text-muted hover:text-text-primary hover:bg-background-hover border border-transparent'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                viewMode === 'list'
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                  : 'text-text-muted hover:text-text-primary hover:bg-background-hover border border-transparent'
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Study Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 bg-background-tertiary/30 rounded-2xl animate-shimmer"
              />
            ))}
          </div>
        ) : filteredStudies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-16 h-16 bg-background-tertiary/50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-text-secondary mb-2">No studies found</h3>
            <p className="text-sm text-text-muted max-w-md">
              {hasActiveFilters
                ? 'Try adjusting your search or filters to find what you\'re looking for.'
                : 'Connect to a PACS server or upload local files to get started.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  clearFilters();
                  fetchStudies();
                }}
                className="mt-4 px-4 py-2 bg-background-tertiary/50 hover:bg-background-hover border border-border-subtle rounded-lg text-sm transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : showTriagedView ? (
          /* Triaged View with Drag & Drop */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedTriagedStudies.map(s => s.studyUID)}
              strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
            >
              <div className={viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'flex flex-col gap-3'
              }>
                {orderedTriagedStudies.map((study) => (
                  <SortableStudyCard
                    key={study.studyUID}
                    study={study}
                    onClick={() => navigate(`/viewer?studyUID=${encodeURIComponent(study.studyUID)}`)}
                    showTriageInfo={true}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudies.map((study, index) => {
              const isPacs = study.source === 'pacs';
              const pacsStudy = isPacs ? (study as PacsStudy) : null;
              const studyId = isPacs ? pacsStudy!.studyInstanceUID : study.id;
              const modalities = isPacs ? pacsStudy!.modalities : (study.modality ? [study.modality] : []);
              const studyDate = isPacs ? pacsStudy!.studyDate : '';
              const numSeries = isPacs ? pacsStudy!.numberOfSeries : 1;
              const numInstances = isPacs ? pacsStudy!.numberOfInstances : 1;
              const patientLocation = isPacs ? pacsStudy?.patientLocation : undefined;
              const urgencyFlag = isPacs ? pacsStudy?.urgencyFlag : undefined;
              const reasonForVisit = isPacs ? pacsStudy?.reasonForVisit : undefined;

              return (
                <div
                  key={studyId}
                  onClick={() => handleStudyClick(study)}
                  className={`group relative bg-gradient-to-br from-background-tertiary/50 to-background-secondary/30 border border-border-subtle rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:border-accent-primary/40 hover:shadow-lg hover:shadow-accent-primary/5 hover:-translate-y-0.5 study-card-accent animate-stagger-fade-in stagger-${Math.min(index + 1, 8)}`}
                >
                  {/* Top row: Patient info + Modality badges */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Patient avatar */}
                      <div className="w-10 h-10 rounded-xl bg-background-hover/50 flex items-center justify-center flex-shrink-0 border border-border-subtle group-hover:border-accent-primary/30 transition-colors">
                        <User className="w-5 h-5 text-text-muted group-hover:text-accent-primary transition-colors" />
                      </div>

                      {/* Patient name & ID */}
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-text-primary truncate group-hover:text-accent-primary transition-colors">
                          {(study.patientName || 'Unknown Patient').replace('^', ' ')}
                        </h3>
                        <p className="text-xs text-text-muted font-mono">
                          ID: {isPacs ? pacsStudy!.patientID : 'Local'}
                        </p>
                      </div>
                    </div>

                    {/* Source + Modality badges */}
                    <div className="flex gap-1.5 flex-shrink-0 ml-2 flex-wrap justify-end">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${
                        isPacs
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-green-500/20 text-green-400 border-green-500/30'
                      }`}>
                        {study.source}
                      </span>
                      {modalities.slice(0, 2).map((mod) => (
                        <span
                          key={mod}
                          className={`px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${MODALITY_COLORS[mod] || MODALITY_COLORS.default}`}
                        >
                          {mod}
                        </span>
                      ))}
                      {modalities.length > 2 && (
                        <span className="px-2 py-1 text-[10px] text-text-muted">
                          +{modalities.length - 2}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Study description */}
                  <p className="text-sm text-text-secondary mb-3 line-clamp-2 min-h-[2.5rem]">
                    {study.studyDescription || 'No description available'}
                  </p>

                  {/* Location and Urgency badges */}
                  {(patientLocation || urgencyFlag) && (
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {urgencyFlag && urgencyFlag !== 'ROUTINE' && (
                        <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${URGENCY_COLORS[urgencyFlag] || URGENCY_COLORS.ROUTINE}`}>
                          <AlertTriangle className="w-3 h-3" />
                          {urgencyFlag.replace('_', ' ')}
                        </span>
                      )}
                      {patientLocation && (
                        <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${getLocationColor(patientLocation)}`}>
                          <MapPin className="w-3 h-3" />
                          {patientLocation}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bottom row: Metadata + Action */}
                  <div className="flex items-center justify-between">
                    {/* Metadata chips */}
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      {studyDate && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(studyDate)}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        {numSeries} series
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        {numInstances} images
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                      {/* Start Longitudinal Session (only for PACS studies with patient ID) */}
                      {isPacs && pacsStudy?.patientID && (
                        <button
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-text-secondary bg-background-tertiary/50 hover:bg-background-hover border border-border-subtle hover:border-accent-primary/40 rounded-lg transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartLongitudinalSession(pacsStudy);
                          }}
                          title="Start longitudinal comparison session"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                          Compare
                        </button>
                      )}
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent-primary bg-accent-primary/10 rounded-lg hover:bg-accent-primary/20 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStudyClick(study);
                        }}
                      >
                        Open
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-background-tertiary/30 border border-border-subtle rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_80px_100px_80px_150px_90px_80px_80px_60px] gap-3 px-4 py-3 bg-background-tertiary/50 border-b border-border-subtle text-xs font-semibold text-text-muted uppercase tracking-wide">
              <div>Patient</div>
              <div>Source</div>
              <div>Location</div>
              <div>Urgency</div>
              <div>Description</div>
              <div>Date</div>
              <div>Modality</div>
              <div>Images</div>
              <div></div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border-subtle">
              {filteredStudies.map((study, index) => {
                const isPacs = study.source === 'pacs';
                const pacsStudy = isPacs ? (study as PacsStudy) : null;
                const studyId = isPacs ? pacsStudy!.studyInstanceUID : study.id;
                const modalities = isPacs ? pacsStudy!.modalities : (study.modality ? [study.modality] : []);
                const studyDate = isPacs ? pacsStudy!.studyDate : '';
                const numSeries = isPacs ? pacsStudy!.numberOfSeries : 1;
                const numInstances = isPacs ? pacsStudy!.numberOfInstances : 1;
                const patientLocation = isPacs ? pacsStudy?.patientLocation : undefined;
                const urgencyFlag = isPacs ? pacsStudy?.urgencyFlag : undefined;

                return (
                  <div
                    key={studyId}
                    onClick={() => handleStudyClick(study)}
                    className="group grid grid-cols-[1fr_80px_100px_80px_150px_90px_80px_80px_60px] gap-3 px-4 py-3 cursor-pointer hover:bg-background-hover/50 transition-colors"
                  >
                    {/* Patient */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-background-hover/50 flex items-center justify-center flex-shrink-0 border border-border-subtle group-hover:border-accent-primary/30 transition-colors">
                        <User className="w-4 h-4 text-text-muted group-hover:text-accent-primary transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent-primary transition-colors">
                          {(study.patientName || 'Unknown Patient').replace('^', ' ')}
                        </div>
                        <div className="text-xs text-text-muted font-mono">
                          {isPacs ? pacsStudy!.patientID : 'Local'}
                        </div>
                      </div>
                    </div>

                    {/* Source */}
                    <div className="flex items-center">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${
                        isPacs
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-green-500/20 text-green-400 border-green-500/30'
                      }`}>
                        {study.source}
                      </span>
                    </div>

                    {/* Location */}
                    <div className="flex items-center">
                      {patientLocation ? (
                        <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${getLocationColor(patientLocation)}`}>
                          <MapPin className="w-3 h-3" />
                          {patientLocation}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">-</span>
                      )}
                    </div>

                    {/* Urgency */}
                    <div className="flex items-center">
                      {urgencyFlag && urgencyFlag !== 'ROUTINE' ? (
                        <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${URGENCY_COLORS[urgencyFlag]}`}>
                          <AlertTriangle className="w-3 h-3" />
                          {urgencyFlag.replace('_', ' ').substring(0, 6)}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">-</span>
                      )}
                    </div>

                    {/* Description */}
                    <div className="flex items-center">
                      <span className="text-sm text-text-secondary truncate">
                        {study.studyDescription || 'No description'}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="flex items-center text-sm text-text-muted">
                      {studyDate ? formatDate(studyDate) : '-'}
                    </div>

                    {/* Modality */}
                    <div className="flex items-center gap-1">
                      {modalities.slice(0, 2).map((mod) => (
                        <span
                          key={mod}
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${MODALITY_COLORS[mod] || MODALITY_COLORS.default}`}
                        >
                          {mod}
                        </span>
                      ))}
                      {modalities.length > 2 && (
                        <span className="text-[10px] text-text-muted">
                          +{modalities.length - 2}
                        </span>
                      )}
                    </div>

                    {/* Images */}
                    <div className="flex items-center text-sm text-text-muted">
                      {numSeries}s / {numInstances}i
                    </div>

                    {/* Action */}
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                      {/* Start Longitudinal Session (only for PACS studies with patient ID) */}
                      {isPacs && pacsStudy?.patientID && (
                        <button
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-secondary hover:text-accent-primary hover:bg-background-hover rounded-lg transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartLongitudinalSession(pacsStudy);
                          }}
                          title="Start longitudinal comparison session"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent-primary bg-accent-primary/10 rounded-lg hover:bg-accent-primary/20 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStudyClick(study);
                        }}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Connection status */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-text-muted">
          <div className={`w-2 h-2 rounded-full ${
            pacsConnected ? 'bg-accent-success shadow-[0_0_6px_rgba(0,229,160,0.5)]' : 'bg-accent-warning animate-pulse'
          }`} />
          <span>
            {pacsConnected
              ? 'Connected to PACS server'
              : 'Connecting to PACS server...'}
          </span>
        </div>
        </div>
      </main>
    </div>
  );
}
