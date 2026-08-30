/**
 * Window/level presets by modality. Values are in modality units after the
 * modality LUT (HU for CT). The viewer applies the DICOM header VOI first and
 * offers these as explicit choices; they never override the header silently.
 */

export interface WindowPreset {
  id: string;
  name: string;
  /** Window width */
  width: number;
  /** Window center */
  center: number;
  /** Keyboard digit, if any */
  key?: string;
}

export const CT_PRESETS: WindowPreset[] = [
  { id: 'ct-soft-tissue', name: 'Soft tissue', width: 400, center: 40, key: '1' },
  { id: 'ct-lung', name: 'Lung', width: 1500, center: -600, key: '2' },
  { id: 'ct-bone', name: 'Bone', width: 1800, center: 400, key: '3' },
  { id: 'ct-brain', name: 'Brain', width: 80, center: 40, key: '4' },
  { id: 'ct-liver', name: 'Liver', width: 150, center: 30, key: '5' },
  { id: 'ct-angio', name: 'Angio', width: 600, center: 300, key: '6' },
  { id: 'ct-stroke', name: 'Stroke', width: 40, center: 40, key: '7' },
  { id: 'ct-subdural', name: 'Subdural', width: 200, center: 75, key: '8' },
];

/** MR has no absolute scale; these are relative to the image's own range and resolved at apply time. */
export const MR_PRESETS: WindowPreset[] = [
  { id: 'mr-full', name: 'Full range', width: 1, center: 0.5, key: '1' },
  { id: 'mr-tight', name: 'Tight (1–99 %)', width: 0.98, center: 0.5, key: '2' },
  { id: 'mr-bright', name: 'Brighten', width: 0.6, center: 0.35, key: '3' },
];

export const XRAY_PRESETS: WindowPreset[] = [
  { id: 'xr-full', name: 'Full range', width: 1, center: 0.5, key: '1' },
  { id: 'xr-lung', name: 'Lung', width: 0.7, center: 0.4, key: '2' },
  { id: 'xr-bone', name: 'Bone', width: 0.5, center: 0.6, key: '3' },
];

export const PET_PRESETS: WindowPreset[] = [
  { id: 'pt-suv-0-10', name: 'SUV 0–10', width: 10, center: 5, key: '1' },
  { id: 'pt-suv-0-5', name: 'SUV 0–5', width: 5, center: 2.5, key: '2' },
  { id: 'pt-suv-0-20', name: 'SUV 0–20', width: 20, center: 10, key: '3' },
];

export function presetsForModality(modality: string): { presets: WindowPreset[]; relative: boolean } {
  switch (modality.toUpperCase()) {
    case 'CT':
      return { presets: CT_PRESETS, relative: false };
    case 'PT':
      return { presets: PET_PRESETS, relative: false };
    case 'MR':
      return { presets: MR_PRESETS, relative: true };
    case 'CR':
    case 'DX':
    case 'MG':
    case 'XA':
    case 'RF':
      return { presets: XRAY_PRESETS, relative: true };
    default:
      return { presets: MR_PRESETS, relative: true };
  }
}

/** Resolve a relative preset (fractions of the pixel range) to absolute width/center. */
export function resolvePreset(preset: WindowPreset, relative: boolean, range: { min: number; max: number }): { width: number; center: number } {
  if (!relative) return { width: preset.width, center: preset.center };
  const span = Math.max(1, range.max - range.min);
  return { width: preset.width * span, center: range.min + preset.center * span };
}
