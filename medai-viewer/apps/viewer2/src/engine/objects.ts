import { cache, geometryLoader, metaData, utilities, Enums, type Types } from '@cornerstonejs/core';
import { segmentation, Enums as ToolEnums, type Types as ToolTypes } from '@cornerstonejs/tools';
import { adaptersSEG } from '@cornerstonejs/adapters';
import type { OpenSeries, OpenStudy } from '../state/session';

/**
 * Derived DICOM objects (SEG labelmaps, RTSTRUCT contours) turned into
 * Cornerstone segmentations that can be attached to viewports showing the
 * referenced image series. No dcmjs here: the naturalized dataset that the
 * metadata package already holds for the object's imageId is enough.
 */

export interface ObjectSegment {
  index: number;
  label: string;
  color?: [number, number, number];
}

export interface ObjectHandle {
  seriesId: string;
  kind: 'SEG' | 'RTSTRUCT';
  segmentationId: string;
  referencedSeriesId: string;
  segments: ObjectSegment[];
  labelmapImageIds?: string[];
  geometryIds?: string[];
  /** Plane the contours were drawn in (RTSTRUCT); labelmaps work in any plane. */
  contourPlaneNormal?: Types.Point3;
}

type Nat = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : utilities.asArray(v as T | T[]));

/** Series a derived object refers to: by ReferencedSeriesSequence, then by FrameOfReference, then any volumetric image series. */
export function resolveReferencedSeries(object: OpenSeries, study: OpenStudy): OpenSeries | undefined {
  const nat = metaData.get('naturalized', object.imageIds[0]) as Nat | undefined;
  const candidates = study.series.filter((s) => !s.isDerived && s.imageIds.length > 0);
  const uids = new Set<string>();
  for (const rs of asArray(nat?.ReferencedSeriesSequence as Nat | Nat[] | undefined)) if (rs.SeriesInstanceUID) uids.add(String(rs.SeriesInstanceUID));
  for (const fr of asArray(nat?.ReferencedFrameOfReferenceSequence as Nat | Nat[] | undefined)) {
    for (const st of asArray(fr.RTReferencedStudySequence as Nat | Nat[] | undefined)) {
      for (const se of asArray(st.RTReferencedSeriesSequence as Nat | Nat[] | undefined)) if (se.SeriesInstanceUID) uids.add(String(se.SeriesInstanceUID));
    }
  }
  const byUid = candidates.find((s) => s.seriesInstanceUID && uids.has(s.seriesInstanceUID));
  if (byUid) return byUid;
  const forUid =
    (nat?.FrameOfReferenceUID as string | undefined) ??
    (asArray(nat?.ReferencedFrameOfReferenceSequence as Nat | Nat[] | undefined)[0]?.FrameOfReferenceUID as string | undefined);
  if (forUid) {
    const byFor = candidates.find((s) => (metaData.get('imagePlaneModule', s.imageIds[0]) as { frameOfReferenceUID?: string } | undefined)?.frameOfReferenceUID === forUid);
    if (byFor) return byFor;
  }
  return candidates.find((s) => s.isVolumetric) ?? candidates[0];
}

interface SegSegmentMeta {
  SegmentNumber?: number;
  SegmentLabel?: string;
  RecommendedDisplayCIELabValue?: number[];
}

export async function createSegLabelmap(object: OpenSeries, referenced: OpenSeries): Promise<ObjectHandle> {
  const segmentationId = `seg:${object.id}`;
  const result = (await adaptersSEG.Cornerstone3D.Segmentation.createFromDicomSegImageId(referenced.imageIds, object.imageIds[0], {
    metadataProvider: metaData,
    tolerance: 1e-2,
  })) as {
    labelMapImages: Types.IImage[][];
    segMetadata: { data: (SegSegmentMeta | undefined)[] };
    overlappingSegments?: boolean;
  };
  const groups = result.labelMapImages ?? [];
  if (!groups.length || !groups[0]?.length) throw new Error('SEG has no frames that map onto the displayed series');
  const imageIds = groups[0].map((img) => img.imageId);
  const segments: ObjectSegment[] = [];
  const config: Record<number, Partial<ToolTypes.Segment>> = {};
  result.segMetadata.data.forEach((seg, index) => {
    if (!seg || index === 0) return;
    const n = seg.SegmentNumber ?? index;
    const label = seg.SegmentLabel ?? `Segment ${n}`;
    const color = cielabToRgb(seg.RecommendedDisplayCIELabValue);
    segments.push({ index: n, label, color });
    config[n] = { label };
  });
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: ToolEnums.SegmentationRepresentations.Labelmap,
        data: { imageIds, referencedImageIds: referenced.imageIds } satisfies ToolTypes.LabelmapSegmentationData,
      },
      config: { segments: config, label: object.description },
    } satisfies ToolTypes.SegmentationPublicInput,
  ]);
  return { seriesId: object.id, kind: 'SEG', segmentationId, referencedSeriesId: referenced.id, segments, labelmapImageIds: imageIds };
}

