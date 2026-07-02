import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Check, X } from 'lucide-react';

interface OrganSelectorProps {
  availableOrgans: Record<string, number>;
  selectedOrgans: string[];
  onSelectionChange: (selected: string[]) => void;
  disabled?: boolean;
}

// Organ categories for grouping
const ORGAN_CATEGORIES: Record<string, string[]> = {
  'Abdominal Organs': [
    'spleen', 'kidney_right', 'kidney_left', 'gallbladder', 'liver', 'stomach',
    'pancreas', 'adrenal_gland_right', 'adrenal_gland_left', 'small_bowel',
    'duodenum', 'colon', 'urinary_bladder', 'prostate', 'kidney_cyst_left',
    'kidney_cyst_right',
  ],
  'Thoracic Organs': [
    'lung_upper_lobe_left', 'lung_lower_lobe_left', 'lung_upper_lobe_right',
    'lung_middle_lobe_right', 'lung_lower_lobe_right', 'esophagus', 'trachea',
    'thyroid_gland',
  ],
  'Cardiovascular': [
    'aorta', 'inferior_vena_cava', 'portal_vein_and_splenic_vein',
    'iliac_artery_left', 'iliac_artery_right', 'iliac_vena_left', 'iliac_vena_right',
    'heart_myocardium', 'heart_atrium_left', 'heart_ventricle_left',
    'heart_atrium_right', 'heart_ventricle_right', 'pulmonary_artery',
    'brachiocephalic_trunk', 'subclavian_artery_right', 'subclavian_artery_left',
    'common_carotid_artery_right',
  ],
  'Neurological': [
    'brain', 'skull', 'spinal_cord',
  ],
  'Vertebrae': [
    'vertebrae_C1', 'vertebrae_C2', 'vertebrae_C3', 'vertebrae_C4', 'vertebrae_C5',
    'vertebrae_C6', 'vertebrae_C7', 'vertebrae_T1', 'vertebrae_T2', 'vertebrae_T3',
    'vertebrae_T4', 'vertebrae_T5', 'vertebrae_T6', 'vertebrae_T7', 'vertebrae_T8',
    'vertebrae_T9', 'vertebrae_T10', 'vertebrae_T11', 'vertebrae_T12',
    'vertebrae_L1', 'vertebrae_L2', 'vertebrae_L3', 'vertebrae_L4', 'vertebrae_L5',
    'vertebrae_S1',
  ],
  'Ribs': [
    'rib_left_1', 'rib_left_2', 'rib_left_3', 'rib_left_4', 'rib_left_5',
    'rib_left_6', 'rib_left_7', 'rib_left_8', 'rib_left_9', 'rib_left_10',
    'rib_left_11', 'rib_left_12', 'rib_right_1', 'rib_right_2', 'rib_right_3',
    'rib_right_4', 'rib_right_5', 'rib_right_6', 'rib_right_7', 'rib_right_8',
    'rib_right_9', 'rib_right_10', 'rib_right_11', 'rib_right_12',
  ],
  'Skeletal': [
    'sternum', 'costal_cartilages', 'humerus_left', 'humerus_right',
    'scapula_left', 'scapula_right', 'clavicula_left', 'clavicula_right',
    'femur_left', 'femur_right', 'hip_left', 'hip_right', 'sacrum', 'face',
  ],
  'Muscles': [
    'gluteus_maximus_left', 'gluteus_maximus_right', 'gluteus_medius_left',
    'gluteus_medius_right', 'gluteus_minimus_left', 'gluteus_minimus_right',
    'autochthon_left', 'autochthon_right', 'iliopsoas_left', 'iliopsoas_right',
  ],
};

