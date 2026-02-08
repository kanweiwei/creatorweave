/**
 * Git Add Command
 *
 * Implements git add functionality using isomorphic-git.
 * Supports adding single files, all changes, and pattern-based additions.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitAddOptions, GitAddResult, GitResult } from '../types'

/**
 * Add a single file to the staging area
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Options containing the file path to add
 * @returns Result containing information about the added file
 */
export async function gitAdd(
  fs: GitFs,
  dir: string,
  options: GitAddOptions
): Promise<GitResult<GitAddResult>> {
  const startTime = Date.now()
  const { filepath } = options

  try {
    await git.add({
      fs,
      dir,
      filepath,
    })

    return {
      success: true,
      data: {
        added: [filepath],
        errors: [],
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to add file "${filepath}": ${errorMessage}`,
        code: 'ADD_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Add all changes (modified, deleted, new files) to the staging area
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Optional: includeUntracked (default: true) to add untracked files
 * @returns Result containing information about all added files
 */
export async function gitAddAll(
  fs: GitFs,
  dir: string,
  options: { includeUntracked?: boolean } = {}
): Promise<GitResult<GitAddResult>> {
  const startTime = Date.now()
  const { includeUntracked = true } = options

  try {
    const statusMatrix = await git.statusMatrix({ fs, dir })
    const added: string[] = []
    const errors: Array<{ filepath: string; error: string }> = []

    for (const [filepath, head, workdir, stage] of statusMatrix) {
      try {
        const needsAdd = (workdir !== stage && workdir !== 0) || (head === 0 && includeUntracked)
        if (needsAdd) {
          await git.add({ fs, dir, filepath })
          added.push(filepath)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push({ filepath, error: errorMessage })
      }
    }

    return {
      success: true,
      data: { added, errors },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to add all changes: ${errorMessage}`,
        code: 'ADD_ALL_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Add files matching a glob pattern to the staging area
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param pattern Glob pattern (e.g., star-ts, src slash star star slash js)
 * @returns Result containing information about matched and added files
 */
export async function gitAddPattern(
  fs: GitFs,
  dir: string,
  pattern: string
): Promise<GitResult<GitAddResult>> {
  const startTime = Date.now()

  try {
    const statusMatrix = await git.statusMatrix({ fs, dir })
    const regexPattern = globToRegex(pattern)
    const added: string[] = []
    const errors: Array<{ filepath: string; error: string }> = []

    const matchingFiles = statusMatrix
      .filter(([filepath]: [string, number, number, number]) => regexPattern.test(filepath))
      .map(([filepath, head, workdir, stage]: [string, number, number, number]) => ({
        filepath,
        needsAdd: (workdir !== stage && workdir !== 0) || head === 0,
      }))
      .filter((file: { filepath: string; needsAdd: boolean }) => file.needsAdd)

    for (const { filepath } of matchingFiles) {
      try {
        await git.add({ fs, dir, filepath })
        added.push(filepath)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push({ filepath, error: errorMessage })
      }
    }

    return {
      success: true,
      data: { added, errors },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to add files matching pattern "${pattern}": ${errorMessage}`,
        code: 'ADD_PATTERN_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Remove a file from the staging area (unstage)
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param filepath File path to remove from staging
 * @returns Promise that resolves when the file is unstaged
 */
export async function gitRemove(
  fs: GitFs,
  dir: string,
  filepath: string
): Promise<GitResult<void>> {
  const startTime = Date.now()

  try {
    await git.remove({ fs, dir, filepath })
    return { success: true, duration: Date.now() - startTime }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to remove file "${filepath}" from staging: ${errorMessage}`,
        code: 'REMOVE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Reset the staging area entirely (unstage all)
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @returns Promise that resolves when all files are unstaged
 */
export async function gitReset(fs: GitFs, dir: string): Promise<GitResult<{ reset: boolean }>> {
  const startTime = Date.now()

  try {
    await git.resetIndex({ fs, dir })
    return { success: true, data: { reset: true }, duration: Date.now() - startTime }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to reset staging area: ${errorMessage}`,
        code: 'RESET_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Reset specific files from the staging area
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param filepaths Array of file paths to unstage
 * @returns Result containing information about reset files
 */
export async function gitResetFiles(
  fs: GitFs,
  dir: string,
  filepaths: string[]
): Promise<GitResult<GitAddResult>> {
  const startTime = Date.now()

  const added: string[] = []
  const errors: Array<{ filepath: string; error: string }> = []

  for (const filepath of filepaths) {
    try {
      await git.resetIndex({ fs, dir, filepath })
      added.push(filepath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push({ filepath, error: errorMessage })
    }
  }

  if (errors.length > 0 && added.length === 0) {
    return {
      success: false,
      error: {
        name: 'GitError',
        message: 'Failed to reset files from staging',
        code: 'RESET_FILES_ERROR',
        exitCode: 128,
        stderr: errors.map((e) => `${e.filepath}: ${e.error}`).join(', '),
      },
      duration: Date.now() - startTime,
    }
  }

  return {
    success: true,
    data: { added: [], errors: [] },
    duration: Date.now() - startTime,
  }
}

/**
 * Convert a glob pattern to a regular expression
 * @param pattern Glob pattern (e.g., star-ts, src slash star star slash js)
 * @returns Regular expression matching the pattern
 */
function globToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*')
    .replace(/\?/g, '[^/]')

  return new RegExp('^' + regexStr + '$')
}
