import { RenderingEngine, Enums, cache, eventTarget, imageLoader, metaData, utilities, volumeLoader, type Types } from '@cornerstonejs/core';
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
  PlanarFreehandContourSegmentationTool,
  type Types as ToolTypes,
} from '@cornerstonejs/tools';
import type { OpenSeries, OpenStudy, ToolName } from '../state/session';
import { md } from './metadata';
import {
  attachToViewport,
  createRtstructContours,
  createSegLabelmap,
  destroyObject,
  detachFromViewport,
  normalsAligned,
  removeAllObjects,
  resolveReferencedSeries,
  type ObjectHandle,
} from './objects';

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
  /** PET (or other) volume fused over the base volume in this slot. */
  fusion?: { seriesId: string; volumeId: string; actorUID: string };
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
  /** imageId → message for loads that failed inside Cornerstone's async pipeline. */
  private failed = new Map<string, string>();
  private failureListenerInstalled = false;

  private installFailureListener(): void {
    if (this.failureListenerInstalled) return;
    this.failureListenerInstalled = true;
    const onFail = (evt: Event) => {
      const detail = (evt as CustomEvent<{ imageId?: string; error?: { message?: string } | string }>).detail ?? {};
      const message = typeof detail.error === 'string' ? detail.error : detail.error?.message ?? 'image failed to load';
      if (detail.imageId) this.failed.set(detail.imageId, message);
      for (const i of this.slots.keys()) this.emit(i);
    };
    eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, onFail);
    eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_ERROR, onFail);
    eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED, (evt: Event) => {
      const volumeId = (evt as CustomEvent<{ volumeId?: string }>).detail?.volumeId;
      if (!volumeId) return;
      this.raiseProgress(volumeId, 100);
      for (const [k, v] of this.slots) if (v.displaySetId && this.volumeIds.get(v.displaySetId) === volumeId) this.emit(k);
    });
  }

  /** Load failure for the image currently shown in a slot, if any. */
  loadError(i: number): string | undefined {
    const id = this.currentImageId(i);
    return id ? this.failed.get(id) : undefined;
  }

  private engine(): RenderingEngine {
    this.installFailureListener();
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
    if (s.displaySetId !== series.id) s.fusion = undefined;
    s.displaySetId = series.id;

    if (kind === 'stack') {
      const sv = re.getViewport(s.viewportId) as Types.IStackViewport;
      const start = series.isCine ? 0 : Math.floor(series.imageIds.length / 2);
      // Decode the first image inside our own await: Cornerstone's stack loader rejects unhandled otherwise.
      try {
        await imageLoader.loadAndCacheImage(series.imageIds[start]);
      } catch (e) {
        throw new Error(`Cannot decode ${series.description}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!alive()) return;
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
    this.reapplyObjects(i);
    this.emit(i);
  }

  clear(i: number): void {
    const s = this.slots.get(i);
    this.generation.set(i, (this.generation.get(i) ?? 0) + 1);
    if (!s?.kind) return;
    s.fusion = undefined;
    this.toolGroup(s.kind).removeViewports(ENGINE_ID, s.viewportId);
    this.engine().disableElement(s.viewportId);
    s.kind = null;
    s.orientation = null;
    s.displaySetId = null;
    this.emit(i);
  }

  /** In-flight createAndCacheVolume calls, so concurrent show()s (e.g. an MPR layout switch) share one. */
  private volumeCreates = new Map<string, Promise<string>>();

  /** Volume for a series, created and streaming on first use. Concurrency-safe. */
  async ensureVolume(series: OpenSeries): Promise<string> {
    const existing = series.volumeId ?? this.volumeIds.get(series.id);
    if (existing && cache.getVolume(existing)) {
      this.volumeIds.set(series.id, existing);
      if (!this.volumeProgress.has(existing)) this.volumeProgress.set(existing, 100);
      return existing;
    }
    const pending = this.volumeCreates.get(series.id);
    if (pending) return pending;
    if (series.imageIds.length === 0) throw new Error(`${series.description}: no images to build a volume from`);
    const create = (async () => {
      const volumeId = `cornerstoneStreamingImageVolume:${series.id}`;
      const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: series.imageIds });
      this.volumeIds.set(series.id, volumeId);
      this.raiseProgress(volumeId, 0);
      const total = series.imageIds.length;
      let loaded = 0;
      (volume as unknown as { load: (cb?: (evt: unknown) => void) => void }).load((evt) => {
        const e = (evt ?? {}) as { framesLoaded?: number; framesProcessed?: number; numFrames?: number; totalNumFrames?: number };
        loaded = Math.max(loaded, e.framesLoaded ?? e.framesProcessed ?? loaded + 1);
        const denom = e.totalNumFrames ?? e.numFrames ?? total;
        this.raiseProgress(volumeId, Math.min(100, Math.round((loaded / Math.max(1, denom)) * 100)));
        for (const [k, v] of this.slots) if (v.displaySetId === series.id) this.emit(k);
      });
      return volumeId;
    })();
    this.volumeCreates.set(series.id, create);
    try {
      return await create;
    } finally {
      this.volumeCreates.delete(series.id);
    }
  }

  /** Progress only ever goes up; late callbacks must not rewind a finished volume. */
  private raiseProgress(volumeId: string, value: number): void {
    const current = this.volumeProgress.get(volumeId) ?? -1;
    if (value > current) this.volumeProgress.set(volumeId, value);
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

  /** True when the displayed PET image was pre-scaled to SUV (body weight) by the loader. */
  isSuvScaled(i: number): boolean {
    const id = this.currentImageId(i);
    const img = id ? cache.getImage(id) : undefined;
    if (!img) return false;
    const helper = (utilities as unknown as { isPTPrescaledWithSUV?: (image: unknown) => boolean }).isPTPrescaledWithSUV;
    if (helper) return Boolean(helper(img));
    const pre = (img as unknown as { preScale?: { scalingParameters?: { suvbw?: number } } }).preScale;
    return Boolean(pre?.scalingParameters?.suvbw);
  }

  /** Streaming progress (0–100) of the volume shown in a slot; 100 for stacks and fully loaded volumes. */
  private volumeProgress = new Map<string, number>();
  progress(i: number): number {
    const s = this.slots.get(i);
    if (!s?.kind || s.kind === 'stack') return 100;
    const volumeId = s.displaySetId ? this.volumeIds.get(s.displaySetId) : undefined;
    if (!volumeId) return 100;
    // The volume's own load status is authoritative; the callback tally is only for the moving bar.
    const vol = cache.getVolume(volumeId) as unknown as { loadStatus?: { loaded?: boolean } } | undefined;
    if (vol?.loadStatus?.loaded) {
      this.raiseProgress(volumeId, 100);
      return 100;
    }
    return this.volumeProgress.get(volumeId) ?? 0;
  }

  /** Displayed intensity (after modality LUT / SUV pre-scaling) at a world position. Volume viewports only. */
  sampleValue(i: number, world: [number, number, number]): number {
    const s = this.slots.get(i);
    const vp = this.viewport(i);
    if (!vp || !s?.kind) throw new Error('No image in the active viewport');
    if (s.kind === 'stack') throw new Error('Sampling by world position needs an MPR/volume viewport');
    const v = (vp as Types.IVolumeViewport).getIntensityFromWorld(world);
    if (!Number.isFinite(v)) throw new Error('Position is outside the volume');
    return v;
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

  /** Flat, serialisable list of measurement annotations with their computed stats (mm, mm², HU…). */
  listAnnotations(): MeasurementSummary[] {
    const all = annotation.state.getAllAnnotations() as unknown as RawAnnotation[];
    return all
      .filter((a) => a?.metadata?.toolName && !/OrientationMarker|ScaleOverlay|ReferenceLines|Crosshairs|ContourSegmentation/.test(a.metadata.toolName))
      .map((a) => {
        const statsByTarget = a.data?.cachedStats ?? {};
        const first = Object.values(statsByTarget)[0] ?? {};
        const stats: Record<string, number | string> = {};
        for (const [k, v] of Object.entries(first)) {
          if (typeof v === 'number' && Number.isFinite(v)) stats[k] = Number(v.toFixed(3));
          else if (typeof v === 'string') stats[k] = v;
        }
        return {
          uid: a.annotationUID,
          tool: a.metadata.toolName,
          label: a.data?.label ?? '',
          frameOfReferenceUID: a.metadata.FrameOfReferenceUID,
          referencedImageId: a.metadata.referencedImageId,
          points: (a.data?.handles?.points ?? []).map((p) => p.map((v) => Number(v.toFixed(2)))),
          stats,
        };
      });
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
    tg.addTool(PlanarFreehandContourSegmentationTool.toolName);
    tg.setToolPassive(PlanarFreehandContourSegmentationTool.toolName);
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
    for (const h of this.objects.values()) destroyObject(h);
    this.objects.clear();
    removeAllObjects();
    this.volumeIds.clear();
    cache.purgeCache();
  }

  // ---------- derived objects (SEG / RTSTRUCT) ----------

  private objects = new Map<string, ObjectHandle>();

  /** Objects currently shown, by series id. */
  shownObjects(): ObjectHandle[] {
    return [...this.objects.values()];
  }

  isObjectShown(seriesId: string): boolean {
    return this.objects.has(seriesId);
  }

  /** Build (once) and attach a SEG/RTSTRUCT to every viewport that shows its referenced series. */
  async showObject(object: OpenSeries, study: OpenStudy): Promise<ObjectHandle> {
    let handle = this.objects.get(object.id);
    if (!handle) {
      const referenced = resolveReferencedSeries(object, study);
      if (!referenced) throw new Error(`${object.description}: no image series to overlay on`);
      if (object.derivedKind === 'SEG') handle = await createSegLabelmap(object, referenced);
      else if (object.derivedKind === 'RTSTRUCT') handle = createRtstructContours(object, referenced);
      else throw new Error(`${object.derivedKind ?? 'This'} objects cannot be displayed yet`);
      this.objects.set(object.id, handle);
    }
    for (const i of this.slots.keys()) this.reapplyObjects(i);
    return handle;
  }

  hideObject(seriesId: string): void {
    const handle = this.objects.get(seriesId);
    if (!handle) return;
    for (const s of this.slots.values()) if (s.kind) detachFromViewport(handle, s.viewportId);
    destroyObject(handle);
    this.objects.delete(seriesId);
    this.re?.render();
  }

  /** Attach every shown object whose referenced series is displayed in this slot. */
  private reapplyObjects(i: number): void {
    const s = this.slots.get(i);
    if (!s?.kind || s.kind === '3d') return;
    const vp = this.viewport(i);
    for (const h of this.objects.values()) {
      if (h.referencedSeriesId !== s.displaySetId) continue;
      if (h.kind === 'RTSTRUCT' && s.kind === 'volume' && vp && !normalsAligned(h.contourPlaneNormal, vp.getCamera().viewPlaneNormal as Types.Point3 | undefined)) {
        continue; // out-of-plane contour rendering needs PolySeg; skip rather than throw
      }
      try {
        attachToViewport(h, s.viewportId);
      } catch (e) {
        console.warn(`[objects] could not attach ${h.kind} to ${s.viewportId}:`, e);
      }
    }
    vp?.render();
  }

  // ---------- fusion ----------

  /** Overlay a second volume (typically PET) on a volume viewport with a colour map. */
  async fuse(i: number, overlay: OpenSeries, opts: { colormap?: string; opacity?: number } = {}): Promise<void> {
    const s = this.slots.get(i);
    const vp = this.viewport(i);
    if (!s?.kind || !vp) throw new Error('No image in that viewport');
    if (s.kind !== 'volume') throw new Error('Fusion needs an MPR (volume) viewport — switch to the MPR layout first');
    if (s.displaySetId === overlay.id) throw new Error('Pick a different series to fuse over the one shown');
    const vv = vp as Types.IVolumeViewport;
    if (s.fusion) {
      vv.removeVolumeActors([s.fusion.actorUID], true);
      s.fusion = undefined;
    }
    const volumeId = await this.ensureVolume(overlay);
    const actorUID = `fusion-${i}-${Date.now().toString(36)}`;
    // MIP blending: a thin MPR slab composited with the default ray-casting integrates opacity over ~0 mm,
    // so even opacity 0.99 barely tints. MIP applies the transfer function once per pixel.
    await vv.addVolumes([{ volumeId, actorUID, visibility: true, blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND }], true);
    vv.setBlendMode(Enums.BlendModes.MAXIMUM_INTENSITY_BLEND, [actorUID], false);
    s.fusion = { seriesId: overlay.id, volumeId, actorUID };
    // Streamed volumes bypass the image cache, so decide SUV from the metadata the loader scales with.
    const mid = overlay.imageIds[Math.floor(overlay.imageIds.length / 2)];
    const scaling = mid ? (metaData.get('scalingModule', mid) as { suvbw?: number } | undefined) : undefined;
    const suv = overlay.modality === 'PT' && Boolean(scaling?.suvbw);
    const voiRange = suv ? { lower: 0, upper: 8 } : this.rangeOfVolume(volumeId);
    // Opacity ramp: background transparent, hot spots opaque — a flat opacity just tints the anatomy.
    const lower = voiRange?.lower ?? 0;
    const upper = voiRange?.upper ?? 1;
    const peak = opts.opacity ?? 0.85;
    const span = upper - lower;
    const opacity = [
      { value: lower, opacity: 0 },
      { value: lower + 0.25 * span, opacity: 0 },
      { value: lower + 0.5 * span, opacity: 0.55 * peak },
      { value: upper, opacity: peak },
    ];
    vv.setProperties({ colormap: { name: opts.colormap ?? 'jet', opacity }, ...(voiRange ? { voiRange } : {}) }, volumeId);
    vv.render();
    this.emit(i);
  }

  unfuse(i: number): void {
    const s = this.slots.get(i);
    const vp = this.viewport(i);
    if (!s?.fusion || !vp || s.kind !== 'volume') return;
    (vp as Types.IVolumeViewport).removeVolumeActors([s.fusion.actorUID], true);
    s.fusion = undefined;
    vp.render();
    this.emit(i);
  }

  fusionOf(i: number): { seriesId: string } | undefined {
    return this.slots.get(i)?.fusion;
  }

  private rangeOfVolume(volumeId: string): { lower: number; upper: number } | undefined {
    let data: ArrayLike<number> | undefined;
    try {
      data = cache.getVolume(volumeId)?.voxelManager?.getScalarData?.() as ArrayLike<number> | undefined;
    } catch {
      return undefined; // still streaming; the header VOI applies until then
    }
    if (!data || data.length === 0) return undefined;
    let min = Infinity;
    let max = -Infinity;
    const step = Math.max(1, Math.floor(data.length / 1_000_000));
    for (let k = 0; k < data.length; k += step) {
      const v = data[k];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return undefined;
    // Ignore the lowest 30 % so background does not tint the anatomy.
    return { lower: min + 0.3 * (max - min), upper: max };
  }
}

export interface MeasurementSummary {
  uid: string;
  tool: string;
  label: string;
  frameOfReferenceUID?: string;
  referencedImageId?: string;
  points: number[][];
  stats: Record<string, number | string>;
}

interface RawAnnotation {
  annotationUID: string;
  metadata: { toolName: string; FrameOfReferenceUID?: string; referencedImageId?: string };
  data?: { label?: string; cachedStats?: Record<string, Record<string, unknown>>; handles?: { points?: number[][] } };
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
