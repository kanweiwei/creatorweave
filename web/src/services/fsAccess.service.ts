/**
 * Check if File System Access API is supported
 * @returns true if supported, false otherwise
 */
export function isSupported(): boolean {
  return 'showDirectoryPicker' in window
}

/**
 * Select a folder using File System Access API and save the handle
 * @param saveHandle Whether to save the handle for future use (requires user permission)
 * @returns FileSystemDirectoryHandle
 * @throws Error if API is not supported or user cancels
 */
export async function selectFolder(saveHandle: boolean = true): Promise<FileSystemDirectoryHandle> {
  if (!isSupported()) {
    throw new Error('File System Access API is not supported')
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'read',
      id: 'bfosa-folder', // Persistent identifier
    })

    if (saveHandle) {
      const { saveDirectoryHandle } = await import('./handle-storage.service')
      // Try to save the handle with persistent permission
      try {
        await saveDirectoryHandle(handle, handle.name || 'Selected Folder')
        console.log('[fsAccess] Handle saved with persistent permission')
      } catch (error) {
        console.warn('[fsAccess] Could not save handle with persistent permission:', error)
        // Still return the handle for this session
      }
    }

    return handle
  } catch (error) {
    // Handle user cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('User cancelled')
    }
    throw error
  }
}

/**
 * Select a folder using a saved handle (if available)
 * @returns FileSystemDirectoryHandle or null
 */
export async function selectFolderOrUseSaved(): Promise<FileSystemDirectoryHandle | null> {
  const { loadDirectoryHandle, hasSavedHandle } = await import('./handle-storage.service')

  // Check if we have a saved handle
  if (await hasSavedHandle()) {
    const saved = await loadDirectoryHandle()
    if (saved) {
      // Verify the handle is still accessible
      try {
        // Try to access the handle to verify it's still valid
        for await (const _entry of saved.handle.values()) {
          // Just checking if we can iterate
          break
        }
        console.log('[fsAccess] Using saved handle:', saved.path)
        return saved.handle
      } catch (error) {
        console.warn('[fsAccess] Saved handle is no longer accessible:', error)
        await import('./handle-storage.service').then((m) => m.clearDirectoryHandle())
      }
    }
  }

  // No saved handle or handle is invalid, select new folder
  return selectFolder(true)
}