// Format organ name for display (e.g., "kidney_right" -> "Kidney Right")
function formatOrganName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function OrganSelector({
  availableOrgans,
  selectedOrgans,
  onSelectionChange,
  disabled = false,
}: OrganSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Get list of available organ names
  const availableOrganNames = useMemo(() => Object.keys(availableOrgans), [availableOrgans]);

  // Group organs by category, only including available organs
  const groupedOrgans = useMemo(() => {
    const groups: Record<string, string[]> = {};
    const usedOrgans = new Set<string>();

    for (const [category, organs] of Object.entries(ORGAN_CATEGORIES)) {
      const availableInCategory = organs.filter((organ) => availableOrganNames.includes(organ));
      if (availableInCategory.length > 0) {
        groups[category] = availableInCategory;
        availableInCategory.forEach((organ) => usedOrgans.add(organ));
      }
    }

    // Add any organs not in predefined categories to "Other"
    const otherOrgans = availableOrganNames.filter((organ) => !usedOrgans.has(organ));
    if (otherOrgans.length > 0) {
      groups['Other'] = otherOrgans;
    }

    return groups;
  }, [availableOrganNames]);

  // Filter organs based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedOrgans;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, string[]> = {};

    for (const [category, organs] of Object.entries(groupedOrgans)) {
      const matchingOrgans = organs.filter((organ) =>
        organ.toLowerCase().includes(query) ||
        formatOrganName(organ).toLowerCase().includes(query)
      );
      if (matchingOrgans.length > 0) {
        filtered[category] = matchingOrgans;
      }
    }

    return filtered;
  }, [groupedOrgans, searchQuery]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleOrgan = (organ: string) => {
    if (selectedOrgans.includes(organ)) {
      onSelectionChange(selectedOrgans.filter((o) => o !== organ));
    } else {
      onSelectionChange([...selectedOrgans, organ]);
    }
  };

  const selectAllInCategory = (category: string) => {
    const organsInCategory = filteredGroups[category] || [];
    const newSelection = new Set(selectedOrgans);
    organsInCategory.forEach((organ) => newSelection.add(organ));
    onSelectionChange(Array.from(newSelection));
  };

  const clearCategory = (category: string) => {
    const organsInCategory = new Set(filteredGroups[category] || []);
    onSelectionChange(selectedOrgans.filter((organ) => !organsInCategory.has(organ)));
  };

  const selectAll = () => {
    onSelectionChange([...availableOrganNames]);
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  const totalOrgans = availableOrganNames.length;
  const selectedCount = selectedOrgans.length;

  return (
    <div className={`space-y-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <label className="text-text-secondary text-xs mb-1 block">
        Organ Selection ({selectedCount}/{totalOrgans} selected)
      </label>

      {/* Search and quick actions */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search organs..."
            className="w-full bg-background-tertiary text-text-primary rounded pl-8 pr-3 py-1.5 text-sm border border-border-default focus:border-primary focus:outline-none"
            disabled={disabled}
          />
        </div>
        <button
          onClick={selectAll}
          className="px-2 py-1 text-xs bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors"
          disabled={disabled}
          title="Select All"
        >
          All
        </button>
        <button
          onClick={clearAll}
          className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
          disabled={disabled}
          title="Clear All"
        >
          Clear
        </button>
      </div>

      {/* Organ groups */}
      <div className="max-h-48 overflow-y-auto border border-border-default rounded bg-background-tertiary">
        {Object.entries(filteredGroups).map(([category, organs]) => {
          const isExpanded = expandedCategories.has(category);
          const selectedInCategory = organs.filter((o) => selectedOrgans.includes(o)).length;

          return (
            <div key={category} className="border-b border-border-default last:border-b-0">
              {/* Category header */}
              <div
                className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-background-secondary"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center gap-1">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-text-muted" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-text-muted" />
                  )}
                  <span className="text-xs font-medium text-text-primary">{category}</span>
                  <span className="text-xs text-text-muted">
                    ({selectedInCategory}/{organs.length})
                  </span>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => selectAllInCategory(category)}
                    className="p-0.5 text-primary hover:bg-primary/20 rounded"
                    title={`Select all in ${category}`}
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => clearCategory(category)}
                    className="p-0.5 text-red-400 hover:bg-red-500/20 rounded"
                    title={`Clear ${category}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Organ checkboxes */}
              {isExpanded && (
                <div className="px-2 pb-2 grid grid-cols-2 gap-1">
                  {organs.map((organ) => (
                    <label
                      key={organ}
                      className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-background-secondary rounded px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOrgans.includes(organ)}
                        onChange={() => toggleOrgan(organ)}
                        className="w-3 h-3 rounded border-border-default text-primary focus:ring-primary"
                        disabled={disabled}
                      />
                      <span className="text-text-primary truncate" title={formatOrganName(organ)}>
                        {formatOrganName(organ)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedCount === 0 && (
        <p className="text-text-muted text-xs">
          No organs selected - will segment all {totalOrgans} structures
        </p>
      )}
    </div>
  );
}

export default OrganSelector;
