/**
 * Session Cache Manager
 *
 * Per-session file caching with mtime-based change detection.
 * Files are read from cache when unchanged, or fetched from filesystem when modified.
 */

import type { FileContent, FileMetadata } from '../types/opfs-types'
import { encodePath, getFileContentType, getFileMetadata } from '../utils/opfs-utils'

const CACHE_DIR = 'cache'
const METADATA_FILE = 'metadata.json'

/**
 * Cache entry in the index
 */
interface CacheEntry {
  path: string
  mtime: number
  size: number
  contentType: 'text' | 'binary'
  cachedAt: number
}

/**
 * Cache index for persisting metadata
 */
interface CacheIndex {
  entries: Record<string, CacheEntry>
}

/**
 * Session Cache Manager
 *
 * Responsibilities:
 * - Manage per-session file cache
 * - Detect file changes using mtime comparison
 * - Read from cache or fall back to real filesystem
 * - Persist cache index to OPFS
 */
export class SessionCacheManager {
  private readonly sessionDir: FileSystemDirectoryHandle
  private cacheDir?: FileSystemDirectoryHandle
  private index: Map<string, CacheEntry> = new Map()
  private initialized = false

  constructor(sessionDir: FileSystemDirectoryHandle) {
    this.sessionDir = sessionDir
  }

  /**
   * Initialize cache manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Get or create cache directory
    this.cacheDir = await this.sessionDir.getDirectoryHandle(CACHE_DIR, { create: true })

    // Load cache index
    await this.loadIndex()

    this.initialized = true
  }

  /**
   * Load cache index from OPFS
   */
  private async loadIndex(): Promise<void> {
    try {
      const indexFile = await this.cacheDir!.getFileHandle(METADATA_FILE)
      const file = await indexFile.getFile()
      const text = await file.text()
      const data: CacheIndex = JSON.parse(text)

      this.index = new Map(
        Object.entries(data.entries).map(([key, value]: [string, CacheEntry]) => [key, value])
      )
    } catch {
      // Index file doesn't exist yet
      this.index = new Map()
    }
  }

