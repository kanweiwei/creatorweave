/**
 * OPFS Session Module
 *
 * Multi-session workspace architecture for browser file system operations.
 * Each conversation/session has isolated cache, pending queue, and undo history.
 *
 * Architecture:
 * - SessionManager: Top-level manager for multiple session workspaces
 * - SessionWorkspace: Encapsulates single session's OPFS operations
 * - SessionCacheManager: Per-session file caching with mtime-based change detection
 * - SessionPendingManager: Per-session pending sync queue management
 * - SessionUndoStorage: Per-session undo history stored in OPFS
 */

export { SessionManager } from './session-manager'
export { SessionWorkspace } from './session-workspace'
export { SessionCacheManager } from './session-cache'
export { SessionPendingManager } from './session-pending'
export { SessionUndoStorage } from './session-undo'
