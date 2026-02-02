/**
 * Remote Store - Zustand store for mobile-web remote session state.
 */

import { create } from 'zustand'
import type { Socket } from 'socket.io-client'
import type { FileEntry, ConnectionState, SessionRole, EncryptionState } from '../types/remote'

// ============================================================================
// Types
// ============================================================================

interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  files?: string[] // @file references
}

interface RemoteState {
  // Connection
  connectionState: ConnectionState
  role: SessionRole
  sessionId: string | null
  error: string | null

  // Encryption
  encryptionState: EncryptionState

  // Reconnect
  reconnectAttempt: number
  reconnectMaxAttempts: number
  cancelReconnect: () => void
  resetReconnect: () => void
  incrementReconnectAttempt: () => void

  // Messages
  messages: AgentMessage[]
  agentStatus: 'idle' | 'thinking' | 'tool_calling' | 'error'

  // File Discovery
  searchResults: FileEntry[]
  recentFiles: FileEntry[]
  selectedFiles: string[] // @file references
  isSearching: boolean
  hostRootName: string | null  // Host's current directory name
  directoryChanged: boolean    // Flag indicating host directory changed since last search

  // UI
  filePickerOpen: boolean

  // Socket reference
  socket: Socket | null

  // Actions
  setConnectionState: (state: ConnectionState) => void
  setRole: (role: SessionRole) => void
  setSessionId: (id: string) => void
  setError: (error: string | null) => void
  setEncryptionState: (state: EncryptionState) => void

  // Messages
  addMessage: (message: AgentMessage) => void
  setAgentStatus: (status: 'idle' | 'thinking' | 'tool_calling' | 'error') => void

  // File Discovery
  searchFiles: (query: string) => Promise<void>
  clearSearchResults: () => void
  setSearchResults: (results: FileEntry[]) => void
  setIsSearching: (searching: boolean) => void
  setRecentFiles: (files: FileEntry[]) => void
  toggleFileSelection: (path: string) => void
  clearFileSelection: () => void
  setFilePickerOpen: (open: boolean) => void
  setSocket: (socket: Socket | null) => void
  setHostRootName: (rootName: string | null) => void
  setDirectoryChanged: (changed: boolean) => void
}

// ============================================================================
// Store
// ============================================================================

export const useRemoteStore = create<RemoteState>((set, get) => ({
  // Initial state
  connectionState: 'disconnected',
  role: 'none',
  sessionId: null,
  error: null,
  encryptionState: 'none',
  reconnectAttempt: 0,
  reconnectMaxAttempts: 3,
  messages: [],
  agentStatus: 'idle',
  searchResults: [],
  recentFiles: [],
  selectedFiles: [],
  isSearching: false,
  hostRootName: null,
  directoryChanged: false,
  filePickerOpen: false,
  socket: null,

  // Reconnect actions
  cancelReconnect: () => {
    console.log('[RemoteStore] Canceling reconnect')
    set({ reconnectAttempt: 0, connectionState: 'disconnected' })
    // Note: actual timeout cleanup happens in App.tsx
  },

  resetReconnect: () => {
    set({ reconnectAttempt: 0 })
  },

  incrementReconnectAttempt: () => {
    const current = get().reconnectAttempt
    set({ reconnectAttempt: current + 1 })
  },

  // Connection
  setConnectionState: (state) => {
    console.log('[RemoteStore] setConnectionState:', state)
    set({ connectionState: state })
  },
  setRole: (role) => set({ role }),
  setSessionId: (id) => set({ sessionId: id }),
  setError: (error) => set({ error }),

  // Encryption
  setEncryptionState: (state) => set({ encryptionState: state }),

  // Messages
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  setAgentStatus: (status) => set({ agentStatus: status }),

  // File Discovery
  searchFiles: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }

    set({ isSearching: true })

    // Send search request via socket
    const { socket } = get()
    if (socket?.connected) {
      socket.emit('message', {
        type: 'file:search',
        query,
        limit: 50,
      })
    }

    // Results will come via socket.on('file:search-result')
  },

  clearSearchResults: () => set({ searchResults: [] }),

  setSearchResults: (results) => set({ searchResults: results }),

  setIsSearching: (searching) => set({ isSearching: searching }),

  setRecentFiles: (files) => set({ recentFiles: files }),

  toggleFileSelection: (path) => {
    const { selectedFiles } = get()
    if (selectedFiles.includes(path)) {
      set({ selectedFiles: selectedFiles.filter((p) => p !== path) })
    } else {
      set({ selectedFiles: [...selectedFiles, path] })
    }
  },

  clearFileSelection: () => set({ selectedFiles: [] }),

  setFilePickerOpen: (open) => set({ filePickerOpen: open }),

  setSocket: (socket) => set({ socket }),

  setHostRootName: (rootName) => set({ hostRootName: rootName }),

  setDirectoryChanged: (changed) => set({ directoryChanged: changed }),
}))
