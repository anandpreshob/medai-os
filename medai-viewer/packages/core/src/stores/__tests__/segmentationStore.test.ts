import { describe, it, expect, beforeEach } from 'vitest';
import { useSegmentationStore, Segment, Segmentation } from '../segmentationStore';

// Helper to create test segmentation with default status
const createTestSegmentation = (overrides: Partial<Segmentation> & { id: string; label: string }): Segmentation => ({
  referenceVolumeId: 'vol-1',
  segments: [],
  status: 'draft',
  ...overrides,
});

describe('segmentationStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useSegmentationStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have empty segmentations array', () => {
      const state = useSegmentationStore.getState();
      expect(state.segmentations).toEqual([]);
    });

    it('should have null activeSegmentationId', () => {
      const state = useSegmentationStore.getState();
      expect(state.activeSegmentationId).toBeNull();
    });

    it('should have null activeSegmentIndex', () => {
      const state = useSegmentationStore.getState();
      expect(state.activeSegmentIndex).toBeNull();
    });
  });

  describe('addSegmentation()', () => {
    it('should add a new segmentation', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test Segmentation',
      });

      useSegmentationStore.getState().addSegmentation(segmentation);

      const state = useSegmentationStore.getState();
      expect(state.segmentations.length).toBe(1);
      expect(state.segmentations[0]).toEqual(segmentation);
    });

    it('should set first segmentation as active by default', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test Segmentation',
      });

      useSegmentationStore.getState().addSegmentation(segmentation);

      expect(useSegmentationStore.getState().activeSegmentationId).toBe('seg-1');
    });

    it('should not change active if already set', () => {
      const seg1: Segmentation = createTestSegmentation({ id: 'seg-1', label: 'Seg 1' });
      const seg2: Segmentation = createTestSegmentation({ id: 'seg-2', label: 'Seg 2' });

      useSegmentationStore.getState().addSegmentation(seg1);
      useSegmentationStore.getState().addSegmentation(seg2);

      expect(useSegmentationStore.getState().activeSegmentationId).toBe('seg-1');
    });
  });

  describe('removeSegmentation()', () => {
    it('should remove segmentation by id', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().removeSegmentation('seg-1');

      expect(useSegmentationStore.getState().segmentations.length).toBe(0);
    });

    it('should clear activeSegmentationId if removed', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().removeSegmentation('seg-1');

      expect(useSegmentationStore.getState().activeSegmentationId).toBeNull();
    });
  });

  describe('setActiveSegmentation()', () => {
    it('should set active segmentation id', () => {
      const seg1: Segmentation = createTestSegmentation({ id: 'seg-1', label: 'Seg 1' });
      const seg2: Segmentation = createTestSegmentation({ id: 'seg-2', label: 'Seg 2' });

      useSegmentationStore.getState().addSegmentation(seg1);
      useSegmentationStore.getState().addSegmentation(seg2);
      useSegmentationStore.getState().setActiveSegmentation('seg-2');

      expect(useSegmentationStore.getState().activeSegmentationId).toBe('seg-2');
    });
  });

  describe('addSegment()', () => {
    it('should add segment to specified segmentation', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      const segment: Segment = {
        segmentIndex: 1,
        label: 'Organ',
        color: '#ff0000',
        visible: true,
        locked: false,
        volumeId: 'labelmap:seg-1:seg1',
        cornerstoneSegmentationId: 'cs-seg:seg-1:seg1',
      };
      useSegmentationStore.getState().addSegment('seg-1', segment);

      const state = useSegmentationStore.getState();
      expect(state.segmentations[0].segments.length).toBe(1);
      expect(state.segmentations[0].segments[0]).toEqual(segment);
    });

    it('should set first segment as active by default', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      const segment: Segment = {
        segmentIndex: 1,
        label: 'Organ',
        color: '#ff0000',
        visible: true,
        locked: false,
        volumeId: 'labelmap:seg-1:seg1',
        cornerstoneSegmentationId: 'cs-seg:seg-1:seg1',
      };
      useSegmentationStore.getState().addSegment('seg-1', segment);

      expect(useSegmentationStore.getState().activeSegmentIndex).toBe(1);
    });
  });

  describe('updateSegment()', () => {
    it('should update segment properties', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [{ segmentIndex: 1, label: 'Organ', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' }],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().updateSegment('seg-1', 1, { label: 'Updated', color: '#00ff00' });

      const state = useSegmentationStore.getState();
      expect(state.segmentations[0].segments[0].label).toBe('Updated');
      expect(state.segmentations[0].segments[0].color).toBe('#00ff00');
    });

    it('should update only specified properties', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [{ segmentIndex: 1, label: 'Organ', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' }],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().updateSegment('seg-1', 1, { visible: false });

      const state = useSegmentationStore.getState();
      expect(state.segmentations[0].segments[0].visible).toBe(false);
      expect(state.segmentations[0].segments[0].label).toBe('Organ'); // unchanged
    });
  });

  describe('removeSegment()', () => {
    it('should remove segment from segmentation', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [
          { segmentIndex: 1, label: 'Organ 1', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' },
          { segmentIndex: 2, label: 'Organ 2', color: '#00ff00', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg2', cornerstoneSegmentationId: 'cs-seg:seg-1:seg2' },
        ],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().removeSegment('seg-1', 1);

      const state = useSegmentationStore.getState();
      expect(state.segmentations[0].segments.length).toBe(1);
      expect(state.segmentations[0].segments[0].segmentIndex).toBe(2);
    });

    it('should clear activeSegmentIndex if removed segment was active', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [{ segmentIndex: 1, label: 'Organ', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' }],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);
      useSegmentationStore.getState().setActiveSegmentIndex(1);

      useSegmentationStore.getState().removeSegment('seg-1', 1);

      expect(useSegmentationStore.getState().activeSegmentIndex).toBeNull();
    });
  });

  describe('setActiveSegmentIndex()', () => {
    it('should set active segment index', () => {
      useSegmentationStore.getState().setActiveSegmentIndex(2);
      expect(useSegmentationStore.getState().activeSegmentIndex).toBe(2);
    });
  });

  describe('toggleSegmentVisibility()', () => {
    it('should toggle segment visibility', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [{ segmentIndex: 1, label: 'Organ', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' }],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().toggleSegmentVisibility('seg-1', 1);

      expect(useSegmentationStore.getState().segmentations[0].segments[0].visible).toBe(false);

      useSegmentationStore.getState().toggleSegmentVisibility('seg-1', 1);

      expect(useSegmentationStore.getState().segmentations[0].segments[0].visible).toBe(true);
    });
  });

  describe('toggleSegmentLock()', () => {
    it('should toggle segment lock', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [{ segmentIndex: 1, label: 'Organ', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' }],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      useSegmentationStore.getState().toggleSegmentLock('seg-1', 1);

      expect(useSegmentationStore.getState().segmentations[0].segments[0].locked).toBe(true);
    });
  });

  describe('getActiveSegmentation()', () => {
    it('should return active segmentation', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
      });
      useSegmentationStore.getState().addSegmentation(segmentation);

      const active = useSegmentationStore.getState().getActiveSegmentation();

      expect(active).toEqual(segmentation);
    });

    it('should return undefined if no active segmentation', () => {
      const active = useSegmentationStore.getState().getActiveSegmentation();
      expect(active).toBeUndefined();
    });
  });

  describe('reset()', () => {
    it('should reset all state to initial values', () => {
      const segmentation: Segmentation = createTestSegmentation({
        id: 'seg-1',
        label: 'Test',
        segments: [{ segmentIndex: 1, label: 'Organ', color: '#ff0000', visible: true, locked: false, volumeId: 'labelmap:seg-1:seg1', cornerstoneSegmentationId: 'cs-seg:seg-1:seg1' }],
      });
      useSegmentationStore.getState().addSegmentation(segmentation);
      useSegmentationStore.getState().setActiveSegmentIndex(1);

      useSegmentationStore.getState().reset();

      const state = useSegmentationStore.getState();
      expect(state.segmentations).toEqual([]);
      expect(state.activeSegmentationId).toBeNull();
      expect(state.activeSegmentIndex).toBeNull();
    });
  });
});
