/**
 * Minimal DICOMweb client: QIDO-RS search, WADO-RS metadata, and URL builders
 * for instance/frame retrieval. No vendor-specific (Orthanc-native) calls —
 * everything here works against any DICOMweb server.
 *
 * Base URL defaults to `/dicomweb`, which the Vite dev server proxies to
 * Orthanc's `/dicom-web` (see vite.config.ts). Deployments set it via
 * `VITE_DICOMWEB_URL`.
 */

export interface DicomWebConfig {
  baseUrl: string;
  headers?: Record<string, string>;
}

/** DICOM JSON attribute (PS3.18 F.2). */
export interface DicomJsonAttr {
  vr: string;
  Value?: unknown[];
  BulkDataURI?: string;
  InlineBinary?: string;
}
export type DicomJson = Record<string, DicomJsonAttr>;

export interface StudySummary {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  accessionNumber: string;
  modalities: string[];
  numberOfSeries: number;
  numberOfInstances: number;
}

export interface SeriesSummary {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  seriesNumber: number;
  seriesDescription: string;
  modality: string;
  numberOfInstances: number;
  bodyPartExamined: string;
}

export interface InstanceSummary {
  sopInstanceUID: string;
  sopClassUID: string;
  instanceNumber: number;
  numberOfFrames: number;
}

export interface StudyQuery {
  patientName?: string;
  patientID?: string;
  studyDate?: string; // YYYYMMDD or YYYYMMDD-YYYYMMDD
  modality?: string;
  accessionNumber?: string;
  studyDescription?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 200;

export function str(attr: DicomJsonAttr | undefined, fallback = ''): string {
  const v = attr?.Value?.[0];
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'object' && v !== null && 'Alphabetic' in (v as object)) {
    return String((v as { Alphabetic?: string }).Alphabetic ?? fallback);
  }
  return String(v);
}

