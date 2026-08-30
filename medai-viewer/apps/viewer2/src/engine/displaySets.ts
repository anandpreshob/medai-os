import type { OpenSeries, OpenStudy } from '../state/session';
import { derivedKind, frameCount, md } from './metadata';

/**
 * Group loaded imageIds into display sets (one per DICOM series), sort slices
 * geometrically, and classify each set: volumetric stack, 2D/cine, or a
 * non-image object (SEG, RTSTRUCT, SR, …) that is listed but not displayed.
 */

const CINE_MODALITIES = new Set(['XA', 'RF', 'US', 'ES', 'OP']);
const ORIENTATION_TOL = 1e-3;
/** Slice spacing may vary by this fraction before we refuse to build a volume. */
const SPACING_TOL = 0.05;

export interface BuildOptions {
  source: OpenSeries['source'];
  /** For local wadouri ids, expand a multi-frame base id into per-frame ids (1-based `?frame=N`). */
  expandFrames?: boolean;
}

export function buildDisplaySets(imageIds: string[], opts: BuildOptions): OpenStudy {
  const bySeries = new Map<string, string[]>();
  for (const id of imageIds) {
    const uid = md.series(id)?.seriesInstanceUID ?? `no-series:${id}`;
    (bySeries.get(uid) ?? bySeries.set(uid, []).get(uid)!).push(id);
  }

  const series: OpenSeries[] = [];
  for (const [uid, ids] of bySeries) {
    const first = ids[0];
    const s = md.series(first) ?? {};
    const kind = derivedKind(first);
    const modality = s.modality ?? 'OT';

    if (kind) {
      series.push({
        id: `${opts.source}:${uid}`,
        source: opts.source,
        studyInstanceUID: s.studyInstanceUID,
        seriesInstanceUID: uid,
        modality,
        description: `${s.seriesDescription || kind} (${kind})`,
        imageIds: ids,
        isVolumetric: false,
        isCine: false,
        frameCount: 0,
        isDerived: true,
        sopClassUID: md.sop(first)?.sopClassUID,
        seriesNumber: s.seriesNumber ?? 0,
        derivedKind: kind,
      });
      continue;
    }

    // Expand multi-frame instances into per-frame imageIds.
    let frames: string[] = [];
    let multiFrameInstances = 0;
    for (const id of ids) {
      const n = frameCount(id);
      if (n > 1 && opts.expandFrames) {
        multiFrameInstances++;
        for (let f = 1; f <= n; f++) frames.push(`${id}?frame=${f}`);
      } else {
        frames.push(id);
      }
    }
    frames = sortSlices(frames);

    const geometry = analyzeGeometry(frames);
    const isCine =
      (multiFrameInstances === 1 && ids.length === 1) &&
      (CINE_MODALITIES.has(modality) || md.cine(first)?.frameTime !== undefined || !geometry.consistentOrientation || geometry.maxSpacing === 0);

    series.push({
      id: `${opts.source}:${uid}`,
      source: opts.source,
      studyInstanceUID: s.studyInstanceUID,
      seriesInstanceUID: uid,
      modality,
      description: s.seriesDescription || `Series ${s.seriesNumber ?? ''}`.trim(),
      imageIds: frames,
      isVolumetric: !isCine && geometry.volumetric,
      isCine,
      frameCount: frames.length,
      isDerived: false,
      sopClassUID: md.sop(first)?.sopClassUID,
      seriesNumber: s.seriesNumber ?? 0,
      geometryNote: geometry.note,
    });
  }

  series.sort((a, b) => (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0) || a.description.localeCompare(b.description));

  const ref = imageIds[0];
  const st = md.study(ref) ?? {};
  const pt = md.patient(ref) ?? {};
  const nat = md.naturalized(ref) ?? {};
  return {
    studyInstanceUID: st.studyInstanceUID ?? md.series(ref)?.studyInstanceUID ?? (nat.StudyInstanceUID as string | undefined) ?? 'local',
    patientName: personName(pt.patientName ?? nat.PatientName),
    patientID: pt.patientId ?? (nat.PatientID as string | undefined) ?? '',
    studyDate: st.studyDate ?? (nat.StudyDate as string | undefined) ?? '',
    studyDescription: st.studyDescription ?? (nat.StudyDescription as string | undefined) ?? '',
    series,
  };
}

