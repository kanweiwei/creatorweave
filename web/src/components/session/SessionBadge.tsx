/**
 * SessionBadge - displays current OPFS session status
 *
 * Shows:
 * - Current session name (active conversation)
 * - Pending changes count
 * - Undo records count
 */

import React, { useCallback, useMemo } from 'react'
import { useSessionStore } from '@/store/session.store'
import { Clock, RotateCcw, AlertCircle } from 'lucide-react'

export interface SessionBadgeProps {
  /** Optional click handler */
  onClick?: () => void
  /** Compact mode (show only counts) */
  compact?: boolean
}

export const SessionBadge: React.FC<SessionBadgeProps> = ({ onClick, compact = false }) => {
  const { activeSessionId, sessions, currentPendingCount, currentUndoCount, initialized } =
    useSessionStore()

  // Get current session info
  const currentSession = useMemo(() => {
    if (!activeSessionId) return null
    return sessions.find((s) => s.id === activeSessionId)
  }, [activeSessionId, sessions])

  const displayName = useMemo(() => {
    if (!currentSession) return '未初始化'
    return currentSession.name || activeSessionId?.slice(0, 8) || '未知会话'
  }, [currentSession, activeSessionId])

  const hasPending = currentPendingCount > 0
  const hasUndo = currentUndoCount > 0

  const handleClick = useCallback(() => {
    onClick?.()
  }, [onClick])

  // Not initialized yet
  if (!initialized) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>初始化中...</span>
      </div>
    )
  }

  // No active session
  if (!activeSessionId || !currentSession) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>无会话</span>
      </div>
    )
  }

  // Compact mode - show only status dots
  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
        title={displayName}
      >
        <span className="max-w-[80px] truncate">{displayName}</span>
        {hasPending && (
          <span
            className="flex h-5 items-center gap-1 rounded-full bg-amber-100 px-1.5 text-amber-700"
            title={`${currentPendingCount} 个待同步`}
          >
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-medium">{currentPendingCount}</span>
          </span>
        )}
        {hasUndo && (
          <span
            className="flex h-5 items-center gap-1 rounded-full bg-blue-100 px-1.5 text-blue-700"
            title={`${currentUndoCount} 个可撤销`}
          >
            <RotateCcw className="h-3 w-3" />
            <span className="text-[10px] font-medium">{currentUndoCount}</span>
          </span>
        )}
      </button>
    )
  }

  // Full mode
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
      title={`当前会话: ${displayName}`}
    >
      {/* Session name */}
      <span className="max-w-[120px] truncate text-neutral-700">{displayName}</span>

      {/* Pending count */}
      {hasPending && (
        <span
          className="flex h-5 items-center gap-1 rounded-full bg-amber-100 px-1.5 text-amber-700"
          title={`${currentPendingCount} 个待同步变更`}
        >
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-medium">{currentPendingCount}</span>
        </span>
      )}

      {/* Undo count */}
      {hasUndo && (
        <span
          className="flex h-5 items-center gap-1 rounded-full bg-blue-100 px-1.5 text-blue-700"
          title={`${currentUndoCount} 个可撤销操作`}
        >
          <RotateCcw className="h-3 w-3" />
          <span className="text-[10px] font-medium">{currentUndoCount}</span>
        </span>
      )}

      {/* No changes indicator */}
      {!hasPending && !hasUndo && <span className="text-xs text-neutral-400">无变更</span>}
    </button>
  )
}
