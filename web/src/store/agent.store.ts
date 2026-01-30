/**
 * Agent state store - manages Agent runtime status.
 * Uses Immer middleware for automatic immutable updates.
 *
 * Directory handle is persisted in IndexedDB (supports structured clone).
 * On page reload, the handle is restored and permission is re-requested.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ToolCall } from '@/agent/message-types'

export type AgentStatus = 'idle' | 'thinking' | 'tool_calling' | 'streaming' | 'error'

const DIR_HANDLE_DB = 'bfosa-dir-handle'
const DIR_HANDLE_STORE = 'handles'
const DIR_HANDLE_KEY = 'directory'

interface AgentState {
  status: AgentStatus
  /** Streaming content being received */
  streamingContent: string
  /** Streaming reasoning/thinking content (GLM-4.7+) */
  streamingReasoning: string
  /** Whether reasoning is actively streaming */
  isReasoningStreaming: boolean
  /** Complete reasoning content (available after reasoning completes) */
  completedReasoning: string | null
  /** Whether content is actively streaming */
  isContentStreaming: boolean
  /** Complete content (available after content streaming completes) */
  completedContent: string | null
  /** Currently executing tool call */
  currentToolCall: ToolCall | null
  /** Current tool call result */
  currentToolResult: string | null
  /** Streaming tool call arguments (tool_stream mode) */
  streamingToolArgs: string
  /** Directory handle for file operations */
  directoryHandle: FileSystemDirectoryHandle | null
  /** Directory name for display */
  directoryName: string | null
  /** Error message */
  error: string | null

  // Actions
  setStatus: (status: AgentStatus) => void
  appendStreamingContent: (delta: string) => void
  appendStreamingReasoning: (delta: string) => void
  resetStreamingContent: () => void
  resetStreamingReasoning: () => void
  setReasoningStreaming: (streaming: boolean) => void
  setCompletedReasoning: (reasoning: string) => void
  setContentStreaming: (streaming: boolean) => void
  setCompletedContent: (content: string) => void
  setCurrentToolCall: (tc: ToolCall | null) => void
  setCurrentToolResult: (result: string | null) => void
  appendStreamingToolArgs: (delta: string) => void
  resetStreamingToolArgs: () => void
  setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
  restoreDirectoryHandle: () => Promise<void>
  setError: (error: string | null) => void
  reset: () => void
}

/** Open the dedicated IndexedDB for directory handle storage */
function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIR_HANDLE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Persist a directory handle to IndexedDB */
async function persistHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openHandleDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_HANDLE_STORE, 'readwrite')
    const store = tx.objectStore(DIR_HANDLE_STORE)
    if (handle) {
      store.put(handle, DIR_HANDLE_KEY)
    } else {
      store.delete(DIR_HANDLE_KEY)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Load a directory handle from IndexedDB */
async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_HANDLE_STORE, 'readonly')
    const store = tx.objectStore(DIR_HANDLE_STORE)
    const req = store.get(DIR_HANDLE_KEY)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/** Verify and re-request readwrite permission on a restored handle */
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if ((await handle.requestPermission(opts)) === 'granted') return true
  return false
}

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    status: 'idle',
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    currentToolResult: null,
    streamingToolArgs: '',
    directoryHandle: null,
    directoryName: null,
    error: null,

    setStatus: (status) =>
      set((state) => {
        state.status = status
      }),

    appendStreamingContent: (delta) =>
      set((state) => {
        state.streamingContent += delta
      }),

    appendStreamingReasoning: (delta) =>
      set((state) => {
        state.streamingReasoning += delta
      }),

    resetStreamingContent: () =>
      set((state) => {
        state.streamingContent = ''
      }),

    resetStreamingReasoning: () =>
      set((state) => {
        state.streamingReasoning = ''
      }),

    setReasoningStreaming: (isReasoningStreaming) =>
      set((state) => {
        state.isReasoningStreaming = isReasoningStreaming
      }),

    setCompletedReasoning: (completedReasoning) =>
      set((state) => {
        state.completedReasoning = completedReasoning
      }),

    setContentStreaming: (isContentStreaming) =>
      set((state) => {
        state.isContentStreaming = isContentStreaming
      }),

    setCompletedContent: (completedContent) =>
      set((state) => {
        state.completedContent = completedContent
      }),

    setCurrentToolCall: (currentToolCall) =>
      set((state) => {
        state.currentToolCall = currentToolCall
      }),

    setCurrentToolResult: (currentToolResult) =>
      set((state) => {
        state.currentToolResult = currentToolResult
      }),

    appendStreamingToolArgs: (delta) =>
      set((state) => {
        state.streamingToolArgs += delta
      }),

    resetStreamingToolArgs: () =>
      set((state) => {
        state.streamingToolArgs = ''
      }),

    setDirectoryHandle: (handle) => {
      set((state) => {
        state.directoryHandle = handle
        state.directoryName = handle?.name || null
      })
      persistHandle(handle).catch(console.error)
    },

    restoreDirectoryHandle: async () => {
      try {
        const handle = await loadHandle()
        if (!handle) return
        const granted = await verifyPermission(handle)
        if (granted) {
          set((state) => {
            state.directoryHandle = handle
            state.directoryName = handle.name
          })
        }
      } catch {
        // Handle missing or permission denied — silently ignore
      }
    },

    setError: (error) =>
      set((state) => {
        state.error = error
        state.status = error ? 'error' : 'idle'
      }),

    reset: () =>
      set((state) => {
        state.status = 'idle'
        state.streamingContent = ''
        state.streamingReasoning = ''
        state.isReasoningStreaming = false
        state.completedReasoning = null
        state.isContentStreaming = false
        state.completedContent = null
        state.currentToolCall = null
        state.currentToolResult = null
        state.streamingToolArgs = ''
        state.error = null
      }),
  }))
)
