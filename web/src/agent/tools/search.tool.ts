import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getActiveWorkspace } from '@/store/workspace.store'
import { getSearchWorkerManager } from '@/workers/search-worker-manager'

function looksRegexLikeQuery(query: string): boolean {
  // Guard against common LLM misuse where regex operators are passed while regex=false.
  return query.includes('|') || query.includes('.*')
}

export const searchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search',
    description:
      'Search keyword/pattern in file contents and return matched file/line locations. ' +
      'Use this before read() when you need to locate relevant code or text quickly.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Required search query (use mode="literal" for plain text or mode="regex" for patterns).',
        },
        path: {
          type: 'string',
          description: 'Optional subdirectory path to search within.',
        },
        glob: {
          type: 'string',
          description: 'Optional file filter glob (example: "**/*.{ts,tsx}").',
        },
        mode: {
          type: 'string',
          enum: ['literal', 'regex'],
          description: 'Search mode: "literal" for plain text, "regex" for regular expressions.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Case-sensitive matching. Default false.',
        },
        whole_word: {
          type: 'boolean',
          description: 'Match whole word only. Default false.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum matches to return. Default 200.',
        },
        context_lines: {
          type: 'number',
          description: 'Context lines before/after matched line in preview. Default 0.',
        },
        deadline_ms: {
          type: 'number',
          description: 'Search time budget in milliseconds. Default 25000.',
        },
        max_file_size: {
          type: 'number',
          description: 'Skip files larger than this byte size. Default 1MB.',
        },
        include_ignored: {
          type: 'boolean',
          description: 'Include ignored directories like node_modules/.git. Default false.',
        },
        exclude_dirs: {
          type: 'array',
          description: 'Extra directory names to exclude.',
          items: { type: 'string' },
        },
      },
      required: ['query', 'mode'],
    },
  },
}

export const searchExecutor: ToolExecutor = async (args, context) => {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return JSON.stringify({ error: 'query is required' })
  }
  const mode = typeof args.mode === 'string' ? args.mode : ''
  if (mode !== 'literal' && mode !== 'regex') {
    return JSON.stringify({
      error: 'mode is required and must be one of: literal, regex',
    })
  }
  const useRegex = mode === 'regex'
  if (!useRegex && looksRegexLikeQuery(query)) {
    return JSON.stringify({
      error:
        'query looks like regex but mode="literal". Use mode="regex" for patterns like "|" or ".*".',
      hint: 'If you intend a regex OR/pattern search, set mode="regex".',
    })
  }

  let directoryHandle: FileSystemDirectoryHandle | null = context.directoryHandle

  // OPFS-only fallback: search in workspace files/ snapshot.
  if (!directoryHandle) {
    const active = await getActiveWorkspace()
    if (!active) {
      return JSON.stringify({ error: 'No active workspace' })
    }
    directoryHandle = await active.workspace.getFilesDir()
  }

  try {
    const manager = getSearchWorkerManager()
    const result = await manager.searchInDirectory(directoryHandle, {
      query,
      path: typeof args.path === 'string' ? args.path : undefined,
      glob: typeof args.glob === 'string' ? args.glob : undefined,
      regex: useRegex,
      caseSensitive: args.case_sensitive === true,
      wholeWord: args.whole_word === true,
      maxResults: typeof args.max_results === 'number' ? args.max_results : undefined,
      contextLines: typeof args.context_lines === 'number' ? args.context_lines : undefined,
      deadlineMs: typeof args.deadline_ms === 'number' ? args.deadline_ms : undefined,
      maxFileSize: typeof args.max_file_size === 'number' ? args.max_file_size : undefined,
      includeIgnored: args.include_ignored === true,
      excludeDirs: Array.isArray(args.exclude_dirs)
        ? args.exclude_dirs.filter((v): v is string => typeof v === 'string')
        : undefined,
    })

    return JSON.stringify({
      success: true,
      query,
      ...result,
      message: `Found ${result.totalMatches} matches in ${result.scannedFiles} files.`,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
