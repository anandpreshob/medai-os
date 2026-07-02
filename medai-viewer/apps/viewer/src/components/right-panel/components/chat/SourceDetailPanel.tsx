import React from 'react';
import {
  X,
  ExternalLink,
  FileText,
  BookOpen,
  GraduationCap,
  ScrollText,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@medai/ui';
import type { ChatSource, ChatSourceType } from '@medai/core';

interface SourceDetailPanelProps {
  source: ChatSource;
  onClose: () => void;
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
 * Get color class for source type
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
      return 'Clinical Guideline';
    case 'pubmed':
      return 'PubMed Article';
    case 'semantic_scholar':
      return 'Semantic Scholar';
    case 'textbook':
      return 'Medical Textbook';
    default:
      return 'Source';
  }
}

/**
 * Side panel showing detailed source information
 */
export function SourceDetailPanel({ source, onClose }: SourceDetailPanelProps) {
  const [copied, setCopied] = React.useState(false);
  const Icon = getSourceIcon(source.type);
  const colorClass = getSourceColor(source.type);
  const typeLabel = getSourceLabel(source.type);

  const handleCopyExcerpt = async () => {
    if (source.excerpt) {
      await navigator.clipboard.writeText(source.excerpt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="absolute inset-0 bg-background-secondary z-20 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${colorClass}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {typeLabel}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-background-tertiary transition-colors"
        >
          <X className="h-4 w-4 text-text-muted" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-sm font-semibold text-text-primary leading-tight">
            {source.title}
          </h3>

          {/* Relevance score */}
          {source.relevanceScore !== undefined && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-text-muted">Relevance:</span>
              <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary rounded-full transition-all"
                  style={{ width: `${source.relevanceScore * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-accent-primary">
                {Math.round(source.relevanceScore * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Authors */}
        {source.authors && source.authors.length > 0 && (
          <div>
            <h4 className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Authors
            </h4>
            <p className="text-xs text-text-secondary">
              {source.authors.join(', ')}
            </p>
          </div>
        )}

        {/* Excerpt */}
        {source.excerpt && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] text-text-muted uppercase tracking-wider">
                Excerpt
              </h4>
              <button
                onClick={handleCopyExcerpt}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="p-3 bg-background-tertiary/50 rounded-lg border border-border-subtle">
              <p className="text-xs text-text-secondary italic leading-relaxed">
                "{source.excerpt}"
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with external link */}
      {source.url && (
        <div className="p-3 border-t border-border-subtle">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button variant="outline" className="w-full justify-center">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Original Source
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
