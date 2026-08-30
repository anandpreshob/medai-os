import { wadors } from '@cornerstonejs/dicom-image-loader';
import { utilities as mdUtils } from '@cornerstonejs/metadata';
import { dicomWeb, num, str, type DicomJson } from '../../lib/dicomweb';
import type { OpenStudy } from '../../state/session';
import { buildDisplaySets } from '../displaySets';

/**
 * Load a whole study from the PACS: series list via QIDO, per-series DICOM JSON
 * metadata via WADO-RS, and one `wadors:` imageId per frame. Pixel data is
 * fetched lazily by the image loader when a viewport asks for it.
 */
export async function loadDicomWebStudy(studyInstanceUID: string, onProgress?: (message: string, fraction: number) => void): Promise<OpenStudy> {
  const seriesList = await dicomWeb.searchSeries(studyInstanceUID);
  if (seriesList.length === 0) throw new Error('Study has no series');
  const imageIds: string[] = [];
  let i = 0;
  for (const s of seriesList) {
    onProgress?.(`Reading series ${s.seriesNumber || ''} ${s.seriesDescription || s.modality}`.trim(), i / seriesList.length);
    let instances: DicomJson[] = [];
    try {
      instances = await dicomWeb.seriesMetadata(studyInstanceUID, s.seriesInstanceUID);
    } catch (e) {
      console.warn(`[dicomweb] metadata failed for series ${s.seriesInstanceUID}:`, e);
      continue;
    }
    const registrations: Promise<unknown>[] = [];
    for (const inst of instances) {
      const sop = str(inst['00080018']);
      if (!sop) continue;
      const frames = Math.max(1, num(inst['00280008'], 1));
      for (let f = 1; f <= frames; f++) {
        const imageId = dicomWeb.wadorsImageId(studyInstanceUID, s.seriesInstanceUID, sop, f);
        wadors.metaDataManager.add(imageId, inst as never);
        registrations.push(Promise.resolve(mdUtils.addDicomWebInstance(imageId, inst as never)).catch(() => undefined));
        imageIds.push(imageId);
      }
    }
    await Promise.all(registrations);
    i++;
  }
  if (imageIds.length === 0) throw new Error('Study has no retrievable instances');
  const study = buildDisplaySets(imageIds, { source: 'dicomweb', expandFrames: false });
  study.studyInstanceUID = studyInstanceUID;
  return study;
}
