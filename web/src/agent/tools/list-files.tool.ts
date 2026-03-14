/**
 * list_files tool - List directory contents in tree format.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import {
  normalizeSubPath,
  parseBoundedInt,
  parseStringList,
  readDirectoryEntriesSorted,
  resolveDirectoryHandle,
  shouldSkipDirectory,
} from './file-discovery.helpers'

export const listFilesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_files',
    description:
      'List files and directories in a tree format. Useful for understanding project layout. File sizes are optional for faster scans.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Subdirectory to list (default: project root)',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 2)',
        },
        maxDepth: {
          type: 'number',
          description: 'Alias of max_depth',
        },
        max_entries: {
          type: 'number',
          description: 'Maximum entries to return (default: 200)',
        },
        maxEntries: {
          type: 'number',
          description: 'Alias of max_entries',
        },
        include_sizes: {
          type: 'boolean',
          description: 'Include file sizes (default: false for faster scans)',
        },
        includeSizes: {
          type: 'boolean',
          description: 'Alias of include_sizes',
        },
        include_ignored: {
          type: 'boolean',
          description: 'Include large ignored directories like node_modules/.git (default: false)',
        },
        includeIgnored: {
          type: 'boolean',
          description: 'Alias of include_ignored',
        },
        exclude_dirs: {
          type: 'array',
          description: 'Extra directory names to skip while traversing',
          items: { type: 'string' },
        },
        excludeDirs: {
          type: 'array',
          description: 'Alias of exclude_dirs',
          items: { type: 'string' },
        },
        deadline_ms: {
          type: 'number',
          description: 'Soft time budget in milliseconds (default: 25000)',
        },
        deadlineMs: {
          type: 'number',
          description: 'Alias of deadline_ms',
        },
      },
    },
  },
}

function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export const listFilesExecutor: ToolExecutor = async (args, context) => {
  const abortSignal = context.abortSignal
  let subPath = ''
  try {
    subPath = normalizeSubPath(args.path)
  } catch {
    return JSON.stringify({ error: 'List failed: path cannot include ".."' })
  }

  const rawMaxDepth = args.max_depth ?? args.maxDepth
  const maxDepth = parseBoundedInt(rawMaxDepth, 2, 1, 10)
  const maxEntries = parseBoundedInt(args.max_entries ?? args.maxEntries, 200, 20, 2000)
  const deadlineMs = parseBoundedInt(args.deadline_ms ?? args.deadlineMs, 25000, 1000, 28000)
  const includeSizes = args.include_sizes === true || args.includeSizes === true
  const includeIgnored = args.include_ignored === true || args.includeIgnored === true
  const extraExcludes = parseStringList(args.exclude_dirs ?? args.excludeDirs)

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  try {
    const { handle: searchHandle } = await resolveDirectoryHandle(context.directoryHandle, subPath)
    const startedAt = Date.now()
    const deadlineAt = startedAt + deadlineMs
    const entries: Array<{ path: string; type: 'file' | 'directory'; size: number; depth: number }> = []
    const queue: Array<{ handle: FileSystemDirectoryHandle; path: string; depth: number }> = [
      { handle: searchHandle, path: '', depth: 0 },
    ]

    let isTruncated = false
    let timedOut = false

    while (queue.length > 0) {
      if (abortSignal?.aborted) {
        return JSON.stringify({ error: 'List failed: operation aborted' })
      }
      const current = queue.shift()!
      if (Date.now() > deadlineAt) {
        timedOut = true
        break
      }

      const handles = await readDirectoryEntriesSorted(current.handle)
      for (const handle of handles) {
        if (abortSignal?.aborted) {
          return JSON.stringify({ error: 'List failed: operation aborted' })
        }
        if (Date.now() > deadlineAt) {
          timedOut = true
          break
        }

        const childDepth = current.depth + 1
        if (childDepth > maxDepth) continue

        const relPath = current.path ? `${current.path}/${handle.name}` : handle.name
        if (handle.kind === 'directory') {
          if (shouldSkipDirectory(handle.name, includeIgnored, extraExcludes)) continue
          entries.push({ path: relPath, type: 'directory', size: 0, depth: childDepth })
          queue.push({
            handle: handle as FileSystemDirectoryHandle,
            path: relPath,
            depth: childDepth,
          })
        } else {
          let size = 0
          if (includeSizes) {
            try {
              if (abortSignal?.aborted) {
                return JSON.stringify({ error: 'List failed: operation aborted' })
              }
              const file = await (handle as FileSystemFileHandle).getFile()
              size = file.size
            } catch {
              size = 0
            }
          }
          entries.push({ path: relPath, type: 'file', size, depth: childDepth })
        }

        if (entries.length >= maxEntries) {
          isTruncated = true
          break
        }
      }
      if (isTruncated || timedOut) break
    }

    if (entries.length === 0) {
      return subPath ? `Directory "${subPath}" is empty` : 'Project directory is empty'
    }

    // Build tree output
    const lines: string[] = []

    for (const entry of entries) {
      const indent = '  '.repeat(entry.depth)
      const name = entry.path.split('/').pop() || entry.path
      if (entry.type === 'directory') {
        lines.push(`${indent}${name}/`)
      } else {
        const size = formatSize(entry.size)
        lines.push(`${indent}${name}${size ? ` (${size})` : ''}`)
      }
    }

    const suffixes: string[] = []
    if (isTruncated) {
      suffixes.push(`... (limited to ${maxEntries} entries)`)
    }
    if (timedOut) {
      suffixes.push(`... (scan budget reached at ${Date.now() - startedAt}ms)`)
    }
    return lines.join('\n') + (suffixes.length > 0 ? `\n${suffixes.join('\n')}` : '')
  } catch (error) {
    return JSON.stringify({
      error: `List failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
