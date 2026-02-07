/**
 * Batch Operations Tools - Advanced file operations for batch processing.
 *
 * Includes:
 * - batch_edit: Apply same edit to multiple files
 * - advanced_search: Enhanced search with file patterns and regex
 * - file_batch_read: Read multiple files at once
 *
 * Phase 4 Integration:
 * - Uses OPFS cache for file operations
 * - Supports dry-run mode for previewing changes
 * - Progress tracking for large operations
 * - Undo/redo support through OPFS workspace
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { getUndoManager } from '@/undo/undo-manager'
import { traverseDirectory } from '@/services/traversal.service'
import { resolveFileHandle } from '@/services/fsAccess.service'
import micromatch from 'micromatch'

//=============================================================================
// Types
//=============================================================================

export interface BatchEditResult {
  path: string
  success: boolean
  matched: boolean
  preview?: {
    old: string
    new: string
    line: number
  }
  error?: string
}

export interface AdvancedSearchResult {
  path: string
  line: number
  match: string
  contextBefore?: string[]
  contextAfter?: string[]
}

export interface FileBatchReadItem {
  path: string
  success: boolean
  content?: string
  size?: number
  error?: string
}

//=============================================================================
// Batch Edit Tool
//=============================================================================

export const batchEditDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'batch_edit',
    description:
      'Apply the same text replacement to multiple files matching a glob pattern. Supports regex patterns for find/replace. Use dry_run=true to preview changes without applying them. All edits use cached content if available.',
    parameters: {
      type: 'object',
      properties: {
        file_pattern: {
          type: 'string',
          description:
            'Glob pattern for matching files (e.g. "*.ts", "src/**/*.tsx", "**/*.test.ts")',
        },
        find: {
          type: 'string',
          description:
            'Text or regex pattern to find. Use regex capturing groups for advanced replacements.',
        },
        replace: {
          type: 'string',
          description: 'Replacement text. Use $1, $2 for regex capture groups.',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, preview changes without applying them. Default: false.',
          default: false,
        },
        use_regex: {
          type: 'boolean',
          description: 'If true, treat "find" as a regex pattern. Default: false.',
          default: false,
        },
        max_files: {
          type: 'number',
          description: 'Maximum number of files to process. Default: 50.',
          default: 50,
        },
      },
      required: ['file_pattern', 'find', 'replace'],
    },
  },
}

export const batchEditExecutor: ToolExecutor = async (args, context) => {
  const filePattern = args.file_pattern as string
  const find = args.find as string
  const replace = args.replace as string
  const dryRun = args.dry_run as boolean | undefined
  const useRegex = args.use_regex as boolean | undefined
  const maxFiles = args.max_files as number | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    const { readFile, writeFile, getPendingChanges } = useOPFSStore.getState()
    const session = useRemoteStore.getState().session

    // Compile search pattern
    let searchPattern: RegExp | string
    if (useRegex) {
      try {
        searchPattern = new RegExp(find, 'gm')
      } catch (error) {
        return JSON.stringify({
          error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    } else {
      searchPattern = find
    }

    // Find matching files
    const matchingFiles: string[] = []
    const limit = maxFiles || 50

    for await (const entry of traverseDirectory(context.directoryHandle)) {
      if (entry.type !== 'file') continue
      if (matchingFiles.length >= limit) break

      // Match file pattern
      if (
        micromatch.isMatch(entry.path, filePattern) ||
        micromatch.isMatch(entry.name, filePattern)
      ) {
        matchingFiles.push(entry.path)
      }
    }

    if (matchingFiles.length === 0) {
      return JSON.stringify({
        success: true,
        message: `No files found matching pattern: ${filePattern}`,
        results: [],
      })
    }

    // Process each file
    const results: BatchEditResult[] = []
    let totalMatches = 0
    let totalReplacements = 0

    for (const filePath of matchingFiles) {
      try {
        // Read file content (will use cache if available)
        const { content } = await readFile(filePath, context.directoryHandle)

        if (typeof content !== 'string') {
          results.push({
            path: filePath,
            success: false,
            matched: false,
            error: 'Cannot edit binary file',
          })
          continue
        }

        const fileContent = content
        let matched = false
        let preview: { old: string; new: string; line: number } | undefined

        if (useRegex) {
          // Regex-based replacement
          const regex = searchPattern as RegExp
          const matches = fileContent.match(regex)
          matched = matches !== null && matches.length > 0

          if (matched && matches) {
            totalMatches += matches.length
            const newContent = fileContent.replace(regex, replace)

            // Find first match for preview
            const firstMatch = regex.exec(fileContent)
            if (firstMatch) {
              const lines = fileContent.split('\n')
              let lineNum = 0
              let charCount = 0
              for (let i = 0; i < lines.length; i++) {
                charCount += lines[i].length + 1
                if (charCount > firstMatch.index) {
                  lineNum = i + 1
                  break
                }
              }
              preview = {
                old: firstMatch[0],
                new: replace,
                line: lineNum,
              }
            }

            if (!dryRun) {
              await writeFile(filePath, newContent, context.directoryHandle)
              totalReplacements++

              // Record for undo
              getUndoManager().recordModification(filePath, 'modify', fileContent, newContent)
            } else {
              totalReplacements++ // Count for preview
            }
          }

          results.push({
            path: filePath,
            success: true,
            matched,
            preview,
          })
        } else {
          // String-based replacement
          const firstIndex = fileContent.indexOf(find)
          matched = firstIndex !== -1

          if (matched) {
            // Count all occurrences
            let count = 0
            let pos = 0
            while ((pos = fileContent.indexOf(find, pos)) !== -1) {
              count++
              pos += find.length
            }
            totalMatches += count

            // Find line number for preview
            const lines = fileContent.split('\n')
            let lineNum = 0
            let charCount = 0
            for (let i = 0; i < lines.length; i++) {
              charCount += lines[i].length + 1
              if (charCount > firstIndex) {
                lineNum = i + 1
                break
              }
            }

            preview = {
              old: find,
              new: replace,
              line: lineNum,
            }

            if (!dryRun) {
              const newContent = fileContent.split(find).join(replace)
              await writeFile(filePath, newContent, context.directoryHandle)
              totalReplacements++

              // Record for undo
              getUndoManager().recordModification(filePath, 'modify', fileContent, newContent)
            } else {
              totalReplacements++ // Count for preview
            }
          }

          results.push({
            path: filePath,
            success: true,
            matched,
            preview,
          })
        }
      } catch (error) {
        results.push({
          path: filePath,
          success: false,
          matched: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Get pending changes count
    const pendingChanges = getPendingChanges()

    // Broadcast to remote sessions
    if (session && !dryRun) {
      const preview = `Batch edit: ${totalReplacements} file(s) modified`
      session.broadcastFileChange('[batch]', 'modify', preview)
    }

    return JSON.stringify({
      success: true,
      dryRun: dryRun || false,
      summary: {
        filesScanned: matchingFiles.length,
        filesMatched: totalReplacements,
        totalMatches,
        totalReplacements,
      },
      status: dryRun ? 'preview' : 'pending',
      pendingCount: pendingChanges.length,
      message: dryRun
        ? `Batch edit preview: ${totalReplacements} file(s) would be modified with ${totalMatches} replacement(s).`
        : `Batch edit complete: ${totalReplacements} file(s) modified with ${totalMatches} replacement(s). ${pendingChanges.length} file(s) pending sync.`,
      results,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Batch edit failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

//=============================================================================
// Advanced Search Tool
//=============================================================================

export const advancedSearchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'advanced_search',
    description:
      'Advanced file content search with regex support, file type filtering, and context lines. Returns matches with file paths, line numbers, and surrounding context for better understanding.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description:
            'Regex pattern to search for in file contents (e.g. "function\\s+\\w+", "TODO:.*")',
        },
        file_pattern: {
          type: 'string',
          description:
            'Only search in files matching this glob pattern (e.g. "*.ts", "src/**/*.tsx")',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search in (default: project root)',
        },
        context_lines: {
          type: 'number',
          description: 'Number of context lines before and after each match. Default: 2.',
          default: 2,
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matches to return. Default: 100.',
          default: 100,
        },
        case_insensitive: {
          type: 'boolean',
          description: 'If true, perform case-insensitive search. Default: false.',
          default: false,
        },
      },
      required: ['pattern'],
    },
  },
}

