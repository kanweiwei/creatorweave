/**
 * File Discovery Service - Host side
 *
 * Provides file search and recent files tracking for Remote sessions.
 */

import { type FileEntry } from '@/remote/remote-protocol'

// ============================================================================
// Types
// ============================================================================

interface SearchOptions {
  limit?: number
  includeDirectories?: boolean
}

interface RecentFileEntry extends FileEntry {
  lastAccessed: number
  accessCount: number
}

// ============================================================================
// Service
// ============================================================================

class FileDiscoveryService {
  private recentFiles: Map<string, RecentFileEntry> = new Map()
  private maxRecentFiles = 10

  // ==========================================================================
  // Search
  // ==========================================================================

  /**
   * Search files by name (supports fuzzy matching)
   */
  search(query: string, fileTree: FileEntry[], options: SearchOptions = {}): FileEntry[] {
    const { limit = 50, includeDirectories = false } = options

    if (!query.trim()) {
      return []
    }

    const lowerQuery = query.toLowerCase()
    const results: FileEntry[] = []

    // Recursive search through file tree
    const searchRecursive = (entries: FileEntry[]) => {
      for (const entry of entries) {
        // Match file name
        const match = this.matchFileName(entry.name, lowerQuery)

        if (match) {
          // Skip directories if not included
          if (entry.type === 'file' || includeDirectories) {
            results.push(entry)

            if (results.length >= limit) {
              return true // Stop searching
            }
          }
        }

        // Recursively search directories
        if (entry.type === 'directory' && entry.children) {
          if (searchRecursive(entry.children)) {
            return true
          }
        }
      }
      return false
    }

    searchRecursive(fileTree)

    return results
  }

  /**
   * Match file name against query (fuzzy matching)
   */
  private matchFileName(fileName: string, query: string): boolean {
    const lowerName = fileName.toLowerCase()

    // Exact match
    if (lowerName === query) {
      return true
    }

    // Contains match
    if (lowerName.includes(query)) {
      return true
    }

    // Starts with match
    if (lowerName.startsWith(query)) {
      return true
    }

    // Fuzzy match: match first letters of parts
    // e.g., "fc" matches "FileController.ts"
    const parts = lowerName.split(/[^a-z0-9]/)
    const firstLetters = parts
      .filter((p) => p.length > 0)
      .map((p) => p[0])
      .join('')
    if (firstLetters.includes(query)) {
      return true
    }

    return false
  }

  // ==========================================================================
  // Recent Files
  // ==========================================================================

  /**
   * Track a file access (called when user views/edits a file)
   */
  trackFileAccess(file: FileEntry): void {
    const existing = this.recentFiles.get(file.path)

    if (existing) {
      // Update existing entry
      existing.lastAccessed = Date.now()
      existing.accessCount++
    } else {
      // Add new entry
      this.recentFiles.set(file.path, {
        ...file,
        lastAccessed: Date.now(),
        accessCount: 1,
      })
    }

    // Trim to max size
    this.trimRecentFiles()
  }

  /**
   * Get recent files list, sorted by last accessed
   */
  getRecentFiles(): FileEntry[] {
    return Array.from(this.recentFiles.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, this.maxRecentFiles)
      .map(({ lastAccessed, accessCount, ...file }) => file)
  }

  /**
   * Clear recent files (e.g., when switching directories)
   */
  clearRecentFiles(): void {
    this.recentFiles.clear()
  }

  /**
   * Trim recent files to max size
   */
  private trimRecentFiles(): void {
    if (this.recentFiles.size <= this.maxRecentFiles) {
      return
    }

    // Sort by last accessed and remove oldest
    const sorted = Array.from(this.recentFiles.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    )

    const toRemove = sorted.slice(0, this.recentFiles.size - this.maxRecentFiles)
    for (const [path] of toRemove) {
      this.recentFiles.delete(path)
    }
  }

  // ==========================================================================
  // File Tree Conversion
  // ==========================================================================

  /**
   * Build a hierarchical FileEntry tree from flat FileMetadata array
   * This is used to convert traversal results into a searchable tree structure
   */
  buildFileTreeFromMetadata(
    files: Array<{
      name: string
      size: number
      type: 'file' | 'directory'
      lastModified: number
      path: string
    }>
  ): FileEntry | null {
    if (files.length === 0) return null

    // Create a map of path -> entry for O(1) lookup
    const entryMap = new Map<string, FileEntry>()

    // First pass: create all entries
    for (const file of files) {
      const extension = file.type === 'file' ? file.name.split('.').pop() || '' : undefined

      const entry: FileEntry = {
        path: file.path,
        name: file.name,
        type: file.type,
        extension,
        size: file.size,
        modified: file.lastModified,
        children: file.type === 'directory' ? [] : undefined,
      }
      entryMap.set(file.path, entry)
    }

    // Second pass: build hierarchy by linking children to parents
    const rootEntries: FileEntry[] = []

    for (const [path, entry] of entryMap) {
      if (entry.type === 'directory') {
        // Find all direct children of this directory
        for (const [childPath, childEntry] of entryMap) {
          if (childPath !== path && childPath.startsWith(path + '/')) {
            // Check if this is a direct child (no other intermediate directory)
            const relativePath = childPath.slice(path.length + 1)
            const slashIndex = relativePath.indexOf('/')
            const isDirectChild = slashIndex === -1

            if (isDirectChild && entry.children) {
              entry.children.push(childEntry)
            }
          }
        }
      }

      // Check if this is a root-level entry (no parent in our set)
      const parentPath = path.substring(0, path.lastIndexOf('/'))
      if (!parentPath || !entryMap.has(parentPath)) {
        rootEntries.push(entry)
      }
    }

    // If we have multiple root entries, create a virtual root
    if (rootEntries.length === 0) {
      return null
    }

    if (rootEntries.length === 1) {
      return rootEntries[0]
    }

    // Multiple root entries - return the first one that looks like a root directory
    // or create a virtual root
    const virtualRoot: FileEntry = {
      path: '',
      name: 'root',
      type: 'directory',
      children: rootEntries,
    }
    return virtualRoot
  }

  /**
   * Convert filesystem store tree to FileEntry format
   */
  convertToFileEntry(node: any): FileEntry {
    return {
      path: node.path,
      name: node.name,
      type: node.type,
      extension: node.extension,
      size: node.size,
      modified: node.modified,
    }
  }

  /**
   * Convert entire file tree to flat array for search
   */
  convertFileTreeToFlat(root: FileEntry): FileEntry[] {
    const result: FileEntry[] = []

    const flatten = (entry: FileEntry) => {
      result.push(entry)

      if (entry.type === 'directory' && entry.children) {
        for (const child of entry.children) {
          flatten(child)
        }
      }
    }

    flatten(root)
    return result
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const fileDiscoveryService = new FileDiscoveryService()
