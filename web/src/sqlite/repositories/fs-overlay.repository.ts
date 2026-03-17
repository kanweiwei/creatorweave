import { getSQLiteDB } from '../sqlite-database'

type OpType = 'create' | 'modify' | 'delete'
type SyncItemStatus = 'success' | 'failed' | 'skipped'
type BatchStatus = 'running' | 'success' | 'failed' | 'partial'

export interface PendingOverlayOp {
  id: string
  workspaceId: string
  path: string
  type: OpType
  fsMtime: number
  timestamp: number
  checkpointId?: string
  checkpointStatus?: 'draft' | 'committed'
  checkpointSummary?: string
}

export interface OverlayOpRecord {
  id: string
  workspaceId: string
  changesetId: string | null
  path: string
  type: OpType
  status: 'pending' | 'synced' | 'discarded' | 'failed'
  fsMtime: number
  createdAt: number
  updatedAt: number
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export class FSOverlayRepository {
  async getOrCreateDraftChangeset(workspaceId: string, source: string = 'tool'): Promise<string> {
    const db = getSQLiteDB()
    const existing = await db.queryFirst<{ id: string }>(
      `SELECT id
       FROM fs_changesets
       WHERE workspace_id = ? AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId]
    )
    if (existing?.id) return existing.id

    const id = generateId('changeset')
    await db.execute(
      `INSERT INTO fs_changesets (id, workspace_id, source, status, created_at)
       VALUES (?, ?, ?, 'draft', ?)`,
      [id, workspaceId, source, Date.now()]
    )
    return id
  }

  async commitLatestDraftChangeset(
    workspaceId: string,
    summary?: string
  ): Promise<{ changesetId: string; opCount: number } | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ id: string; op_count: number }>(
      `SELECT c.id as id, COUNT(o.id) as op_count
       FROM fs_changesets c
       LEFT JOIN fs_ops o
         ON o.changeset_id = c.id
        AND o.workspace_id = c.workspace_id
        AND o.status IN ('pending', 'failed')
       WHERE c.workspace_id = ? AND c.status = 'draft'
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [workspaceId]
    )

    if (!row?.id) return null
    const now = Date.now()
    await db.execute(
      `UPDATE fs_changesets
       SET status = 'committed',
           summary = COALESCE(?, summary),
           committed_at = ?
       WHERE id = ?`,
      [summary || null, now, row.id]
    )

    return { changesetId: row.id, opCount: Number(row.op_count || 0) }
  }

  async listChangesetPendingOps(
    workspaceId: string,
    changesetId: string
  ): Promise<OverlayOpRecord[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      workspace_id: string
      changeset_id: string | null
      path: string
      op_type: OpType
      status: 'pending' | 'synced' | 'discarded' | 'failed'
      fs_mtime: number
      created_at: number
      updated_at: number
    }>(
      `SELECT id, workspace_id, changeset_id, path, op_type, status, fs_mtime, created_at, updated_at
       FROM fs_ops
       WHERE workspace_id = ?
         AND changeset_id = ?
         AND status IN ('pending', 'failed')
       ORDER BY updated_at DESC`,
      [workspaceId, changesetId]
    )

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      changesetId: row.changeset_id,
      path: row.path,
      type: row.op_type,
      status: row.status,
      fsMtime: row.fs_mtime,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async listPendingOps(workspaceId: string): Promise<PendingOverlayOp[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{
      id: string
      workspace_id: string
      changeset_id: string | null
      path: string
      op_type: OpType
      fs_mtime: number
      updated_at: number
      checkpoint_status: 'draft' | 'committed' | null
      checkpoint_summary: string | null
    }>(
      `SELECT o.id,
              o.workspace_id,
              o.changeset_id,
              o.path,
              o.op_type,
              o.fs_mtime,
              o.updated_at,
              c.status AS checkpoint_status,
              c.summary AS checkpoint_summary
       FROM fs_ops o
       LEFT JOIN fs_changesets c ON c.id = o.changeset_id
       WHERE o.workspace_id = ? AND o.status = 'pending'
       ORDER BY updated_at ASC`,
      [workspaceId]
    )
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      path: row.path,
      type: row.op_type,
      fsMtime: row.fs_mtime,
      timestamp: row.updated_at,
      checkpointId: row.changeset_id || undefined,
      checkpointStatus: row.checkpoint_status || undefined,
      checkpointSummary: row.checkpoint_summary || undefined,
    }))
  }

  async upsertPendingOp(workspaceId: string, path: string, type: OpType): Promise<PendingOverlayOp> {
    const db = getSQLiteDB()
    const now = Date.now()
    const changesetId = await this.getOrCreateDraftChangeset(workspaceId)
    const existing = await db.queryFirst<{ id: string }>(
      `SELECT id
       FROM fs_ops
       WHERE workspace_id = ? AND path = ? AND status = 'pending'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [workspaceId, path]
    )

    if (existing?.id) {
      await db.execute(
        `UPDATE fs_ops
         SET changeset_id = ?, op_type = ?, fs_mtime = ?, updated_at = ?, error_message = NULL
         WHERE id = ?`,
        [changesetId, type, 0, now, existing.id]
      )
      return {
        id: existing.id,
        workspaceId,
        path,
        type,
        fsMtime: 0,
        timestamp: now,
        checkpointId: changesetId,
        checkpointStatus: 'draft',
      }
    }

    const id = generateId('op')
    await db.execute(
      `INSERT INTO fs_ops
       (id, workspace_id, changeset_id, path, op_type, status, fs_mtime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, workspaceId, changesetId, path, type, 0, now, now]
    )
    return {
      id,
      workspaceId,
      path,
      type,
      fsMtime: 0,
      timestamp: now,
      checkpointId: changesetId,
      checkpointStatus: 'draft',
    }
  }

  async discardPendingPath(workspaceId: string, path: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_ops
       SET status = 'discarded', updated_at = ?
       WHERE workspace_id = ? AND path = ? AND status = 'pending'`,
      [Date.now(), workspaceId, path]
    )
  }

  async createSyncBatch(workspaceId: string, totalOps: number): Promise<string> {
    const db = getSQLiteDB()
    const id = generateId('syncbatch')
    await db.execute(
      `INSERT INTO fs_sync_batches
       (id, workspace_id, status, total_ops, success_count, failed_count, skipped_count, started_at)
       VALUES (?, ?, 'running', ?, 0, 0, 0, ?)`,
      [id, workspaceId, totalOps, Date.now()]
    )
    return id
  }

  async recordSyncItem(
    batchId: string,
    opId: string,
    path: string,
    status: SyncItemStatus,
    errorMessage?: string
  ): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO fs_sync_items
       (id, batch_id, op_id, path, status, error_message, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId('syncitem'), batchId, opId, path, status, errorMessage || null, Date.now()]
    )
  }

  async markOpSynced(opId: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(`UPDATE fs_ops SET status = 'synced', updated_at = ?, error_message = NULL WHERE id = ?`, [
      Date.now(),
      opId,
    ])
  }

  async markOpFailed(opId: string, errorMessage: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_ops SET status = 'failed', updated_at = ?, error_message = ? WHERE id = ?`,
      [Date.now(), errorMessage, opId]
    )
  }

  async keepOpPending(opId: string, errorMessage?: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_ops SET status = 'pending', updated_at = ?, error_message = ? WHERE id = ?`,
      [Date.now(), errorMessage || null, opId]
    )
  }

  async finalizeSyncBatch(
    batchId: string,
    status: BatchStatus,
    successCount: number,
    failedCount: number,
    skippedCount: number
  ): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE fs_sync_batches
       SET status = ?, success_count = ?, failed_count = ?, skipped_count = ?, completed_at = ?
       WHERE id = ?`,
      [status, successCount, failedCount, skippedCount, Date.now(), batchId]
    )
  }
}

let instance: FSOverlayRepository | null = null

export function getFSOverlayRepository(): FSOverlayRepository {
  if (!instance) {
    instance = new FSOverlayRepository()
  }
  return instance
}
