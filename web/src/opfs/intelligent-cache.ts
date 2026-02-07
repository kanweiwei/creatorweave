/**
 * OPFS Intelligent Cache Manager
 *
 * Enhances the existing SessionCacheManager with:
 * - Hot/Cold file classification
 * - Smart preloading based on access patterns
 * - LRU (Least Recently Used) eviction policy
 * - Cache size limits and automatic cleanup
 * - Performance monitoring
 */

//=============================================================================
// Types and Interfaces
//=============================================================================

export interface CacheEntry {
  path: string
  /** Number of times accessed */
  accessCount: number
  /** Last access timestamp */
  lastAccess: number
  /** First access timestamp */
  firstAccess: number
  /** File size in bytes */
  size: number
  /** Content type */
  contentType: 'text' | 'binary'
  /** How hot this file is (0-1) */
  hotness: number
}

export interface CacheStats {
  /** Total cache size in bytes */
  totalSize: number
  /** Number of cached files */
  fileCount: number
  /** Number of cache hits */
  hits: number
  /** Number of cache misses */
  misses: number
  /** Hit rate (0-1) */
  hitRate: number
  /** Hot files (frequently accessed) */
  hotFiles: string[]
  /** Cold files (rarely accessed) */
  coldFiles: string[]
}

export interface CacheConfig {
  /** Maximum cache size in bytes (default: 50MB) */
  maxSize: number
  /** Maximum number of files (default: 500) */
  maxFiles: number
  /** Hot file threshold (access count) */
  hotThreshold: number
  /** Cold file threshold (days since last access) */
  coldThresholdDays: number
  /** Enable automatic cleanup */
  autoCleanup: boolean
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 500,
  hotThreshold: 5,
  coldThresholdDays: 7,
  autoCleanup: true,
}

//=============================================================================
// Intelligent Cache Manager
//=============================================================================

