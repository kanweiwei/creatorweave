/**
 * Git Log Command
 *
 * Implements git log functionality using isomorphic-git.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitCommit, GitLogOptions, GitResult } from '../types'

/**
 * Get commit history from a git repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Log options
 * @returns Result containing array of commits
 */
export async function gitLog(
  fs: GitFs,
  dir: string,
  options: GitLogOptions = {}
): Promise<GitResult<GitCommit[]>> {
  const startTime = Date.now()
  const { depth = 0, skip = 0, includeBody = false, reverse = false } = options

  try {
    // Get the list of commits
    const commits: GitCommit[] = []

    // Build log options
    const gitLogOptions = {
      depth: depth > 0 ? depth : undefined,
      skip,
    }

    // Iterate through commits
    const logIterator = git.log({ fs, dir, ...gitLogOptions })

    for await (const commit of logIterator) {
      const { oid, message, author, committer, parent, tree, gpgsig } = commit.commit

      // Format the commit object
      const gitCommit: GitCommit = {
        oid,
        shortOid: oid.substring(0, 7),
        message: includeBody ? message : message.split('\n')[0],
        authorName: author.name,
        authorEmail: author.email,
        authorTimestamp: author.timestamp * 1000, // Convert to milliseconds
        committerName: committer.name,
        committerEmail: committer.email,
        committerTimestamp: committer.timestamp * 1000,
        parent: parent || [],
        tree,
        signature: gpgsig || undefined,
      }

      commits.push(gitCommit)
    }

    // Reverse if requested (oldest first)
    if (reverse) {
      commits.reverse()
    }

    return {
      success: true,
      data: commits,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get git log: ${errorMessage}`,
        code: 'LOG_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get the latest commit (HEAD)
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Result containing the latest commit
 */
export async function gitLogLatest(fs: GitFs, dir: string): Promise<GitResult<GitCommit | null>> {
  const result = await gitLog(fs, dir, { depth: 1 })

  if (result.success && result.data && result.data.length > 0) {
    return {
      success: true,
      data: result.data[0],
      duration: result.duration,
    }
  }

  return {
    success: true,
    data: null,
    duration: result.duration,
  }
}

/**
 * Get commit count
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Result containing the number of commits
 */
export async function gitLogCount(fs: GitFs, dir: string): Promise<GitResult<number>> {
  const startTime = Date.now()

  try {
    let count = 0
    const iterator = git.log({ fs, dir })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _commit of iterator) {
      count++
    }

    return {
      success: true,
      data: count,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to count commits: ${errorMessage}`,
        code: 'LOG_COUNT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get commits with custom format
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param format Format string (supported placeholders: %H, %h, %s, %b, %an, %ae, %cn, %ce)
 * @param options Log options
 * @returns Result containing formatted commit strings
 */
export async function gitLogFormatted(
  fs: GitFs,
  dir: string,
  format: string,
  options: GitLogOptions = {}
): Promise<GitResult<string[]>> {
  const startTime = Date.now()
  const { depth = 0, skip = 0, reverse = false } = options

  try {
    const lines: string[] = []

    const gitLogOptions = {
      depth: depth > 0 ? depth : undefined,
      skip,
    }

    const logIterator = git.log({ fs, dir, ...gitLogOptions })

    for await (const commit of logIterator) {
      const { oid, message, author, committer, parent } = commit.commit

      // Parse format placeholders
      const formatted = format
        .replace(/%H/g, oid)
        .replace(/%h/g, oid.substring(0, 7))
        .replace(/%s/g, message.split('\n')[0])
        .replace(/%b/g, message)
        .replace(/%an/g, author.name)
        .replace(/%ae/g, author.email)
        .replace(/%cn/g, committer.name)
        .replace(/%ce/g, committer.email)
        .replace(/%P/g, (parent || []).join(' '))
        .replace(/%p/g, (parent || []).map((p: string) => p.substring(0, 7)).join(' '))

      lines.push(formatted)
    }

    if (reverse) {
      lines.reverse()
    }

    return {
      success: true,
      data: lines,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to format git log: ${errorMessage}`,
        code: 'LOG_FORMAT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}
