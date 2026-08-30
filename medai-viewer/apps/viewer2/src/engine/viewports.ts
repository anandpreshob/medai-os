import { RenderingEngine, Enums, cache, utilities, volumeLoader, type Types } from '@cornerstonejs/core';
import {
  ToolGroupManager,
  Enums as ToolEnums,
  utilities as toolUtils,
  annotation,
  StackScrollTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  CrosshairsTool,
  TrackballRotateTool,
  LengthTool,
  AngleTool,
  CobbAngleTool,
  BidirectionalTool,
  EllipticalROITool,
  CircleROITool,
  RectangleROITool,
  ProbeTool,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  type Types as ToolTypes,
} from '@cornerstonejs/tools';
import type { OpenSeries, ToolName } from '../state/session';
import { md } from './metadata';

export type SlotKind = 'stack' | 'volume' | '3d';
export type SlotOrientation = 'axial' | 'sagittal' | 'coronal';

export interface ShowOptions {
  kind?: SlotKind;
  orientation?: SlotOrientation;
}

interface SlotState {
  element: HTMLDivElement | null;
  viewportId: string;
  kind: SlotKind | null;
  orientation: SlotOrientation | null;
  displaySetId: string | null;
  pending?: { series: OpenSeries; opts: ShowOptions };
  resize?: ResizeObserver;
}

const { MouseBindings, KeyboardBindings } = ToolEnums;
const ENGINE_ID = 'medai';

const ANNOTATION_TOOLS: ToolName[] = [
  'Length',
  'Angle',
  'CobbAngle',
  'Bidirectional',
  'EllipticalROI',
  'CircleROI',
  'RectangleROI',
  'Probe',
  'ArrowAnnotate',
  'PlanarFreehandROI',
];

const TOOL_CLASS: Record<ToolName, { toolName: string }> = {
  WindowLevel: WindowLevelTool,
  Pan: PanTool,
  Zoom: ZoomTool,
  StackScroll: StackScrollTool,
  Length: LengthTool,
  Angle: AngleTool,
  CobbAngle: CobbAngleTool,
  Bidirectional: BidirectionalTool,
  EllipticalROI: EllipticalROITool,
  RectangleROI: RectangleROITool,
  CircleROI: CircleROITool,
  Probe: ProbeTool,
  ArrowAnnotate: ArrowAnnotateTool,
  PlanarFreehandROI: PlanarFreehandROITool,
  Crosshairs: CrosshairsTool,
};

/** Bindings a tool keeps even when it is not the primary-button tool. */
const BASELINE: Partial<Record<ToolName, ToolTypes.IToolBinding[]>> = {
  Pan: [{ mouseButton: MouseBindings.Auxiliary }, { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Ctrl }],
  Zoom: [{ mouseButton: MouseBindings.Secondary }, { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Shift }],
  StackScroll: [{ mouseButton: MouseBindings.Wheel }, { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Alt }],
};

const ORIENTATION_AXIS: Record<SlotOrientation, Enums.OrientationAxis> = {
  axial: Enums.OrientationAxis.AXIAL,
  sagittal: Enums.OrientationAxis.SAGITTAL,
  coronal: Enums.OrientationAxis.CORONAL,
};

/**
 * Owns the rendering engine, one viewport per layout slot, and the tool groups.
 * React components attach DOM elements; commands drive everything else.
 */
export class ViewportManager {
  private re: RenderingEngine | null = null;
  private slots = new Map<number, SlotState>();
  private volumeIds = new Map<string, string>();
  private primaryTool: ToolName = 'WindowLevel';
  private listeners = new Map<number, Set<() => void>>();
  /** Bumped whenever a slot is detached/cleared/re-shown so in-flight show() calls abort quietly. */
  private generation = new Map<number, number>();

  private engine(): RenderingEngine {
    return (this.re ??= new RenderingEngine(ENGINE_ID));
  }

  private slot(i: number): SlotState {
    let s = this.slots.get(i);
    if (!s) {
      s = { element: null, viewportId: `slot-${i}`, kind: null, orientation: null, displaySetId: null };
      this.slots.set(i, s);
    }
    return s;
  }