export function num(attr: DicomJsonAttr | undefined, fallback = 0): number {
  const v = attr?.Value?.[0];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function strs(attr: DicomJsonAttr | undefined): string[] {
  return (attr?.Value ?? []).map(String).filter(Boolean);
}

export class DicomWebClient {
  readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: Partial<DicomWebConfig> = {}) {
    this.baseUrl = (config.baseUrl ?? '/dicomweb').replace(/\/$/, '');
    this.headers = config.headers ?? {};
  }

  // ---------- QIDO-RS ----------

  async searchStudies(q: StudyQuery = {}): Promise<StudySummary[]> {
    const p = new URLSearchParams();
    if (q.patientName) p.set('PatientName', `*${q.patientName}*`);
    if (q.patientID) p.set('PatientID', `*${q.patientID}*`);
    if (q.studyDate) p.set('StudyDate', q.studyDate);
    if (q.modality) p.set('ModalitiesInStudy', q.modality);
    if (q.accessionNumber) p.set('AccessionNumber', q.accessionNumber);
    if (q.studyDescription) p.set('StudyDescription', `*${q.studyDescription}*`);
    p.set('limit', String(q.limit ?? DEFAULT_LIMIT));
    if (q.offset) p.set('offset', String(q.offset));
    p.set('includefield', 'ModalitiesInStudy,NumberOfStudyRelatedSeries,NumberOfStudyRelatedInstances,StudyDescription,AccessionNumber');
    const rows = await this.getJson<DicomJson[]>(`/studies?${p}`);
    return rows.map((r) => ({
      studyInstanceUID: str(r['0020000D']),
      patientName: str(r['00100010'], 'Unknown'),
      patientID: str(r['00100020']),
      studyDate: str(r['00080020']),
      studyTime: str(r['00080030']),
      studyDescription: str(r['00081030']),
      accessionNumber: str(r['00080050']),
      modalities: strs(r['00080061']),
      numberOfSeries: num(r['00201206']),
      numberOfInstances: num(r['00201208']),
    }));
  }

  async searchSeries(studyInstanceUID: string): Promise<SeriesSummary[]> {
    const rows = await this.getJson<DicomJson[]>(
      `/studies/${enc(studyInstanceUID)}/series?includefield=SeriesDescription,BodyPartExamined,NumberOfSeriesRelatedInstances`,
    );
    return rows
      .map((r) => ({
        studyInstanceUID,
        seriesInstanceUID: str(r['0020000E']),
        seriesNumber: num(r['00200011']),
        seriesDescription: str(r['0008103E']),
        modality: str(r['00080060']),
        numberOfInstances: num(r['00201209']),
        bodyPartExamined: str(r['00180015']),
      }))
      .sort((a, b) => a.seriesNumber - b.seriesNumber);
  }

  async searchInstances(studyInstanceUID: string, seriesInstanceUID: string): Promise<InstanceSummary[]> {
    const rows = await this.getJson<DicomJson[]>(
      `/studies/${enc(studyInstanceUID)}/series/${enc(seriesInstanceUID)}/instances?includefield=NumberOfFrames,InstanceNumber`,
    );
    return rows.map((r) => ({
      sopInstanceUID: str(r['00080018']),
      sopClassUID: str(r['00080016']),
      instanceNumber: num(r['00200013']),
      numberOfFrames: num(r['00280008'], 1),
    }));
  }

  // ---------- WADO-RS ----------

  /** Full DICOM JSON metadata for every instance in a series (no bulk pixel data). */
  async seriesMetadata(studyInstanceUID: string, seriesInstanceUID: string): Promise<DicomJson[]> {
    return this.getJson<DicomJson[]>(`/studies/${enc(studyInstanceUID)}/series/${enc(seriesInstanceUID)}/metadata`);
  }

  instanceUrl(studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string): string {
    return `${this.baseUrl}/studies/${enc(studyInstanceUID)}/series/${enc(seriesInstanceUID)}/instances/${enc(sopInstanceUID)}`;
  }

  /** `wadors:` imageId for the Cornerstone DICOM image loader; frames are 1-based. */
  wadorsImageId(studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string, frame = 1): string {
    return `wadors:${this.absolute(this.instanceUrl(studyInstanceUID, seriesInstanceUID, sopInstanceUID))}/frames/${frame}`;
  }

  // ---------- STOW-RS ----------

  async storeInstances(files: File[] | ArrayBuffer[]): Promise<{ stored: number; failed: number }> {
    const boundary = `----medai${Math.random().toString(16).slice(2)}`;
    const parts: BlobPart[] = [];
    for (const f of files) {
      parts.push(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`);
      parts.push(f instanceof File ? f : new Blob([f]));
      parts.push('\r\n');
    }
    parts.push(`--${boundary}--\r\n`);
    const res = await fetch(`${this.baseUrl}/studies`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': `multipart/related; type="application/dicom"; boundary=${boundary}`, Accept: 'application/dicom+json' },
      body: new Blob(parts),
    });
    if (!res.ok && res.status !== 202) throw new Error(`STOW-RS failed: ${res.status} ${res.statusText}`);
    const json = (await res.json().catch(() => ({}))) as DicomJson;
    const stored = json['00081199']?.Value?.length ?? files.length;
    const failed = json['00081198']?.Value?.length ?? 0;
    return { stored, failed };
  }

  // ---------- helpers ----------

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/studies?limit=1`, { headers: { ...this.headers, Accept: 'application/dicom+json' } });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { ...this.headers, Accept: 'application/dicom+json' } });
    if (res.status === 204) return [] as unknown as T;
    if (!res.ok) throw new Error(`DICOMweb ${res.status} ${res.statusText} for ${path}`);
    return (await res.json()) as T;
  }

  private absolute(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    return typeof window !== 'undefined' ? new URL(url, window.location.origin).toString() : url;
  }
}

function enc(uid: string): string {
  return encodeURIComponent(uid);
}

export const dicomWeb = new DicomWebClient({ baseUrl: import.meta.env?.VITE_DICOMWEB_URL || '/dicomweb' });