interface RtContour {
  ContourGeometricType?: string;
  ContourData?: (number | string)[] | number | string;
}
interface RtRoiContour {
  ReferencedROINumber?: number | string;
  ROIDisplayColor?: (number | string)[] | number | string;
  ContourSequence?: RtContour | RtContour[];
}
interface RtRoi {
  ROINumber?: number | string;
  ROIName?: string;
  ReferencedFrameOfReferenceUID?: string;
}

export function createRtstructContours(object: OpenSeries, referenced: OpenSeries): ObjectHandle {
  const ds = metaData.get('naturalized', object.imageIds[0]) as
    | { ROIContourSequence?: RtRoiContour | RtRoiContour[]; StructureSetROISequence?: RtRoi | RtRoi[]; ReferencedFrameOfReferenceSequence?: Nat | Nat[] }
    | undefined;
  if (!ds) throw new Error('RTSTRUCT dataset is not available');
  const segmentationId = `rt:${object.id}`;
  const rois = asArray(ds.StructureSetROISequence);
  const roiContours = asArray(ds.ROIContourSequence);
  const forUid =
    (asArray(ds.ReferencedFrameOfReferenceSequence)[0]?.FrameOfReferenceUID as string | undefined) ??
    rois[0]?.ReferencedFrameOfReferenceUID ??
    (metaData.get('imagePlaneModule', referenced.imageIds[0]) as { frameOfReferenceUID?: string } | undefined)?.frameOfReferenceUID ??
    '';
  const geometryIds: string[] = [];
  const segments: ObjectSegment[] = [];
  const config: Record<number, Partial<ToolTypes.Segment>> = {};
  let planeNormal: Types.Point3 | undefined;

  roiContours.forEach((rc, i) => {
    const roiNumber = Number(rc.ReferencedROINumber ?? i + 1);
    const roi = rois.find((r) => Number(r.ROINumber) === roiNumber);
    const rgb = asArray(rc.ROIDisplayColor as (number | string)[] | number | string | undefined).map(Number);
    const color: Types.Point3 = [rgb[0] ?? 255, rgb[1] ?? 0, rgb[2] ?? 0];
    const segmentIndex = i + 1;
    const data: Types.ContourData[] = asArray(rc.ContourSequence)
      .filter((c) => (c.ContourGeometricType ?? 'CLOSED_PLANAR') !== 'POINT')
      .map((c) => {
        const flat = asArray(c.ContourData as (number | string)[] | number | string | undefined).map(Number);
        const points: Types.Point3[] = [];
        for (let k = 0; k + 2 < flat.length; k += 3) points.push([flat[k], flat[k + 1], flat[k + 2]]);
        return { points, type: c.ContourGeometricType === 'OPEN_PLANAR' ? Enums.ContourType.OPEN_PLANAR : Enums.ContourType.CLOSED_PLANAR, color, segmentIndex };
      })
      .filter((c) => c.points.length >= 3);
    if (!data.length) return;
    planeNormal ??= contourNormal(data[0].points);
    const geometryId = `${segmentationId}:roi:${roiNumber}`;
    if (!cache.getGeometry(geometryId)) {
      geometryLoader.createAndCacheGeometry(geometryId, {
        type: Enums.GeometryType.CONTOUR,
        geometryData: { id: geometryId, data, frameOfReferenceUID: forUid, color, segmentIndex } satisfies Types.PublicContourSetData,
        segmentIndex,
      });
    }
    geometryIds.push(geometryId);
    const label = roi?.ROIName ?? `ROI ${roiNumber}`;
    segments.push({ index: segmentIndex, label, color: [color[0], color[1], color[2]] });
    config[segmentIndex] = { label };
  });
  if (!geometryIds.length) throw new Error('RTSTRUCT has no planar contours');
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: { type: ToolEnums.SegmentationRepresentations.Contour, data: { geometryIds } satisfies ToolTypes.ContourSegmentationData },
      config: { segments: config, label: object.description },
    },
  ]);
  return { seriesId: object.id, kind: 'RTSTRUCT', segmentationId, referencedSeriesId: referenced.id, segments, geometryIds, contourPlaneNormal: planeNormal };
}

