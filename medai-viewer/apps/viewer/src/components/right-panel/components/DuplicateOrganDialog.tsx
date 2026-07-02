import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@medai/ui';

export type DuplicateDialogChoice = 'skip' | 'replace' | 'cancel';

interface DuplicateOrganDialogProps {
  isOpen: boolean;
  duplicateOrgans: string[];
  onChoice: (choice: DuplicateDialogChoice) => void;
}

export function DuplicateOrganDialog({
  isOpen,
  duplicateOrgans,
  onChoice,
}: DuplicateOrganDialogProps) {
  if (!isOpen) return null;

  const organList = duplicateOrgans.join(', ');
  const isPlural = duplicateOrgans.length > 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg p-6 max-w-md mx-4 shadow-xl border border-border-subtle">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              Duplicate Organ{isPlural ? 's' : ''} Found
            </h3>
            <p className="text-text-secondary text-sm mt-2">
              You already have segmentation{isPlural ? 's' : ''} for:{' '}
              <span className="font-medium text-text-primary">{organList}</span>
            </p>
          </div>
        </div>

        <p className="text-text-muted text-sm mb-4">
          What would you like to do?
        </p>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => onChoice('skip')}
          >
            <span className="font-medium">Skip duplicates</span>
            <span className="text-text-muted ml-2">
              — Only segment new organs
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => onChoice('replace')}
          >
            <span className="font-medium">Replace existing</span>
            <span className="text-text-muted ml-2">
              — Remove old, add new segments
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => onChoice('cancel')}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
