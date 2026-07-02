import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { LoaderRegistry, useViewerStore, useLongitudinalStore, useDetectionStore, autoDetectionService, AutoDetectionService, isFeatureEnabled, type PacsStudyInfo, type LoadedImage, type ImageMetadata } from '@medai/core';
import { toast } from '@medai/ui';

// 2D modalities that should not be displayed as 3D volumes
const MODALITIES_2D = ['CR', 'DX', 'MG', 'XA', 'RF', 'RG', 'IO', 'PX'];

/**
 * ViewerPage - Wrapper component for the medical image viewer
 *
 * Handles URL parameters for loading studies from PACS:
 * - /viewer?studyUID=xxx - Load study from PACS
 * - /viewer (no params) - Show FileDropZone for local uploads
 *
 * Also handles navigation state for local study loading.
 */
export function ViewerPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoadingPacs, setIsLoadingPacs] = useState(false);
  const loadedStudyRef = useRef<string | null>(null);
  const { setLoading, addImage, setActiveImage, setLoadingError, setPacsStudy, setActiveSeries, persistImage, clearLocalImages } = useViewerStore();

  const studyUID = searchParams.get('studyUID');
  const localStudyId = (location.state as { localStudyId?: string } | null)?.localStudyId;
  const longitudinalSessionId = searchParams.get('longitudinal');

  // Load study from PACS using Orthanc native API - stack as 3D volume
  const loadPacsStudy = useCallback(async (uid: string) => {
    setIsLoadingPacs(true);
    setLoading(true, 0);

    // Clear any previously loaded local files (e.g., NIfTI files from previous sessions)
    await clearLocalImages();

    try {
      console.log('[ViewerPage] Loading study from PACS:', uid);

      // Step 1: Find Orthanc study by DICOM UID
      const studiesResponse = await fetch('/proxy/orthanc/studies');
      if (!studiesResponse.ok) {
        throw new Error('Failed to get studies from Orthanc');
      }
      const studyIds: string[] = await studiesResponse.json();

      let orthancStudyId: string | null = null;
      let studyInfo: any = null;
      for (const studyId of studyIds) {
        const resp = await fetch(`/proxy/orthanc/studies/${studyId}`);
        if (!resp.ok) continue;
        const info = await resp.json();
        if (info.MainDicomTags?.StudyInstanceUID === uid) {
          orthancStudyId = studyId;
          studyInfo = info;
          break;
        }
      }

      if (!orthancStudyId || !studyInfo) {
        throw new Error('Study not found in Orthanc');
      }
      console.log('[ViewerPage] Found Orthanc study:', studyInfo.MainDicomTags);

      // Step 2: Get series info
      const seriesIds: string[] = studyInfo.Series || [];
      if (seriesIds.length === 0) {
        throw new Error('No series found in study');
      }

      // Get first series details
      const seriesResp = await fetch(`/proxy/orthanc/series/${seriesIds[0]}`);
      if (!seriesResp.ok) throw new Error('Failed to get series info');
      const seriesInfo = await seriesResp.json();
      console.log('[ViewerPage] Series info:', seriesInfo.MainDicomTags);

      // Step 3: Get all instances for this series
      const instanceIds: string[] = seriesInfo.Instances || [];
      console.log('[ViewerPage] Found', instanceIds.length, 'instances in series');

      if (instanceIds.length === 0) {
        throw new Error('No instances found in series');
      }

      // Step 4: Download all DICOM files and parse them
      const slices: { buffer: ArrayBuffer; position: number; instanceNumber: number }[] = [];

      for (let i = 0; i < instanceIds.length; i++) {
        try {
          // Get instance metadata first for sorting
          const metaResp = await fetch(`/proxy/orthanc/instances/${instanceIds[i]}/simplified-tags`);
          const meta = metaResp.ok ? await metaResp.json() : {};

          // Download DICOM file
          const fileResponse = await fetch(`/proxy/orthanc/instances/${instanceIds[i]}/file`);
          if (!fileResponse.ok) continue;

          const buffer = await fileResponse.arrayBuffer();

          // Parse position from ImagePositionPatient or use instance number
          const positionStr = meta.ImagePositionPatient || '';
          const position = positionStr ? parseFloat(positionStr.split('\\')[2] || '0') : 0;
          const instanceNumber = parseInt(meta.InstanceNumber || '0', 10);

          slices.push({ buffer, position, instanceNumber });
          setLoading(true, ((i + 1) / instanceIds.length) * 80);
        } catch (err) {
          console.warn(`[ViewerPage] Error loading instance ${i}:`, err);
        }
      }

      if (slices.length === 0) {
        throw new Error('Failed to load any DICOM slices');
      }

      // Sort by position (z-axis) or instance number
      slices.sort((a, b) => a.position - b.position || a.instanceNumber - b.instanceNumber);
      console.log('[ViewerPage] Sorted', slices.length, 'slices by position');

      // Step 5: Parse first slice to get dimensions and create 3D volume
      setLoading(true, 85);
      const firstSlice = slices[0];
      const firstImage = await parseSliceForMetadata(firstSlice.buffer);

      const width = firstImage.width;
      const height = firstImage.height;
      const depth = slices.length;
      const bytesPerPixel = firstImage.bytesPerPixel;

      console.log('[ViewerPage] Creating 3D volume:', width, 'x', height, 'x', depth);

      // Create combined pixel data
      const totalSize = width * height * depth;
      let volumeData: Uint8Array | Int16Array | Uint16Array | Float32Array;

      if (firstImage.dataType === 'uint8') {
        volumeData = new Uint8Array(totalSize);
      } else if (firstImage.dataType === 'int16') {
        volumeData = new Int16Array(totalSize);
      } else if (firstImage.dataType === 'uint16') {
        volumeData = new Uint16Array(totalSize);
      } else {
        volumeData = new Float32Array(totalSize);
      }

      // Stack all slices into the volume
      for (let z = 0; z < slices.length; z++) {
        const slicePixels = await extractPixelData(slices[z].buffer, width, height, firstImage.dataType);
        const offset = z * width * height;
        volumeData.set(slicePixels, offset);
      }

      setLoading(true, 95);

      // Determine if this is a 2D or 3D image
      const modality = seriesInfo.MainDicomTags?.Modality || 'CT';
      const is2DModality = MODALITIES_2D.includes(modality.toUpperCase());
      const dimensionality = (is2DModality || depth === 1) ? '2D' : '3D';

      console.log('[ViewerPage] Modality:', modality, 'Depth:', depth, 'Dimensionality:', dimensionality);

      // Create the image
      const volumeImage: LoadedImage = {
        imageId: `pacs:${uid}:${seriesInfo.MainDicomTags?.SeriesInstanceUID || 'series'}`,
        metadata: {
          width,
          height,
          depth,
          spacingX: firstImage.spacingX,
          spacingY: firstImage.spacingY,
          spacingZ: firstImage.spacingZ || 1.0,
          originX: firstImage.originX,
          originY: firstImage.originY,
          originZ: firstImage.originZ,
          direction: firstImage.direction,
          dataType: firstImage.dataType,
          modality,
          seriesDescription: seriesInfo.MainDicomTags?.SeriesDescription || '',
          studyDescription: studyInfo.MainDicomTags?.StudyDescription || '',
          bodyPartExamined: seriesInfo.MainDicomTags?.BodyPartExamined || studyInfo.MainDicomTags?.BodyPartExamined || '',
          protocolName: seriesInfo.MainDicomTags?.ProtocolName || '',
          patientName: studyInfo.MainDicomTags?.PatientName || '',
          format: 'dicom',
          dimensionality,
        },
        pixelData: volumeData.buffer as ArrayBuffer,
      };

      // Set PACS study info for hierarchy display
      // Note: Orthanc stores patient info in PatientMainDicomTags, not MainDicomTags
      const pacsStudyInfo: PacsStudyInfo = {
        studyInstanceUID: uid,
        patientName: studyInfo.PatientMainDicomTags?.PatientName || studyInfo.MainDicomTags?.PatientName || 'Unknown',
        patientID: studyInfo.PatientMainDicomTags?.PatientID || studyInfo.MainDicomTags?.PatientID || '',
        studyDate: studyInfo.MainDicomTags?.StudyDate || '',
        studyDescription: studyInfo.MainDicomTags?.StudyDescription || '',
        modality: seriesInfo.MainDicomTags?.Modality || 'CT',
        series: [{
          seriesInstanceUID: seriesInfo.MainDicomTags?.SeriesInstanceUID || '',
          seriesNumber: parseInt(seriesInfo.MainDicomTags?.SeriesNumber || '1', 10),
          seriesDescription: seriesInfo.MainDicomTags?.SeriesDescription || 'Series 1',
          modality: seriesInfo.MainDicomTags?.Modality || 'CT',
          instanceCount: slices.length,
          imageIds: [volumeImage.imageId],
        }],
      };

      setPacsStudy(pacsStudyInfo);
      setActiveSeries(pacsStudyInfo.series[0].seriesInstanceUID);
      addImage(volumeImage);
      // Explicitly set this image as active (overrides any previously active image)
      setActiveImage(volumeImage.imageId);

      // Persist image to IndexedDB
      await persistImage(volumeImage);

      // Load stored AI detections for X-ray instances
      if (is2DModality && isFeatureEnabled('chestxray')) {
        for (const instId of instanceIds) {
          try {
            const stored = await autoDetectionService.getStoredDetection(instId);
            if (stored && stored.status === 'success' && stored.detections.length > 0) {
              const detections = AutoDetectionService.toDetections(stored);
              useDetectionStore.getState().setDetections(
                volumeImage.imageId, detections, stored.description, stored.processingTimeMs
              );
              console.log(`[ViewerPage] Loaded ${detections.length} stored detections for image`);
              break; // For 2D, one instance is enough
            }
          } catch (err) {
            console.warn('[ViewerPage] Failed to load stored detections:', err);
          }
        }
      }

      toast.success('PACS Study Loaded', `Loaded ${slices.length} slice(s) as ${dimensionality} image`);

    } catch (error) {
      console.error('[ViewerPage] Failed to load PACS study:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setLoadingError(message);
      toast.error('PACS Load Failed', message);
    } finally {
      setIsLoadingPacs(false);
      setLoading(false);
    }
  }, [setLoading, addImage, setActiveImage, persistImage, setLoadingError, setPacsStudy, setActiveSeries, clearLocalImages]);

  useEffect(() => {
    // Prevent duplicate loads of the same study
    if (studyUID && loadedStudyRef.current !== studyUID) {
      loadedStudyRef.current = studyUID;
      loadPacsStudy(studyUID);
    } else if (localStudyId) {
      console.log('[ViewerPage] Loading local study:', localStudyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyUID, localStudyId]);

  // Activate longitudinal session if provided in URL
  useEffect(() => {
    if (longitudinalSessionId) {
      const { setActiveSession, sessions } = useLongitudinalStore.getState();
      if (sessions[longitudinalSessionId]) {
        setActiveSession(longitudinalSessionId);
        console.log('[ViewerPage] Activated longitudinal session:', longitudinalSessionId);
        toast.success('Longitudinal Session', 'Comparison mode activated');
      } else {
        console.warn('[ViewerPage] Longitudinal session not found:', longitudinalSessionId);
      }
    }
  }, [longitudinalSessionId]);

  return <MainLayout />;
}

/**
 * Parse a DICOM slice to extract metadata
 */
async function parseSliceForMetadata(buffer: ArrayBuffer): Promise<{
  width: number;
  height: number;
  bytesPerPixel: number;
  dataType: 'uint8' | 'int16' | 'uint16' | 'float32';
  spacingX: number;
  spacingY: number;
  spacingZ: number;
  originX: number;
  originY: number;
  originZ: number;
  direction: number[];
}> {
  // Dynamic import dicom-parser
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  const rows = dataSet.uint16('x00280010') || 512;
  const columns = dataSet.uint16('x00280011') || 512;
  const bitsAllocated = dataSet.uint16('x00280100') || 16;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0;

  // Pixel spacing
  const pixelSpacingStr = dataSet.string('x00280030') || '1\\1';
  const [spacingY, spacingX] = pixelSpacingStr.split('\\').map(parseFloat);

  // Slice thickness for Z spacing
  const sliceThickness = parseFloat(dataSet.string('x00180050') || '1');

  // Image position
  const positionStr = dataSet.string('x00200032') || '0\\0\\0';
  const [originX, originY, originZ] = positionStr.split('\\').map(parseFloat);

  // Image orientation
  const orientationStr = dataSet.string('x00200037') || '1\\0\\0\\0\\1\\0';
  const orientParts = orientationStr.split('\\').map(parseFloat);
  const direction = [
    orientParts[0] || 1, orientParts[1] || 0, orientParts[2] || 0,
    orientParts[3] || 0, orientParts[4] || 1, orientParts[5] || 0,
    0, 0, 1,
  ];

  let dataType: 'uint8' | 'int16' | 'uint16' | 'float32' = 'int16';
  if (bitsAllocated === 8) {
    dataType = 'uint8';
  } else if (bitsAllocated === 16) {
    dataType = pixelRepresentation === 0 ? 'uint16' : 'int16';
  } else if (bitsAllocated === 32) {
    dataType = 'float32';
  }

  return {
    width: columns,
    height: rows,
    bytesPerPixel: bitsAllocated / 8,
    dataType,
    spacingX: spacingX || 1,
    spacingY: spacingY || 1,
    spacingZ: sliceThickness || 1,
    originX: originX || 0,
    originY: originY || 0,
    originZ: originZ || 0,
    direction,
  };
}

/**
 * Extract pixel data from a DICOM buffer
 */
async function extractPixelData(
  buffer: ArrayBuffer,
  width: number,
  height: number,
  dataType: 'uint8' | 'int16' | 'uint16' | 'float32'
): Promise<Uint8Array | Int16Array | Uint16Array | Float32Array> {
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  const pixelDataElement = dataSet.elements['x7fe00010'];
  if (!pixelDataElement) {
    throw new Error('No pixel data in DICOM');
  }

  const totalPixels = width * height;
  const offset = pixelDataElement.dataOffset;
  const length = pixelDataElement.length;
  const rescaleSlope = parseFloat(dataSet.string('x00281053') || '1');
  const rescaleIntercept = parseFloat(dataSet.string('x00281052') || '0');

  let result: Uint8Array | Int16Array | Uint16Array | Float32Array;

  if (dataType === 'uint8') {
    // Handle 8-bit images (X-rays, mammograms, etc.)
    result = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels && i < length; i++) {
      let value = byteArray[offset + i];
      value = value * rescaleSlope + rescaleIntercept;
      result[i] = Math.max(0, Math.min(255, Math.round(value)));
    }
  } else {
    // For 16-bit and 32-bit data, use DataView
    const dataView = new DataView(byteArray.buffer, byteArray.byteOffset + offset, length);

    if (dataType === 'uint16') {
      result = new Uint16Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        let value = dataView.getUint16(i * 2, true);
        value = value * rescaleSlope + rescaleIntercept;
        result[i] = Math.max(0, Math.min(65535, Math.round(value)));
      }
    } else if (dataType === 'int16') {
      result = new Int16Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        let value = dataView.getInt16(i * 2, true);
        value = value * rescaleSlope + rescaleIntercept;
        result[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
      }
    } else {
      result = new Float32Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        let value = dataView.getFloat32(i * 4, true);
        result[i] = value * rescaleSlope + rescaleIntercept;
      }
    }
  }

  return result;
}
