/**
 * Git Diff Command
 *
 * Implements git diff functionality using isomorphic-git.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitDiff, GitDiffEntry, GitDiffLine, GitDiffOptions, GitResult } from '../types'

/**
 * Convert unified diff lines to GitDiffLine array
 * @param diffText Unified diff text
 * @returns Array of diff lines
 */
function parseDiffLines(diffText: string): GitDiffLine[] {
  const lines: GitDiffLine[] = []
  const diffLines = diffText.split('\n')

  for (const line of diffLines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({
        type: 'addition',
        content: line.substring(1),
      })
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({
        type: 'deletion',
        content: line.substring(1),
      })
    } else if (line.startsWith('@@')) {
      // Header line, skip
      continue
    } else {
      lines.push({
        type: 'context',
        content: line,
      })
    }
  }

  return lines
}

/**
 * Convert text diff to structured diff entries
 * @param diffText Unified diff text
 * @returns Array of diff entries
 */
function parseDiffText(diffText: string): GitDiffEntry[] {
  const entries: GitDiffEntry[] = []
  const blocks = diffText.split('diff --git ')

  for (const block of blocks) {
    if (!block.trim()) continue

    // Parse file header
    const headerMatch = block.match(/^ a\/(.+?)\s+b\/(.+?)$/m)
    const binaryMatch = block.match(/Binary files (.+?) and (.+?) differ/)

    if (binaryMatch) {
      // Binary file diff
      const entry: GitDiffEntry = {
        path: binaryMatch[2],
        oldPath: binaryMatch[1].replace(/^a\//, ''),
        isBinary: true,
        additions: 0,
        deletions: 0,
        hunks: [],
      }
      entries.push(entry)
      continue
    }

    if (!headerMatch) continue

    const oldPath = headerMatch[1]
    const newPath = headerMatch[2]
    const isRename = oldPath !== newPath

    // Parse new/old mode
    const newModeMatch = block.match(/new mode (\d+)/)
    const oldModeMatch = block.match(/old mode (\d+)/)

    const entry: GitDiffEntry = {
      path: newPath,
      oldPath: isRename ? oldPath : undefined,
      isBinary: false,
      newMode: newModeMatch?.[1],
      oldMode: oldModeMatch?.[1],
      additions: 0,
      deletions: 0,
      hunks: [],
    }

    // Parse hunks
    const diffLines = parseDiffLines(block)

    // Count additions and deletions
    for (const line of diffLines) {
      if (line.type === 'addition') entry.additions++
      if (line.type === 'deletion') entry.deletions++
    }

    // Parse individual hunks with line numbers
    let oldLineNum = 0
    let newLineNum = 0
    let currentHunk: {
      oldStart: number
      oldLines: number
      newStart: number
      newLines: number
      header: string
      lines: GitDiffLine[]
    } | null = null

    for (const line of diffLines) {
      if (line.type === 'context') {
        if (!currentHunk) {
          const headerMatchLocal = block.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/)
          if (headerMatchLocal) {
            currentHunk = {
              oldStart: parseInt(headerMatchLocal[1], 10),
              oldLines: headerMatchLocal[2] ? parseInt(headerMatchLocal[2], 10) : 1,
              newStart: parseInt(headerMatchLocal[3], 10),
              newLines: headerMatchLocal[4] ? parseInt(headerMatchLocal[4], 10) : 1,
              header: `@@ -${headerMatchLocal[1]},${headerMatchLocal[2]} +${headerMatchLocal[3]},${headerMatchLocal[4]} @@`,
              lines: [],
            }
            oldLineNum = currentHunk.oldStart
            newLineNum = currentHunk.newStart
          }
        }

        if (currentHunk) {
          currentHunk.lines.push({
            ...line,
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          })
        }
      } else if (line.type === 'addition') {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum || 1,
            oldLines: 0,
            newStart: newLineNum || 1,
            newLines: 0,
            header: '',
            lines: [],
          }
        }
        currentHunk.lines.push({
          ...line,
          oldLineNumber: undefined,
          newLineNumber: newLineNum++,
        })
        currentHunk.newLines++
      } else if (line.type === 'deletion') {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum || 1,
            oldLines: 0,
            newStart: newLineNum || 1,
            newLines: 0,
            header: '',
            lines: [],
          }
        }
        currentHunk.lines.push({
          ...line,
          oldLineNumber: oldLineNum++,
          newLineNumber: undefined,
        })
        currentHunk.oldLines++
      }

      if (currentHunk && currentHunk.lines.length > 0) {
        // Check if hunk is complete
        const contextCount = currentHunk.lines.filter((l) => l.type === 'context').length
        if (
          currentHunk.lines.length >=
          currentHunk.oldLines + currentHunk.newLines + contextCount
        ) {
          entry.hunks.push({
            oldStart: currentHunk.oldStart,
            oldLines: currentHunk.oldLines,
            newStart: currentHunk.newStart,
            newLines: currentHunk.newLines,
            header: currentHunk.header,
            lines: currentHunk.lines,
          })
          currentHunk = null
        }
      }
    }

    if (currentHunk && currentHunk.lines.length > 0) {
      entry.hunks.push({
        oldStart: currentHunk.oldStart,
        oldLines: currentHunk.oldLines,
        newStart: currentHunk.newStart,
        newLines: currentHunk.newLines,
        header: currentHunk.header,
        lines: currentHunk.lines,
      })
    }

    entries.push(entry)
  }

  return entries
}

