import { create } from 'zustand';

/**
 * What is currently open. Deliberately small: the engine (Cornerstone) owns
 * pixel and camera state; this store owns *which* things are open and the
 * user-facing layout/tool choices that commands read and write.
 */

export type LayoutId = '1x1' | '1x2' | '2x2' | 'mpr' | 'mpr+3d';
export type ToolName =
  | 'WindowLevel'
  | 'Pan'
  | 'Zoom'
  | 'StackScroll'
  | 'Length'
  | 'Angle'
  | 'CobbAngle'
  | 'Bidirectional'
  | 'EllipticalROI'
  | 'RectangleROI'
  | 'CircleROI'
  | 'Probe'
  | 'ArrowAnnotate'
  | 'PlanarFreehandROI'
  | 'Crosshairs';

export interface OpenSeries {
  /** Stable id used as the viewport's display-set id. */
  id: string;
  source: 'dicomweb' | 'local-dicom' | 'local-volume';
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  modality: string;
  description: string;
  /** Cornerstone imageIds (one per frame) for image series; empty for volume files. */
  imageIds: string[];
  /** Cornerstone volumeId for volumetric display sets, if created. */
  volumeId?: string;
  /** True when the series is a proper 3D stack (consistent orientation, ≥ 3 slices). */
  isVolumetric: boolean;
  /** Multi-frame cine candidate (XA/US/cardiac). */
  isCine: boolean;
  frameCount: number;
  /** DICOM-SEG / RTSTRUCT and other derived objects are not displayable series. */
  isDerived: boolean;
  sopClassUID?: string;
  seriesNumber?: number;
  /** SEG / RTSTRUCT / SR / RTDOSE / … for derived objects. */
  derivedKind?: string;
  /** Why a stack could not become a volume, when applicable. */
  geometryNote?: string;
  /** For local volume files: display name. */
  fileName?: string;
}

export interface OpenStudy {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyDescription: string;
  series: OpenSeries[];
}

export interface Overlays {
  patientInfo: boolean;
  orientation: boolean;
  scaleBar: boolean;
  referenceLines: boolean;
}

interface SessionState {
  study: OpenStudy | null;
  /** Display-set id shown in each viewport slot, by slot index. */
  slots: (string | null)[];
  activeSlot: number;
  layout: LayoutId;
  activeTool: ToolName;
  overlays: Overlays;
  cinePlaying: boolean;
  cineFps: number;
  loading: { active: boolean; message: string; progress: number };
  error: string | null;
  /** Incremented when engine-only state (overlays, fusion) changes so panels re-read it. */
  engineTick: number;

  bump: () => void;
  setStudy: (study: OpenStudy | null) => void;
  addSeries: (series: OpenSeries) => void;
  setSlot: (slot: number, displaySetId: string | null) => void;
  setActiveSlot: (slot: number) => void;
  setLayout: (layout: LayoutId) => void;
  setActiveTool: (tool: ToolName) => void;
  setOverlay: (key: keyof Overlays, on: boolean) => void;
  setCine: (playing: boolean, fps?: number) => void;
  setLoading: (active: boolean, message?: string, progress?: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initial = {
  study: null,
  slots: [null, null, null, null] as (string | null)[],
  activeSlot: 0,
  layout: '1x1' as LayoutId,
  activeTool: 'WindowLevel' as ToolName,
  overlays: { patientInfo: true, orientation: true, scaleBar: true, referenceLines: false },
  cinePlaying: false,
  cineFps: 15,
  loading: { active: false, message: '', progress: 0 },
  error: null,
  engineTick: 0,
};

export const useSession = create<SessionState>((set) => ({
  ...initial,
  bump: () => set((s) => ({ engineTick: s.engineTick + 1 })),
  setStudy: (study) => set({ study, slots: [null, null, null, null], activeSlot: 0 }),
  addSeries: (series) =>
    set((s) => {
      if (!s.study) return {};
      if (s.study.series.some((x) => x.id === series.id)) return {};
      return { study: { ...s.study, series: [...s.study.series, series] } };
    }),
  setSlot: (slot, displaySetId) =>
    set((s) => {
      const slots = [...s.slots];
      slots[slot] = displaySetId;
      return { slots };
    }),
  setActiveSlot: (activeSlot) => set({ activeSlot }),
  setLayout: (layout) => set({ layout }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setOverlay: (key, on) => set((s) => ({ overlays: { ...s.overlays, [key]: on } })),
  setCine: (cinePlaying, fps) => set((s) => ({ cinePlaying, cineFps: fps ?? s.cineFps })),
  setLoading: (active, message = '', progress = 0) => set({ loading: { active, message, progress } }),
  setError: (error) => set({ error }),
  reset: () => set({ ...initial, slots: [null, null, null, null] }),
}));

export function slotCount(layout: LayoutId): number {
  switch (layout) {
    case '1x1':
      return 1;
    case '1x2':
      return 2;
    case '2x2':
    case 'mpr+3d':
      return 4;
    case 'mpr':
      return 3;
  }
}

export function getSeries(id: string | null): OpenSeries | undefined {
  if (!id) return undefined;
  return useSession.getState().study?.series.find((s) => s.id === id);
}
