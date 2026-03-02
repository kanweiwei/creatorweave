/**
 * Agent store - manages global agent configuration.
 * Runtime status is now managed per-conversation in conversation.store.
 *
 * Directory handle is persisted in IndexedDB (supports structured clone).
 * On page reload, the handle is restored and permission is re-requested.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'

const DIR_HANDLE_DB = 'bfosa-dir-handle'
const DIR_HANDLE_STORE = 'handles'
const LEGACY_DIR_HANDLE_KEY = 'directory'

function getProjectHandleKey(projectId: string): string {
  return `directory:${projectId}`
}

interface AgentState {
  /** Active project ID for directory handle scoping */
  activeProjectId: string
  /** Directory handle for file operations */
  directoryHandle: FileSystemDirectoryHandle | null
  /** Directory name for display */
  directoryName: string | null
  /** Whether handle restoration is in progress */
  isRestoringHandle: boolean
  /** Handle that needs user activation to restore permissions */
  pendingHandle: FileSystemDirectoryHandle | null

  // Actions
  setActiveProject: (projectId: string) => Promise<void>
  setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
  restoreDirectoryHandle: () => Promise<void>
  /** Request permission for pending handle (must be called from user activation) */
  requestPendingHandlePermission: () => Promise<boolean>
}

/** Open the dedicated IndexedDB for directory handle storage */
async function withHandleDB<T>(callback: (db: IDBDatabase) => T | Promise<T>): Promise<T> {
  const request = indexedDB.open(DIR_HANDLE_DB, 1)
  return new Promise<T>((resolve, reject) => {
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE)
      }
    }
    request.onsuccess = async () => {
      const db = request.result
      try {
        const result = await callback(db)
        db.close() // Always close the connection after use
        resolve(result)
      } catch (error) {
        db.close()
        reject(error)
      }
    }
    request.onerror = () => reject(request.error)
  })
}

