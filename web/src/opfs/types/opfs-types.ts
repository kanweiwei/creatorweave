/**
 * OPFS (Origin Private File System) Type Definitions
 *
 * Core types for multi-session OPFS workspace architecture
 */

/**
 * File content type - supports both text and binary
 */
export type FileContent = string | ArrayBuffer | Blob

/**
 * File metadata
 */
export interface FileMetadata {
  /** File path */
  path: string
  /** File modification time (for change detection) */
  mtime: number
  /** File size in bytes */
  size: number
  /** Content type */
  contentType: 'text' | 'binary'
  /** Optional: content hash (for quick comparison) */
  hash?: string
}

/**
 * Session index - OPFS/index.json
 */
export interface SessionIndex {
  /** Metadata for all sessions */
  sessions: SessionMetadata[]
  /** Currently active session ID */
  activeSessionId: string
  /** Last modified time */
  lastModified: number
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  /** Session ID (corresponds to conversation.id) */
  id: string
  /** Session name */
  name: string
  /** Creation time */
  createdAt: number
  /** Last active time */
  lastActiveAt: number
  /** Cache size in bytes */
  cacheSize: number
  /** Pending sync count */
  pendingCount: number
  /** Undo record count */
  undoCount: number
  /** Number of files modified by this session */
  modifiedFiles: number
  /** Session status */
  status: 'active' | 'archived'
}

/**
 * File modification status
 */
export type FileStatus =
  /** Not modified */
  | 'unmodified'
  /** Modified by current session */
  | 'modified-by-current'
  /** Modified by other session */
  | 'modified-by-other'
  /** Modified by multiple sessions */
  | 'modified-by-multiple'

/**
 * Pending sync record - stores metadata only, not content
 * Content is read directly from OPFS and real filesystem when comparing
 */
export interface PendingChange {
  /** Unique ID */
  id: string
  /** File path */
  path: string
  /** Operation type */
  type: 'create' | 'modify' | 'delete'
  /** Real file modification time (for conflict detection) */
  fsMtime: number
  /** Operation timestamp */
  timestamp: number
  /** Associated Agent message ID */
  agentMessageId?: string
}

/**
 * Undo record - content is stored in OPFS
 */
export interface UndoRecord {
  /** Unique ID */
  id: string
  /** File path */
  path: string
  /** Operation type */
  type: 'create' | 'modify' | 'delete'
  /** Path to old content in OPFS (not in memory) */
  oldContentPath?: string
  /** Path to new content in OPFS */
  newContentPath?: string
  /** Operation timestamp */
  timestamp: number
  /** Whether the record has been undone */
  undone: boolean
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Number of successful syncs */
  success: number
  /** Number of failed syncs */
  failed: number
  /** Number of skipped syncs (conflicts, etc.) */
  skipped: number
  /** Conflict list */
  conflicts: ConflictInfo[]
}

/**
 * Conflict information
 */
export interface ConflictInfo {
  /** File path */
  path: string
  /** Current session */
  session: string
  /** Other sessions that modified this file */
  otherSessions: string[]
  /** OPFS version timestamp */
  opfsMtime: number
  /** Current filesystem file timestamp */
  currentFsMtime: number
}

/**
 * Storage status
 */
export type StorageStatus = 'normal' | 'warning' | 'urgent' | 'critical' | 'full'

/**
 * Storage threshold configuration
 */
export const STORAGE_THRESHOLDS = {
  /** 70% - Show notification */
  WARNING: 0.7,
  /** 80% - Block large files */
  URGENT: 0.8,
  /** 95% - Block most operations */
  CRITICAL: 0.95,
  /** 100% - Must clean up */
  FULL: 1.0,
} as const

/**
 * Storage estimate
 */
export interface StorageEstimate {
  /** Total quota in bytes */
  quota: number
  /** Usage in bytes */
  usage: number
  /** Storage details by type (only in some browsers) */
  usageDetails?: {
    [key: string]: number
  }
}

/**
 * OPFS detailed usage breakdown
 */
export interface DetailedUsage {
  /** Project file cache size */
  projectFiles: number
  /** Undo history size */
  undoHistory: number
  /** Other cache size */
  cache: number
  /** Temporary file size */
  temp: number
  /** Total */
  total: number
}