  // ---------- DOM lifecycle ----------

  attach(i: number, element: HTMLDivElement): void {
    const s = this.slot(i);
    if (s.element === element) return;
    if (s.element) this.detach(i);
    s.element = element;
    s.resize = new ResizeObserver(() => this.scheduleResize());
    s.resize.observe(element);
    if (s.pending) {
      const { series, opts } = s.pending;
      s.pending = undefined;
      void this.show(i, series, opts);
    }
  }

  detach(i: number): void {
    const s = this.slots.get(i);
    if (!s) return;
    this.generation.set(i, (this.generation.get(i) ?? 0) + 1);
    s.resize?.disconnect();
    s.resize = undefined;
    if (s.kind) {
      this.toolGroup(s.kind).removeViewports(ENGINE_ID, s.viewportId);
      this.engine().disableElement(s.viewportId);
    }
    s.element = null;
    s.kind = null;
    s.orientation = null;
    s.displaySetId = null;
  }

  private resizeTimer: number | undefined;
  private scheduleResize(): void {
    if (this.resizeTimer) cancelAnimationFrame(this.resizeTimer);
    this.resizeTimer = requestAnimationFrame(() => {
      this.resizeTimer = undefined;
      if (this.re) this.re.resize(true, false);
    });
  }

  // ---------- display ----------

  async show(i: number, series: OpenSeries, opts: ShowOptions = {}): Promise<void> {
    const s = this.slot(i);
    if (!s.element) {
      s.pending = { series, opts };
      return;
    }
    const gen = (this.generation.get(i) ?? 0) + 1;
    this.generation.set(i, gen);
    const alive = () => this.generation.get(i) === gen && s.element !== null;
    try {
      await this.showInner(i, s, series, opts, alive);
    } catch (e) {
      if (!alive()) return; // superseded or torn down mid-flight: not an error
      throw e;
    }
  }

  private async showInner(i: number, s: SlotState, series: OpenSeries, opts: ShowOptions, alive: () => boolean): Promise<void> {
    const kind: SlotKind = opts.kind ?? (series.imageIds.length === 0 ? 'volume' : 'stack');
    const orientation = opts.orientation ?? 'axial';
    if (kind !== 'stack' && !series.isVolumetric && series.imageIds.length > 0) {
      throw new Error(`${series.description}: not a regular 3D stack${series.geometryNote ? ` (${series.geometryNote})` : ''}`);
    }
    const re = this.engine();

    if (s.kind !== kind) {
      if (s.kind) {
          this.toolGroup(s.kind).removeViewports(ENGINE_ID, s.viewportId);
        re.disableElement(s.viewportId);
      }
      const type = kind === 'stack' ? Enums.ViewportType.STACK : kind === 'volume' ? Enums.ViewportType.ORTHOGRAPHIC : Enums.ViewportType.VOLUME_3D;
      re.enableElement({
        viewportId: s.viewportId,
        type,
        element: s.element!,
        defaultOptions: { background: [0, 0, 0], ...(kind === 'volume' ? { orientation: ORIENTATION_AXIS[orientation] } : {}) },
      });
      this.toolGroup(kind).addViewport(s.viewportId, ENGINE_ID);
      s.kind = kind;
      s.orientation = kind === 'volume' ? orientation : null;
    } else if (kind === 'volume' && s.orientation !== orientation) {
      (re.getViewport(s.viewportId) as Types.IVolumeViewport).setOrientation(ORIENTATION_AXIS[orientation]);
      s.orientation = orientation;
    }
    s.displaySetId = series.id;

    if (kind === 'stack') {
      const sv = re.getViewport(s.viewportId) as Types.IStackViewport;
      const start = series.isCine ? 0 : Math.floor(series.imageIds.length / 2);
      await sv.setStack(series.imageIds, start);
      if (!alive()) return;
      sv.render();
    } else {
      const volumeId = await this.ensureVolume(series);
      if (!alive()) return;
      const vv = re.getViewport(s.viewportId) as Types.IVolumeViewport;
      await vv.setVolumes([{ volumeId }]);
      if (!alive()) return;
      if (kind === '3d') vv.setProperties({ preset: series.modality === 'CT' ? 'CT-Bone' : 'MR-Default' });
      vv.render();
    }
    this.applyPrimaryTool();
    this.emit(i);
  }