  /**
   * Save cache index to OPFS
   */
  private async saveIndex(): Promise<void> {
    if (!this.cacheDir) return

    const indexFile = await this.cacheDir.getFileHandle(METADATA_FILE, { create: true })
    const writable = await indexFile.createWritable()

    const data: CacheIndex = {
      entries: Object.fromEntries(this.index.entries()),
    }

    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  /**
   * Read file (prioritize cache)
   * @param path File path
   * @param directoryHandle Real filesystem directory handle
   * @returns File content and metadata
   */
  async read(
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ content: FileContent; metadata: FileMetadata }> {
    if (!this.initialized) await this.initialize()

    const cachedEntry = this.index.get(path)

    if (!directoryHandle) {
      if (!cachedEntry) {
        throw new Error(`File not found in OPFS cache: ${path}`)
      }
      const content = await this.readFromCache(path)
      return {
        content,
        metadata: {
          path,
          mtime: cachedEntry.mtime,
          size: cachedEntry.size,
          contentType: cachedEntry.contentType,
        },
      }
    }

    // Get current file metadata from filesystem
    const fileHandle = await this.getFileHandle(path, directoryHandle)
    const metadata = await getFileMetadata(fileHandle, path)

    // Check if cache is valid (mtime matches)
    if (cachedEntry && cachedEntry.mtime === metadata.mtime) {
      try {
        // Cache hit - read from OPFS
        const content = await this.readFromCache(path)
        return { content, metadata }
      } catch {
        // Cache read failed, fall back to filesystem
        console.warn(`Cache read failed for ${path}, reading from filesystem`)
      }
    }

    // Cache miss or file modified - read from filesystem
    const file = await fileHandle.getFile()
    const content: FileContent =
      metadata.contentType === 'text' ? await file.text() : await file.arrayBuffer()

    // Update cache
    await this.writeToCache(path, content)
    this.updateIndex(path, metadata)

    return { content, metadata }
  }

  /**
   * Write file to cache
   * @param path File path
   * @param content File content
   */
  async write(path: string, content: FileContent): Promise<void> {
    if (!this.initialized) await this.initialize()

    await this.writeToCache(path, content)

    // Update index (use current time as mtime for uncommitted changes)
    this.index.set(path, {
      path,
      mtime: Date.now(),
      size:
        content instanceof Blob
          ? content.size
          : typeof content === 'string'
            ? new Blob([content]).size
            : content.byteLength,
      contentType: getFileContentType(path),
      cachedAt: Date.now(),
    })

    await this.saveIndex()
  }

  /**
   * Delete file from cache
   * @param path File path
   */
  async delete(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    const encodedPath = encodePath(path)

    try {
      await this.cacheDir!.removeEntry(encodedPath)
    } catch {
      // File doesn't exist in cache, ignore
    }

    this.index.delete(path)
    await this.saveIndex()
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Delete all cached files
    for (const path of this.index.keys()) {
      try {
        const encodedPath = encodePath(path)
        await this.cacheDir!.removeEntry(encodedPath)
      } catch (err) {
        console.warn(`Failed to delete cache file: ${path}`, err)
      }
    }

    this.index.clear()
    await this.saveIndex()
  }

  /**
   * Read content from OPFS cache
   */
  private async readFromCache(path: string): Promise<FileContent> {
    if (!this.cacheDir) throw new Error('Cache directory not initialized')

    const encodedPath = encodePath(path)
    const cacheFile = await this.cacheDir.getFileHandle(encodedPath)
    const file = await cacheFile.getFile()

    // Try to read as text first, fall back to binary
    try {
      return await file.text()
    } catch {
      return await file.arrayBuffer()
    }
  }

  /**
   * Read file content directly from cache without touching native filesystem.
   * Returns null if the file is not cached.
   */
  async readCached(path: string): Promise<FileContent | null> {
    if (!this.initialized) await this.initialize()
    if (!this.index.has(path)) {
      return null
    }

    try {
      return await this.readFromCache(path)
    } catch {
      return null
    }
  }

  /**
   * Write content to OPFS cache
   */
  private async writeToCache(path: string, content: FileContent): Promise<void> {
    if (!this.cacheDir) throw new Error('Cache directory not initialized')

    const encodedPath = encodePath(path)
    const cacheFile = await this.cacheDir.getFileHandle(encodedPath, { create: true })
    const writable = await cacheFile.createWritable()

    if (typeof content === 'string') {
      await writable.write(content)
    } else if (content instanceof Blob) {
      await writable.write(content)
    } else {
      await writable.write(content)
    }

    await writable.close()
  }

  /**
   * Update cache index entry
   */
  private updateIndex(path: string, metadata: FileMetadata): void {
    this.index.set(path, {
      path,
      mtime: metadata.mtime,
      size: metadata.size,
      contentType: metadata.contentType,
      cachedAt: Date.now(),
    })
    this.saveIndex().catch(console.error)
  }

  /**
   * Get file handle from filesystem
   */
  private async getFileHandle(
    path: string,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<FileSystemFileHandle> {
    const parts = path.split('/')
    let current = directoryHandle

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      current = await this.getDirectoryHandleByName(current, parts[i])
    }

    // Get file handle
    const fileName = parts[parts.length - 1]
    if (!fileName) {
      throw new Error(`Invalid file path: ${path}`)
    }

    return await this.getFileHandleByName(current, fileName)
  }

  /**
   * Resolve directory by exact name.
   * Falls back to directory iteration when direct lookup rejects the name.
   */
  private async getDirectoryHandleByName(
    parent: FileSystemDirectoryHandle,
    name: string
  ): Promise<FileSystemDirectoryHandle> {
    try {
      return await parent.getDirectoryHandle(name)
    } catch (error) {
      const matched = await this.findEntryByName(parent, name, 'directory')
      if (matched) return matched
      throw error
    }
  }

  /**
   * Resolve file by exact name.
   * Falls back to directory iteration when direct lookup rejects the name.
   */
  private async getFileHandleByName(
    parent: FileSystemDirectoryHandle,
    name: string
  ): Promise<FileSystemFileHandle> {
    try {
      return await parent.getFileHandle(name)
    } catch (error) {
      const matched = await this.findEntryByName(parent, name, 'file')
      if (matched) return matched
      throw error
    }
  }

  private async findEntryByName(
    parent: FileSystemDirectoryHandle,
    name: string,
    kind: 'file'
  ): Promise<FileSystemFileHandle | null>
  private async findEntryByName(
    parent: FileSystemDirectoryHandle,
    name: string,
    kind: 'directory'
  ): Promise<FileSystemDirectoryHandle | null>
  private async findEntryByName(
    parent: FileSystemDirectoryHandle,
    name: string,
    kind: 'file' | 'directory'
  ): Promise<FileSystemFileHandle | FileSystemDirectoryHandle | null> {
    for await (const [entryName, handle] of parent.entries()) {
      if (entryName === name && handle.kind === kind) {
        return handle as FileSystemFileHandle | FileSystemDirectoryHandle
      }
    }
    return null
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ size: number; fileCount: number }> {
    if (!this.initialized) return { size: 0, fileCount: 0 }

    let size = 0
    let fileCount = 0

    for (const entry of this.index.values()) {
      size += entry.size
      fileCount++
    }

    return { size, fileCount }
  }

  /**
   * Check if file is in cache
   */
  has(path: string): boolean {
    return this.index.has(path)
  }

  /**
   * Get all cached file paths
   */
  getCachedPaths(): string[] {
    return Array.from(this.index.keys())
  }
}
