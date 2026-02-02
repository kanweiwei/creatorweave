/**
 * file_read tool - Read file contents from the user's local filesystem.
 *
 * Phase 4 Integration:
 * - Uses OPFS cache-first reading for better performance
 * - Returns cached content if file has pending modifications
 * - Falls back to filesystem if no cache exists
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'

export const fileReadDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_read',
    description:
      'Read the contents of a file at the given path. Returns the file text content. Uses cached version if the file has pending modifications. Use this to understand existing code before making changes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root (e.g. "src/index.ts")',
        },
      },
      required: ['path'],
    },
  },
}

export const fileReadExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string
  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    // Use OPFS store for cache-first reading (Phase 4 integration)
    const { readFile } = useOPFSStore.getState()

    // Read from OPFS (will use cache if available, otherwise read from filesystem)
    const { content, metadata } = await readFile(path, context.directoryHandle)

    // Check file size - limit to 1MB for text reading
    if (metadata.size > 1024 * 1024) {
      return JSON.stringify({
        error: `File is too large (${(metadata.size / 1024 / 1024).toFixed(1)}MB). Maximum readable size is 1MB.`,
      })
    }

    // Return content
    if (typeof content === 'string') {
      return content
    } else {
      // Binary content - return as base64
      const buffer = content instanceof ArrayBuffer ? content : await content.arrayBuffer()
      return JSON.stringify({
        binary: true,
        content: Buffer.from(buffer).toString('base64'),
        size: metadata.size,
        contentType: metadata.contentType,
      })
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${path}` })
    }
    return JSON.stringify({
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