/** Persist a directory handle to IndexedDB */
async function persistHandle(
  projectId: string,
  handle: FileSystemDirectoryHandle | null
): Promise<void> {
  return withHandleDB((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readwrite')
      const store = tx.objectStore(DIR_HANDLE_STORE)
      const key = getProjectHandleKey(projectId)
      if (handle) {
        store.put(handle, key)
      } else {
        store.delete(key)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  })
}

/** Load a directory handle from IndexedDB */
async function loadHandle(projectId: string): Promise<FileSystemDirectoryHandle | null> {
  return withHandleDB((db) => {
    return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readonly')
      const store = tx.objectStore(DIR_HANDLE_STORE)
      const req = store.get(getProjectHandleKey(projectId))
      req.onsuccess = () => {
        const scopedHandle = req.result as FileSystemDirectoryHandle | null
        if (scopedHandle) {
          resolve(scopedHandle)
          return
        }

        // Backward compatibility: fall back to legacy global key.
        if (!projectId) {
          const legacyReq = store.get(LEGACY_DIR_HANDLE_KEY)
          legacyReq.onsuccess = () => resolve((legacyReq.result as FileSystemDirectoryHandle) || null)
          legacyReq.onerror = () => reject(legacyReq.error)
          return
        }

        resolve(null)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Verify and re-request readwrite permission on a restored handle */
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if ((await handle.requestPermission(opts)) === 'granted') return true
  return false
}

export const useAgentStore = create<AgentState>()(
  immer((set, get) => ({
    activeProjectId: '',
    directoryHandle: null,
    directoryName: null,
    isRestoringHandle: false,
    pendingHandle: null,

    setActiveProject: async (projectId) => {
      set((state) => {
        state.activeProjectId = projectId
        state.directoryHandle = null
        state.directoryName = null
        state.pendingHandle = null
      })
      if (!projectId) {
        return
      }
      await get().restoreDirectoryHandle()
    },

    setDirectoryHandle: (handle) => {
      const { activeProjectId } = get()
      if (!activeProjectId) {
        toast.error('请先进入一个项目，再绑定文件夹')
        return
      }
      set((state) => {
        state.directoryHandle = handle
        state.pendingHandle = null // Clear pending handle when setting new handle
        // Treat empty string as null (some browsers return empty name)
        state.directoryName = handle?.name && handle.name.trim() ? handle.name : null
      })
      persistHandle(activeProjectId, handle).catch((error) => {
        console.error('[AgentStore] Failed to persist directory handle:', error)
        toast.error('文件夹选择保存失败，刷新后可能需要重新选择')
      })

      // Notify remote session of directory change
      if (handle) {
        // Trigger async file tree rebuild and broadcast to remotes
        import('./remote.store').then(({ useRemoteStore }) => {
          const remoteStore = useRemoteStore.getState()
          if (remoteStore.session && remoteStore.getRole() === 'host') {
            remoteStore.refreshFileTree().catch((err) => {
              console.error('[AgentStore] Failed to refresh file tree:', err)
            })
          }
        })
      }
    },

    restoreDirectoryHandle: async () => {
      set((state) => {
        state.isRestoringHandle = true
      })

      try {
        console.log('[AgentStore] Starting directory handle restoration...')
        const { activeProjectId } = get()
        if (!activeProjectId) {
          return
        }
        const handle = await loadHandle(activeProjectId)

        if (!handle) {
          console.log(
            '[AgentStore] No saved directory handle found in IndexedDB for project:',
            activeProjectId
          )
          return
        }

        console.log('[AgentStore] Found saved handle, checking permissions...')
        const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
        const permission = await handle.queryPermission(opts)

        if (permission === 'granted') {
          console.log('[AgentStore] Permission already granted, restoring handle:', handle.name)
          set((state) => {
            state.directoryHandle = handle
            state.directoryName = handle.name && handle.name.trim() ? handle.name : null
            state.pendingHandle = null
          })
        } else if (permission === 'prompt') {
          // Permission is in prompt state - try to request immediately
          // This will only work if called during user activation, otherwise it will fail with SecurityError
          console.log('[AgentStore] Permission is prompt, requesting...')
          try {
            const result = await handle.requestPermission(opts)
            if (result === 'granted') {
              console.log('[AgentStore] Permission granted, restoring handle:', handle.name)
              set((state) => {
                state.directoryHandle = handle
                state.directoryName = handle.name && handle.name.trim() ? handle.name : null
                state.pendingHandle = null
              })
            } else {
              console.warn('[AgentStore] Permission denied after request')
              throw new Error('Permission denied')
            }
          } catch (err) {
            // SecurityError: User activation required - save as pending
            if (err instanceof Error && err.name === 'SecurityError') {
              console.log(
                '[AgentStore] User activation required, saving as pending handle:',
                handle.name
              )
              set((state) => {
                state.pendingHandle = handle
              })
              toast.info('点击下方按钮恢复文件夹访问权限', {
                action: {
                  label: '恢复',
                  onClick: () => {
                    const store = useAgentStore.getState()
                    store.requestPendingHandlePermission()
                  },
                },
              })
            } else {
              throw err
            }
          }
        } else {
          // Permission denied
          console.warn('[AgentStore] Permission denied for handle:', handle.name)
          toast.info('文件夹权限已过期，请重新选择文件夹')
          await persistHandle(activeProjectId, null)
        }
      } catch (error) {
        // Handle missing or permission denied — log for debugging
        console.error('[AgentStore] Failed to restore directory handle:', error)
        // Check if it's a specific error type
        if (error instanceof Error) {
          if (error.name === 'NotFoundError') {
            console.log('[AgentStore] Handle not found in IndexedDB (may have been cleared)')
          } else if (error.name === 'SecurityError' || error.message.includes('User activation')) {
            console.log('[AgentStore] User activation required for permission request')
            // This is expected - handle will be in IndexedDB, user needs to click to restore
          } else if (error.message.includes('permission') || error.message.includes('Permission')) {
            console.log('[AgentStore] Permission error during restoration')
          } else {
            console.error('[AgentStore] Unexpected error:', error.message)
          }
        }
      } finally {
        set((state) => {
          state.isRestoringHandle = false
        })
      }
    },

    requestPendingHandlePermission: async () => {
      const state = useAgentStore.getState()
      const handle = state.pendingHandle
      const projectId = state.activeProjectId

      if (!handle) {
        console.warn('[AgentStore] No pending handle to request permission for')
        return false
      }

      try {
        console.log('[AgentStore] Requesting permission for pending handle:', handle.name)
        const granted = await verifyPermission(handle)

        if (granted) {
          console.log('[AgentStore] Permission granted, restoring handle:', handle.name)
          set((state) => {
            state.directoryHandle = handle
            state.directoryName = handle.name && handle.name.trim() ? handle.name : null
            state.pendingHandle = null
          })
          toast.success('文件夹权限已恢复')
          return true
        } else {
          console.warn('[AgentStore] Permission denied for handle:', handle.name)
          toast.error('文件夹权限被拒绝，请重新选择文件夹')
          // Clear the pending handle
          set((state) => {
            state.pendingHandle = null
          })
          await persistHandle(projectId, null)
          return false
        }
      } catch (error) {
        console.error('[AgentStore] Failed to request permission for pending handle:', error)
        toast.error(
          '恢复文件夹权限失败: ' + (error instanceof Error ? error.message : String(error))
        )
        return false
      }
    },
  }))
)

// ============================================================================
// GLOBAL DIAGNOSTIC FUNCTIONS - For debugging handle persistence issues
// ============================================================================

declare global {
  interface Window {
    /** List all IndexedDB databases (helps detect duplicates) */
    __listAllIndexedDB: () => Promise<{
      databases: Array<{ name: string; version: number }>
      duplicates: Record<string, number> // name -> count
      error?: string
    }>
    /** Delete a specific IndexedDB database by name */
    __deleteIndexedDB: (name: string) => Promise<{
      success: boolean
      error?: string
    }>
    /** Check if directory handle exists in IndexedDB */
    __checkHandleInIndexedDB: () => Promise<{
      exists: boolean
      handleName: string | null
      error?: string
    }>
    /** Manually clear the directory handle from IndexedDB */
    __clearHandleFromIndexedDB: () => Promise<{
      success: boolean
      error?: string
    }>
    /** Get current directory handle state from store */
    __getHandleState: () => {
      handle: FileSystemDirectoryHandle | null
      name: string | null
      isRestoring: boolean
      pendingHandleName: string | null
    }
  }
}

/**
 * List all IndexedDB databases
 * This helps detect duplicate databases that might cause confusion
 * Usage: await window.__listAllIndexedDB()
 */
window.__listAllIndexedDB = async () => {
  try {
    // @ts-ignore - indexedDB.databases() is supported in modern browsers
    const databases = await indexedDB.databases()

    // Count duplicates
    const nameCount: Record<string, number> = {}
    databases.forEach((db) => {
      if (db?.name) {
        nameCount[db.name] = (nameCount[db.name] || 0) + 1
      }
    })

    // Find duplicates
    const duplicates: Record<string, number> = {}
    for (const [name, count] of Object.entries(nameCount)) {
      if (count > 1) {
        duplicates[name] = count
      }
    }

    return {
      databases: databases.map((db) => ({
        name: db?.name || '(unnamed)',
        version: db?.version || 0,
      })),
      duplicates,
    }
  } catch (error) {
    return {
      databases: [],
      duplicates: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Delete a specific IndexedDB database by name
 * WARNING: This will permanently delete the database and all its data
 * Usage: await window.__deleteIndexedDB('bfosa-dir-handle')
 */
window.__deleteIndexedDB = async (name: string) => {
  try {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve({ success: true })
      req.onerror = () => resolve({ success: false, error: req.error?.message || 'Unknown error' })
      req.onblocked = () => {
        console.warn(`[IndexedDB] Delete blocked for ${name} - database is in use`)
        resolve({ success: false, error: 'Database is in use by another tab' })
      }
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check if directory handle exists in IndexedDB
 * Usage: await window.__checkHandleInIndexedDB()
 */
window.__checkHandleInIndexedDB = async () => {
  try {
    const projectId = useAgentStore.getState().activeProjectId
    return await withHandleDB((db) => {
      return new Promise<{ exists: boolean; handleName: string | null }>((resolve, reject) => {
        const tx = db.transaction(DIR_HANDLE_STORE, 'readonly')
        const store = tx.objectStore(DIR_HANDLE_STORE)
        const req = store.get(getProjectHandleKey(projectId))
        req.onsuccess = () => {
          const handle = req.result as FileSystemDirectoryHandle | null
          if (handle) {
            resolve({
              exists: true,
              handleName: handle.name || null,
            })
            return
          }
          const legacyReq = store.get(LEGACY_DIR_HANDLE_KEY)
          legacyReq.onsuccess = () => {
            const legacy = legacyReq.result as FileSystemDirectoryHandle | null
            resolve({
              exists: legacy !== null && legacy !== undefined,
              handleName: legacy?.name || null,
            })
          }
          legacyReq.onerror = () => reject(legacyReq.error)
        }
        req.onerror = () => reject(req.error)
      })
    })
  } catch (error) {
    return {
      exists: false,
      handleName: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Manually clear the directory handle from IndexedDB
 * Useful for testing or when handle becomes stale
 * Usage: await window.__clearHandleFromIndexedDB()
 */
window.__clearHandleFromIndexedDB = async () => {
  try {
    const { activeProjectId } = useAgentStore.getState()
    await persistHandle(activeProjectId, null)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Get current directory handle state from store
 * Usage: window.__getHandleState()
 */
window.__getHandleState = () => {
  const state = useAgentStore.getState()
  return {
    handle: state.directoryHandle,
    name: state.directoryName,
    isRestoring: state.isRestoringHandle,
    pendingHandleName: state.pendingHandle?.name || null,
  }
}