/**
 * Get diff between working directory and index (staged)
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Diff options
 * @returns Result containing diff information
 */
export async function gitDiff(
  fs: GitFs,
  dir: string,
  options: GitDiffOptions = {}
): Promise<GitResult<GitDiff>> {
  const startTime = Date.now()
  const { ref = 'HEAD', oldRef } = options

  try {
    // Get the reference commits
    let newCommitOid = ''
    try {
      newCommitOid = await git.resolveRef({ fs, dir, ref })
    } catch {
      // No commits or ref not found
      newCommitOid = ''
    }

    let oldCommitOid: string | undefined
    if (oldRef) {
      try {
        oldCommitOid = await git.resolveRef({ fs, dir, ref: oldRef })
      } catch {
        // Old ref not found, skip
      }
    } else if (newCommitOid) {
      // Get parent commit for diff against working tree
      try {
        const commit = await git.readCommit({ fs, dir, oid: newCommitOid })
        oldCommitOid = commit.commit.parent[0] || undefined
      } catch {
        // No parent
      }
    }

    // Generate diff text
    let diffText = ''

    if (oldCommitOid && newCommitOid) {
      // Diff between two commits
      diffText = await git.diff({ fs, dir, oid1: oldCommitOid, oid2: newCommitOid })
    } else if (newCommitOid) {
      // Diff between commit and working tree
      diffText = await git.diffCommit({ fs, dir, oid: newCommitOid })
    } else {
      // No commits, return empty diff
      diffText = ''
    }

    // Parse the diff text into structured format
    const entries = parseDiffText(diffText)

    // Calculate totals
    let totalAdditions = 0
    let totalDeletions = 0
    let hasBinary = false

    for (const entry of entries) {
      totalAdditions += entry.additions
      totalDeletions += entry.deletions
      if (entry.isBinary) {
        hasBinary = true
      }
    }

    const diff: GitDiff = {
      entries,
      totalAdditions,
      totalDeletions,
      hasBinary,
    }

    return {
      success: true,
      data: diff,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get git diff: ${errorMessage}`,
        code: 'DIFF_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get diff between index (staged) and working directory
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Result containing staged diff
 */
export async function gitDiffCached(fs: GitFs, dir: string): Promise<GitResult<GitDiff>> {
  const startTime = Date.now()

  try {
    // Get staged diff using isomorphic-git
    const diffText = await git.diffStaged({
      fs,
      dir,
    })

    const entries = parseDiffText(diffText)

    let totalAdditions = 0
    let totalDeletions = 0
    let hasBinary = false

    for (const entry of entries) {
      totalAdditions += entry.additions
      totalDeletions += entry.deletions
      if (entry.isBinary) {
        hasBinary = true
      }
    }

    const diff: GitDiff = {
      entries,
      totalAdditions,
      totalDeletions,
      hasBinary,
    }

    return {
      success: true,
      data: diff,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get staged diff: ${errorMessage}`,
        code: 'DIFF_CACHED_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get raw diff as text
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Diff options
 * @returns Result containing raw diff text
 */
export async function gitDiffText(
  fs: GitFs,
  dir: string,
  options: GitDiffOptions = {}
): Promise<GitResult<string>> {
  const startTime = Date.now()
  const { ref = 'HEAD', oldRef } = options

  try {
    let diffText = ''

    let newCommitOid = ''
    try {
      newCommitOid = await git.resolveRef({ fs, dir, ref })
    } catch {
      newCommitOid = ''
    }

    if (oldRef) {
      const oldCommitOid = await git.resolveRef({ fs, dir, ref: oldRef })
      diffText = await git.diff({
        fs,
        dir,
        oid1: oldCommitOid,
        oid2: newCommitOid,
      })
    } else if (newCommitOid) {
      diffText = await git.diffCommit({
        fs,
        dir,
        oid: newCommitOid,
      })
    } else {
      diffText = ''
    }

    return {
      success: true,
      data: diffText,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get diff text: ${errorMessage}`,
        code: 'DIFF_TEXT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get diff statistics summary
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Diff options
 * @returns Result containing diff statistics
 */
export async function gitDiffStats(
  fs: GitFs,
  dir: string,
  options: GitDiffOptions = {}
): Promise<GitResult<{ files: number; additions: number; deletions: number }>> {
  const result = await gitDiff(fs, dir, options)

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      duration: result.duration,
    }
  }

  const diff = result.data!
  return {
    success: true,
    data: {
      files: diff.entries.length,
      additions: diff.totalAdditions,
      deletions: diff.totalDeletions,
    },
    duration: result.duration,
  }
}

/**
 * Check if there are uncommitted changes
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns True if there are uncommitted changes
 */
export async function gitHasUncommittedChanges(
  fs: GitFs,
  dir: string
): Promise<GitResult<boolean>> {
  const result = await gitDiff(fs, dir)

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      duration: result.duration,
    }
  }

  return {
    success: true,
    data: result.data!.entries.length > 0,
    duration: result.duration,
  }
}
