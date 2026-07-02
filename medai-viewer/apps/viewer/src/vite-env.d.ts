/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MONAI Label server (segmentation/analytics). Default: http://localhost:8002 */
  readonly VITE_MONAI_SERVER_URL: string;
  /** MedAI API gateway (chat, chest X-ray, triage, batch, reports). Default: http://localhost:8002 */
  readonly VITE_MEDAI_SERVER_URL: string;
  /** Chat service override; falls back to VITE_MEDAI_SERVER_URL */
  readonly VITE_CHAT_SERVICE_URL: string;
  /** Orthanc PACS (dev-proxy target for /proxy/dicom and /proxy/orthanc). Default: http://localhost:8042 */
  readonly VITE_ORTHANC_URL: string;
  /** Comma-separated optional features to enable (or "all"). Empty = basic viewer. */
  readonly VITE_FEATURES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