export const advancedSearchExecutor: ToolExecutor = async (args, context) => {
  const pattern = args.pattern as string
  const filePattern = args.file_pattern as string | undefined
  const subPath = (args.path as string) || ''
  const contextLines = args.context_lines as number | undefined
  const maxResults = args.max_results as number | undefined
  const caseInsensitive = args.case_insensitive as boolean | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  // Compile regex
  let regex: RegExp
  try {
    const flags = caseInsensitive ? 'gim' : 'gm'
    regex = new RegExp(pattern, flags)
  } catch (error) {
    return JSON.stringify({
      error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  try {
    // Resolve subdirectory
    let searchHandle = context.directoryHandle
    if (subPath) {
      const parts = subPath.split('/').filter(Boolean)
      for (const part of parts) {
        searchHandle = await searchHandle.getDirectoryHandle(part)
      }
    }

    const results: AdvancedSearchResult[] = []
    const maxMatches = maxResults || 100
    let totalMatches = 0
    const ctxLines = contextLines || 2

    // File extensions to skip (binary files)
    const skipExts = new Set([
      'png',
      'jpg',
      'jpeg',
      'gif',
      'ico',
      'svg',
      'woff',
      'woff2',
      'ttf',
      'eot',
      'wasm',
      'zip',
      'gz',
      'tar',
      'pdf',
      'mp3',
      'mp4',
      'webm',
      'webp',
    ])

    // Search files
    for await (const entry of traverseDirectory(searchHandle)) {
      if (entry.type !== 'file') continue
      if (totalMatches >= maxMatches) break

      // Filter by file pattern
      if (filePattern) {
        if (
          !micromatch.isMatch(entry.path, filePattern) &&
          !micromatch.isMatch(entry.name, filePattern)
        ) {
          continue
        }
      }

      // Skip binary files
      const ext = entry.name.split('.').pop()?.toLowerCase()
      if (ext && skipExts.has(ext)) continue

      // Skip large files
      if (entry.size > 512 * 1024) continue

      try {
        const entryPath = subPath ? `${subPath}/${entry.path}` : entry.path
        const fileHandle = await resolveFileHandle(context.directoryHandle!, entryPath)
        const file = await fileHandle.getFile()
        const content = await file.text()

        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (totalMatches >= maxMatches) break

          regex.lastIndex = 0
          const match = regex.exec(lines[i])

          if (match) {
            // Get context lines
            const startLine = Math.max(0, i - ctxLines)
            const endLine = Math.min(lines.length - 1, i + ctxLines)

            const result: AdvancedSearchResult = {
              path: entryPath,
              line: i + 1,
              match: lines[i].trim(),
            }

            // Add context if available
            if (startLine < i) {
              result.contextBefore = lines.slice(startLine, i).map((l) => l.trim())
            }
            if (endLine > i) {
              result.contextAfter = lines.slice(i + 1, endLine + 1).map((l) => l.trim())
            }

            results.push(result)
            totalMatches++
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (results.length === 0) {
      return JSON.stringify({
        success: true,
        pattern,
        path: subPath || 'project root',
        filePattern: filePattern || 'all files',
        message: `No matches found for pattern "${pattern}"${subPath ? ` in ${subPath}` : ''}`,
        results: [],
      })
    }

    const truncated = totalMatches >= maxMatches
    return JSON.stringify({
      success: true,
      pattern,
      path: subPath || 'project root',
      filePattern: filePattern || 'all files',
      summary: {
        totalMatches,
        truncated,
      },
      message: `Found ${totalMatches} match(es) for pattern "${pattern}"${truncated ? ` (limited to ${maxMatches})` : ''}`,
      results,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Advanced search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

//=============================================================================
// File Batch Read Tool
//=============================================================================

export const fileBatchReadDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_batch_read',
    description:
      'Read multiple files at once. Uses cached content if files have pending modifications. Returns content, size, and status for each file. Useful for batch analysis operations.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description: 'Array of file paths to read (relative to project root)',
          items: {
            type: 'string',
          },
        },
        max_files: {
          type: 'number',
          description: 'Maximum number of files to read. Default: 20.',
          default: 20,
        },
        max_size: {
          type: 'number',
          description: 'Maximum file size in bytes. Default: 256KB.',
          default: 262144,
        },
      },
      required: ['paths'],
    },
  },
}

export const fileBatchReadExecutor: ToolExecutor = async (args, context) => {
  const paths = args.paths as string[]
  const maxFiles = args.max_files as number | undefined
  const maxSize = args.max_size as number | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    return JSON.stringify({ error: 'paths must be a non-empty array' })
  }

  // Limit batch size
  const limit = Math.min(paths.length, maxFiles || 20)

  try {
    const { readFile } = useOPFSStore.getState()
    const results: FileBatchReadItem[] = []
    let successCount = 0
    let errorCount = 0
    let totalSize = 0

    for (let i = 0; i < limit; i++) {
      const filePath = paths[i]
      try {
        const { content, metadata } = await readFile(filePath, context.directoryHandle)

        // Check file size limit
        const sizeLimit = maxSize || 262144 // 256KB default
        const fileSize = metadata.size
        if (fileSize > sizeLimit) {
          results.push({
            path: filePath,
            success: false,
            error: `File size (${fileSize} bytes) exceeds limit (${sizeLimit} bytes)`,
          })
          errorCount++
          continue
        }

        // Skip binary files
        if (typeof content !== 'string') {
          results.push({
            path: filePath,
            success: false,
            size: fileSize,
            error: 'Cannot read binary file in batch mode',
          })
          errorCount++
          continue
        }

        results.push({
          path: filePath,
          success: true,
          content,
          size: fileSize,
        })
        successCount++
        totalSize += fileSize
      } catch (error) {
        results.push({
          path: filePath,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
        errorCount++
      }
    }

    return JSON.stringify({
      success: true,
      summary: {
        total: limit,
        successful: successCount,
        errors: errorCount,
        totalBytes: totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      },
      message: `Batch read complete: ${successCount} successful, ${errorCount} errors, ${formatBytes(totalSize)} total.`,
      results,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Batch read failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
