/**
 * DICOMweb Client for TypeScript
 * Handles communication with PACS servers via DICOMweb protocol (QIDO-RS, WADO-RS)
 * Uses the existing MedAI server proxy endpoints at /proxy/dicom/
 */

// ============================================
// Types
// ============================================

/**
 * DICOM study representation with all relevant metadata
 */
export interface DicomStudy {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;           // YYYYMMDD format
  studyTime?: string;
  studyDescription?: string;
  modalities: string[];        // ['CT', 'MR', etc.]
  numberOfSeries: number;
  numberOfInstances: number;
  accessionNumber?: string;
  referringPhysician?: string;
  // Clinical context fields (from instance-level tags)
  patientLocation?: string;    // InstitutionalDepartmentName (0008,1040)
  reasonForVisit?: string;     // ReasonForTheRequestedProcedure (0040,1002)
  urgencyFlag?: string;        // Parsed from reasonForVisit (STAT, URGENT, SEMI_URGENT, ROUTINE)
}

/**
 * DICOM series within a study
 */
export interface DicomSeries {
  seriesInstanceUID: string;
  seriesNumber: number;
  seriesDescription?: string;
  modality: string;
  numberOfInstances: number;
  bodyPartExamined?: string;
}

/**
 * Raw QIDO-RS study result from DICOMweb server
 */
export interface QidoStudyResult {
  '00080020'?: { Value: string[] };  // StudyDate
  '00080030'?: { Value: string[] };  // StudyTime
  '00080050'?: { Value: string[] };  // AccessionNumber
  '00080061'?: { Value: string[] };  // ModalitiesInStudy
  '00080090'?: { Value: string[] };  // ReferringPhysicianName
  '00081030'?: { Value: string[] };  // StudyDescription
  '00100010'?: { Value: Array<{ Alphabetic?: string } | string> }; // PatientName
  '00100020'?: { Value: string[] };  // PatientID
  '0020000D'?: { Value: string[] };  // StudyInstanceUID
  '00200010'?: { Value: string[] };  // StudyID
  '00201206'?: { Value: number[] };  // NumberOfStudyRelatedSeries
  '00201208'?: { Value: number[] };  // NumberOfStudyRelatedInstances
}

/**
 * Raw QIDO-RS series result from DICOMweb server
 */
export interface QidoSeriesResult {
  '00080060'?: { Value: string[] };  // Modality
  '00080021'?: { Value: string[] };  // SeriesDate
  '00080031'?: { Value: string[] };  // SeriesTime
  '0008103E'?: { Value: string[] };  // SeriesDescription
  '00180015'?: { Value: string[] };  // BodyPartExamined
  '0020000E'?: { Value: string[] };  // SeriesInstanceUID
  '00200011'?: { Value: number[] };  // SeriesNumber
  '00201209'?: { Value: number[] };  // NumberOfSeriesRelatedInstances
}

/**
 * Search parameters for QIDO-RS queries
 */
export interface QidoSearchParams {
  PatientName?: string;
  PatientID?: string;
  StudyDate?: string;       // YYYYMMDD or range YYYYMMDD-YYYYMMDD
  ModalitiesInStudy?: string;
  StudyDescription?: string;
  AccessionNumber?: string;
  limit?: number;
  offset?: number;
}

/**
 * Parameters for WADO-RS retrieval
 */
export interface WadoRetrieveParams {
  studyUID: string;
  seriesUID?: string;
  instanceUID?: string;
}

// ============================================
// Client Implementation
// ============================================

/**
 * DICOMWebClient - Queries PACS servers via DICOMweb protocol
 *
 * Uses proxy endpoints that follow standard DICOMweb paths:
 * - /proxy/dicom/studies - Query studies (QIDO-RS)
 * - /proxy/dicom/studies/{uid}/series - Query series (QIDO-RS)
 * - /proxy/dicom/studies/{uid} - Retrieve study (WADO-RS)
 *
 * The Vite dev proxy rewrites /proxy/dicom -> /dicom-web for Orthanc
 *
 * Example usage:
 * ```typescript
 * const client = new DICOMWebClient();
 * const studies = await client.searchStudies({ PatientName: 'Smith' });
 * ```
 */
