/**
 * Remote Store - Zustand store for remote control session state.
 */

import { create } from 'zustand'
import type { ConnectionState } from '@/remote/ws-client'
import type { SessionRole } from '@/remote/remote-session'
import { RemoteSession } from '@/remote/remote-session'
import type { RemoteMessage, StateSyncMessage } from '@/remote/remote-protocol'

type RemoteMessageEntry = { role: string; content: string | null; messageId: string }

interface RemoteState {
  // Connection
  connectionState: ConnectionState
  role: SessionRole
  sessionId: string | null
  peerCount: number
  relayUrl: string
  error: string | null

  // Remote view (for Remote role)
  remoteMessages: RemoteMessageEntry[]
  remoteAgentStatus: 'idle' | 'thinking' | 'tool_calling' | 'error'
  thinkingText: string

  // Session instance (not serialized)
  session: RemoteSession | null

  // Internal callback hooks for Host to receive remote commands
  _onRemoteMessage: ((content: string, messageId: string) => void) | null
  _onRemoteCancel: (() => void) | null

  // Actions
  setRelayUrl: (url: string) => void
  createSession: () => Promise<string>
  joinSession: (sessionId: string) => Promise<void>
  closeSession: () => void
  sendMessage: (content: string, messageId: string) => void
  sendCancel: () => void
  clearError: () => void
}

export const useRemoteStore = create<RemoteState>()((set, get) => ({
  connectionState: 'disconnected',
  role: 'none',
  sessionId: null,
  peerCount: 0,
  relayUrl: 'wss://relay.example.com',
  error: null,
  remoteMessages: [],
  remoteAgentStatus: 'idle',
  thinkingText: '',
  session: null,
  _onRemoteMessage: null,
  _onRemoteCancel: null,

  setRelayUrl: (url) => {
    set({ relayUrl: url })
    const session = get().session
    if (session) {
      session.setRelayUrl(url)
    }
  },

  createSession: async () => {
    const { relayUrl } = get()
    const session = new RemoteSession(relayUrl, {
      onConnectionStateChange: (state) => set({ connectionState: state }),
      onRoleChange: (role) => set({ role }),
      onPeerChange: (peerCount) => set({ peerCount }),
      onError: (error) => set({ error }),
      onRemoteMessage: (content, messageId) => {
        const store = get()
        store._onRemoteMessage?.(content, messageId)
      },
      onRemoteCancel: () => {
        const store = get()
        store._onRemoteCancel?.()
      },
    })

    set({ session })

    const sessionId = await session.createSession()
    set({ sessionId })
    return sessionId
  },

  joinSession: async (sessionId) => {
    const { relayUrl } = get()
    const session = new RemoteSession(relayUrl, {
      onConnectionStateChange: (state) => set({ connectionState: state }),
      onRoleChange: (role) => set({ role }),
      onPeerChange: (peerCount) => set({ peerCount }),
      onError: (error) => set({ error }),
      onAgentEvent: (event: RemoteMessage) => {
        handleRemoteAgentEvent(event, set, get)
      },
      onStateSync: (state: StateSyncMessage) => {
        set({
          remoteMessages: state.messages,
          remoteAgentStatus: state.agentStatus,
        })
      },
    })

    set({ session, sessionId })
    await session.joinSession(sessionId)
  },

  closeSession: () => {
    const { session } = get()
    if (session) {
      session.close()
    }
    set({
      session: null,
      sessionId: null,
      role: 'none',
      connectionState: 'disconnected',
      peerCount: 0,
      remoteMessages: [],
      remoteAgentStatus: 'idle',
      thinkingText: '',
      error: null,
    })
  },

  sendMessage: (content, messageId) => {
    const { session } = get()
    if (session) {
      session.sendRemoteMessage(content, messageId)
    }
  },

  sendCancel: () => {
    const { session } = get()
    if (session) {
      session.sendRemoteCancel()
    }
  },

  clearError: () => set({ error: null }),
}))

/** Register callbacks for Host mode (called by AgentPanel) */
export function registerRemoteCallbacks(
  onMessage: (content: string, messageId: string) => void,
  onCancel: () => void
): void {
  useRemoteStore.setState({
    _onRemoteMessage: onMessage,
    _onRemoteCancel: onCancel,
  })
}

/** Handle incoming agent events on the Remote side */
function handleRemoteAgentEvent(
  event: RemoteMessage,
  set: (partial: Partial<RemoteState>) => void,
  get: () => RemoteState
): void {
  switch (event.type) {
    case 'agent:message':
      set({
        remoteMessages: [
          ...get().remoteMessages,
          { role: event.role, content: event.content, messageId: event.messageId },
        ],
        thinkingText: '',
      })
      break

    case 'agent:thinking':
      set({
        thinkingText: get().thinkingText + event.delta,
      })
      break

    case 'agent:status':
      set({ remoteAgentStatus: event.status })
      if (event.status === 'idle') {
        set({ thinkingText: '' })
      }
      break

    case 'agent:tool_call':
      set({
        remoteMessages: [
          ...get().remoteMessages,
          {
            role: 'tool_call',
            content: `Tool: ${event.toolName}(${event.args})`,
            messageId: event.toolCallId,
          },
        ],
      })
      break

    case 'agent:tool_result':
      // Tool results are typically followed by an agent message
      break

    case 'file:change':
      set({
        remoteMessages: [
          ...get().remoteMessages,
          {
            role: 'system',
            content: `File ${event.changeType}: ${event.path}`,
            messageId: `file-${Date.now()}`,
          },
        ],
      })
      break

    default:
      break
  }
}
