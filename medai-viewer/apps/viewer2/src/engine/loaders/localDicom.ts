import { imageLoader, metaData } from '@cornerstonejs/core';
import { wadouri } from '@cornerstonejs/dicom-image-loader';
import { utilities as mdUtils } from '@cornerstonejs/metadata';
import type { OpenStudy } from '../../state/session';
import { buildDisplaySets } from '../displaySets';
import { NON_IMAGE_SOP_CLASSES } from '../metadata';

export interface LocalLoadResult {
  study: OpenStudy | null;
  imageIds: string[];
  skipped: { name: string; reason: string }[];
}

function byteLength(v: unknown): number {
  if (!v) return 0;
  if (v instanceof ArrayBuffer) return v.byteLength;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + byteLength(x), 0);
  return typeof v === 'string' ? v.length : 1;
}

function hasPixelData(nat: Record<string, unknown>): boolean {
  return byteLength(nat.PixelData) > 0 || byteLength(nat.FloatPixelData) > 0 || byteLength(nat.DoubleFloatPixelData) > 0;
}

/** SEG/RTSTRUCT/SR/… legitimately carry no PixelData; only image IODs must have it. */
function isNonImageObject(nat: Record<string, unknown>): boolean {
  const sop = String(nat.SOPClassUID ?? '');
  return sop in NON_IMAGE_SOP_CLASSES || !('Rows' in nat);
}

async function hasDicmMagic(file: File): Promise<boolean> {
  if (file.size < 132) return false;
  const head = new Uint8Array(await file.slice(128, 132).arrayBuffer());
  return head[0] === 0x44 && head[1] === 0x49 && head[2] === 0x43 && head[3] === 0x4d;
}

/**
 * Register local DICOM files with the image loader and parse their headers so
 * that grouping, sorting and volume building can read metadata immediately.
 * Non-DICOM files are reported in `skipped`, never thrown.
 */
export async function loadLocalDicomFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<LocalLoadResult> {
  const imageIds: string[] = [];
  const skipped: LocalLoadResult['skipped'] = [];
  let done = 0;
  for (const file of files) {
    done++;
    // Files without the preamble (old GE/raw exports) are accepted by extension; the parser decides.
    if (!(await hasDicmMagic(file)) && !/\.(dcm|dicom)$/i.test(file.name)) {
      skipped.push({ name: file.name, reason: 'not a DICOM file' });
      continue;
    }
    const imageId = wadouri.fileManager.add(file);
    try {
      const buffer = await file.arrayBuffer();
      await mdUtils.addDicomPart10Instance(imageId, buffer);
      const nat = metaData.get('naturalized', imageId) as Record<string, unknown> | undefined;
      if (!nat) {
        // Fallback: let the loader parse it (also decodes one frame).
        await imageLoader.loadAndCacheImage(imageId);
      } else if (!hasPixelData(nat) && !isNonImageObject(nat)) {
        throw new Error('no pixel data found');
      }
      imageIds.push(imageId);
    } catch (e) {
      wadouri.fileManager.remove(Number(imageId.split(':')[1]));
      skipped.push({ name: file.name, reason: e instanceof Error ? e.message : String(e) });
    }
    onProgress?.(done, files.length);
  }
  const study = imageIds.length ? buildDisplaySets(imageIds, { source: 'local-dicom', expandFrames: true }) : null;
  return { study, imageIds, skipped };
}
