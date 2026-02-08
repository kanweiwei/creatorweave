/**
 * Git Module
 *
 * Browser-compatible Git operations using isomorphic-git.
 *
 * This module provides:
 * - Type definitions for Git operations
 * - Filesystem abstraction using LightningFS
 * - Commands: log, status, diff
 *
 * Usage:
 * ```typescript
 * import { initGitFs, gitLog, gitStatus, gitDiff } from './git'
 *
 * // Initialize the filesystem
 * const fs = await initGitFs()
 *
 * // Perform Git operations
 * const logResult = await gitLog(fs, '/path/to/repo')
 * const statusResult = await gitStatus(fs, '/path/to/repo')
 * const diffResult = await gitDiff(fs, '/path/to/repo')
 * ```
 */

// Types
export type {
  GitCommit,
  GitStatus,
  GitStatusEntry,
  GitStatusType,
  GitStatusOptions,
  GitDiff,
  GitDiffEntry,
  GitDiffHunk,
  GitDiffLine,
  GitDiffOptions,
  GitLogOptions,
  GitInitOptions,
  GitConfigEntry,
  GitBlob,
  GitTreeEntry,
  GitRef,
  GitError,
  GitResult,
} from './types'

// Utils
export {
  getLightningFS,
  initBuffer,
  getBuffer,
  createGitFs,
  getGitFs,
  initGitFs,
  resetGitFs,
  isGitRepository,
  initGitRepository,
  getGitDir,
} from './utils'

export type { GitFs } from './utils/fs'

// Commands
export { gitLog, gitLogLatest, gitLogCount, gitLogFormatted } from './commands/gitLog'
export { gitStatus, gitStatusPorcelain, gitHasChanges, gitStatusShort } from './commands/gitStatus'
export {
  gitDiff,
  gitDiffCached,
  gitDiffText,
  gitDiffStats,
  gitHasUncommittedChanges,
} from './commands/gitDiff'
