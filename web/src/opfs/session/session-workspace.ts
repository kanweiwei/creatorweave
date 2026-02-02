/**
 * Session Workspace
 *
 * Encapsulates a single session's OPFS operations.
 * Coordinates cache, pending queue, and undo storage for file operations.
 */

import type {
  FileContent,
  FileMetadata,
  PendingChange,
  UndoRecord,
  SyncResult,
} from '../types/opfs-types'
import { SessionCacheManager } from './session-cache'
import { SessionPendingManager } from './session-pending'
import { SessionUndoStorage } from './session-undo'

const SESSION_METADATA_FILE = 'session.json'

/**
 * Session metadata for persistence
 */
interface SessionMetadataPersist {
  sessionId: string
  createdAt: number
  lastAccessedAt: number
  rootDirectory: string
}

/**
 * Session Workspace
 *
 * Responsibilities:
 * - Encapsulate single session's OPFS operations
 * - Coordinate cache, pending queue, and undo storage
 * - Provide interfaces: readFile, writeFile, deleteFile, getPendingChanges, syncToDisk, clear
 */
export class SessionWorkspace {
  readonly sessionId: string
  readonly sessionDir: FileSystemDirectoryHandle
  readonly rootDirectory: string

  private readonly cacheManager: SessionCacheManager
  private readonly pendingManager: SessionPendingManager
  private readonly undoStorage: SessionUndoStorage

  private initialized = false
  private metadata: SessionMetadataPersist

  constructor(sessionId: string, sessionDir: FileSystemDirectoryHandle, rootDirectory: string) {
    this.sessionId = sessionId
    this.sessionDir = sessionDir
    this.rootDirectory = rootDirectory

    // Initialize managers
    this.cacheManager = new SessionCacheManager(sessionDir)
    this.pendingManager = new SessionPendingManager(sessionDir)
    this.undoStorage = new SessionUndoStorage(sessionDir)

    // Initial metadata
    this.metadata = {
      sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      rootDirectory,
    }
  }

  /**
   * Initialize session workspace
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Load or create metadata
    await this.loadMetadata()

    // Initialize all managers
    await Promise.all([
      this.cacheManager.initialize(),
      this.pendingManager.initialize(),
      this.undoStorage.initialize(),
    ])

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    this.initialized = true
  }

  /**
   * Load session metadata from OPFS
   */
  private async loadMetadata(): Promise<void> {
    try {
      const metadataFile = await this.sessionDir.getFileHandle(SESSION_METADATA_FILE)
      const file = await metadataFile.getFile()
      const text = await file.text()
      const data = JSON.parse(text) as SessionMetadataPersist

      this.metadata = data
    } catch {
      // Metadata doesn't exist yet, will be created on first save
      this.metadata = {
        sessionId: this.sessionId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        rootDirectory: this.rootDirectory,
      }
    }
  }

  /**
   * Save session metadata to OPFS
   */
  private async saveMetadata(): Promise<void> {
    const metadataFile = await this.sessionDir.getFileHandle(SESSION_METADATA_FILE, {
      create: true,
    })
    const writable = await metadataFile.createWritable()

    await writable.write(JSON.stringify(this.metadata, null, 2))
    await writable.close()
  }

  /**
   * Read file from session (cache first)
   * @param path File path
   * @param directoryHandle Real filesystem directory handle
   * @returns File content and metadata
   */
  async readFile(
    path: string,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<{ content: FileContent; metadata: FileMetadata }> {
    if (!this.initialized) await this.initialize()

    return await this.cacheManager.read(path, directoryHandle)
  }

  /**
   * Write file to session (cache + pending + undo)
   * @param path File path
   * @param content File content
   * @param directoryHandle Real filesystem directory handle (for old content)
   */
  async writeFile(
    path: string,
    content: FileContent,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Get old content for undo
    let oldContent: FileContent | undefined
    try {
      const oldData = await this.cacheManager.read(path, directoryHandle)
      oldContent = oldData.content
    } catch {
      // File doesn't exist, oldContent stays undefined
    }

    // Record to undo history
    await this.undoStorage.recordModification(path, content, oldContent)

    // Write to cache
    await this.cacheManager.write(path, content)

    // Mark as pending
    await this.pendingManager.add(path)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Delete file from session
   * @param path File path
   * @param directoryHandle Real filesystem directory handle (for old content)
   */
  async deleteFile(path: string, directoryHandle: FileSystemDirectoryHandle): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Get old content for undo
    let oldContent: FileContent | undefined
    try {
      const oldData = await this.cacheManager.read(path, directoryHandle)
      oldContent = oldData.content
    } catch {
      // File doesn't exist in cache
    }

    // Record to undo history
    await this.undoStorage.recordDeletion(path, oldContent)

    // Delete from cache
    await this.cacheManager.delete(path)

    // Mark as pending for deletion
    await this.pendingManager.markForDeletion(path)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Get pending changes
   */
  getPendingChanges(): PendingChange[] {
    return this.pendingManager.getAll()
  }

  /**
   * Get pending count
   */
  get pendingCount(): number {
    return this.pendingManager.count
  }

  /**
   * Get undo records
   */
  getUndoRecords(): UndoRecord[] {
    return this.undoStorage.getAll()
  }

  /**
   * Get undo count
   */
  get undoCount(): number {
    return this.undoStorage.count
  }

  /**
   * Undo a specific operation
   * @param recordId Undo record ID
   */
  async undo(recordId: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    await this.undoStorage.undo(recordId, this.cacheManager)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Redo a specific operation
   * @param recordId Undo record ID
   */
  async redo(recordId: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    await this.undoStorage.redo(recordId, this.cacheManager)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Sync pending changes to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @returns Sync result
   */
  async syncToDisk(directoryHandle: FileSystemDirectoryHandle): Promise<SyncResult> {
    if (!this.initialized) await this.initialize()

    const result = await this.pendingManager.sync(directoryHandle, this.cacheManager)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    return result
  }

  /**
   * Clear all session data (cache, pending, undo)
   */
  async clear(): Promise<void> {
    await Promise.all([
      this.cacheManager.clear(),
      this.pendingManager.clear(),
      this.undoStorage.clear(),
    ])

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    cache: { size: number; fileCount: number }
    pending: number
    undo: number
    metadata: SessionMetadataPersist
  }> {
    const cacheStats = await this.cacheManager.getStats()

    return {
      cache: cacheStats,
      pending: this.pendingCount,
      undo: this.undoCount,
      metadata: { ...this.metadata },
    }
  }

  /**
   * Get cached file paths
   */
  getCachedPaths(): string[] {
    return this.cacheManager.getCachedPaths()
  }

  /**
   * Check if file is in cache
   * @param path File path
   */
  hasCachedFile(path: string): boolean {
    return this.cacheManager.has(path)
  }

  /**
   * Prune undo records older than specified days
   * @param days Age in days
   */
  async pruneUndoOlderThan(days: number): Promise<number> {
    if (!this.initialized) await this.initialize()

    const pruned = await this.undoStorage.pruneOlderThan(days)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    return pruned
  }

  /**
   * Get session metadata
   */
  getMetadata(): SessionMetadataPersist {
    return { ...this.metadata }
  }

  /**
   * Update root directory
   * @param rootDirectory New root directory
   */
  async updateRootDirectory(rootDirectory: string): Promise<void> {
    this.metadata.rootDirectory = rootDirectory
    await this.saveMetadata()
  }
}
