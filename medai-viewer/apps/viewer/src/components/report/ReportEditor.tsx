import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Edit2, Check, X, Copy, FileText } from 'lucide-react';
import { Button, toast } from '@medai/ui';
import { ReportSections } from '@medai/core';
import ReactMarkdown from 'react-markdown';

/**
 * Fix malformed markdown patterns from LLM output
 * Common issues:
 * - "Text:**" instead of "**Text:**"
 * - Unpaired ** markers
 */
function cleanMarkdown(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // Fix patterns like "Word:**" or "Word(s):**" at start of line or after newline
  // These should be "**Word:** " or "**Word(s):**"
  cleaned = cleaned.replace(/^([A-Z][A-Za-z\s\(\)]+):\*\*/gm, '**$1:**');
  cleaned = cleaned.replace(/\n([A-Z][A-Za-z\s\(\)]+):\*\*/g, '\n**$1:**');

  // Fix "**Text:** content" that has wrong spacing
  cleaned = cleaned.replace(/\*\*([^*]+):\*\*\s*(?!\*)/g, '**$1:** ');

  // Fix single trailing ** without opening
  cleaned = cleaned.replace(/([A-Za-z]):\*\*\s/g, '**$1:** ');

  // Remove orphan ** at end of lines
  cleaned = cleaned.replace(/\*\*\s*$/gm, '');

  // Fix double spaces
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned;
}

interface ReportSectionProps {
  title: string;
  sectionKey: keyof ReportSections;
  content: string;
  editedContent?: string;
  onEdit: (key: keyof ReportSections, content: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ReportSection({
  title,
  sectionKey,
  content,
  editedContent,
  onEdit,
  isExpanded,
  onToggleExpand,
}: ReportSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localContent, setLocalContent] = useState(editedContent ?? content);

  const displayContent = editedContent ?? content;
  const hasEdits = editedContent !== undefined && editedContent !== content;

  const handleSave = () => {
    onEdit(sectionKey, localContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalContent(displayContent);
    setIsEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent);
    toast.success('Copied', 'Section content copied to clipboard');
  };

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden mb-3">
      {/* Section Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-background-secondary cursor-pointer hover:bg-background-hover transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">{title}</span>
          {hasEdits && (
            <span className="text-xs bg-accent-primary/20 text-accent-primary px-2 py-0.5 rounded">
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            title="Copy section"
          >
            <Copy className="h-4 w-4" />
          </Button>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-text-muted" />
          ) : (
            <ChevronDown className="h-5 w-5 text-text-muted" />
          )}
        </div>
      </div>

      {/* Section Content */}
      {isExpanded && (
        <div className="p-4 bg-background-primary">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={localContent}
                onChange={(e) => setLocalContent(e.target.value)}
                className="w-full h-40 px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent-primary"
                placeholder="Enter content..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button variant="default" size="sm" onClick={handleSave}>
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative group">
              <div className="prose prose-sm prose-invert max-w-none text-text-secondary
                prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2
                prose-p:my-2 prose-p:leading-relaxed
                prose-strong:text-text-primary prose-strong:font-semibold
                prose-ul:my-2 prose-ul:pl-4 prose-li:my-1
                prose-ol:my-2 prose-ol:pl-4
                [&>*:first-child]:mt-0">
                {displayContent ? (
                  <ReactMarkdown>{cleanMarkdown(displayContent)}</ReactMarkdown>
                ) : (
                  <p className="text-text-muted italic">No content</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReportEditorProps {
  sections: ReportSections;
  editedSections: Partial<ReportSections>;
  onEditSection: (key: keyof ReportSections, content: string) => void;
  className?: string;
}

const SECTION_CONFIG: { key: keyof ReportSections; title: string }[] = [
  { key: 'clinicalHistory', title: 'Clinical History' },
  { key: 'technique', title: 'Technique' },
  { key: 'comparison', title: 'Comparison' },
  { key: 'findings', title: 'Radiologist Findings' },
  { key: 'aiFindings', title: 'AI Findings' },
  { key: 'impression', title: 'Impression' },
  { key: 'recommendations', title: 'Recommendations' },
];

export function ReportEditor({
  sections,
  editedSections,
  onEditSection,
  className = '',
}: ReportEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<keyof ReportSections>>(
    new Set(['findings', 'impression', 'recommendations'])
  );

  const toggleSection = (key: keyof ReportSections) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(SECTION_CONFIG.map((s) => s.key)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const copyFullReport = () => {
    const fullReport = SECTION_CONFIG.map(({ key, title }) => {
      const content = editedSections[key] ?? sections[key];
      return `## ${title}\n${cleanMarkdown(content) || 'N/A'}`;
    }).join('\n\n');

    navigator.clipboard.writeText(fullReport);
    toast.success('Copied', 'Full report copied to clipboard');
  };

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">Report Sections</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
          <div className="w-px h-4 bg-border-subtle" />
          <Button variant="secondary" size="sm" onClick={copyFullReport}>
            <Copy className="h-4 w-4 mr-1" />
            Copy Full Report
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div>
        {SECTION_CONFIG.map(({ key, title }) => (
          <ReportSection
            key={key}
            title={title}
            sectionKey={key}
            content={sections[key]}
            editedContent={editedSections[key]}
            onEdit={onEditSection}
            isExpanded={expandedSections.has(key)}
            onToggleExpand={() => toggleSection(key)}
          />
        ))}
      </div>
    </div>
  );
}
