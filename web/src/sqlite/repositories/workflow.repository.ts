/**
 * Workflow Repository
 *
 * SQLite-based storage for custom workflows
 */

import { getSQLiteDB, parseJSON, toJSON, boolToInt, intToBool } from '../sqlite-database'
import type {
  CustomWorkflowTemplate,
  CustomWorkflowNode,
  WorkflowEdge,
  WorkflowSource,
  WorkflowDomain,
} from '../../agent/workflow/types'

// Re-export for convenience
export type { CustomWorkflowTemplate, CustomWorkflowNode, WorkflowEdge }

// Database row type (snake_case for SQLite)
interface WorkflowRow {
  id: string
  name: string
  description: string | null
  domain: string
  entry_node_id: string | null
  nodes_json: string
  edges_json: string
  source: string
  version: number
  enabled: number // BOOLEAN (0 or 1)
  created_at: number
  updated_at: number
}

//=============================================================================
// Workflow Repository
//=============================================================================

export class WorkflowRepository {
  /**
   * Get all custom workflows
   */
  async findAll(): Promise<CustomWorkflowTemplate[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<WorkflowRow>(
      'SELECT * FROM custom_workflows ORDER BY updated_at DESC'
    )
    return rows.map((row) => this.rowToWorkflow(row))
  }

  /**
   * Find workflow by ID
   */
  async findById(id: string): Promise<CustomWorkflowTemplate | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<WorkflowRow>(
      'SELECT * FROM custom_workflows WHERE id = ?',
      [id]
    )
    return row ? this.rowToWorkflow(row) : null
  }

  /**
   * Find workflow by name (case-insensitive)
   */
  async findByName(name: string): Promise<CustomWorkflowTemplate | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<WorkflowRow>(
      'SELECT * FROM custom_workflows WHERE LOWER(name) = LOWER(?)',
      [name]
    )
    return row ? this.rowToWorkflow(row) : null
  }

  /**
   * Get all enabled workflows
   */
  async findEnabled(): Promise<CustomWorkflowTemplate[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<WorkflowRow>(
      'SELECT * FROM custom_workflows WHERE enabled = 1 ORDER BY name'
    )
    return rows.map((row) => this.rowToWorkflow(row))
  }

  /**
   * Find workflows by domain
   */
  async findByDomain(domain: WorkflowDomain): Promise<CustomWorkflowTemplate[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<WorkflowRow>(
      'SELECT * FROM custom_workflows WHERE domain = ? ORDER BY name',
      [domain]
    )
    return rows.map((row) => this.rowToWorkflow(row))
  }

  /**
   * Find workflows by source
   */
  async findBySource(source: WorkflowSource): Promise<CustomWorkflowTemplate[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<WorkflowRow>(
      'SELECT * FROM custom_workflows WHERE source = ? ORDER BY updated_at DESC',
      [source]
    )
    return rows.map((row) => this.rowToWorkflow(row))
  }

  /**
   * Search workflows by keyword in name or description
   */
  async search(keyword: string): Promise<CustomWorkflowTemplate[]> {
    const db = getSQLiteDB()
    const pattern = `%${keyword}%`
    const rows = await db.queryAll<WorkflowRow>(
      `SELECT * FROM custom_workflows
       WHERE name LIKE ? OR description LIKE ?
       ORDER BY updated_at DESC`,
      [pattern, pattern]
    )
    return rows.map((row) => this.rowToWorkflow(row))
  }

  /**
   * Insert or update a workflow
   */
  async save(workflow: CustomWorkflowTemplate): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()

    await db.execute(
      `INSERT INTO custom_workflows (
        id, name, description, domain, entry_node_id, nodes_json, edges_json,
        source, version, enabled, created_at, updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         domain = excluded.domain,
         entry_node_id = excluded.entry_node_id,
         nodes_json = excluded.nodes_json,
         edges_json = excluded.edges_json,
         source = excluded.source,
         version = excluded.version,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [
        workflow.id,
        workflow.name,
        workflow.description || null,
        workflow.domain,
        workflow.entryNodeId || null,
        toJSON(workflow.nodes),
        toJSON(workflow.edges),
        workflow.source,
        workflow.version,
        boolToInt(workflow.enabled),
        workflow.createdAt || now,
        now,
      ]
    )
  }

  /**
   * Toggle workflow enabled status
   */
  async toggleEnabled(id: string, enabled: boolean): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE custom_workflows SET enabled = ?, updated_at = ? WHERE id = ?', [
      boolToInt(enabled),
      Date.now(),
      id,
    ])
  }

  /**
   * Rename a workflow
   */
  async rename(id: string, newName: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE custom_workflows SET name = ?, updated_at = ? WHERE id = ?', [
      newName,
      Date.now(),
      id,
    ])
  }

  /**
   * Delete a workflow by ID
   */
  async delete(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM custom_workflows WHERE id = ?', [id])
  }

  /**
   * Delete all workflows
   */
  async deleteAll(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM custom_workflows')
  }

  /**
   * Count total workflows
   */
  async count(): Promise<number> {
    const db = getSQLiteDB()
    const result = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM custom_workflows'
    )
    return result?.count || 0
  }

  /**
   * Get distinct domains
   */
  async getDomains(): Promise<string[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{ domain: string }>(
      'SELECT DISTINCT domain FROM custom_workflows ORDER BY domain'
    )
    return rows.map((r) => r.domain)
  }

  /**
   * Convert database row to domain object
   */
  private rowToWorkflow(row: WorkflowRow): CustomWorkflowTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      domain: row.domain as WorkflowDomain,
      entryNodeId: row.entry_node_id || '',
      nodes: parseJSON<CustomWorkflowNode[]>(row.nodes_json, []),
      edges: parseJSON<WorkflowEdge[]>(row.edges_json, []),
      source: row.source as WorkflowSource,
      version: row.version,
      enabled: intToBool(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let workflowRepoInstance: WorkflowRepository | null = null

export function getWorkflowRepository(): WorkflowRepository {
  if (!workflowRepoInstance) {
    workflowRepoInstance = new WorkflowRepository()
  }
  return workflowRepoInstance
}
