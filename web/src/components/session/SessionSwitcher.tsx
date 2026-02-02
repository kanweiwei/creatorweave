/**
 * SessionSwitcher - dropdown menu for switching between OPFS sessions
 *
 * Displays:
 * - All available sessions
 * - Each session's pending/undo counts
 * - Active session indicator
 * - Switch session functionality
 */

import React, { useState, useCallback, useMemo } from 'react'
import { useSessionStore } from '@/store/session.store'
import { ChevronDown, Check, Clock, RotateCcw, Trash2, Plus } from 'lucide-react'

export interface SessionSwitcherProps {
  /** Callback when session is switched */
  onSessionSwitch?: (sessionId: string) => void
  /** Show create new session button */
  showCreate?: boolean
  /** Show delete session button */
  showDelete?: boolean
}

export const SessionSwitcher: React.FC<SessionSwitcherProps> = ({
  onSessionSwitch,
  showCreate = false,
  showDelete = false,
}) => {
  const [open, setOpen] = useState(false)
  const { activeSessionId, sessions, switchSession, deleteSession, isLoading } = useSessionStore()

  // Sort sessions: active first, then by lastActiveAt
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.id === activeSessionId) return -1
      if (b.id === activeSessionId) return 1
      return (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
    })
  }, [sessions, activeSessionId])

  const handleSwitch = useCallback(
    async (sessionId: string) => {
      try {
        await switchSession(sessionId)
        onSessionSwitch?.(sessionId)
        setOpen(false)
      } catch (error) {
        console.error('[SessionSwitcher] Failed to switch session:', error)
      }
    },
    [switchSession, onSessionSwitch]
  )

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation() // Prevent triggering switch

      if (!confirm('确定要删除此会话吗？所有缓存、待同步和撤销记录将被删除。')) {
        return
      }

      try {
        await deleteSession(sessionId)
      } catch (error) {
        console.error('[SessionSwitcher] Failed to delete session:', error)
      }
    },
    [deleteSession]
  )

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId)
  }, [sessions, activeSessionId])

  const displayName = useMemo(() => {
    if (!activeSession) return '选择会话'
    return activeSession.name || activeSessionId?.slice(0, 8) || '未知会话'
  }, [activeSession, activeSessionId])

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isLoading || sessions.length === 0}
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        <span className="max-w-[120px] truncate text-neutral-700">{displayName}</span>
        {sessions.length > 0 && (
          <span className="text-xs text-neutral-400">({sessions.length})</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />

          {/* Menu */}
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border bg-white shadow-lg">
            {/* Header */}
            <div className="border-b border-neutral-100 px-3 py-2">
              <span className="text-xs font-medium text-neutral-600">
                会话列表 ({sessions.length})
              </span>
            </div>

            {/* Session list */}
            <div className="custom-scrollbar max-h-80 overflow-y-auto">
              {sortedSessions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-neutral-400">暂无会话</div>
              ) : (
                <ul>
                  {sortedSessions.map((session) => {
                    const isActive = session.id === activeSessionId
                    const hasPending = session.pendingCount > 0
                    const hasUndo = session.undoCount > 0

                    return (
                      <li
                        key={session.id}
                        className={`flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 ${
                          isActive ? 'bg-primary-50' : ''
                        }`}
                      >
                        {/* Session selector */}
                        <button
                          type="button"
                          onClick={() => handleSwitch(session.id)}
                          className="flex flex-1 items-center gap-2 text-left"
                        >
                          {/* Active indicator */}
                          {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                          {!isActive && <span className="h-4 w-4 shrink-0" />}

                          {/* Session info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-xs font-medium text-neutral-700">
                                {session.name || session.id.slice(0, 8)}
                              </span>
                            </div>

                            {/* Status badges */}
                            <div className="mt-0.5 flex items-center gap-2">
                              {/* Pending count */}
                              {hasPending && (
                                <span
                                  className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700"
                                  title={`${session.pendingCount} 个待同步`}
                                >
                                  <Clock className="h-2.5 w-2.5" />
                                  {session.pendingCount}
                                </span>
                              )}

                              {/* Undo count */}
                              {hasUndo && (
                                <span
                                  className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700"
                                  title={`${session.undoCount} 个可撤销`}
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  {session.undoCount}
                                </span>
                              )}

                              {/* No changes */}
                              {!hasPending && !hasUndo && (
                                <span className="text-[10px] text-neutral-400">无变更</span>
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Delete button */}
                        {showDelete && !isActive && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, session.id)}
                            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                            title="删除会话"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer - Create new session */}
            {showCreate && (
              <div className="border-t border-neutral-100 p-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建会话
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
