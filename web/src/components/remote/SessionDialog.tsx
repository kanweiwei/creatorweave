/**
 * Session Dialog - create or join a remote control session.
 */

import React, { useState, useCallback } from 'react'
import { useRemoteStore } from '@/store/remote.store'

interface SessionDialogProps {
  open: boolean
  onClose: () => void
}

export const SessionDialog: React.FC<SessionDialogProps> = ({ open, onClose }) => {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [joinSessionId, setJoinSessionId] = useState('')
  const [relayUrl, setRelayUrl] = useState(useRemoteStore.getState().relayUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { createSession, joinSession, setRelayUrl: storeSetRelayUrl } = useRemoteStore()

  const handleCreate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      storeSetRelayUrl(relayUrl)
      await createSession()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }, [relayUrl, createSession, storeSetRelayUrl, onClose])

  const handleJoin = useCallback(async () => {
    if (!joinSessionId.trim()) {
      setError('Please enter a session ID')
      return
    }
    setLoading(true)
    setError(null)
    try {
      storeSetRelayUrl(relayUrl)
      await joinSession(joinSessionId.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join session')
    } finally {
      setLoading(false)
    }
  }, [joinSessionId, relayUrl, joinSession, storeSetRelayUrl, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Remote Session</h2>

        {/* Mode toggle */}
        <div className="mb-4 flex rounded-md border">
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'create' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setMode('create')}
          >
            Create (Host)
          </button>
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'join' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setMode('join')}
          >
            Join (Remote)
          </button>
        </div>

        {/* Relay URL */}
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Relay Server</label>
        <input
          type="text"
          value={relayUrl}
          onChange={(e) => setRelayUrl(e.target.value)}
          className="mb-4 w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="wss://relay.example.com"
        />

        {/* Join-specific: session ID input */}
        {mode === 'join' && (
          <>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Session ID
            </label>
            <input
              type="text"
              value={joinSessionId}
              onChange={(e) => setJoinSessionId(e.target.value)}
              className="mb-4 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              placeholder="abc-1234-xyz"
            />
          </>
        )}

        {/* Error display */}
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Connecting...' : mode === 'create' ? 'Create Session' : 'Join Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
