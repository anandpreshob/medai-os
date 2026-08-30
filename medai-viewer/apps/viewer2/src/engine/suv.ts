import { metaData } from '@cornerstonejs/core';
import { calculateSUVScalingFactors, type InstanceMetadata } from '@cornerstonejs/calculate-suv';

/**
 * SUV(bw) scaling factors for PET from the naturalized DICOM dataset.
 *
 * Cornerstone 5.8.2 ships a provider for this, but it reads a
 * `RadiopharmaceuticalInfo` key while dcmjs naturalizes the sequence as
 * `RadiopharmaceuticalInformationSequence`, so it never fires for local files.
 * This provider does the same computation from the keyword dcmjs actually emits.
 */

type Nat = Record<string, unknown>;
const cache = new Map<string, Record<string, number> | null>();

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return str(v[0]);
  if (typeof v === 'object') {
    // dcmjs may naturalize DA/TM as {year,month,day} / {hours,minutes,seconds,fractionalSeconds}
    const o = v as Record<string, unknown>;
    if ('year' in o) return `${o.year}${String(o.month).padStart(2, '0')}${String(o.day).padStart(2, '0')}`;
    if ('hours' in o) {
      return `${String(o.hours ?? 0).padStart(2, '0')}${String(o.minutes ?? 0).padStart(2, '0')}${String(o.seconds ?? 0).padStart(2, '0')}.${String(o.fractionalSeconds ?? '000000').padEnd(6, '0')}`;
    }
    return undefined;
  }
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function suvFactorsFromNaturalized(nat: Nat): Record<string, number> | null {
  if (nat.Modality !== 'PT') return null;
  const seq = nat.RadiopharmaceuticalInformationSequence ?? nat.RadiopharmaceuticalInfo;
  const ri = (Array.isArray(seq) ? seq[0] : seq) as Nat | undefined;
  if (!ri) return null;
  const corrected = nat.CorrectedImage;
  const inst: Partial<InstanceMetadata> = {
    CorrectedImage: (typeof corrected === 'string' ? corrected.split('\\') : Array.isArray(corrected) ? corrected.map(String) : undefined) as InstanceMetadata['CorrectedImage'],
    Units: str(nat.Units) as InstanceMetadata['Units'],
    DecayCorrection: str(nat.DecayCorrection) as InstanceMetadata['DecayCorrection'],
    RadionuclideTotalDose: num(ri.RadionuclideTotalDose),
    RadionuclideHalfLife: num(ri.RadionuclideHalfLife),
    RadiopharmaceuticalStartTime: str(ri.RadiopharmaceuticalStartTime),
    RadiopharmaceuticalStartDateTime: str(ri.RadiopharmaceuticalStartDateTime),
    PatientWeight: num(nat.PatientWeight),
    // Sex/size only feed SUVlbm/SUVbsa; calculate-suv rejects anything but M/F, so pass them only when usable.
    ...(str(nat.PatientSex) === 'M' || str(nat.PatientSex) === 'F' ? { PatientSex: str(nat.PatientSex) as InstanceMetadata['PatientSex'], PatientSize: num(nat.PatientSize) } : {}),
    SeriesDate: str(nat.SeriesDate),
    SeriesTime: str(nat.SeriesTime),
    AcquisitionDate: str(nat.AcquisitionDate),
    AcquisitionTime: str(nat.AcquisitionTime),
    FrameReferenceTime: num(nat.FrameReferenceTime),
    ActualFrameDuration: num(nat.ActualFrameDuration),
  };
  const required: (keyof InstanceMetadata)[] = ['CorrectedImage', 'Units', 'DecayCorrection', 'RadionuclideTotalDose', 'RadionuclideHalfLife', 'PatientWeight', 'SeriesDate', 'SeriesTime', 'AcquisitionDate', 'AcquisitionTime'];
  if (required.some((k) => inst[k] === undefined) || !inst.PatientWeight) return null;
  try {
    const [f] = calculateSUVScalingFactors([inst as InstanceMetadata]);
    return f ? (f as unknown as Record<string, number>) : null;
  } catch (e) {
    console.warn('[suv] cannot compute SUV factors:', e instanceof Error ? e.message : e);
    return null;
  }
}

let installed = false;
/** Register the scalingModule provider ahead of Cornerstone's own; call once before any PET image loads. */
export function installSuvProvider(): void {
  if (installed) return;
  installed = true;
  metaData.addProvider((type: string, imageId: string) => {
    if (type !== 'scalingModule') return undefined;
    if (cache.has(imageId)) return cache.get(imageId) ?? undefined;
    const nat = metaData.get('naturalized', imageId) as Nat | undefined;
    const factors = nat ? suvFactorsFromNaturalized(nat) : null;
    cache.set(imageId, factors);
    return factors ?? undefined;
  }, 10_000);
}