export class IntelligentCacheManager {
  private entries = new Map<string, CacheEntry>()
  private accessSequence: string[] = [] // For LRU tracking
  private stats = { hits: 0, misses: 0 }
  private config: CacheConfig

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }
  }

  /**
   * Record a file access (call this when reading a file)
   */
  recordAccess(path: string, size: number, contentType: 'text' | 'binary'): void {
    const now = Date.now()
    const existing = this.entries.get(path)

    if (existing) {
      // Update existing entry
      existing.accessCount++
      existing.lastAccess = now
      existing.hotness = this.calculateHotness(existing)
      this.stats.hits++
    } else {
      // Create new entry
      this.entries.set(path, {
        path,
        accessCount: 1,
        lastAccess: now,
        firstAccess: now,
        size,
        contentType,
        hotness: 0, // Will be calculated on next access
      })
      this.stats.misses++
      this.accessSequence.push(path)
    }
  }

  /**
   * Calculate hotness score (0-1) based on access patterns
   */
  private calculateHotness(entry: CacheEntry): number {
    const now = Date.now()
    const daysSinceFirstAccess = (now - entry.firstAccess) / (1000 * 60 * 60 * 24)
    const daysSinceLastAccess = (now - entry.lastAccess) / (1000 * 60 * 60 * 24)

    // Access frequency (accesses per day)
    const accessFrequency = entry.accessCount / Math.max(daysSinceFirstAccess, 1)

    // Recency bonus (more recent = higher)
    const recencyBonus = Math.max(0, 1 - daysSinceLastAccess / 30) // Decay over 30 days

    // Combined score
    return Math.min(1, accessFrequency * 0.7 + recencyBonus * 0.3)
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalSize = Array.from(this.entries.values()).reduce((sum, e) => sum + e.size, 0)
    const totalRequests = this.stats.hits + this.stats.misses
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0

    // Calculate hot and cold files
    const now = Date.now()
    const coldThresholdMs = this.config.coldThresholdDays * 24 * 60 * 60 * 1000

    const hotFiles: string[] = []
    const coldFiles: string[] = []

    for (const [path, entry] of this.entries) {
      if (entry.accessCount >= this.config.hotThreshold) {
        hotFiles.push(path)
      } else if (now - entry.lastAccess > coldThresholdMs) {
        coldFiles.push(path)
      }
    }

    return {
      totalSize,
      fileCount: this.entries.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      hotFiles,
      coldFiles,
    }
  }

  /**
   * Get files to preload (based on access patterns)
   */
  getFilesToPreload(currentPath: string, availablePaths: string[]): string[] {
    const toPreload: string[] = []
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/'))

    // Strategy 1: Same directory files (often accessed together)
    for (const path of availablePaths) {
      if (path.startsWith(currentDir) && path !== currentPath) {
        const entry = this.entries.get(path)
        // If previously accessed or in same directory
        if (entry || path.startsWith(currentDir)) {
          toPreload.push(path)
        }
      }
    }

    // Strategy 2: Previously hot files
    const stats = this.getStats()
    for (const hotPath of stats.hotFiles) {
      if (availablePaths.includes(hotPath) && !toPreload.includes(hotPath)) {
        toPreload.push(hotPath)
      }
    }

    // Limit preload count
    return toPreload.slice(0, 10)
  }

  /**
   * Get files to evict (when cache is full)
   */
  getFilesToEvict(neededSpace: number): string[] {
    const toEvict: string[] = []
    let freedSpace = 0

    // Sort by LRU (least recently used) and cold files
    const sorted = Array.from(this.entries.entries()).sort((a, b) => {
      // First prioritize cold files
      const aCold = this.isCold(a[1])
      const bCold = this.isCold(b[1])
      if (aCold && !bCold) return -1
      if (!aCold && bCold) return 1

      // Then by last access time
      return a[1].lastAccess - b[1].lastAccess
    })

    for (const [path, entry] of sorted) {
      if (freedSpace >= neededSpace) break

      // Don't evict hot files unless absolutely necessary
      if (entry.accessCount >= this.config.hotThreshold && freedSpace === 0) {
        continue
      }

      toEvict.push(path)
      freedSpace += entry.size
    }

    return toEvict
  }

  /**
   * Check if a file entry is cold
   */
  private isCold(entry: CacheEntry): boolean {
    const now = Date.now()
    const coldThresholdMs = this.config.coldThresholdDays * 24 * 60 * 60 * 1000
    return entry.accessCount < this.config.hotThreshold && now - entry.lastAccess > coldThresholdMs
  }

  /**
   * Remove entries from cache tracking
   */
  remove(paths: string[]): void {
    for (const path of paths) {
      this.entries.delete(path)
      const index = this.accessSequence.indexOf(path)
      if (index !== -1) {
        this.accessSequence.splice(index, 1)
      }
    }
  }

  /**
   * Clear all cache tracking
   */
  clear(): void {
    this.entries.clear()
    this.accessSequence = []
    this.stats = { hits: 0, misses: 0 }
  }

  /**
   * Check if cleanup is needed
   */
  needsCleanup(): boolean {
    const stats = this.getStats()
    return stats.totalSize > this.config.maxSize || stats.fileCount > this.config.maxFiles
  }

  /**
   * Get recommended files for cleanup
   */
  getCleanupRecommendation(): {
    reason: string
    files: string[]
    spaceToFree: number
  } | null {
    if (!this.needsCleanup()) return null

    const stats = this.getStats()
    const overflow = Math.max(
      0,
      stats.totalSize - this.config.maxSize,
      stats.fileCount - this.config.maxFiles
    )

    const files = this.getFilesToEvict(overflow)
    const spaceToFree = files.reduce((sum, path) => sum + (this.entries.get(path)?.size || 0), 0)

    let reason = ''
    if (stats.totalSize > this.config.maxSize) {
      reason = `Cache size (${(stats.totalSize / 1024 / 1024).toFixed(1)}MB) exceeds limit (${(this.config.maxSize / 1024 / 1024).toFixed(1)}MB)`
    } else if (stats.fileCount > this.config.maxFiles) {
      reason = `File count (${stats.fileCount}) exceeds limit (${this.config.maxFiles})`
    }

    return { reason, files, spaceToFree }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let instance: IntelligentCacheManager | null = null

export function getIntelligentCacheManager(): IntelligentCacheManager {
  if (!instance) {
    instance = new IntelligentCacheManager()
  }
  return instance
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Estimate cache hit rate from recent activity
 */
export function getRecentHitRate(_windowMs: number = 60000): number {
  // windowMs parameter reserved for future time-windowed hit rate calculation
  const manager = getIntelligentCacheManager()
  const stats = manager.getStats()
  return stats.hitRate
}

/**
 * Get cache performance report
 */
export function getCachePerformanceReport(): string {
  const manager = getIntelligentCacheManager()
  const stats = manager.getStats()

  const hitRatePercent = (stats.hitRate * 100).toFixed(1)
  const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2)

  let report = `Cache Performance:\n`
  report += `- Hit Rate: ${hitRatePercent}% (${stats.hits}/${stats.hits + stats.misses})\n`
  report += `- Size: ${sizeMB}MB (${stats.fileCount} files)\n`

  if (stats.hotFiles.length > 0) {
    report += `- Hot Files: ${stats.hotFiles.length}\n`
  }

  if (stats.coldFiles.length > 0) {
    report += `- Cold Files: ${stats.coldFiles.length} (eligible for cleanup)\n`
  }

  const cleanup = manager.getCleanupRecommendation()
  if (cleanup) {
    report += `\nCleanup Recommended: ${cleanup.reason}\n`
    report += `Can free ${(cleanup.spaceToFree / 1024 / 1024).toFixed(2)}MB by removing ${cleanup.files.length} files\n`
  }

  return report
}
