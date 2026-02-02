/**
 * sync_to_disk tool - Sync pending file changes to the real filesystem.
 *
 * Phase 4 Integration:
 * - Syncs all pending changes from OPFS cache to disk
 * - Returns sync result with success/failed/skipped counts
 * - Provides conflict information if any
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'

export const fileSyncDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'sync_to_disk',
    description:
      'Sync all pending file changes from OPFS cache to the real filesystem. This writes all modified, created, and deleted files to disk. Returns sync result with counts of successful, failed, and skipped operations.',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description:
            'Set to true to confirm the sync operation. This is a safety measure to prevent accidental overwrites.',
        },
      },
      required: ['confirm'],
    },
  },
}

export const fileSyncExecutor: ToolExecutor = async (args, context) => {
  const confirm = args.confirm as boolean

  if (!confirm) {
    return JSON.stringify({
      error: 'Sync not confirmed. Set confirm to true to proceed with syncing changes to disk.',
      message: 'This will write all pending changes to the real filesystem.',
    })
  }

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    const { syncPendingChanges, getPendingChanges } = useOPFSStore.getState()

    // Get pending changes before sync
    const pendingBefore = getPendingChanges()

    if (pendingBefore.length === 0) {
      return JSON.stringify({
        success: true,
        message: 'No pending changes to sync.',
        result: {
          success: 0,
          failed: 0,
          skipped: 0,
          conflicts: [],
        },
      })
    }

    // Perform sync
    const result = await syncPendingChanges(context.directoryHandle)

    // Get remaining pending changes
    const pendingAfter = getPendingChanges()

    return JSON.stringify({
      success: true,
      result: {
        success: result.success,
        failed: result.failed,
        skipped: result.skipped,
        conflicts: result.conflicts || [],
      },
      pendingBefore: pendingBefore.length,
      pendingAfter: pendingAfter.length,
      message: `Sync complete: ${result.success} succeeded, ${result.failed} failed, ${result.skipped} skipped.`,
      details:
        result.failed > 0
          ? 'Some files failed to sync. Check the conflicts array for details.'
          : 'All pending changes synced successfully.',
    })
  } catch (error) {
    return JSON.stringify({
      error: `Failed to sync changes: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
