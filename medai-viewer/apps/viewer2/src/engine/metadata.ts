import { metaData } from '@cornerstonejs/core';

/**
 * Thin, typed readers over Cornerstone's metadata providers. Every field is
 * optional because real-world DICOM omits things; callers decide fallbacks.
 */

export interface ImagePlane {
  frameOfReferenceUID?: string;
  rows?: number;
  columns?: number;
  imageOrientationPatient?: number[];
  imagePositionPatient?: number[];
  rowCosines?: number[];
  columnCosines?: number[];
  pixelSpacing?: number[];
  rowPixelSpacing?: number;
  columnPixelSpacing?: number;
  sliceThickness?: number;
  sliceLocation?: number;
}

export interface ImagePixel {
  samplesPerPixel?: number;
  photometricInterpretation?: string;
  rows?: number;
  columns?: number;
  bitsAllocated?: number;
  bitsStored?: number;
  pixelRepresentation?: number;
}

export interface SeriesInfo {
  modality?: string;
  seriesInstanceUID?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  studyInstanceUID?: string;
  seriesDate?: string;
  seriesTime?: string;
}

export interface StudyInfo {
  studyInstanceUID?: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  accessionNumber?: string;
}

export interface PatientInfo {
  patientName?: string;
  patientId?: string;
  patientBirthDate?: string;
  patientSex?: string;
}

export interface GeneralImageInfo {
  instanceNumber?: number;
  sopInstanceUID?: string;
}

export interface VoiLut {
  windowCenter?: number | number[];
  windowWidth?: number | number[];
  voiLUTFunction?: string;
}

const get = <T>(type: string, imageId: string): T | undefined => (metaData.get(type, imageId) as T | undefined) ?? undefined;

export const md = {
  plane: (id: string) => get<ImagePlane>('imagePlaneModule', id),
  pixel: (id: string) => get<ImagePixel>('imagePixelModule', id),
  series: (id: string) => get<SeriesInfo>('generalSeriesModule', id),
  study: (id: string) => get<StudyInfo>('generalStudyModule', id),
  patient: (id: string) => get<PatientInfo>('patientModule', id),
  image: (id: string) => get<GeneralImageInfo>('generalImageModule', id),
  sop: (id: string) => get<{ sopClassUID?: string; sopInstanceUID?: string }>('sopCommonModule', id),
  voi: (id: string) => get<VoiLut>('voiLutModule', id),
  multiframe: (id: string) => get<{ NumberOfFrames?: number; numberOfFrames?: number }>('multiframeModule', id),
  cine: (id: string) => get<{ frameTime?: number; FrameTime?: number }>('cineModule', id),
  transferSyntax: (id: string) => get<{ transferSyntaxUID?: string }>('transferSyntax', id)?.transferSyntaxUID,
  /** Raw naturalized dataset (5.x path): DICOM keywords as keys. */
  naturalized: (id: string) => get<Record<string, unknown>>('naturalized', id),
};

/** First window center/width from the header, or undefined when absent/zero. */
export function headerWindow(imageId: string): { center: number; width: number } | undefined {
  const v = md.voi(imageId);
  if (!v) return undefined;
  const c = Array.isArray(v.windowCenter) ? v.windowCenter[0] : v.windowCenter;
  const w = Array.isArray(v.windowWidth) ? v.windowWidth[0] : v.windowWidth;
  if (typeof c !== 'number' || typeof w !== 'number' || !Number.isFinite(c) || !Number.isFinite(w) || w <= 0) return undefined;
  return { center: c, width: w };
}

export function frameCount(imageId: string): number {
  const m = md.multiframe(imageId);
  const n = Number(m?.NumberOfFrames ?? m?.numberOfFrames ?? md.naturalized(imageId)?.NumberOfFrames ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** SOP classes that carry no displayable pixel data (or none we display in Tier 1). */
export const NON_IMAGE_SOP_CLASSES: Record<string, string> = {
  '1.2.840.10008.5.1.4.1.1.66.4': 'SEG',
  '1.2.840.10008.5.1.4.1.1.481.3': 'RTSTRUCT',
  '1.2.840.10008.5.1.4.1.1.481.2': 'RTDOSE',
  '1.2.840.10008.5.1.4.1.1.481.5': 'RTPLAN',
  '1.2.840.10008.5.1.4.1.1.88.11': 'SR',
  '1.2.840.10008.5.1.4.1.1.88.22': 'SR',
  '1.2.840.10008.5.1.4.1.1.88.33': 'SR',
  '1.2.840.10008.5.1.4.1.1.88.34': 'SR',
  '1.2.840.10008.5.1.4.1.1.88.67': 'SR',
  '1.2.840.10008.5.1.4.1.1.104.1': 'PDF',
  '1.2.840.10008.5.1.4.1.1.9.1.1': 'ECG',
  '1.2.840.10008.5.1.4.1.1.9.1.2': 'ECG',
  '1.2.840.10008.5.1.4.1.1.9.1.3': 'ECG',
  '1.2.840.10008.5.1.4.1.1.11.1': 'PR',
  '1.2.840.10008.5.1.4.1.1.66': 'RAW',
  '1.2.840.10008.5.1.4.1.1.66.1': 'REG',
  '1.2.840.10008.5.1.4.1.1.66.2': 'FIDUCIAL',
  '1.2.840.10008.5.1.4.1.1.66.3': 'REG',
  '1.2.840.10008.5.1.4.1.1.66.5': 'SURFACE',
  '1.2.840.10008.5.1.4.1.1.77.1.6': 'WSI',
};

export function derivedKind(imageId: string): string | undefined {
  const sop = md.sop(imageId)?.sopClassUID ?? (md.naturalized(imageId)?.SOPClassUID as string | undefined);
  return sop ? NON_IMAGE_SOP_CLASSES[sop] : undefined;
}