export class DICOMWebClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    // Default to same origin (uses proxy)
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search for studies using QIDO-RS
   *
   * @param params - Search parameters (patient name, date, modality, etc.)
   * @returns Array of matching DicomStudy objects
   */
  async searchStudies(params: QidoSearchParams = {}): Promise<DicomStudy[]> {
    const queryParams = new URLSearchParams();

    // Add search parameters with wildcard support
    if (params.PatientName) {
      // Wrap in wildcards for partial matching
      queryParams.append('PatientName', `*${params.PatientName}*`);
    }
    if (params.PatientID) {
      queryParams.append('PatientID', params.PatientID);
    }
    if (params.StudyDate) {
      queryParams.append('StudyDate', params.StudyDate);
    }
    if (params.ModalitiesInStudy) {
      queryParams.append('ModalitiesInStudy', params.ModalitiesInStudy);
    }
    if (params.StudyDescription) {
      queryParams.append('StudyDescription', `*${params.StudyDescription}*`);
    }
    if (params.AccessionNumber) {
      queryParams.append('AccessionNumber', params.AccessionNumber);
    }
    if (params.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params.offset) {
      queryParams.append('offset', params.offset.toString());
    }

    // Request additional fields in response
    queryParams.append('includefield', '00081030'); // StudyDescription
    queryParams.append('includefield', '00201206'); // NumberOfStudyRelatedSeries
    queryParams.append('includefield', '00201208'); // NumberOfStudyRelatedInstances

    const url = `${this.baseUrl}/proxy/dicom/studies?${queryParams.toString()}`;

    console.log('[DICOMWebClient] Searching studies:', url);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/dicom+json',
        },
      });

      if (!response.ok) {
        throw new Error(`QIDO search failed: ${response.status} ${response.statusText}`);
      }

      const results: QidoStudyResult[] = await response.json();
      return this.parseStudyResults(results);
    } catch (error) {
      console.error('[DICOMWebClient] Search failed:', error);
      throw error;
    }
  }

  /**
   * Get series for a specific study
   *
   * @param studyUID - Study Instance UID
   * @returns Array of DicomSeries objects
   */
  async getSeriesForStudy(studyUID: string): Promise<DicomSeries[]> {
    const url = `${this.baseUrl}/proxy/dicom/studies/${encodeURIComponent(studyUID)}/series`;

    console.log('[DICOMWebClient] Getting series for study:', studyUID);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/dicom+json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get series: ${response.status} ${response.statusText}`);
      }

      const results: QidoSeriesResult[] = await response.json();
      return this.parseSeriesResults(results);
    } catch (error) {
      console.error('[DICOMWebClient] Get series failed:', error);
      throw error;
    }
  }

  /**
   * Get WADO-RS URL for retrieving study/series/instance
   *
   * @param params - Retrieval parameters
   * @returns URL string for WADO-RS request
   */
  getWadoUrl(params: WadoRetrieveParams): string {
    let path = `studies/${encodeURIComponent(params.studyUID)}`;
    if (params.seriesUID) {
      path += `/series/${encodeURIComponent(params.seriesUID)}`;
      if (params.instanceUID) {
        path += `/instances/${encodeURIComponent(params.instanceUID)}`;
      }
    }
    return `${this.baseUrl}/proxy/dicom/${path}`;
  }

  /**
   * Get WADO-RS metadata URL
   *
   * @param studyUID - Study Instance UID
   * @param seriesUID - Optional Series Instance UID
   * @returns URL string for metadata request
   */
  getMetadataUrl(studyUID: string, seriesUID?: string): string {
    let path = `studies/${encodeURIComponent(studyUID)}`;
    if (seriesUID) {
      path += `/series/${encodeURIComponent(seriesUID)}`;
    }
    path += '/metadata';
    return `${this.baseUrl}/proxy/dicom/${path}`;
  }

  /**
   * Test connection to the PACS server
   *
   * @returns True if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/proxy/dicom/studies?limit=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/dicom+json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch clinical context (location, urgency) for studies from instance-level tags
   * Uses Orthanc REST API to get simplified tags from the first instance of each study
   *
   * @param studies - Array of studies to enrich with clinical context
   * @returns Studies with patientLocation, reasonForVisit, and urgencyFlag populated
   */
  async enrichStudiesWithClinicalContext(studies: DicomStudy[]): Promise<DicomStudy[]> {
    console.log('[DICOMWebClient] Enriching', studies.length, 'studies with clinical context');

    // First, get all Orthanc study IDs and build a map by StudyInstanceUID
    const orthancStudyMap = new Map<string, string>();

    try {
      const allStudiesResponse = await fetch(
        `${this.baseUrl}/proxy/orthanc/studies`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (allStudiesResponse.ok) {
        const allOrthancIds: string[] = await allStudiesResponse.json();

        // Fetch study details in parallel to build the map
        await Promise.all(
          allOrthancIds.map(async (orthancId) => {
            try {
              const detailsResponse = await fetch(
                `${this.baseUrl}/proxy/orthanc/studies/${orthancId}`,
                { headers: { 'Accept': 'application/json' } }
              );
              if (detailsResponse.ok) {
                const details = await detailsResponse.json();
                const studyUID = details.MainDicomTags?.StudyInstanceUID;
                if (studyUID) {
                  orthancStudyMap.set(studyUID, orthancId);
                }
              }
            } catch {
              // Ignore individual failures
            }
          })
        );
      }
    } catch (error) {
      console.warn('[DICOMWebClient] Failed to fetch Orthanc study list:', error);
    }

    console.log('[DICOMWebClient] Built Orthanc study map with', orthancStudyMap.size, 'entries');

    const enrichedStudies = await Promise.all(
      studies.map(async (study) => {
        try {
          // Look up the Orthanc ID using our map
          const orthancStudyId = orthancStudyMap.get(study.studyInstanceUID);

          if (!orthancStudyId) {
            // Fallback: try DICOMweb metadata
            return await this.enrichStudyViaDicomWeb(study);
          }

          // Get study details to find first instance
          const studyDetailsResponse = await fetch(
            `${this.baseUrl}/proxy/orthanc/studies/${orthancStudyId}`,
            { headers: { 'Accept': 'application/json' } }
          );

          if (!studyDetailsResponse.ok) {
            return study;
          }

          const studyDetails = await studyDetailsResponse.json();
          const firstSeriesId = studyDetails.Series?.[0];
          if (!firstSeriesId) return study;

          // Get series to find first instance
          const seriesResponse = await fetch(
            `${this.baseUrl}/proxy/orthanc/series/${firstSeriesId}`,
            { headers: { 'Accept': 'application/json' } }
          );

          if (!seriesResponse.ok) return study;

          const seriesDetails = await seriesResponse.json();
          const firstInstanceId = seriesDetails.Instances?.[0];
          if (!firstInstanceId) return study;

          // Get instance simplified tags
          const tagsResponse = await fetch(
            `${this.baseUrl}/proxy/orthanc/instances/${firstInstanceId}/simplified-tags`,
            { headers: { 'Accept': 'application/json' } }
          );

          if (!tagsResponse.ok) return study;

          const tags = await tagsResponse.json();

          // Extract clinical context
          const patientLocation = tags.InstitutionalDepartmentName || '';
          const reasonForVisit = tags.ReasonForTheRequestedProcedure || tags.ReasonForStudy || '';

          // Parse urgency from reason
          let urgencyFlag = 'ROUTINE';
          if (reasonForVisit) {
            const reasonUpper = reasonForVisit.toUpperCase();
            if (reasonUpper.startsWith('STAT:') || reasonUpper.startsWith('STAT ')) {
              urgencyFlag = 'STAT';
            } else if (reasonUpper.startsWith('URGENT:') || reasonUpper.startsWith('URGENT ')) {
              urgencyFlag = 'URGENT';
            } else if (reasonUpper.startsWith('SEMI_URGENT:') || reasonUpper.startsWith('SEMI-URGENT:')) {
              urgencyFlag = 'SEMI_URGENT';
            }
          }

          return {
            ...study,
            patientLocation,
            reasonForVisit,
            urgencyFlag,
          };
        } catch (error) {
          console.warn('[DICOMWebClient] Failed to enrich study:', study.studyInstanceUID, error);
          return study;
        }
      })
    );

    return enrichedStudies;
  }

  /**
   * Fallback method to enrich study via DICOMweb metadata endpoint
   */
  private async enrichStudyViaDicomWeb(study: DicomStudy): Promise<DicomStudy> {
    try {
      // Try WADO-RS metadata endpoint
      const metadataUrl = this.getMetadataUrl(study.studyInstanceUID);
      const response = await fetch(metadataUrl, {
        headers: { 'Accept': 'application/dicom+json' },
      });

      if (!response.ok) return study;

      const metadata = await response.json();
      if (!metadata || !Array.isArray(metadata) || metadata.length === 0) return study;

      // Extract from first instance metadata
      const firstInstance = metadata[0];

      const patientLocation = this.extractTagValue(firstInstance, '00081040') || ''; // InstitutionalDepartmentName
      const reasonForVisit = this.extractTagValue(firstInstance, '00401002') || // ReasonForTheRequestedProcedure
                            this.extractTagValue(firstInstance, '00321067') || ''; // ReasonForStudy (retired)

      // Parse urgency
      let urgencyFlag = 'ROUTINE';
      if (reasonForVisit) {
        const reasonUpper = reasonForVisit.toUpperCase();
        if (reasonUpper.startsWith('STAT')) urgencyFlag = 'STAT';
        else if (reasonUpper.startsWith('URGENT')) urgencyFlag = 'URGENT';
        else if (reasonUpper.startsWith('SEMI')) urgencyFlag = 'SEMI_URGENT';
      }

      return {
        ...study,
        patientLocation,
        reasonForVisit,
        urgencyFlag,
      };
    } catch {
      return study;
    }
  }

  /**
   * Extract a tag value from DICOM JSON format
   */
  private extractTagValue(instance: Record<string, unknown>, tag: string): string | undefined {
    const field = instance[tag] as { Value?: Array<string | { Alphabetic?: string }> } | undefined;
    if (field?.Value?.[0]) {
      const value = field.Value[0];
      if (typeof value === 'string') return value;
      if (typeof value === 'object' && 'Alphabetic' in value) return value.Alphabetic;
    }
    return undefined;
  }

  /**
   * Parse QIDO-RS study results into DicomStudy objects
   */
  private parseStudyResults(results: QidoStudyResult[]): DicomStudy[] {
    return results.map((result) => {
      const getValue = <T>(tag: string): T | undefined => {
        const field = result[tag as keyof QidoStudyResult];
        if (field && 'Value' in field && Array.isArray(field.Value) && field.Value.length > 0) {
          return field.Value[0] as T;
        }
        return undefined;
      };

      const getValues = (tag: string): string[] => {
        const field = result[tag as keyof QidoStudyResult];
        if (field && 'Value' in field && Array.isArray(field.Value)) {
          return field.Value.map(v => String(v));
        }
        return [];
      };

      // Parse patient name (PersonName format can be object or string)
      let patientName = 'Unknown';
      const pnField = result['00100010'];
      if (pnField?.Value?.[0]) {
        const nameValue = pnField.Value[0];
        if (typeof nameValue === 'object' && 'Alphabetic' in nameValue) {
          patientName = nameValue.Alphabetic || 'Unknown';
        } else if (typeof nameValue === 'string') {
          patientName = nameValue;
        }
      }

      return {
        studyInstanceUID: getValue<string>('0020000D') || '',
        patientName,
        patientID: getValue<string>('00100020') || '',
        studyDate: getValue<string>('00080020') || '',
        studyTime: getValue<string>('00080030'),
        studyDescription: getValue<string>('00081030'),
        modalities: getValues('00080061'),
        numberOfSeries: getValue<number>('00201206') || 0,
        numberOfInstances: getValue<number>('00201208') || 0,
        accessionNumber: getValue<string>('00080050'),
        referringPhysician: getValue<string>('00080090'),
      };
    });
  }

  /**
   * Parse QIDO-RS series results into DicomSeries objects
   */
  private parseSeriesResults(results: QidoSeriesResult[]): DicomSeries[] {
    return results.map((result) => {
      const getValue = <T>(tag: string): T | undefined => {
        const field = result[tag as keyof QidoSeriesResult];
        if (field && 'Value' in field && Array.isArray(field.Value) && field.Value.length > 0) {
          return field.Value[0] as T;
        }
        return undefined;
      };

      return {
        seriesInstanceUID: getValue<string>('0020000E') || '',
        seriesNumber: getValue<number>('00200011') || 0,
        seriesDescription: getValue<string>('0008103E'),
        modality: getValue<string>('00080060') || '',
        numberOfInstances: getValue<number>('00201209') || 0,
        bodyPartExamined: getValue<string>('00180015'),
      };
    });
  }
}

export default DICOMWebClient;
