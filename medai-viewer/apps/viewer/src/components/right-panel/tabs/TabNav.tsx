import React from 'react';
import type { TabId } from '../types';
import type { SuiteTabConfig } from '@medai/core';
import {
  Target,
  Wand2,
  Activity,
  Radiation,
  Brain,
  Heart,
  Scissors,
  BarChart2,
  Scan,
} from 'lucide-react';

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabs?: SuiteTabConfig[];
}

// Icon mapping for tab icons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  Wand2,
  Activity,
  Radiation,
  Brain,
  Heart,
  Scissors,
  BarChart2,
  Scan,
};

// Fallback tabs only when the suite provides no `tabs` field at all.
// An explicitly empty array (e.g. feature-filtered in basic mode) renders
// nothing — we must NOT re-introduce gated tabs here.
const defaultTabs: SuiteTabConfig[] = [
  { id: 'auto-segmentation', label: 'Auto-Seg', component: 'AutoSegmentationTab', icon: 'Target' },
  { id: 'smart-edit', label: 'SmartEdit', component: 'SmartEditTab', icon: 'Wand2' },
];

export function TabNav({ activeTab, onTabChange, tabs }: TabNavProps) {
  const tabsToRender = tabs ?? defaultTabs;

  // No visible tabs (all filtered out by feature flags) -> render nothing
  if (tabsToRender.length === 0) return null;

  return (
    <div className="flex bg-background-tertiary/50 rounded-xl p-1.5 gap-1 border border-border-subtle/50">
      {tabsToRender.map((tab) => {
        const IconComponent = tab.icon ? iconMap[tab.icon] : null;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            className={`
              relative flex-1 px-3 py-2.5 text-sm font-medium rounded-lg
              transition-all duration-200 ease-out
              flex items-center justify-center gap-2
              ${isActive
                ? 'bg-gradient-to-b from-background-elevated to-background-tertiary text-text-primary shadow-md border border-border-subtle'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover/60'
              }
            `}
            onClick={() => onTabChange(tab.id as TabId)}
            data-testid={`tab-${tab.id}`}
          >
            {/* Active indicator accent line */}
            {isActive && (
              <div className="absolute inset-x-3 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-accent-primary to-transparent rounded-full" />
            )}
            {IconComponent && (
              <IconComponent className={`h-4 w-4 ${isActive ? 'text-accent-primary' : ''}`} />
            )}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
