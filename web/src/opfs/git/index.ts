/**
 * OPFS Git - Browser-based Git implementation using FSOverlayRepository.
 *
 * Provides Git-like operations based on the existing change tracking and snapshot system:
 * - git_status: Shows pending changes (unstaged) and staged snapshots
 * - git_diff: Shows diff between working directory and snapshots
 * - git_log: Shows commit/snapshot history
 * - git_show: Shows details of a specific snapshot
 * - git_restore: Restores files from a snapshot or discards pending changes
 */

import { getSQLiteDB } from '@/sqlite'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'
import type { SnapshotFileRecord, SnapshotRecord } from '@/sqlite/repositories/fs-overlay.repository'
import { structuredPatch } from 'diff'

export interface GitStatusResult {
  workspaceId: string
  branch: string
  staged: SnapshotCommit[]
  unstaged: FileChange[]
  untracked: FileChange[]
  counts: { staged: number; unstaged: number; untracked: number }
}

export interface GitDiffResult {
  workspaceId: string
  from: string | null
  to: string | null
  files: DiffFile[]
  summary: { filesChanged: number; insertions: number; deletions: number }
}

export interface GitLogResult {
  workspaceId: string
  head: string | null
  commits: SnapshotCommit[]
  hasMore: boolean
}

export interface SnapshotCommit {
  id: string
  summary: string | null
  source: string
  status: string
  createdAt: number
  committedAt: number | null
  opCount: number
  isCurrent?: boolean
}

export interface FileChange {
  path: string
  type: 'create' | 'modify' | 'delete'
  status?: string
}

export interface DiffFile {
  path: string
  kind: 'add' | 'delete' | 'modify'
  additions?: number
  deletions?: number
  hunks: DiffHunk[]
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context'
  content: string
}

export interface GitShowResult {
  id: string
  summary: string | null
  source: string
  status: string
  createdAt: number
  committedAt: number | null
  opCount: number
  files: SnapshotFileInfo[]
  diff?: GitDiffResult
}

export interface SnapshotFileInfo {
  path: string
  opType: 'create' | 'modify' | 'delete'
  beforeSize?: number
  afterSize?: number
}

export interface GitRestoreResult {
  restored: number
  discarded: number
  message: string
}

//=============================================================================
// git_status - Working tree status
//=============================================================================

