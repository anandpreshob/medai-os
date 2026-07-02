/**
 * IndexedDB Persistence Service
 *
 * Persists viewer state (images, segmentations, session) to IndexedDB
 * so that data survives page reloads and navigation.
 */

import { LoadedImage } from '../loaders/types';
import { LongitudinalSession } from '../stores/longitudinalTypes';

const DB_NAME = 'medai-viewer';
const DB_VERSION = 2;

// Store names
const STORES = {
  IMAGES: 'images',
  SEGMENTATIONS: 'segmentations',
  SESSION: 'session',
  LONGITUDINAL_SESSIONS: 'longitudinal_sessions',
} as const;

// Session state interface
export interface PersistedSession {
  activeImageId: string | null;
  activeSegmentationId: string | null;
  timestamp: number;
}

// Persisted segmentation data
export interface PersistedSegmentation {
  id: string;
  imageId: string;  // Reference to the image this segmentation belongs to
  label: string;
  segments: Array<{
    segmentIndex: number;
    label: string;
    color: string;
    visible: boolean;
    locked: boolean;
  }>;
  // The actual labelmap data for each segment
  labelmapData: Array<{
    segmentIndex: number;
    volumeId: string;
    data: ArrayBuffer;  // The binary labelmap data
    dimensions: [number, number, number];
  }>;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve, reject) => {
    console.log('[PersistenceService] Opening IndexedDB:', DB_NAME, 'v' + DB_VERSION);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[PersistenceService] Failed to open IndexedDB:', request.error);
      dbInitPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[PersistenceService] IndexedDB opened successfully');
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      console.log('[PersistenceService] Upgrading IndexedDB schema');
      const db = (event.target as IDBOpenDBRequest).result;

      // Create images store
      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        const imageStore = db.createObjectStore(STORES.IMAGES, { keyPath: 'imageId' });
        imageStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[PersistenceService] Created images store');
      }

      // Create segmentations store
      if (!db.objectStoreNames.contains(STORES.SEGMENTATIONS)) {
        const segStore = db.createObjectStore(STORES.SEGMENTATIONS, { keyPath: 'id' });
        segStore.createIndex('imageId', 'imageId', { unique: false });
        segStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[PersistenceService] Created segmentations store');
      }

      // Create session store (single record)
      if (!db.objectStoreNames.contains(STORES.SESSION)) {
        db.createObjectStore(STORES.SESSION, { keyPath: 'id' });
        console.log('[PersistenceService] Created session store');
      }

      // Create longitudinal sessions store (v2)
      if (!db.objectStoreNames.contains(STORES.LONGITUDINAL_SESSIONS)) {
        const longStore = db.createObjectStore(STORES.LONGITUDINAL_SESSIONS, { keyPath: 'id' });
        longStore.createIndex('patientId', 'patientId', { unique: false });
        longStore.createIndex('createdAt', 'createdAt', { unique: false });
        longStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        console.log('[PersistenceService] Created longitudinal_sessions store');
      }
    };
  });

  return dbInitPromise;
}

/**
 * Get a transaction for the specified stores
 */
