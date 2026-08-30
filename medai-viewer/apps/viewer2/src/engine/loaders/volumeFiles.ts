import { volumeLoader, type Types } from '@cornerstonejs/core';
import { createNiftiImageIdsAndCacheMetadata } from '@cornerstonejs/nifti-volume-loader';
import type { OpenSeries } from '../../state/session';

/**
 * Non-DICOM volumes: NIfTI through Cornerstone's loader, NRRD / MetaImage / TIFF
 * through itk-wasm into a local volume. Everything stays in the browser.
 */

export const VOLUME_FILE_RE = /\.(nii|nii\.gz|nrrd|nhdr|mha|mhd|tif|tiff)$/i;

export function isVolumeFile(name: string): boolean {
  return VOLUME_FILE_RE.test(name);
}

let counter = 0;

export async function loadVolumeFile(file: File, siblings: File[] = []): Promise<OpenSeries> {
  const name = file.name;
  if (/\.nii(\.gz)?$/i.test(name)) return loadNifti(file);
  return loadWithItk(file, siblings);
}

async function loadNifti(file: File): Promise<OpenSeries> {
  let blob: Blob = file;
  if (/\.gz$/i.test(file.name)) {
    // The NIfTI loader sniffs `.gz` from the URL path; object URLs have none, so decompress here.
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress .nii.gz files');
    blob = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  }
  const url = URL.createObjectURL(blob);
  const imageIds = await createNiftiImageIdsAndCacheMetadata({ url });
  const id = `local-volume:nifti-${counter++}`;
  return {
    id,
    source: 'local-volume',
    modality: 'MR',
    description: file.name,
    imageIds,
    volumeId: `cornerstoneStreamingImageVolume:${url}`,
    isVolumetric: imageIds.length >= 3,
    isCine: false,
    frameCount: imageIds.length,
    isDerived: false,
    fileName: file.name,
  };
}

interface ItkImage {
  imageType: { dimension: number; componentType: string; pixelType: string; components: number };
  origin: number[];
  spacing: number[];
  direction: Float64Array | number[];
  size: number[];
  data: ArrayLike<number> | null;
}

async function loadWithItk(file: File, siblings: File[]): Promise<OpenSeries> {
  const { readImage } = await import('@itk-wasm/image-io');
  // MetaImage headers reference a separate .raw file; itk-wasm needs it alongside.
  let input: File | { data: Uint8Array; path: string } = file;
  if (/\.mhd$/i.test(file.name)) {
    const header = await file.text();
    const rawName = /ElementDataFile\s*=\s*(\S+)/i.exec(header)?.[1];
    const raw = rawName ? siblings.find((f) => f.name === rawName) : undefined;
    if (rawName && rawName.toUpperCase() !== 'LOCAL' && !raw) {
      throw new Error(`${file.name} references ${rawName}; open both files together`);
    }
    input = { data: new Uint8Array(await file.arrayBuffer()), path: file.name };
    // itk-wasm accepts extra binary files through the `mountDirectories`-less path only for single inputs,
    // so we inline the raw data into a single MHA by rewriting the header when the sidecar is present.
    if (raw) {
      const hdr = header.replace(/ElementDataFile\s*=\s*\S+/i, 'ElementDataFile = LOCAL');
      const merged = new Blob([hdr, await raw.arrayBuffer()]);
      input = { data: new Uint8Array(await merged.arrayBuffer()), path: file.name.replace(/\.mhd$/i, '.mha') };
    }
  }
  const result = (await readImage(input as never)) as { image: ItkImage; webWorker?: { terminate: () => void } };
  result.webWorker?.terminate();
  const img = result.image;
  if (!img.data) throw new Error(`${file.name}: no pixel data`);
  if (img.imageType.components !== 1) {
    throw new Error(`${file.name}: ${img.imageType.components}-component images (e.g. DTI, RGB) are not supported as volumes`);
  }
  const dims: Types.Point3 = [img.size[0] ?? 1, img.size[1] ?? 1, img.size[2] ?? 1];
  const spacing: Types.Point3 = [img.spacing[0] ?? 1, img.spacing[1] ?? 1, img.spacing[2] ?? 1];
  const origin: Types.Point3 = [img.origin[0] ?? 0, img.origin[1] ?? 0, img.origin[2] ?? 0];
  const dir = Array.from(img.direction);
  const direction: Types.Mat3 = (dir.length === 9 ? dir : dir.length === 4 ? [dir[0], dir[1], 0, dir[2], dir[3], 0, 0, 0, 1] : [1, 0, 0, 0, 1, 0, 0, 0, 1]) as Types.Mat3;

  const { scalarData, bits, signed, isFloat } = toScalarData(img.data, img.imageType.componentType);
  const range = minMax(scalarData);
  const volumeId = `local:${file.name}-${counter++}`;
  const volume = volumeLoader.createLocalVolume(volumeId, {
    metadata: {
      BitsAllocated: bits,
      BitsStored: bits,
      HighBit: bits - 1,
      SamplesPerPixel: 1,
      PixelRepresentation: signed || isFloat ? 1 : 0,
      PhotometricInterpretation: 'MONOCHROME2',
      Modality: 'OT',
      SeriesInstanceUID: volumeId,
      ImageOrientationPatient: [direction[0], direction[1], direction[2], direction[3], direction[4], direction[5]],
      PixelSpacing: [spacing[1], spacing[0]],
      FrameOfReferenceUID: `${volumeId}-for`,
      Columns: dims[0],
      Rows: dims[1],
      voiLut: [{ windowWidth: Math.max(1, range.max - range.min), windowCenter: (range.max + range.min) / 2 }],
      VOILUTFunction: 'LINEAR',
    } as unknown as Types.Metadata,
    dimensions: dims,
    spacing,
    origin,
    direction,
    scalarData,
  });

  return {
    id: `local-volume:${volume.volumeId}`,
    source: 'local-volume',
    modality: 'OT',
    description: file.name,
    imageIds: [],
    volumeId: volume.volumeId,
    isVolumetric: dims[2] >= 3,
    isCine: false,
    frameCount: dims[2],
    isDerived: false,
    fileName: file.name,
  };
}

type Scalar = Int8Array | Uint8Array | Int16Array | Uint16Array | Float32Array;

function toScalarData(data: ArrayLike<number>, componentType: string): { scalarData: Scalar; bits: number; signed: boolean; isFloat: boolean } {
  switch (componentType) {
    case 'int8':
      return { scalarData: data instanceof Int8Array ? data : Int8Array.from(data), bits: 8, signed: true, isFloat: false };
    case 'uint8':
      return { scalarData: data instanceof Uint8Array ? data : Uint8Array.from(data), bits: 8, signed: false, isFloat: false };
    case 'int16':
      return { scalarData: data instanceof Int16Array ? data : Int16Array.from(data), bits: 16, signed: true, isFloat: false };
    case 'uint16':
      return { scalarData: data instanceof Uint16Array ? data : Uint16Array.from(data), bits: 16, signed: false, isFloat: false };
    default:
      // int32/uint32/float64 → float32 (Cornerstone volumes support Float32 directly)
      return { scalarData: data instanceof Float32Array ? data : Float32Array.from(data), bits: 32, signed: true, isFloat: true };
  }
}

function minMax(a: Scalar): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
