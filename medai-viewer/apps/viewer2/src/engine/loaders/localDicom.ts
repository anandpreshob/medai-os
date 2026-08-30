import { imageLoader, metaData } from '@cornerstonejs/core';
import { wadouri } from '@cornerstonejs/dicom-image-loader';
import { utilities as mdUtils } from '@cornerstonejs/metadata';
import type { OpenStudy } from '../../state/session';
import { buildDisplaySets } from '../displaySets';

export interface LocalLoadResult {
  study: OpenStudy | null;
  imageIds: string[];
  skipped: { name: string; reason: string }[];
}

async function isDicom(file: File): Promise<boolean> {
  if (file.size < 132) return false;
  const head = new Uint8Array(await file.slice(128, 132).arrayBuffer());
  if (head[0] === 0x44 && head[1] === 0x49 && head[2] === 0x43 && head[3] === 0x4d) return true;
  // Some files (e.g. pydicom's no_meta.dcm) lack the preamble; accept by extension and let the parser decide.
  return /\.(dcm|dicom)$/i.test(file.name);
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
    if (!(await isDicom(file))) {
      skipped.push({ name: file.name, reason: 'not a DICOM file' });
      continue;
    }
    const imageId = wadouri.fileManager.add(file);
    try {
      const buffer = await file.arrayBuffer();
      await mdUtils.addDicomPart10Instance(imageId, buffer);
      if (!metaData.get('naturalized', imageId)) {
        // Fallback: let the loader parse it (also decodes one frame).
        await imageLoader.loadAndCacheImage(imageId);
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