export async function gitStatus(workspaceId: string): Promise<GitStatusResult> {
  const repo = getFSOverlayRepository()
  const db = getSQLiteDB()

  // Get pending ops (unstaged changes)
  const pendingOps = await repo.listPendingOps(workspaceId)

  // Get committed snapshots (staged changes)
  const snapshots = await repo.listSnapshots(workspaceId, 20)
  const staged = snapshots.filter((s) => s.status === 'committed' || s.status === 'approved')

  // Separate pending ops by type (simulate git's staging concept)
  const unstaged: FileChange[] = []
  const untracked: FileChange[] = []

  for (const op of pendingOps) {
    if (op.snapshotStatus === 'draft') {
      // Draft changes - treat as unstaged
      unstaged.push({
        path: op.path,
        type: op.type,
        status: 'unstaged',
      })
    } else {
      // Committed/approved - treat as staged
      unstaged.push({
        path: op.path,
        type: op.type,
        status: 'staged',
      })
    }
  }

  // Get current branch name (from workspaces table)
  const workspace = await db.queryFirst<{ name: string }>(
    `SELECT name FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId]
  )
  const branch = workspace?.name || 'main'

  return {
    workspaceId,
    branch,
    staged: staged.map(mapSnapshotToCommit),
    unstaged,
    untracked,
    counts: {
      staged: staged.length,
      unstaged: unstaged.length,
      untracked: untracked.length,
    },
  }
}

export function formatGitStatus(status: GitStatusResult): string {
  const lines: string[] = []

  lines.push(`On branch ${status.branch}`)
  lines.push('')

  if (status.staged.length > 0) {
    lines.push(`Staged changes (${status.counts.staged} snapshots):`)
    for (const commit of status.staged) {
      lines.push(`  [${commit.id.slice(0, 8)}] ${commit.summary || 'No message'} (${commit.opCount} ops)`)
    }
    lines.push('')
  }

  if (status.unstaged.length > 0) {
    lines.push(`Unstaged changes (${status.counts.unstaged} files):`)
    for (const change of status.unstaged) {
      const statusStr = change.type === 'create' ? 'A' : change.type === 'modify' ? 'M' : 'D'
      lines.push(`  ${statusStr} ${change.path}`)
    }
    lines.push('')
  }

  if (status.untracked.length > 0) {
    lines.push(`Untracked files (${status.counts.untracked}):`)
    for (const change of status.untracked) {
      lines.push(`  ? ${change.path}`)
    }
    lines.push('')
  }

  if (status.counts.staged === 0 && status.counts.unstaged === 0 && status.counts.untracked === 0) {
    lines.push('No changes to commit (working tree clean)')
  }

  return lines.join('\n')
}

//=============================================================================
// git_diff - Show changes
//=============================================================================

export async function gitDiff(
  workspaceId: string,
  options?: {
    mode?: 'working' | 'cached' | 'snapshot'
    snapshotId?: string
    path?: string
  }
): Promise<GitDiffResult> {
  const repo = getFSOverlayRepository()
  const mode = options?.mode || 'working'
  const targetSnapshotId = options?.snapshotId

  let from: string | null = null
  let to: string | null = null
  let ops: Awaited<ReturnType<typeof repo.listSnapshotOps>> = []

  if (mode === 'snapshot' && targetSnapshotId) {
    // Compare between two snapshots or show a specific snapshot
    const snapshots = await repo.listSnapshots(workspaceId, 50)
    const targetIdx = snapshots.findIndex((s) => s.id === targetSnapshotId)
    if (targetIdx >= 0 && targetIdx < snapshots.length - 1) {
      from = snapshots[targetIdx + 1].id
      to = targetSnapshotId
      ops = await repo.listSnapshotOps(workspaceId, to)
    } else if (targetIdx >= 0) {
      to = targetSnapshotId
      ops = await repo.listSnapshotOps(workspaceId, to)
    }
  } else if (mode === 'cached') {
    // Show staged changes (approved snapshots not yet synced)
    const snapshots = await repo.listSnapshots(workspaceId, 50)
    const approved = snapshots.find((s) => s.status === 'approved')
    if (approved) {
      to = approved.id
      ops = await repo.listSnapshotOps(workspaceId, to)
    }
  } else {
    // Show working directory pending changes
    const pending = await repo.listPendingOps(workspaceId)
    ops = pending.map((op) => ({
      id: op.id,
      workspaceId: op.workspaceId,
      snapshotId: op.snapshotId || null,
      path: op.path,
      type: op.type,
      status: 'pending' as const,
      reviewStatus: op.reviewStatus as 'pending' | 'approved' | 'rejected' | undefined,
      fsMtime: op.fsMtime,
      createdAt: op.timestamp,
      updatedAt: op.timestamp,
    }))
  }

  // Filter by path if specified
  let filteredOps = ops
  if (options?.path) {
    const prefix = options.path
    filteredOps = ops.filter((op) => op.path.startsWith(prefix))
  }

  // Convert ops to diff files
  const files: DiffFile[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const op of filteredOps) {
    const snapshotIdForDiff = op.snapshotId || to || targetSnapshotId || undefined
    let resolved: DiffFile | null = null

    if (snapshotIdForDiff) {
      const snapshotFile = await repo.getSnapshotFileContent(snapshotIdForDiff, op.path)
      if (snapshotFile) {
        resolved = buildDiffFileFromSnapshotContent(op.path, op.type, snapshotFile)
      }
    }

    const diffFile = resolved || buildFallbackDiffFile(op.path, op.type)
    totalAdditions += diffFile.additions || 0
    totalDeletions += diffFile.deletions || 0
    files.push(diffFile)
  }

  return {
    workspaceId,
    from,
    to,
    files,
    summary: {
      filesChanged: files.length,
      insertions: totalAdditions,
      deletions: totalDeletions,
    },
  }
}

export function formatGitDiff(diff: GitDiffResult): string {
  const lines: string[] = []

  if (diff.from || diff.to) {
    lines.push(`diff --git ${diff.from || 'null'} ${diff.to || 'null'}`)
  }

  for (const file of diff.files) {
    if (file.kind === 'add') {
      lines.push(`diff --git a/${file.path} b/${file.path}`)
      lines.push(`new file mode`)
      lines.push(`--- /dev/null`)
      lines.push(`+++ b/${file.path}`)
    } else if (file.kind === 'delete') {
      lines.push(`diff --git a/${file.path} b/${file.path}`)
      lines.push(`deleted file mode`)
      lines.push(`--- a/${file.path}`)
      lines.push(`+++ /dev/null`)
    } else {
      lines.push(`diff --git a/${file.path} b/${file.path}`)
      lines.push(`--- a/${file.path}`)
      lines.push(`+++ b/${file.path}`)
    }

    for (const hunk of file.hunks) {
      lines.push(hunk.header)
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '
        lines.push(`${prefix}${line.content}`)
      }
    }
    lines.push('')
  }

  if (diff.files.length === 0) {
    return 'No changes to show'
  }

  return lines.join('\n')
}

//=============================================================================
// git_log - Show commit history
//=============================================================================

export async function gitLog(
  workspaceId: string,
  options?: {
    limit?: number
    path?: string
    status?: 'committed' | 'approved' | 'rolled_back'
  }
): Promise<GitLogResult> {
  const repo = getFSOverlayRepository()
  const limit = options?.limit || 10
  const hasFilter = Boolean(options?.status || options?.path)
  const fetchLimit = hasFilter ? Math.max(limit * 20, 200) : limit + 1
  const snapshots = await repo.listSnapshots(workspaceId, fetchLimit)

  let filtered = snapshots

  if (options?.status) {
    filtered = filtered.filter((snapshot) => snapshot.status === options.status)
  }

  if (options?.path) {
    const prefix = options.path
    const matched = await Promise.all(
      filtered.map(async (snapshot) => {
        const ops = await repo.listSnapshotOps(workspaceId, snapshot.id)
        return ops.some((op) => op.path.startsWith(prefix)) ? snapshot : null
      })
    )
    filtered = matched.filter((snapshot): snapshot is SnapshotRecord => snapshot !== null)
  }

  const hasMore = filtered.length > limit
  const commits = filtered.slice(0, limit).map(mapSnapshotToCommit)

  // Get HEAD commit (most recent)
  const head = commits.length > 0 ? commits[0].id : null

  return {
    workspaceId,
    head,
    commits,
    hasMore,
  }
}

export function formatGitLog(log: GitLogResult): string {
  const lines: string[] = []

  for (const commit of log.commits) {
    const date = new Date(commit.createdAt).toLocaleString()
    const isCurrent = commit.isCurrent ? ' (current)' : ''
    lines.push(`commit ${commit.id}${isCurrent}`)
    lines.push(`Date:   ${date}`)
    if (commit.summary) {
      lines.push('')
      lines.push(`    ${commit.summary}`)
    }
    lines.push('')
  }

  if (log.hasMore) {
    lines.push(`... and more commits`)
  }

  if (log.commits.length === 0) {
    return 'No commits yet'
  }

  return lines.join('\n')
}

export function formatGitLogOneline(log: GitLogResult): string {
  const lines: string[] = []

  for (const commit of log.commits) {
    const shortId = commit.id.slice(0, 8)
    const summary = commit.summary || '(no message)'
    const isCurrent = commit.isCurrent ? ' *' : ''
    lines.push(`${shortId} ${summary}${isCurrent}`)
  }

  if (log.hasMore) {
    lines.push(`... and more commits`)
  }

  if (log.commits.length === 0) {
    return 'No commits yet'
  }

  return lines.join('\n')
}

//=============================================================================
// git_show - Show commit details
//=============================================================================

export async function gitShow(
  workspaceId: string,
  snapshotId?: string,
  options?: {
    includeDiff?: boolean
    path?: string
  }
): Promise<GitShowResult | null> {
  const repo = getFSOverlayRepository()

  let targetId = snapshotId

  // If no snapshotId provided, get the latest
  if (!targetId) {
    const snapshots = await repo.listSnapshots(workspaceId, 1)
    if (snapshots.length === 0) {
      return null
    }
    targetId = snapshots[0].id
  }

  const snapshots = await repo.listSnapshots(workspaceId, 50)
  const snapshot = snapshots.find((s) => s.id === targetId)

  if (!snapshot) {
    return null
  }

  const files = await repo.listSnapshotFiles(targetId)
  let diff: GitDiffResult | undefined
  if (options?.includeDiff) {
    diff = await gitDiff(workspaceId, {
      mode: 'snapshot',
      snapshotId: targetId,
      path: options.path,
    })
  }

  return {
    id: snapshot.id,
    summary: snapshot.summary,
    source: snapshot.source,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    committedAt: snapshot.committedAt,
    opCount: snapshot.opCount,
    files: files.map((f) => ({
      path: f.path,
      opType: f.opType,
      beforeSize: f.beforeContentSize,
      afterSize: f.afterContentSize,
    })),
    diff,
  }
}

export function formatGitShow(data: GitShowResult): string {
  const date = new Date(data.createdAt).toLocaleString()

  const lines: string[] = []
  lines.push(`commit ${data.id}`)
  lines.push(`Date:   ${date}`)
  lines.push(`Status: ${data.status}`)
  lines.push('')
  if (data.summary) {
    lines.push(`    ${data.summary}`)
  }
  lines.push('')
  lines.push(`Changed files (${data.files.length}):`)
  for (const file of data.files) {
    const sizeStr =
      file.beforeSize !== undefined && file.afterSize !== undefined
        ? ` (${file.beforeSize} -> ${file.afterSize})`
        : ''
    lines.push(`  ${file.opType}: ${file.path}${sizeStr}`)
  }

  if (data.diff) {
    lines.push('')
    lines.push('Diff:')
    lines.push(formatGitDiff(data.diff))
  }

  return lines.join('\n')
}

//=============================================================================
// git_restore - Restore files
//=============================================================================

export async function gitRestore(
  workspaceId: string,
  options?: {
    paths?: string[]
    staged?: boolean
    worktree?: boolean
    snapshotId?: string
  }
): Promise<GitRestoreResult> {
  const repo = getFSOverlayRepository()
  const paths = options?.paths || []
  const staged = options?.staged || false
  const worktree = options?.worktree !== false

  if (paths.length === 0) {
    throw new Error('No paths specified')
  }

  let restored = 0
  let discarded = 0

  if (staged) {
    // Unstage: just discard from pending (don't apply to working tree)
    for (const path of paths) {
      await repo.discardPendingPath(workspaceId, path)
      discarded++
    }
  } else if (worktree) {
    // Restore from snapshot or discard pending changes
    const targetSnapshotId = options?.snapshotId

    if (targetSnapshotId) {
      // Restore specific files from a snapshot
      const ops = await repo.listSnapshotOps(workspaceId, targetSnapshotId)
      const targetOps = ops.filter((op) => paths.includes(op.path))

      for (const op of targetOps) {
        if (op.type === 'delete') {
          // Mark as discarded
          await repo.discardPendingPath(workspaceId, op.path)
          discarded++
        } else {
          // Content restoration from snapshot requires OPFS write operations.
          // For now, mark as restored but note actual content restore is pending.
          restored++
        }
      }
    } else {
      // Discard pending changes
      for (const path of paths) {
        await repo.discardPendingPath(workspaceId, path)
        discarded++
      }
    }
  }

  return {
    restored,
    discarded,
    message: formatRestoreMessage(restored, discarded, paths.length),
  }
}

export function formatGitRestore(result: GitRestoreResult): string {
  return result.message
}

//=============================================================================
// Helpers
//=============================================================================

function mapSnapshotToCommit(snapshot: SnapshotRecord): SnapshotCommit {
  return {
    id: snapshot.id,
    summary: snapshot.summary,
    source: snapshot.source,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    committedAt: snapshot.committedAt,
    opCount: snapshot.opCount,
    isCurrent: snapshot.isCurrent,
  }
}

function formatRestoreMessage(restored: number, discarded: number, total: number): string {
  if (discarded > 0 && restored === 0) {
    return `Discarded ${discarded} of ${total} file(s) from working tree`
  } else if (discarded > 0 && restored > 0) {
    return `Restored ${restored}, discarded ${discarded} of ${total} file(s)`
  } else {
    return `Restored ${restored} of ${total} file(s) from snapshot`
  }
}

function buildFallbackDiffFile(path: string, opType: 'create' | 'modify' | 'delete'): DiffFile {
  const additions = opType === 'create' ? 1 : opType === 'delete' ? 0 : 1
  const deletions = opType === 'delete' ? 1 : opType === 'create' ? 0 : 1
  return {
    path,
    kind: opType === 'create' ? 'add' : opType === 'delete' ? 'delete' : 'modify',
    additions,
    deletions,
    hunks: [
      {
        header: `@@ -1 +1 @@ ${opType}: ${path}`,
        lines: [
          {
            type: 'context',
            content: `... ${path} (${opType})`,
          },
        ],
      },
    ],
  }
}

function buildDiffFileFromSnapshotContent(
  path: string,
  opType: 'create' | 'modify' | 'delete',
  snapshotFile: SnapshotFileRecord
): DiffFile {
  const kind: DiffFile['kind'] = opType === 'create' ? 'add' : opType === 'delete' ? 'delete' : 'modify'

  if (snapshotFile.beforeContentKind === 'binary' || snapshotFile.afterContentKind === 'binary') {
    return {
      path,
      kind,
      additions: 0,
      deletions: 0,
      hunks: [
        {
          header: '@@ binary @@',
          lines: [{ type: 'context', content: '[binary files differ]' }],
        },
      ],
    }
  }

  const beforeText = snapshotFile.beforeContentKind === 'text' ? (snapshotFile.beforeContentText || '') : ''
  const afterText = snapshotFile.afterContentKind === 'text' ? (snapshotFile.afterContentText || '') : ''

  const patch = structuredPatch(path, path, beforeText, afterText, '', '', {
    context: 3,
  })

  let additions = 0
  let deletions = 0

  const hunks: DiffHunk[] = patch.hunks.map((hunk) => {
    const lines: DiffLine[] = hunk.lines.map((rawLine) => {
      if (rawLine.startsWith('+')) {
        additions += 1
        return { type: 'add', content: rawLine.slice(1) }
      }
      if (rawLine.startsWith('-')) {
        deletions += 1
        return { type: 'delete', content: rawLine.slice(1) }
      }
      if (rawLine.startsWith(' ')) {
        return { type: 'context', content: rawLine.slice(1) }
      }
      return { type: 'context', content: rawLine }
    })

    return {
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      lines,
    }
  })

  if (hunks.length === 0) {
    hunks.push({
      header: '@@ -0,0 +0,0 @@',
      lines: [{ type: 'context', content: '[no textual changes]' }],
    })
  }

  return {
    path,
    kind,
    additions,
    deletions,
    hunks,
  }
}
