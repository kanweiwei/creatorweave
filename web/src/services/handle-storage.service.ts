/**
 * File System Handle Storage
 *
 * Manages persistence of directory handles using IndexedDB
 * via the File System Access API.
 */

const DB_NAME = 'BFOSA_FS_HANDLE_DB'
const DB_VERSION = 1
const STORE_NAME = 'directory_handles'

export interface StoredHandle {
  id: string
  handle: FileSystemDirectoryHandle
  lastAccessed: number
  path: string // For display purposes
}

/**
 * Initialize the IndexedDB database
 */
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result as IDBDatabase
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

/**
 * Save a directory handle to IndexedDB
 */
export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  path: string
): Promise<void> {
  try {
    // Request persistent permission to access the directory
    // This allows the handle to be used across sessions
    const permission = await (handle as any).requestPermission({ mode: 'read' })

    if (permission !== 'granted') {
      console.warn('[HandleStorage] Persistent permission not granted')
      throw new Error('Persistent permission was not granted')
    }

    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    // Store the handle with metadata
    await store.put({
      id: 'last-selected-folder',
      handle,
      lastAccessed: Date.now(),
      path,
    })

    console.log('[HandleStorage] Directory handle saved:', path)
  } catch (error) {
    console.error('[HandleStorage] Failed to save handle:', error)
    throw error
  }
}

/**
 * Load the last saved directory handle from IndexedDB
 */
export async function loadDirectoryHandle(): Promise<StoredHandle | null> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get('last-selected-folder')

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result as StoredHandle | undefined
        if (result) {
          console.log('[HandleStorage] Directory handle loaded:', result.path)
        } else {
          console.log('[HandleStorage] No saved handle found')
        }
        resolve(result || null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[HandleStorage] Failed to load handle:', error)
    return null
  }
}

/**
 * Clear the saved directory handle
 */
export async function clearDirectoryHandle(): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    await tx.objectStore(STORE_NAME).delete('last-selected-folder')
    console.log('[HandleStorage] Directory handle cleared')
  } catch (error) {
    console.error('[HandleStorage] Failed to clear handle:', error)
  }
}

/**
 * Check if a saved handle exists
 */
export async function hasSavedHandle(): Promise<boolean> {
  try {
    const db = await initDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.count('last-selected-folder')

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result > 0)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[HandleStorage] Failed to check handle:', error)
    return false
  }
}
