/**
 * Git Status Command
 *
 * Implements git status functionality using isomorphic-git.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type {
  GitStatus,
  GitStatusEntry,
  GitStatusOptions,
  GitStatusType,
  GitResult,
} from '../types'

/**
 * Status matrix entry type from isomorphic-git
 */
type StatusMatrixEntry = [filepath: string, head: number, workdir: number, stage: number]

/**
 * Get the current status of a git repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Status options
 * @returns Result containing repository status
 */
export async function gitStatus(
  fs: GitFs,
  dir: string,
  options: GitStatusOptions = {}
): Promise<GitResult<GitStatus>> {
  const startTime = Date.now()
  const { showAll = false } = options

  try {
    // Get current branch
    let currentBranch = ''
    try {
      currentBranch = await git.currentBranch({ fs, dir })
    } catch {
      // No HEAD (new repository)
      currentBranch = ''
    }

    // Get HEAD commit and tree
    let currentCommit: string | undefined
    let currentTree: string | undefined
    try {
      const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      currentCommit = head
      const commit = await git.readCommit({ fs, dir, oid: head })
      currentTree = commit.commit.tree
    } catch {
      // No commits yet
    }

    // Get all status entries
    const statusMatrix = await git.statusMatrix({ fs, dir })

    // Filter and map status entries
    const entries: GitStatusEntry[] = statusMatrix
      .filter(([, head, workdir, stage]: StatusMatrixEntry) => {
        // Filter based on options
        if (!showAll) {
          // Default: show modified, added, deleted, untracked
          if (head !== 0 && head !== workdir) return true
          if (workdir !== stage && workdir !== 0) return true
          if (head === 0) return true
          return false
        }
        return true
      })
      .map(([filepath, head, workdir, stage]: StatusMatrixEntry) => {
        // Determine the status type
        let statusType: GitStatusType = 'unmodified'

        if (head === 0 && workdir === 0 && stage === 0) {
          statusType = 'untracked'
        } else if (head === 1 && workdir === 0 && stage === 0) {
          statusType = 'deleted'
        } else if (head === 1 && workdir === 2 && stage === 0) {
          statusType = 'modified'
        } else if (head === 0 && workdir === 2 && stage === 0) {
          statusType = 'added'
        } else if (head === 1 && workdir === 1 && stage === 1) {
          statusType = 'unmodified'
        } else if (head === 0 && workdir === 0 && stage === 1) {
          // Intentional add
          statusType = 'added'
        } else if (head === 1 && workdir === 1 && stage === 2) {
          // Added in index, modified in workdir
          statusType = 'modified'
        } else if (head === 0 && workdir === 0 && stage === 3) {
          // Unmerged
          statusType = 'unmerged'
        }

        return {
          path: filepath,
          status: statusType,
          staged: head !== workdir || stage !== head,
          unstaged: workdir !== stage,
          untracked: head === 0,
        }
      })

    // Count statistics
    const stagedCount = entries.filter((e) => e.staged && !e.untracked).length
    const unstagedCount = entries.filter((e) => e.unstaged && !e.untracked).length
    const untrackedCount = entries.filter((e) => e.untracked).length

    // Check for conflicts
    const hasConflicts = entries.some((e) => e.status === 'unmerged')

    const status: GitStatus = {
      currentBranch: currentBranch || '(no branch)',
      isBare: await git.isBare({ fs, dir }),
      isEmpty: statusMatrix.length === 0,
      entries,
      stagedCount,
      unstagedCount,
      untrackedCount,
      hasConflicts,
      currentCommit,
      currentTree,
    }

    return {
      success: true,
      data: status,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get git status: ${errorMessage}`,
        code: 'STATUS_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get porcelain status (machine-readable)
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Result containing porcelain status lines
 */
export async function gitStatusPorcelain(fs: GitFs, dir: string): Promise<GitResult<string[]>> {
  const result = await gitStatus(fs, dir)

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      duration: result.duration,
    }
  }

  const lines = result.data!.entries.map((entry) => {
    let code = ''

    // Staged status (first column)
    if (entry.staged) {
      if (entry.status === 'added') code += 'A'
      else if (entry.status === 'deleted') code += 'M'
      else if (entry.status === 'modified') code += 'M'
      else if (entry.status === 'renamed') code += 'R'
      else if (entry.status === 'copied') code += 'C'
      else if (entry.status === 'unmerged') code += 'U'
      else code += ' '
    } else {
      code += ' '
    }

    // Unstaged status (second column)
    if (entry.untracked) {
      code += '?'
    } else if (entry.unstaged) {
      if (entry.status === 'deleted') code += 'D'
      else if (entry.status === 'modified') code += 'M'
      else if (entry.status === 'renamed') code += 'R'
      else if (entry.status === 'copied') code += 'C'
      else code += ' '
    } else {
      code += ' '
    }

    // Path
    code += ` ${entry.path}`

    return code
  })

  return {
    success: true,
    data: lines,
    duration: result.duration,
  }
}

/**
 * Check if repository has uncommitted changes
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns True if repository has changes
 */
export async function gitHasChanges(fs: GitFs, dir: string): Promise<GitResult<boolean>> {
  const result = await gitStatus(fs, dir, { showAll: true })

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      duration: result.duration,
    }
  }

  const hasChanges =
    result.data!.stagedCount > 0 ||
    result.data!.unstagedCount > 0 ||
    result.data!.untrackedCount > 0

  return {
    success: true,
    data: hasChanges,
    duration: result.duration,
  }
}

/**
 * Get short status summary
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Short status string
 */
export async function gitStatusShort(fs: GitFs, dir: string): Promise<GitResult<string>> {
  const result = await gitStatus(fs, dir)

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      duration: result.duration,
    }
  }

  const status = result.data!
  const parts: string[] = []

  // Current branch
  parts.push(`On branch ${status.currentBranch}`)

  // Changes to be committed
  if (status.stagedCount > 0) {
    parts.push(`Changes to be committed: ${status.entries.filter((e) => e.staged).length}`)
  }

  // Changes not staged
  if (status.unstagedCount > 0) {
    parts.push(
      `Changes not staged for commit: ${status.entries.filter((e) => e.unstaged && !e.untracked).length}`
    )
  }

  // Untracked
  if (status.untrackedCount > 0) {
    parts.push(`Untracked files: ${status.untrackedCount}`)
  }

  return {
    success: true,
    data: parts.join('\n'),
    duration: result.duration,
  }
}
