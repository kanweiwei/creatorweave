/**
 * glob tool - Search for files matching a glob pattern.
 * Uses iterative traversal + micromatch with traversal pruning.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import micromatch from 'micromatch'
import {
  getStaticGlobPrefix,
  normalizeSubPath,
  parseBoundedInt,
  parseStringList,
  readDirectoryEntriesSorted,
  resolveDirectoryHandle,
  shouldSkipDirectory,
} from './file-discovery.helpers'

export const globDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob',
    description:
      'Search for files by pattern. Use this FIRST when user mentions filenames or file types.' +
      '\n\nExamples:' +
      '\n- "find sales.csv" → glob(pattern="**/*sales*.csv")' +
      '\n- "all CSV files" → glob(pattern="**/*.csv")' +
      '\n- "TypeScript files in src" → glob(pattern="src/**/*.ts")' +
      '\n- "all test files" → glob(pattern="**/*.test.*")' +
      '\n- "Excel files" → glob(pattern="**/*.xlsx")',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g. "**/*.csv", "**/*sales*", "src/**/*.tsx")',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search in (default: project root)',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matches to return (default: 200)',
        },
        maxResults: {
          type: 'number',
          description: 'Alias of max_results',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum directory depth to traverse from search root (default: 20)',
        },
        maxDepth: {
          type: 'number',
          description: 'Alias of max_depth',
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
      required: ['pattern'],
    },
  },
}

export const globExecutor: ToolExecutor = async (args, context) => {
  const abortSignal = context.abortSignal
  const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : ''
  if (!pattern) {
    return JSON.stringify({ error: 'Glob search failed: pattern is required' })
  }

  let subPath = ''
  try {
    subPath = normalizeSubPath(args.path)
  } catch {
    return JSON.stringify({ error: 'Glob search failed: path cannot include ".."' })
  }

  const maxResults = parseBoundedInt(args.max_results ?? args.maxResults, 200, 1, 5000)
  const maxDepth = parseBoundedInt(args.max_depth ?? args.maxDepth, 20, 1, 64)
  const deadlineMs = parseBoundedInt(args.deadline_ms ?? args.deadlineMs, 25000, 1000, 28000)
  const includeIgnored = args.include_ignored === true || args.includeIgnored === true
  const extraExcludes = parseStringList(args.exclude_dirs ?? args.excludeDirs)

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  try {
    const staticPrefix = subPath ? '' : getStaticGlobPrefix(pattern)
    const effectiveRoot = subPath || staticPrefix
    const { handle: searchHandle, exists } = await resolveDirectoryHandle(
      context.directoryHandle,
      effectiveRoot,
      { allowMissing: !subPath && !!staticPrefix }
    )
    if (!exists) {
      return `No files matching pattern "${pattern}"`
    }

    const startedAt = Date.now()
    const deadlineAt = startedAt + deadlineMs
    const matches: string[] = []
    const stack: Array<{ handle: FileSystemDirectoryHandle; fullPath: string; localPath: string; depth: number }> =
      [{ handle: searchHandle, fullPath: effectiveRoot, localPath: '', depth: 0 }]
    let isTruncated = false
    let timedOut = false

    while (stack.length > 0) {
      if (abortSignal?.aborted) {
        return JSON.stringify({ error: 'Glob search failed: operation aborted' })
      }
      const current = stack.pop()!
      if (Date.now() > deadlineAt) {
        timedOut = true
        break
      }

      const handles = await readDirectoryEntriesSorted(current.handle)
      for (const handle of handles) {
        if (abortSignal?.aborted) {
          return JSON.stringify({ error: 'Glob search failed: operation aborted' })
        }
        if (Date.now() > deadlineAt) {
          timedOut = true
          break
        }

        const nextDepth = current.depth + 1
        if (nextDepth > maxDepth) continue

        const fullPath = current.fullPath ? `${current.fullPath}/${handle.name}` : handle.name
        const localPath = current.localPath ? `${current.localPath}/${handle.name}` : handle.name

        if (handle.kind === 'directory') {
          if (shouldSkipDirectory(handle.name, includeIgnored, extraExcludes)) continue
          stack.push({
            handle: handle as FileSystemDirectoryHandle,
            fullPath,
            localPath,
            depth: nextDepth,
          })
          continue
        }

        if (micromatch.isMatch(fullPath, pattern) || micromatch.isMatch(localPath, pattern)) {
          matches.push(fullPath)
          if (matches.length >= maxResults) {
            isTruncated = true
            break
          }
        }
      }
      if (isTruncated || timedOut) break
    }

    if (matches.length === 0) {
      return `No files matching pattern "${pattern}"${subPath ? ` in ${subPath}` : ''}`
    }

    const suffixes: string[] = []
    if (isTruncated) {
      suffixes.push(`... (limited to ${maxResults} results)`)
    }
    if (timedOut) {
      suffixes.push(`... (scan budget reached at ${Date.now() - startedAt}ms)`)
    }
    return matches.join('\n') + (suffixes.length > 0 ? `\n${suffixes.join('\n')}` : '')
  } catch (error) {
    return JSON.stringify({
      error: `Glob search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