async function getTransaction(
  storeNames: string | string[],
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBTransaction> {
  const db = await initDB();
  return db.transaction(storeNames, mode);
}

// ============================================================================
// Image Persistence
// ============================================================================

/**
 * Save a loaded image to IndexedDB
 */
export async function saveImage(image: LoadedImage): Promise<void> {
  console.log('[PersistenceService] Saving image:', image.imageId);

  try {
    const tx = await getTransaction(STORES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORES.IMAGES);

    // Create a serializable version of the image
    const persistedImage = {
      imageId: image.imageId,
      metadata: image.metadata,
      pixelData: image.pixelData,  // ArrayBuffer is directly storable in IndexedDB
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(persistedImage);
      request.onsuccess = () => {
        console.log('[PersistenceService] Image saved successfully:', image.imageId);
        resolve();
      };
      request.onerror = () => {
        console.error('[PersistenceService] Failed to save image:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error saving image:', err);
    throw err;
  }
}

/**
 * Load an image from IndexedDB
 */
export async function loadImage(imageId: string): Promise<LoadedImage | null> {
  console.log('[PersistenceService] Loading image:', imageId);

  try {
    const tx = await getTransaction(STORES.IMAGES, 'readonly');
    const store = tx.objectStore(STORES.IMAGES);

    return new Promise((resolve, reject) => {
      const request = store.get(imageId);
      request.onsuccess = () => {
        if (request.result) {
          console.log('[PersistenceService] Image loaded successfully:', imageId);
          resolve({
            imageId: request.result.imageId,
            metadata: request.result.metadata,
            pixelData: request.result.pixelData,
          });
        } else {
          console.log('[PersistenceService] Image not found:', imageId);
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error('[PersistenceService] Failed to load image:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error loading image:', err);
    return null;
  }
}

/**
 * Get all stored image IDs
 */
export async function getAllImageIds(): Promise<string[]> {
  try {
    const tx = await getTransaction(STORES.IMAGES, 'readonly');
    const store = tx.objectStore(STORES.IMAGES);

    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => {
        resolve(request.result as string[]);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error getting image IDs:', err);
    return [];
  }
}

/**
 * Delete an image from IndexedDB
 */
export async function deleteImage(imageId: string): Promise<void> {
  console.log('[PersistenceService] Deleting image:', imageId);

  try {
    const tx = await getTransaction(STORES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORES.IMAGES);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(imageId);
      request.onsuccess = () => {
        console.log('[PersistenceService] Image deleted:', imageId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    // Also delete associated segmentations
    await deleteSegmentationsByImageId(imageId);
  } catch (err) {
    console.error('[PersistenceService] Error deleting image:', err);
  }
}

// ============================================================================
// Segmentation Persistence
// ============================================================================

/**
 * Save a segmentation to IndexedDB
 */
export async function saveSegmentation(segmentation: PersistedSegmentation): Promise<void> {
  console.log('[PersistenceService] Saving segmentation:', segmentation.id);

  try {
    const tx = await getTransaction(STORES.SEGMENTATIONS, 'readwrite');
    const store = tx.objectStore(STORES.SEGMENTATIONS);

    const persistedSeg = {
      ...segmentation,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(persistedSeg);
      request.onsuccess = () => {
        console.log('[PersistenceService] Segmentation saved:', segmentation.id);
        resolve();
      };
      request.onerror = () => {
        console.error('[PersistenceService] Failed to save segmentation:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error saving segmentation:', err);
    throw err;
  }
}

/**
 * Load a segmentation from IndexedDB
 */
export async function loadSegmentation(segmentationId: string): Promise<PersistedSegmentation | null> {
  console.log('[PersistenceService] Loading segmentation:', segmentationId);

  try {
    const tx = await getTransaction(STORES.SEGMENTATIONS, 'readonly');
    const store = tx.objectStore(STORES.SEGMENTATIONS);

    return new Promise((resolve, reject) => {
      const request = store.get(segmentationId);
      request.onsuccess = () => {
        if (request.result) {
          console.log('[PersistenceService] Segmentation loaded:', segmentationId);
          resolve(request.result);
        } else {
          console.log('[PersistenceService] Segmentation not found:', segmentationId);
          resolve(null);
        }
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error loading segmentation:', err);
    return null;
  }
}

/**
 * Get all segmentations for an image
 */
export async function getSegmentationsByImageId(imageId: string): Promise<PersistedSegmentation[]> {
  try {
    const tx = await getTransaction(STORES.SEGMENTATIONS, 'readonly');
    const store = tx.objectStore(STORES.SEGMENTATIONS);
    const index = store.index('imageId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(imageId);
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error getting segmentations:', err);
    return [];
  }
}

/**
 * Delete a segmentation from IndexedDB
 */
export async function deleteSegmentation(segmentationId: string): Promise<void> {
  console.log('[PersistenceService] Deleting segmentation:', segmentationId);

  try {
    const tx = await getTransaction(STORES.SEGMENTATIONS, 'readwrite');
    const store = tx.objectStore(STORES.SEGMENTATIONS);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(segmentationId);
      request.onsuccess = () => {
        console.log('[PersistenceService] Segmentation deleted:', segmentationId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[PersistenceService] Error deleting segmentation:', err);
  }
}

/**
 * Delete all segmentations for an image
 */
async function deleteSegmentationsByImageId(imageId: string): Promise<void> {
  const segmentations = await getSegmentationsByImageId(imageId);
  for (const seg of segmentations) {
    await deleteSegmentation(seg.id);
  }
}

// ============================================================================
// Session Persistence
// ============================================================================

const SESSION_KEY = 'current';

/**
 * Save the current session state
 */
export async function saveSession(session: Omit<PersistedSession, 'timestamp'>): Promise<void> {
  console.log('[PersistenceService] Saving session:', session);

  try {
    const tx = await getTransaction(STORES.SESSION, 'readwrite');
    const store = tx.objectStore(STORES.SESSION);

    const persistedSession = {
      id: SESSION_KEY,
      ...session,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(persistedSession);
      request.onsuccess = () => {
        console.log('[PersistenceService] Session saved');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[PersistenceService] Error saving session:', err);
  }
}

/**
 * Load the current session state
 */
export async function loadSession(): Promise<PersistedSession | null> {
  console.log('[PersistenceService] Loading session');

  try {
    const tx = await getTransaction(STORES.SESSION, 'readonly');
    const store = tx.objectStore(STORES.SESSION);

    return new Promise((resolve, reject) => {
      const request = store.get(SESSION_KEY);
      request.onsuccess = () => {
        if (request.result) {
          console.log('[PersistenceService] Session loaded:', request.result);
          resolve(request.result);
        } else {
          console.log('[PersistenceService] No session found');
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[PersistenceService] Error loading session:', err);
    return null;
  }
}

/**
 * Clear the current session
 */
export async function clearSession(): Promise<void> {
  console.log('[PersistenceService] Clearing session');

  try {
    const tx = await getTransaction(STORES.SESSION, 'readwrite');
    const store = tx.objectStore(STORES.SESSION);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(SESSION_KEY);
      request.onsuccess = () => {
        console.log('[PersistenceService] Session cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[PersistenceService] Error clearing session:', err);
  }
}

// ============================================================================
// Longitudinal Session Persistence
// ============================================================================

/**
 * Save a longitudinal session to IndexedDB
 */
export async function saveLongitudinalSession(session: LongitudinalSession): Promise<void> {
  console.log('[PersistenceService] Saving longitudinal session:', session.id);

  try {
    const tx = await getTransaction(STORES.LONGITUDINAL_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORES.LONGITUDINAL_SESSIONS);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(session);
      request.onsuccess = () => {
        console.log('[PersistenceService] Longitudinal session saved:', session.id);
        resolve();
      };
      request.onerror = () => {
        console.error('[PersistenceService] Failed to save longitudinal session:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error saving longitudinal session:', err);
    throw err;
  }
}

/**
 * Load a longitudinal session from IndexedDB
 */
export async function loadLongitudinalSession(sessionId: string): Promise<LongitudinalSession | null> {
  console.log('[PersistenceService] Loading longitudinal session:', sessionId);

  try {
    const tx = await getTransaction(STORES.LONGITUDINAL_SESSIONS, 'readonly');
    const store = tx.objectStore(STORES.LONGITUDINAL_SESSIONS);

    return new Promise((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => {
        if (request.result) {
          console.log('[PersistenceService] Longitudinal session loaded:', sessionId);
          resolve(request.result);
        } else {
          console.log('[PersistenceService] Longitudinal session not found:', sessionId);
          resolve(null);
        }
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error loading longitudinal session:', err);
    return null;
  }
}

/**
 * Load all longitudinal sessions from IndexedDB
 */
export async function loadAllLongitudinalSessions(): Promise<LongitudinalSession[]> {
  console.log('[PersistenceService] Loading all longitudinal sessions');

  try {
    const tx = await getTransaction(STORES.LONGITUDINAL_SESSIONS, 'readonly');
    const store = tx.objectStore(STORES.LONGITUDINAL_SESSIONS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const sessions = request.result || [];
        console.log('[PersistenceService] Loaded', sessions.length, 'longitudinal sessions');
        resolve(sessions);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error loading all longitudinal sessions:', err);
    return [];
  }
}

/**
 * Get longitudinal sessions for a specific patient
 */
export async function getLongitudinalSessionsByPatient(patientId: string): Promise<LongitudinalSession[]> {
  console.log('[PersistenceService] Getting longitudinal sessions for patient:', patientId);

  try {
    const tx = await getTransaction(STORES.LONGITUDINAL_SESSIONS, 'readonly');
    const store = tx.objectStore(STORES.LONGITUDINAL_SESSIONS);
    const index = store.index('patientId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(patientId);
      request.onsuccess = () => {
        const sessions = request.result || [];
        console.log('[PersistenceService] Found', sessions.length, 'sessions for patient:', patientId);
        resolve(sessions);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[PersistenceService] Error getting sessions for patient:', err);
    return [];
  }
}

/**
 * Delete a longitudinal session from IndexedDB
 */
export async function deleteLongitudinalSession(sessionId: string): Promise<void> {
  console.log('[PersistenceService] Deleting longitudinal session:', sessionId);

  try {
    const tx = await getTransaction(STORES.LONGITUDINAL_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORES.LONGITUDINAL_SESSIONS);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(sessionId);
      request.onsuccess = () => {
        console.log('[PersistenceService] Longitudinal session deleted:', sessionId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[PersistenceService] Error deleting longitudinal session:', err);
  }
}

/**
 * Clear all longitudinal sessions from IndexedDB
 */
export async function clearAllLongitudinalSessions(): Promise<void> {
  console.log('[PersistenceService] Clearing all longitudinal sessions');

  try {
    const tx = await getTransaction(STORES.LONGITUDINAL_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORES.LONGITUDINAL_SESSIONS);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        console.log('[PersistenceService] All longitudinal sessions cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[PersistenceService] Error clearing longitudinal sessions:', err);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear all persisted data
 */
export async function clearAllData(): Promise<void> {
  console.log('[PersistenceService] Clearing all data');

  try {
    const tx = await getTransaction(
      [STORES.IMAGES, STORES.SEGMENTATIONS, STORES.SESSION, STORES.LONGITUDINAL_SESSIONS],
      'readwrite'
    );

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(STORES.IMAGES).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
      new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(STORES.SEGMENTATIONS).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
      new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(STORES.SESSION).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
      new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(STORES.LONGITUDINAL_SESSIONS).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ]);

    console.log('[PersistenceService] All data cleared');
  } catch (err) {
    console.error('[PersistenceService] Error clearing all data:', err);
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Initialize the persistence service (call on app startup)
 */
export async function initPersistence(): Promise<boolean> {
  if (!isIndexedDBAvailable()) {
    console.warn('[PersistenceService] IndexedDB is not available');
    return false;
  }

  try {
    await initDB();
    return true;
  } catch (err) {
    console.error('[PersistenceService] Failed to initialize:', err);
    return false;
  }
}
