/**
 * Remote Panel - displays connection status and session controls.
 *
 * Shows:
 * - Connection state indicator
 * - Session ID (with copy button)
 * - Peer count
 * - Disconnect button
 */

import React, { useState, useCallback } from 'react'
import { useRemoteStore } from '@/store/remote.store'
import { SessionDialog } from './SessionDialog'

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  disconnected: { label: 'Disconnected', color: 'bg-gray-400' },
  connecting: { label: 'Connecting...', color: 'bg-yellow-400' },
  connected: { label: 'Connected', color: 'bg-green-400' },
  reconnecting: { label: 'Reconnecting...', color: 'bg-yellow-400' },
}

export const RemotePanel: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { connectionState, role, sessionId, peerCount, error, closeSession, clearError } =
    useRemoteStore()

  const isActive = role !== 'none'
  const stateInfo = STATE_LABELS[connectionState] || STATE_LABELS.disconnected

  const handleCopySessionId = useCallback(() => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId).catch(() => {
        // Fallback: do nothing
      })
    }
  }, [sessionId])

  // Compact view when not connected
  if (!isActive) {
    return (
      <>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          title="Remote Control"
        >
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          Remote
        </button>
        <SessionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </>
    )
  }

  // Active session view
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm">
      {/* Connection indicator */}
      <span className={`h-2 w-2 rounded-full ${stateInfo.color}`} title={stateInfo.label} />

      {/* Role badge */}
      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium uppercase">
        {role}
      </span>

      {/* Session ID */}
      {sessionId && (
        <button
          onClick={handleCopySessionId}
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
          title="Click to copy session ID"
        >
          {sessionId}
        </button>
      )}

      {/* Peer count */}
      {peerCount > 0 && (
        <span className="text-xs text-muted-foreground" title="Connected peers">
          {peerCount} peer{peerCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Error */}
      {error && (
        <button
          onClick={clearError}
          className="max-w-[120px] truncate text-xs text-destructive"
          title={error}
        >
          {error}
        </button>
      )}

      {/* Disconnect */}
      <button
        onClick={closeSession}
        className="ml-auto rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
        title="Disconnect"
      >
        Disconnect
      </button>
    </div>
  )
}
