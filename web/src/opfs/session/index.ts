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

/**
 * Get or create the singleton SessionManager instance
 */
import { SessionManager as SessionManagerClass } from './session-manager'

let sessionManagerInstance: SessionManagerClass | null = null

export async function getSessionManager(): Promise<SessionManagerClass> {
  if (!sessionManagerInstance) {
    const manager = new SessionManagerClass()
    await manager.initialize()
    sessionManagerInstance = manager
  }
  return sessionManagerInstance
}

/**
 * Reset the session manager singleton (useful for testing)
 */
export function resetSessionManager(): void {
  sessionManagerInstance = null
}
