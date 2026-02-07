/**
 * glob tool - Search for files matching a glob pattern.
 * Uses traversal.service + micromatch for pattern matching.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { traverseDirectory } from '@/services/traversal.service'
import micromatch from 'micromatch'

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
      },
      required: ['pattern'],
    },
  },
}

export const globExecutor: ToolExecutor = async (args, context) => {
  const pattern = args.pattern as string
  const subPath = (args.path as string) || ''

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  try {
    let searchHandle = context.directoryHandle
    if (subPath) {
      const parts = subPath.split('/').filter(Boolean)
      for (const part of parts) {
        searchHandle = await searchHandle.getDirectoryHandle(part)
      }
    }

    const matches: string[] = []
    const MAX_RESULTS = 200

    for await (const entry of traverseDirectory(searchHandle)) {
      if (entry.type !== 'file') continue
      const entryPath = subPath ? `${subPath}/${entry.path}` : entry.path
      if (micromatch.isMatch(entryPath, pattern) || micromatch.isMatch(entry.path, pattern)) {
        matches.push(entryPath)
        if (matches.length >= MAX_RESULTS) break
      }
    }

    if (matches.length === 0) {
      return `No files matching pattern "${pattern}"${subPath ? ` in ${subPath}` : ''}`
    }

    const truncated =
      matches.length >= MAX_RESULTS ? `\n... (limited to ${MAX_RESULTS} results)` : ''
    return matches.join('\n') + truncated
  } catch (error) {
    return JSON.stringify({
      error: `Glob search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