  clear(i: number): void {
    const s = this.slots.get(i);
    this.generation.set(i, (this.generation.get(i) ?? 0) + 1);
    if (!s?.kind) return;
    this.toolGroup(s.kind).removeViewports(ENGINE_ID, s.viewportId);
    this.engine().disableElement(s.viewportId);
    s.kind = null;
    s.orientation = null;
    s.displaySetId = null;
    this.emit(i);
  }

  /** Volume for a series, created and streaming on first use. */
  async ensureVolume(series: OpenSeries): Promise<string> {
    const existing = series.volumeId ?? this.volumeIds.get(series.id);
    if (existing && cache.getVolume(existing)) return existing;
    if (series.imageIds.length === 0) throw new Error(`${series.description}: no images to build a volume from`);
    const volumeId = `cornerstoneStreamingImageVolume:${series.id}`;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: series.imageIds });
    volume.load();
    this.volumeIds.set(series.id, volumeId);
    return volumeId;
  }

  // ---------- queries ----------

  viewport(i: number): Types.IStackViewport | Types.IVolumeViewport | undefined {
    const s = this.slots.get(i);
    if (!s?.kind || !this.re) return undefined;
    return this.re.getViewport(s.viewportId) as Types.IStackViewport | Types.IVolumeViewport;
  }

  kindOf(i: number): SlotKind | null {
    return this.slots.get(i)?.kind ?? null;
  }

  elementOf(i: number): HTMLDivElement | null {
    return this.slots.get(i)?.element ?? null;
  }

  currentImageId(i: number): string | undefined {
    const vp = this.viewport(i);
    return vp?.getCurrentImageId?.() ?? undefined;
  }

  sliceInfo(i: number): { index: number; count: number } {
    const vp = this.viewport(i);
    if (!vp) return { index: 0, count: 0 };
    return { index: vp.getSliceIndex(), count: vp.getNumberOfSlices() };
  }

  windowLevel(i: number): { width: number; center: number } | undefined {
    const vp = this.viewport(i);
    const range = vp?.getProperties()?.voiRange;
    if (!range) return undefined;
    const wl = utilities.windowLevel.toWindowLevel(range.lower, range.upper);
    return { width: wl.windowWidth, center: wl.windowCenter };
  }

  zoom(i: number): number {
    return this.viewport(i)?.getZoom() ?? 1;
  }

  /** Pixel value range of what is displayed, for relative presets. */
  pixelRange(i: number): { min: number; max: number } | undefined {
    const vp = this.viewport(i);
    if (!vp) return undefined;
    const imageId = this.currentImageId(i);
    const img = imageId ? cache.getImage(imageId) : undefined;
    if (img && Number.isFinite(img.minPixelValue) && Number.isFinite(img.maxPixelValue)) {
      return { min: img.minPixelValue, max: img.maxPixelValue };
    }
    const data = vp.getImageData();
    const scalars = data && 'scalarData' in data ? (data.scalarData as ArrayLike<number> | undefined) : undefined;
    if (!scalars || scalars.length === 0) return undefined;
    let min = Infinity;
    let max = -Infinity;
    const step = Math.max(1, Math.floor(scalars.length / 2_000_000));
    for (let k = 0; k < scalars.length; k += step) {
      const v = scalars[k];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  }

  /** Modality of the series in a slot, from metadata of the current image. */
  modality(i: number): string | undefined {
    const id = this.currentImageId(i);
    return id ? md.series(id)?.modality : undefined;
  }

  /** Screen-edge orientation labels (LPS) from the camera; empty when unknown. */
  orientationLabels(i: number): { left: string; right: string; top: string; bottom: string } {
    const vp = this.viewport(i);
    const s = this.slots.get(i);
    const none = { left: '', right: '', top: '', bottom: '' };
    if (!vp || !s?.kind || s.kind === '3d') return none;
    const cam = vp.getCamera();
    if (!cam.viewUp || !cam.viewPlaneNormal) return none;
    const up = cam.viewUp;
    const n = cam.viewPlaneNormal;
    // Screen right = up × normal (normal points from focal point toward the camera).
    const right: Types.Point3 = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
    if (s.kind === 'stack') {
      // Stack viewports render in image space; map through the image plane's cosines.
      const id = this.currentImageId(i);
      const plane = id ? md.plane(id) : undefined;
      if (!plane?.rowCosines || !plane.columnCosines) return none;
      return {
        right: lps(plane.rowCosines, cam.flipHorizontal ? -1 : 1),
        left: lps(plane.rowCosines, cam.flipHorizontal ? 1 : -1),
        bottom: lps(plane.columnCosines, cam.flipVertical ? -1 : 1),
        top: lps(plane.columnCosines, cam.flipVertical ? 1 : -1),
      };
    }
    return { right: lps(right, 1), left: lps(right, -1), top: lps(up, 1), bottom: lps(up, -1) };
  }

  // ---------- manipulation ----------

  setWindowLevel(i: number, width: number, center: number): void {
    const vp = this.viewport(i);
    if (!vp) return;
    vp.setProperties({ voiRange: utilities.windowLevel.toLowHighRange(width, center) });
    vp.render();
  }

  invert(i: number): void {
    const vp = this.viewport(i);
    if (!vp) return;
    vp.setProperties({ invert: !vp.getProperties()?.invert });
    vp.render();
  }

  resetView(i: number): void {
    const vp = this.viewport(i);
    if (!vp) return;
    vp.resetProperties();
    vp.resetCamera();
    vp.render();
  }

  scroll(i: number, delta: number): void {
    const vp = this.viewport(i);
    if (!vp) return;
    utilities.scroll(vp as unknown as Parameters<typeof utilities.scroll>[0], { delta });
  }

  jumpToSlice(i: number, index: number): void {
    const s = this.slots.get(i);
    const vp = this.viewport(i);
    if (!vp || !s?.element) return;
    const count = vp.getNumberOfSlices();
    const clamped = Math.max(0, Math.min(count - 1, Math.round(index)));
    void utilities.jumpToSlice(s.element, { imageIndex: clamped });
  }

  playCine(i: number, fps: number): void {
    const s = this.slots.get(i);
    if (!s?.element || !s.kind) return;
    toolUtils.cine.playClip(s.element, { framesPerSecond: fps, loop: true });
  }

  stopCine(i: number): void {
    const s = this.slots.get(i);
    if (!s?.element) return;
    toolUtils.cine.stopClip(s.element);
  }

  setPrimaryTool(tool: ToolName): void {
    this.primaryTool = tool;
    this.applyPrimaryTool();
  }

  private applyPrimaryTool(): void {
    for (const kind of ['stack', 'volume'] as SlotKind[]) {
      const tg = this.toolGroup(kind);
      for (const name of Object.keys(TOOL_CLASS) as ToolName[]) {
        if (name === 'Crosshairs' && kind === 'stack') continue;
        const toolName = TOOL_CLASS[name].toolName;
        if (!tg.hasTool(toolName)) continue;
        if (name === this.primaryTool) {
          tg.setToolActive(toolName, { bindings: [...(BASELINE[name] ?? []), { mouseButton: MouseBindings.Primary }] });
        } else if (BASELINE[name]) {
          tg.setToolActive(toolName, { bindings: BASELINE[name]! });
        } else if (name === 'Crosshairs') {
          tg.setToolDisabled(toolName);
        } else {
          tg.setToolPassive(toolName);
        }
      }
    }
  }

  /** Millimetres per CSS pixel along the screen's horizontal axis (for the scale bar). */
  mmPerPixel(i: number): number | undefined {
    const vp = this.viewport(i);
    const s = this.slots.get(i);
    if (!vp || !s?.element || s.kind === '3d') return undefined;
    const w = s.element.clientWidth;
    const h = s.element.clientHeight;
    if (!w || !h) return undefined;
    try {
      const a = vp.canvasToWorld([0, h / 2]);
      const b = vp.canvasToWorld([w, h / 2]);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      return Number.isFinite(d) && d > 0 ? d / w : undefined;
    } catch {
      return undefined;
    }
  }

  deleteSelectedAnnotations(): number {
    const uids = annotation.selection.getAnnotationsSelected();
    uids.forEach((uid) => annotation.state.removeAnnotation(uid));
    this.rerenderAnnotations();
    return uids.length;
  }

  clearAnnotations(): void {
    annotation.state.removeAllAnnotations();
    this.rerenderAnnotations();
  }

  private rerenderAnnotations(): void {
    const ids = [...this.slots.values()].filter((s) => s.kind).map((s) => s.viewportId);
    if (ids.length) toolUtils.triggerAnnotationRenderForViewportIds(ids);
  }

  // ---------- events ----------

  /** Notify on anything that changes what the corner overlays show. */
  subscribe(i: number, cb: () => void): () => void {
    const set = this.listeners.get(i) ?? new Set();
    set.add(cb);
    this.listeners.set(i, set);
    const s = this.slot(i);
    const el = s.element;
    const events = [Enums.Events.STACK_NEW_IMAGE, Enums.Events.VOLUME_NEW_IMAGE, Enums.Events.VOI_MODIFIED, Enums.Events.CAMERA_MODIFIED, Enums.Events.IMAGE_RENDERED];
    events.forEach((e) => el?.addEventListener(e, cb));
    return () => {
      set.delete(cb);
      events.forEach((e) => el?.removeEventListener(e, cb));
    };
  }

  private emit(i: number): void {
    this.listeners.get(i)?.forEach((cb) => cb());
  }

  // ---------- tool groups ----------

  private toolGroup(kind: SlotKind): ToolTypes.IToolGroup {
    const id = `tg-${kind}`;
    const existing = ToolGroupManager.getToolGroup(id);
    if (existing) return existing;
    const tg = ToolGroupManager.createToolGroup(id)!;
    if (kind === '3d') {
      tg.addTool(TrackballRotateTool.toolName);
      tg.addTool(ZoomTool.toolName);
      tg.addTool(PanTool.toolName);
      tg.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
      tg.setToolActive(ZoomTool.toolName, { bindings: BASELINE.Zoom! });
      tg.setToolActive(PanTool.toolName, { bindings: BASELINE.Pan! });
      return tg;
    }
    tg.addTool(StackScrollTool.toolName);
    tg.addTool(WindowLevelTool.toolName);
    tg.addTool(PanTool.toolName);
    tg.addTool(ZoomTool.toolName);
    ANNOTATION_TOOLS.forEach((t) => tg.addTool(TOOL_CLASS[t].toolName));
    if (kind === 'volume') {
      tg.addTool(CrosshairsTool.toolName, { viewportIndicators: false, autoPan: { enabled: false, panSize: 10 } });
      tg.setToolDisabled(CrosshairsTool.toolName);
    }
    tg.setToolActive(StackScrollTool.toolName, { bindings: BASELINE.StackScroll! });
    tg.setToolActive(PanTool.toolName, { bindings: BASELINE.Pan! });
    tg.setToolActive(ZoomTool.toolName, { bindings: BASELINE.Zoom! });
    tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
    ANNOTATION_TOOLS.forEach((t) => tg.setToolPassive(TOOL_CLASS[t].toolName));
    return tg;
  }

  /** Drop everything shown and every cached volume/image (call when opening a different study). */
  clearAll(): void {
    for (const i of [...this.slots.keys()]) this.clear(i);
    this.volumeIds.clear();
    cache.purgeCache();
  }
}

/** Dominant LPS axis label of a direction vector (sign flips for the opposite screen edge). */
function lps(v: ArrayLike<number>, sign: 1 | -1): string {
  const x = v[0] * sign;
  const y = v[1] * sign;
  const z = v[2] * sign;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) return x > 0 ? 'L' : 'R';
  if (ay >= ax && ay >= az) return y > 0 ? 'P' : 'A';
  return z > 0 ? 'S' : 'I';
}

export const viewports = new ViewportManager();
