/**
 * file_edit tool - Apply diff-based edits to a file using string replacement.
 *
 * Phase 4 Integration:
 * - Uses OPFS cache for reading file content
 * - Writes edited content to OPFS workspace
 * - Supports undo/redo through OPFS workspace
 * - Broadcasts file changes to remote sessions
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { getUndoManager } from '@/undo/undo-manager'

export const fileEditDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_edit',
    description:
      'Apply a text replacement to a file. Finds the exact old_text in the file and replaces it with new_text. The old_text must be unique in the file. Uses cached content if file has pending modifications. Use file_read first to see the current content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root',
        },
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace (must be unique in the file)',
        },
        new_text: {
          type: 'string',
          description: 'The text to replace old_text with',
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
}

export const fileEditExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string
  const oldText = args.old_text as string
  const newText = args.new_text as string

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    // Use OPFS store for cache-first reading (Phase 4 integration)
    const { readFile, writeFile, getPendingChanges } = useOPFSStore.getState()

    // Read file content (will use cache if available)
    const { content } = await readFile(path, context.directoryHandle)

    if (typeof content !== 'string') {
      return JSON.stringify({
        error: `Cannot edit binary file: ${path}. Use file_write to replace the entire file.`,
      })
    }

    const fileContent = content

    // Check that old_text exists and is unique
    const firstIndex = fileContent.indexOf(oldText)
    if (firstIndex === -1) {
      return JSON.stringify({
        error: `old_text not found in file. Make sure you have the exact text including whitespace and indentation.`,
      })
    }

    const secondIndex = fileContent.indexOf(oldText, firstIndex + 1)
    if (secondIndex !== -1) {
      return JSON.stringify({
        error: `old_text appears multiple times in the file. Provide a larger, more unique text snippet to match.`,
      })
    }

    // Apply replacement
    const newContent = fileContent.replace(oldText, newText)

    // Write edited content to OPFS workspace
    await writeFile(path, newContent, context.directoryHandle)

    // Get current pending count for status message
    const pendingChanges = getPendingChanges()

    // Record modification for legacy undo manager (backward compatibility)
    getUndoManager().recordModification(path, 'modify', fileContent, newContent)

    // Broadcast file change to remote sessions
    const session = useRemoteStore.getState().session
    if (session) {
      const preview = `Edited: ${path} (${newText.length} chars added, ${oldText.length} chars removed)`
      session.broadcastFileChange(path, 'modify', preview)
    }

    return JSON.stringify({
      success: true,
      path,
      action: 'edited',
      status: 'pending',
      pendingCount: pendingChanges.length,
      message: `File "${path}" edited. ${pendingChanges.length} file(s) pending sync.`,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${path}` })
    }
    return JSON.stringify({
      error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