export function attachToViewport(handle: ObjectHandle, viewportId: string): void {
  if (handle.kind === 'SEG') {
    segmentation.addLabelmapRepresentationToViewport(viewportId, [{ segmentationId: handle.segmentationId }]);
    segmentation.config.style.setStyle(
      { viewportId, segmentationId: handle.segmentationId, type: ToolEnums.SegmentationRepresentations.Labelmap },
      { fillAlpha: 0.45, renderOutline: true, outlineWidth: 2 } satisfies ToolTypes.LabelmapStyle,
    );
    for (const s of handle.segments) {
      if (s.color) segmentation.config.color.setSegmentIndexColor(viewportId, handle.segmentationId, s.index, [s.color[0], s.color[1], s.color[2], 255] as Types.Color);
    }
  } else {
    segmentation.addContourRepresentationToViewport(viewportId, [{ segmentationId: handle.segmentationId }]);
    segmentation.config.style.setStyle(
      { viewportId, segmentationId: handle.segmentationId, type: ToolEnums.SegmentationRepresentations.Contour },
      { outlineWidth: 2, fillAlpha: 0, renderFill: false } satisfies ToolTypes.ContourStyle,
    );
  }
}

export function detachFromViewport(handle: ObjectHandle, viewportId: string): void {
  try {
    if (handle.kind === 'SEG') segmentation.removeLabelmapRepresentation(viewportId, handle.segmentationId, true);
    else segmentation.removeContourRepresentation(viewportId, handle.segmentationId, true);
  } catch {
    /* representation was not on this viewport */
  }
}

export function destroyObject(handle: ObjectHandle): void {
  try {
    segmentation.removeSegmentation(handle.segmentationId);
  } catch {
    /* already gone */
  }
  handle.labelmapImageIds?.forEach((id) => cache.removeImageLoadObject(id, { force: true }));
  handle.geometryIds?.forEach((g) => cache.removeGeometryLoadObject(g));
}

export function removeAllObjects(): void {
  segmentation.removeAllSegmentations();
}

function contourNormal(points: Types.Point3[]): Types.Point3 | undefined {
  if (points.length < 3) return undefined;
  const [a, b, c] = [points[0], points[Math.floor(points.length / 3)], points[Math.floor((2 * points.length) / 3)]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Types.Point3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n);
  return len > 0 ? ([n[0] / len, n[1] / len, n[2] / len] as Types.Point3) : undefined;
}

/** Contours only render in-plane without PolySeg: compare the viewport normal with the contour plane. */
export function normalsAligned(a: Types.Point3 | undefined, b: Types.Point3 | undefined, tol = 0.05): boolean {
  if (!a || !b) return true;
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  return dot > 1 - tol;
}

/** DICOM RecommendedDisplayCIELabValue (0–65535 scaled L*a*b*) → 8-bit sRGB. */
export function cielabToRgb(v?: number[]): [number, number, number] | undefined {
  if (!v || v.length < 3) return undefined;
  const L = (v[0] / 65535) * 100;
  const a = (v[1] / 65535) * 255 - 128;
  const b = (v[2] / 65535) * 255 - 128;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const finv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * finv(fx);
  const Y = 1.0 * finv(fy);
  const Z = 1.08883 * finv(fz);
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  const gamma = (c: number) => {
    const x = Math.max(0, Math.min(1, c));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  };
  return [gamma(lin[0]), gamma(lin[1]), gamma(lin[2])];
}
