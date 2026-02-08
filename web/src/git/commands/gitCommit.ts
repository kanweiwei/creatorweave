/**
 * Git Commit Command
 *
 * Implements git commit functionality using isomorphic-git.
 * Supports creating commits, amending commits, and GPG-signed commits.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitCommitOptions, GitCommitResult, GitResult } from '../types'

/**
 * Create a new commit with the staged changes
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Commit options including message and author
 * @returns Result containing the created commit information
 */
export async function gitCommit(
  fs: GitFs,
  dir: string,
  options: GitCommitOptions
): Promise<GitResult<GitCommitResult>> {
  const startTime = Date.now()
  const { message, author, signingKey } = options

  try {
    if (!message || message.trim() === '') {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'Commit message is required',
          code: 'COMMIT_ERROR',
          exitCode: 128,
          stderr: 'Commit message cannot be empty',
        },
        duration: Date.now() - startTime,
      }
    }

    // Get author from options or use defaults
    const authorName = author?.name || 'Unknown Author'
    const authorEmail = author?.email || 'unknown@example.com'
    const authorTimestamp = Math.floor(Date.now() / 1000)

    // Prepare commit parameters
    const commitParams: {
      fs: GitFs
      dir: string
      message: string
      author: { name: string; email: string; timestamp: number }
      committer?: { name: string; email: string; timestamp: number }
      parent?: string[]
      signingKey?: string
    } = {
      fs,
      dir,
      message,
      author: {
        name: authorName,
        email: authorEmail,
        timestamp: authorTimestamp,
      },
    }

    // Add signing key if provided
    if (signingKey) {
      commitParams.signingKey = signingKey
    }

    // Create the commit
    const sha = await git.commit(commitParams)

    return {
      success: true,
      data: {
        sha,
        shortSha: sha.substring(0, 7),
        message,
        author: {
          name: authorName,
          email: authorEmail,
          timestamp: authorTimestamp * 1000,
        },
        committer: {
          name: authorName,
          email: authorEmail,
          timestamp: authorTimestamp * 1000,
        },
        tree: '',
        parents: [],
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to create commit: ${errorMessage}`,
        code: 'COMMIT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Amend the last commit with new changes or message
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Options for amending (message, author, signing key)
 * @returns Result containing the amended commit information
 */
export async function gitCommitAmend(
  fs: GitFs,
  dir: string,
  options: Partial<GitCommitOptions> = {}
): Promise<GitResult<GitCommitResult>> {
  const startTime = Date.now()
  const { message, author, signingKey } = options

  try {
    // Get the current HEAD commit to get existing information
    const currentCommit = await git.resolveRef({ fs, dir, ref: 'HEAD' })

    // Read the current commit object to preserve existing information
    const currentCommitObj = await git.readCommit({
      fs,
      dir,
      oid: currentCommit,
    })

    const existingAuthor = currentCommitObj.commit.author
    const existingMessage = currentCommitObj.commit.message

    // Use provided values or fall back to existing values
    const authorName = author?.name || existingAuthor.name
    const authorEmail = author?.email || existingAuthor.email
    const authorTimestamp = Math.floor(Date.now() / 1000)
    const commitMessage = message || existingMessage

    // Prepare commit parameters for amend
    const commitParams: {
      fs: GitFs
      dir: string
      message: string
      author: { name: string; email: string; timestamp: number }
      committer?: { name: string; email: string; timestamp: number }
      parent?: string[]
      signingKey?: string
    } = {
      fs,
      dir,
      message: commitMessage,
      author: {
        name: authorName,
        email: authorEmail,
        timestamp: authorTimestamp,
      },
      parent: [currentCommit],
    }

    // Add signing key if provided
    if (signingKey) {
      commitParams.signingKey = signingKey
    }

    // Create the amended commit
    const sha = await git.commit(commitParams)

    return {
      success: true,
      data: {
        sha,
        shortSha: sha.substring(0, 7),
        message: commitMessage,
        author: {
          name: authorName,
          email: authorEmail,
          timestamp: authorTimestamp * 1000,
        },
        committer: {
          name: authorName,
          email: authorEmail,
          timestamp: authorTimestamp * 1000,
        },
        tree: currentCommitObj.commit.tree,
        parents: [currentCommit],
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to amend commit: ${errorMessage}`,
        code: 'AMEND_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Create a GPG-signed commit
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Commit options including message, author, and GPG signing key
 * @returns Result containing the created commit information
 */
export async function gitCommitWithSignature(
  fs: GitFs,
  dir: string,
  options: GitCommitOptions
): Promise<GitResult<GitCommitResult>> {
  // Ensure signing key is provided for signed commits
  if (!options.signingKey) {
    return {
      success: false,
      error: {
        name: 'GitError',
        message: 'GPG signing key is required for signed commits',
        code: 'SIGNATURE_ERROR',
        exitCode: 128,
        stderr: 'Signing key not provided',
      },
      duration: Date.now(),
    }
  }

  // Delegate to gitCommit which handles signing
  const result = await gitCommit(fs, dir, options)

  // If the commit was successful, add signature information
  if (result.success && result.data) {
    result.data.signature = options.signingKey
  }

  return result
}

/**
 * Create a commit with an empty tree (for initialization)
 * Useful for creating the first commit in a new repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param message Commit message
 * @param author Author information
 * @returns Result containing the created commit information
 */
export async function gitInitialCommit(
  fs: GitFs,
  dir: string,
  message: string,
  author?: { name: string; email: string }
): Promise<GitResult<GitCommitResult>> {
  const startTime = Date.now()

  try {
    const authorName = author?.name || 'Unknown Author'
    const authorEmail = author?.email || 'unknown@example.com'
    const authorTimestamp = Math.floor(Date.now() / 1000)

    // Create an empty tree and commit
    const sha = await git.commit({
      fs,
      dir,
      message,
      author: {
        name: authorName,
        email: authorEmail,
        timestamp: authorTimestamp,
      },
    })

    return {
      success: true,
      data: {
        sha,
        shortSha: sha.substring(0, 7),
        message,
        author: {
          name: authorName,
          email: authorEmail,
          timestamp: authorTimestamp * 1000,
        },
        committer: {
          name: authorName,
          email: authorEmail,
          timestamp: authorTimestamp * 1000,
        },
        tree: '',
        parents: [],
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to create initial commit: ${errorMessage}`,
        code: 'INITIAL_COMMIT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}