/** DICOM PN arrives either as a string or naturalized `{ Alphabetic }`. */
export function personName(v: unknown): string {
  if (!v) return 'Unknown';
  if (typeof v === 'object') {
    const o = v as { Alphabetic?: string };
    return personName(o.Alphabetic ?? '');
  }
  return String(v).replace(/\^+/g, ' ').trim() || 'Unknown';
}

/** Sort by position along the slice normal; fall back to InstanceNumber, then original order. */
export function sortSlices(imageIds: string[]): string[] {
  const planes = imageIds.map((id) => ({ id, plane: md.plane(id), inst: md.image(id)?.instanceNumber ?? Number.NaN }));
  const first = planes.find((p) => p.plane?.imageOrientationPatient?.length === 6 && p.plane.imagePositionPatient?.length === 3);
  if (first && planes.every((p) => p.plane?.imagePositionPatient?.length === 3)) {
    const [rx, ry, rz, cx, cy, cz] = first.plane!.imageOrientationPatient!;
    const n = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
    const key = (p: number[]) => p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
    return planes
      .map((p) => ({ id: p.id, k: key(p.plane!.imagePositionPatient!), inst: p.inst }))
      .sort((a, b) => a.k - b.k || a.inst - b.inst)
      .map((p) => p.id);
  }
  if (planes.every((p) => Number.isFinite(p.inst))) {
    return [...planes].sort((a, b) => a.inst - b.inst).map((p) => p.id);
  }
  return imageIds;
}

export interface Geometry {
  volumetric: boolean;
  consistentOrientation: boolean;
  maxSpacing: number;
  minSpacing: number;
  note?: string;
}

/** Decide whether a sorted stack can be a volume: ≥ 3 slices, one orientation, regular spacing. */
export function analyzeGeometry(sorted: string[]): Geometry {
  if (sorted.length < 3) return { volumetric: false, consistentOrientation: true, maxSpacing: 0, minSpacing: 0, note: sorted.length === 1 ? undefined : 'fewer than 3 slices' };
  const planes = sorted.map((id) => md.plane(id));
  if (planes.some((p) => !p?.imageOrientationPatient || !p.imagePositionPatient)) {
    return { volumetric: false, consistentOrientation: false, maxSpacing: 0, minSpacing: 0, note: 'missing image position/orientation' };
  }
  const iop0 = planes[0]!.imageOrientationPatient!;
  const consistentOrientation = planes.every((p) => p!.imageOrientationPatient!.every((v, i) => Math.abs(v - iop0[i]) < ORIENTATION_TOL));
  if (!consistentOrientation) return { volumetric: false, consistentOrientation, maxSpacing: 0, minSpacing: 0, note: 'slices have different orientations' };
  const [rx, ry, rz, cx, cy, cz] = iop0;
  const n = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
  const pos = planes.map((p) => p!.imagePositionPatient!.reduce((acc, v, i) => acc + v * n[i], 0));
  let min = Infinity;
  let max = 0;
  for (let i = 1; i < pos.length; i++) {
    const d = Math.abs(pos[i] - pos[i - 1]);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  if (max === 0) return { volumetric: false, consistentOrientation, maxSpacing: 0, minSpacing: 0, note: 'all slices at the same position' };
  const regular = (max - min) / max <= SPACING_TOL;
  return {
    volumetric: regular,
    consistentOrientation,
    maxSpacing: max,
    minSpacing: min,
    note: regular ? undefined : `irregular slice spacing (${min.toFixed(2)}–${max.toFixed(2)} mm); shown as a stack`,
  };
}
