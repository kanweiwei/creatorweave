/**
 * useUnloadGuard - prevent accidental page close/refresh when there are unsaved changes.
 *
 * Registers a `beforeunload` listener that triggers the browser's native
 * "Leave site?" confirmation dialog whenever:
 * - the workspace store reports pending file changes that haven't been synced, OR
 * - a conversation (agent loop) is currently running.
 *
 * The hook is a no-op when there is nothing to protect.
 *
 * NOTE: We only check `currentPendingCount` (which reflects the actual pending
 * ledger count from refreshPendingChanges). We intentionally do NOT check
 * `pendingChanges?.changes.length` separately because during sync-to-disk,
 * that field may briefly hold stale data while the async refresh hasn't completed.
 */
import { useEffect } from 'react'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'

export function useUnloadGuard() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // Only check the canonical pending count from workspace store.
      // This is updated by refreshPendingChanges which runs after sync completes.
      const { currentPendingCount } = useConversationContextStore.getState()

      // Also guard when any agent loop is active (activeRunId indicates the
      // conversation is currently streaming/processing).
      const { conversations } = useConversationStore.getState()
      const isRunning = conversations.some(conv => !!conv.activeRunId)

      if (currentPendingCount === 0 && !isRunning) return

      // Modern browsers require preventDefault() to show the confirmation dialog.
      e.preventDefault()
      // Fallback for older browsers (Chrome < 119, Firefox < 116)
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}
