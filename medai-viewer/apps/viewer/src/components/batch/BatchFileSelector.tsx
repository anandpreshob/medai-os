/**
 * BatchFileSelector - File selection component for batch processing
 *
 * Features:
 * - Multi-select file list with thumbnails
 * - Filter by modality, date, status
 * - Select all/none buttons
 * - File previews on hover
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Check,
  Square,
  CheckSquare,
  Filter,
  X,
  Image,
  Calendar,
  Activity,
  Search,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@medai/ui';
import { useBatchProcessingStore, useViewerStore, type BatchFile } from '@medai/core';

interface FilterOptions {
  modality: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
}

const MODALITY_OPTIONS = ['All', 'CT', 'MR', 'XR', 'US', 'PT', 'NM', 'Other'];

export function BatchFileSelector() {
  const [filters, setFilters] = useState<FilterOptions>({
    modality: 'All',
    dateFrom: '',
    dateTo: '',
    searchQuery: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);

  // Store state
  const {
    availableFiles,
    selectedFileIds,
    setAvailableFiles,
    selectFile,
    deselectFile,
    selectAllFiles,
    deselectAllFiles,
    toggleFileSelection,
  } = useBatchProcessingStore();

  const { images } = useViewerStore();

  // Initialize available files from viewer store
  useEffect(() => {
    if (images.size > 0 && availableFiles.length === 0) {
      const files: BatchFile[] = Array.from(images.entries()).map(([imageId, image]) => ({
        id: imageId,
        name: imageId.split('/').pop() || imageId, // Extract filename from imageId
        imageId,
        modality: image.metadata?.modality || 'Unknown',
        date: undefined, // Date not available in current ImageMetadata type
        patientId: image.metadata?.patientName, // Use patientName as a fallback
        studyDescription: image.metadata?.studyDescription,
        thumbnailUrl: undefined, // Would be generated from image data
      }));
      setAvailableFiles(files);
    }
  }, [images, availableFiles.length, setAvailableFiles]);

  // Filter files based on current filter options
  const filteredFiles = useMemo(() => {
    return availableFiles.filter((file) => {
      // Modality filter
      if (filters.modality !== 'All' && file.modality !== filters.modality) {
        return false;
      }

      // Date range filter
      if (filters.dateFrom && file.date && file.date < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && file.date && file.date > filters.dateTo) {
        return false;
      }

      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesName = file.name.toLowerCase().includes(query);
        const matchesPatient = file.patientId?.toLowerCase().includes(query);
        const matchesDescription = file.studyDescription?.toLowerCase().includes(query);
        if (!matchesName && !matchesPatient && !matchesDescription) {
          return false;
        }
      }

      return true;
    });
  }, [availableFiles, filters]);

  // Check if all filtered files are selected
  const allFiltered = filteredFiles.every((f) => selectedFileIds.has(f.id));
  const someFiltered = filteredFiles.some((f) => selectedFileIds.has(f.id));

  /**
   * Handle select/deselect all filtered files
   */
  const handleSelectAllFiltered = useCallback(() => {
    if (allFiltered) {
      filteredFiles.forEach((f) => deselectFile(f.id));
    } else {
      filteredFiles.forEach((f) => selectFile(f.id));
    }
  }, [allFiltered, filteredFiles, selectFile, deselectFile]);

  /**
   * Clear all filters
   */
  const handleClearFilters = useCallback(() => {
    setFilters({
      modality: 'All',
      dateFrom: '',
      dateTo: '',
      searchQuery: '',
    });
  }, []);

  const hasActiveFilters = filters.modality !== 'All' || filters.dateFrom || filters.dateTo || filters.searchQuery;

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => setFilters((f) => ({ ...f, searchQuery: e.target.value }))}
            placeholder="Search files, patients, descriptions..."
            className="
              w-full pl-10 pr-4 py-2.5 rounded-lg
              bg-background-tertiary border border-border-subtle
              text-text-primary text-sm placeholder:text-text-muted
              focus:outline-none focus:border-accent-primary/40
              transition-colors
            "
          />
        </div>

        {/* Filter Toggle */}
        <Button
          variant={showFilters || hasActiveFilters ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4 mr-1.5" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1.5 w-5 h-5 rounded-full bg-white/20 text-xs flex items-center justify-center">
              !
            </span>
          )}
        </Button>

        {/* Selection Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAllFiltered}
            className="text-xs"
          >
            {allFiltered ? 'Deselect All' : 'Select All'}
          </Button>
          <span className="text-xs text-text-muted">
            {selectedFileIds.size} of {filteredFiles.length}
          </span>
        </div>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="p-4 rounded-lg bg-background-tertiary/50 border border-border-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Filter Options
            </h4>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-xs text-accent-primary hover:text-accent-primary/80 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Modality Filter */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Modality</label>
              <div className="relative">
                <select
                  value={filters.modality}
                  onChange={(e) => setFilters((f) => ({ ...f, modality: e.target.value }))}
                  className="
                    w-full px-3 py-2 rounded-lg appearance-none
                    bg-background-tertiary border border-border-subtle
                    text-text-primary text-sm
                    focus:outline-none focus:border-accent-primary/40
                    transition-colors cursor-pointer
                  "
                >
                  {MODALITY_OPTIONS.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Date From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="
                  w-full px-3 py-2 rounded-lg
                  bg-background-tertiary border border-border-subtle
                  text-text-primary text-sm
                  focus:outline-none focus:border-accent-primary/40
                  transition-colors
                "
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Date To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="
                  w-full px-3 py-2 rounded-lg
                  bg-background-tertiary border border-border-subtle
                  text-text-primary text-sm
                  focus:outline-none focus:border-accent-primary/40
                  transition-colors
                "
              />
            </div>
          </div>
        </div>
      )}

      {/* File Grid */}
      <div className="grid grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-2">
        {filteredFiles.map((file) => {
          const isSelected = selectedFileIds.has(file.id);
          const isHovered = hoveredFileId === file.id;

          return (
            <button
              key={file.id}
              onClick={() => toggleFileSelection(file.id)}
              onMouseEnter={() => setHoveredFileId(file.id)}
              onMouseLeave={() => setHoveredFileId(null)}
              className={`
                relative group p-3 rounded-xl
                transition-all duration-200
                ${isSelected
                  ? 'bg-accent-primary/10 border-2 border-accent-primary/40 shadow-lg shadow-accent-primary/10'
                  : 'bg-background-tertiary/50 border-2 border-transparent hover:border-border-emphasis hover:bg-background-hover/50'
                }
              `}
            >
              {/* Selection Checkbox */}
              <div className={`
                absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center
                transition-all duration-200
                ${isSelected
                  ? 'bg-accent-primary text-white'
                  : 'bg-background-hover/50 text-text-muted group-hover:bg-background-hover'
                }
              `}>
                {isSelected ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span className="w-3 h-3" />
                )}
              </div>

              {/* Thumbnail Placeholder */}
              <div className={`
                w-full aspect-square rounded-lg mb-2 flex items-center justify-center
                transition-colors
                ${isSelected
                  ? 'bg-accent-primary/5'
                  : 'bg-background-tertiary group-hover:bg-background-hover/50'
                }
              `}>
                {file.thumbnailUrl ? (
                  <img
                    src={file.thumbnailUrl}
                    alt={file.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <Image className={`w-8 h-8 ${isSelected ? 'text-accent-primary/40' : 'text-text-muted'}`} />
                )}
              </div>

              {/* File Info */}
              <div className="text-left">
                <p className="text-xs font-medium text-text-primary truncate" title={file.name}>
                  {file.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {file.modality && (
                    <span className="text-2xs px-1.5 py-0.5 rounded bg-background-hover text-text-muted">
                      {file.modality}
                    </span>
                  )}
                  {file.date && (
                    <span className="text-2xs text-text-muted">
                      {file.date}
                    </span>
                  )}
                </div>
              </div>

              {/* Hover Preview Tooltip */}
              {isHovered && (
                <div className="absolute z-20 left-full ml-2 top-0 w-48 p-3 rounded-lg bg-background-elevated border border-border-default shadow-xl pointer-events-none">
                  <p className="text-xs font-medium text-text-primary mb-2">{file.name}</p>
                  <div className="space-y-1 text-2xs text-text-muted">
                    {file.modality && (
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3 h-3" />
                        <span>Modality: {file.modality}</span>
                      </div>
                    )}
                    {file.date && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        <span>Date: {file.date}</span>
                      </div>
                    )}
                    {file.patientId && (
                      <div className="flex items-center gap-1.5">
                        <span>Patient: {file.patientId}</span>
                      </div>
                    )}
                    {file.studyDescription && (
                      <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                        {file.studyDescription}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredFiles.length === 0 && (
        <div className="py-12 text-center">
          <Image className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No files found</p>
          <p className="text-sm text-text-muted mt-1">
            {availableFiles.length === 0
              ? 'Load images in the viewer to see them here'
              : 'Try adjusting your filter criteria'
            }
          </p>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="mt-3"
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}

      {/* Selection Summary */}
      {selectedFileIds.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-accent-primary/5 border border-accent-primary/20">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-accent-primary" />
            <span className="text-sm text-text-primary">
              <strong>{selectedFileIds.size}</strong> file{selectedFileIds.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={deselectAllFiles}
            className="text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Clear Selection
          </Button>
        </div>
      )}
    </div>
  );
}

export default BatchFileSelector;
