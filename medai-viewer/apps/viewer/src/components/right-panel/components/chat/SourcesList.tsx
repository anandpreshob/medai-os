import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  BookOpen,
  GraduationCap,
  ScrollText,
} from 'lucide-react';
import type { ChatSource, ChatSourceType } from '@medai/core';

interface SourcesListProps {
  sources: ChatSource[];
  onSourceSelect: (source: ChatSource) => void;
}

/**
 * Get icon for source type
 */
function getSourceIcon(type: ChatSourceType) {
  switch (type) {
    case 'guideline':
      return ScrollText;
    case 'pubmed':
      return GraduationCap;
    case 'semantic_scholar':
      return BookOpen;
    case 'textbook':
      return FileText;
    default:
      return FileText;
  }
}

/**
 * Get color for source type badge
 */
function getSourceColor(type: ChatSourceType): string {
  switch (type) {
    case 'guideline':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'pubmed':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'semantic_scholar':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'textbook':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

/**
 * Get label for source type
 */
function getSourceLabel(type: ChatSourceType): string {
  switch (type) {
    case 'guideline':
      return 'Guideline';
    case 'pubmed':
      return 'PubMed';
    case 'semantic_scholar':
      return 'Scholar';
    case 'textbook':
      return 'Textbook';
    default:
      return 'Source';
  }
}

/**
 * Single source item
 */
function SourceItem({
  source,
  onSelect,
}: {
  source: ChatSource;
  onSelect: () => void;
}) {
  const Icon = getSourceIcon(source.type);
  const colorClass = getSourceColor(source.type);
  const label = getSourceLabel(source.type);

  // Truncate excerpt if too long
  const truncatedExcerpt = source.excerpt
    ? source.excerpt.length > 100
      ? source.excerpt.substring(0, 100) + '...'
      : source.excerpt
    : null;

  return (
    <div
      className="p-2 rounded-lg bg-background-tertiary/50 hover:bg-background-tertiary cursor-pointer transition-colors group"
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        {/* Source type badge */}
        <span
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>

        {/* Relevance score */}
        {source.relevanceScore !== undefined && (
          <span className="ml-auto text-[10px] text-text-muted">
            {Math.round(source.relevanceScore * 100)}%
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-xs font-medium text-text-primary mt-1.5 line-clamp-2 group-hover:text-accent-primary transition-colors">
        {source.title}
      </h4>

      {/* Authors */}
      {source.authors && source.authors.length > 0 && (
        <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">
          {source.authors.slice(0, 3).join(', ')}
          {source.authors.length > 3 && ` +${source.authors.length - 3} more`}
        </p>
      )}

      {/* Excerpt preview */}
      {truncatedExcerpt && (
        <p className="text-[10px] text-text-secondary mt-1 line-clamp-2 italic">
          "{truncatedExcerpt}"
        </p>
      )}

      {/* External link */}
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] text-accent-primary hover:underline mt-1"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View source
        </a>
      )}
    </div>
  );
}

/**
 * Collapsible list of citation sources
 */
export function SourcesList({ sources, onSourceSelect }: SourcesListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium">
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
          {sources.map((source, index) => (
            <SourceItem
              key={`${source.title}-${index}`}
              source={source}
              onSelect={() => onSourceSelect(source)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
