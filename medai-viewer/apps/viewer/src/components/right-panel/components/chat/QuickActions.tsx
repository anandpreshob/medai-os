import React from 'react';
import { FileText, ListTree, Lightbulb, Sparkles } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'summarize',
    label: 'Summarize Findings',
    icon: FileText,
    prompt:
      'Please summarize the key findings from this case in a concise manner suitable for a radiology report.',
  },
  {
    id: 'differential',
    label: 'Differential Diagnosis',
    icon: ListTree,
    prompt:
      'Based on the imaging findings, what are the most likely differential diagnoses to consider? Please rank them by probability.',
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    icon: Lightbulb,
    prompt:
      'What clinical recommendations would you suggest based on the imaging findings? Include any follow-up imaging or additional workup that may be needed.',
  },
];

interface QuickActionsProps {
  onActionSelect: (prompt: string) => void;
  disabled?: boolean;
}

/**
 * Horizontal button row for quick action prompts
 */
export function QuickActions({ onActionSelect, disabled = false }: QuickActionsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
        <Sparkles className="h-3 w-3" />
        Quick actions
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onActionSelect(action.prompt)}
              disabled={disabled}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                bg-background-tertiary/50 text-text-secondary border border-border-subtle
                hover:bg-background-tertiary hover:text-text-primary hover:border-accent-primary/30
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-150"
            >
              <Icon className="h-3 w-3" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
