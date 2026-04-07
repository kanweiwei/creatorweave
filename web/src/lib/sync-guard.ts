/**
 * Client-side utilities for the sync-guard Vite plugin.
 *
 * Call pauseHmr(paths) before writing files to disk, resumeHmr(paths) after.
 * In production these are no-ops.
 */

const SYNC_GUARD_URL = '/__sync_guard'

/**
 * Pause Vite file watching for specified paths.
 * Call before writing files to disk.
 *
 * @param paths - Array of file/directory paths that will be written
 */
export async function pauseHmr(paths: string[]): Promise<void> {
  if (!import.meta.env.DEV) return
  if (paths.length === 0) return

  try {
    await fetch(SYNC_GUARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause', paths }),
    })
  } catch {
    // Silently ignore — plugin may not be available
  }
}

/**
 * Resume Vite file watching for specified paths.
 * Call after writing files to disk completes.
 *
 * @param paths - Array of file/directory paths that were written
 */
export async function resumeHmr(paths: string[]): Promise<void> {
  if (!import.meta.env.DEV) return
  if (paths.length === 0) return

  try {
    await fetch(SYNC_GUARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume', paths }),
    })
  } catch {
    // Silently ignore
  }
}
