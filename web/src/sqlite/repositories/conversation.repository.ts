/**
 * Conversation Repository
 *
 * SQLite-based storage for conversations (metadata only).
 * Messages are stored in the independent `messages` table via MessageRepository.
 */

import { getSQLiteDB, type ConversationRow, parseJSON, toJSON } from '../sqlite-database'
import type { ContextWindowUsage } from '@/agent/message-types'

export interface StoredConversation {
  id: string
  title: string
  titleMode?: 'auto' | 'manual'
  messages: unknown[] // Message[] — populated by MessageRepository, not this table
  lastContextWindowUsage?: ContextWindowUsage | null
  createdAt: number
  updatedAt: number
}

/** Lightweight conversation metadata without messages */
export interface ConversationMeta {
  id: string
  title: string
  titleMode?: 'auto' | 'manual'
  lastContextWindowUsage?: ContextWindowUsage | null
  createdAt: number
  updatedAt: number
}

//=============================================================================
// Conversation Repository
//=============================================================================

export class ConversationRepository {
  /**
   * Get all conversations metadata (without messages) ordered by updated_at desc.
   * Messages must be loaded separately via MessageRepository.findByConversation().
   */
  async findAll(): Promise<ConversationMeta[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<Pick<ConversationRow, 'id' | 'title' | 'title_mode' | 'context_usage_json' | 'created_at' | 'updated_at'>>(
      'SELECT id, title, title_mode, context_usage_json, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
    )
    return rows.map((row) => this.rowToMeta(row))
  }

  /**
   * Alias for findAll() — returns conversation metadata.
   */
  async findAllMeta(): Promise<ConversationMeta[]> {
    return this.findAll()
  }

  /**
   * Find conversation metadata by ID (without messages).
   */
  async findById(id: string): Promise<ConversationMeta | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<Pick<ConversationRow, 'id' | 'title' | 'title_mode' | 'context_usage_json' | 'created_at' | 'updated_at'>>(
      'SELECT id, title, title_mode, context_usage_json, created_at, updated_at FROM conversations WHERE id = ?',
      [id]
    )
    return row ? this.rowToMeta(row) : null
  }

  /**
   * Insert or update conversation metadata (no messages).
   * Messages are managed by MessageRepository.
   */
  async save(conversation: StoredConversation): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO conversations (id, title, title_mode, context_usage_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         title_mode = excluded.title_mode,
         context_usage_json = excluded.context_usage_json,
         updated_at = excluded.updated_at`,
      [
        conversation.id,
        conversation.title,
        conversation.titleMode || 'manual',
        toJSON(conversation.lastContextWindowUsage || null),
        conversation.createdAt,
        conversation.updatedAt,
      ]
    )
  }

  /**
   * Delete a conversation by ID.
   * Messages are cascade-deleted via FOREIGN KEY ON DELETE CASCADE.
   */
  async delete(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM conversations WHERE id = ?', [id])
  }

  /**
   * Delete all conversations
   */
  async deleteAll(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM conversations')
  }

  /**
   * Count conversations
   */
  async count(): Promise<number> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM conversations'
    )
    return row?.count || 0
  }

  /**
   * Get most recently updated conversation metadata
   */
  async findMostRecent(): Promise<ConversationMeta | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<Pick<ConversationRow, 'id' | 'title' | 'title_mode' | 'context_usage_json' | 'created_at' | 'updated_at'>>(
      'SELECT id, title, title_mode, context_usage_json, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 1'
    )
    return row ? this.rowToMeta(row) : null
  }

  /**
   * Update conversation title
   */
  async updateTitle(id: string, title: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [title, Date.now(), id])
  }

  /**
   * Touch conversation's updated_at timestamp without changing other fields.
   * Used after message-level operations via MessageRepository.
   */
  async touch(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), id])
  }

  /**
   * Save only the metadata fields (no messages).
   * Used by persistConversationMeta().
   */
  async saveMeta(meta: {
    id: string
    title: string
    titleMode?: 'auto' | 'manual'
    contextUsage?: ContextWindowUsage | null
    createdAt: number
    updatedAt: number
  }): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `INSERT INTO conversations (id, title, title_mode, context_usage_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         title_mode = excluded.title_mode,
         context_usage_json = excluded.context_usage_json,
         updated_at = excluded.updated_at`,
      [
        meta.id,
        meta.title,
        meta.titleMode || 'manual',
        toJSON(meta.contextUsage || null),
        meta.createdAt,
        meta.updatedAt,
      ]
    )
  }

  /**
   * Convert database row to metadata (no messages)
   */
  private rowToMeta(
    row: Pick<ConversationRow, 'id' | 'title' | 'title_mode' | 'context_usage_json' | 'created_at' | 'updated_at'>
  ): ConversationMeta {
    return {
      id: row.id,
      title: row.title,
      titleMode: row.title_mode === 'auto' ? 'auto' : 'manual',
      lastContextWindowUsage: parseJSON(row.context_usage_json || '', null),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let conversationRepoInstance: ConversationRepository | null = null

export function getConversationRepository(): ConversationRepository {
  if (!conversationRepoInstance) {
    conversationRepoInstance = new ConversationRepository()
  }
  return conversationRepoInstance
}
