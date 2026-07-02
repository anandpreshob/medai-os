import React from 'react';
import { Button } from '@medai/ui';

export type MergeDialogChoice = 'merge' | 'replace' | 'cancel';

interface MergeReplaceDialogProps {
  isOpen: boolean;
  onChoice: (choice: MergeDialogChoice) => void;
}

export function MergeReplaceDialog({ isOpen, onChoice }: MergeReplaceDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg p-6 max-w-md mx-4 shadow-xl border border-border-subtle">
        <h3 className="text-lg font-semibold text-text-primary mb-3">
          Existing Segmentation Found
        </h3>
        <p className="text-text-secondary text-sm mb-4">
          You already have a segmentation loaded. Would you like to merge the new label with the existing segmentation, or replace it entirely?
        </p>
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChoice('cancel')}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChoice('replace')}
          >
            Replace
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onChoice('merge')}
          >
            Merge
          </Button>
        </div>
      </div>
    </div>
  );
}
