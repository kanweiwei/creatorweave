/**
 * Session State Serialization
 *
 * Handles saving and restoring complete session state for cross-device continuity.
 * Includes conversation history, agent memory, file state, and UI state.
 */

import type {
  Conversation,
  Message,
  Thread,
} from '@/components/agent/message-types'
import type { ProjectFingerprint } from '@/agent/project-fingerprint'
import type { MemoryEntry } from '@/agent/context-memory'

//=============================================================================
// Session State Types
//=============================================================================

export interface SessionState {
  /** Session metadata */
  metadata: SessionMetadata

  /** Conversation history */
  conversations: SerializedConversation[]

  /** File system state */
  files: FileSystemState

  /** Agent memory and context */
  agent: AgentState

  /** UI preferences and layout */
  ui: UIState

  /** Remote session data (if applicable) */
  remote?: RemoteState
}

export interface SessionMetadata {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  deviceId: string
  browserInfo: string
  version: string
}

export interface SerializedConversation {
  id: string
  title: string
  messages: SerializedMessage[]
  createdAt: number
  updatedAt: number
  status: 'idle' | 'pending' | 'streaming' | 'tool_calling' | 'error'
  messageCount: number
  hasMore: boolean
}

export interface SerializedMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  reasoningContent?: string
  toolCalls?: SerializedToolCall[]
  toolResults?: SerializedToolResult[]
  timestamp: number
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface SerializedToolCall {
  id: string
  name: string
  arguments: string
}

export interface SerializedToolResult {
  toolCallId: string
  name: string
  content: string
}

export interface FileSystemState {
  /** Root directory handle name */
  rootName: string | null
  /** Recently accessed files */
  recentFiles: string[]
  /** File handle metadata */
  handles: Record<string, FileHandleMetadata>
  /** Last selected file */
  activeFile: string | null
}

export interface FileHandleMetadata {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
}

export interface AgentState {
  /** Project fingerprint */
  fingerprint: ProjectFingerprint | null

  /** Memory entries */
  memories: MemoryEntry[]

  /** Session preferences */
  preferences: AgentPreferences

  /** Last tool recommendations */
  recommendedTools: string[]
}

export interface AgentPreferences {
  /** Preferred model */
  model: string
  /** Temperature setting */
  temperature: number
  /** Max iterations */
  maxIterations: number
  /** Auto-enable features */
  autoPrefetch: boolean
  /** Learning mode enabled */
  learningEnabled: boolean
}

export interface UIState {
  /** Theme preference */
  theme: 'light' | 'dark' | 'system'
  /** Layout configuration */
  layout: UILayout
  /** Panel states */
  panels: PanelStates
  /** Command palette history */
  commandHistory: string[]
}

export interface UILayout {
  /** Main layout direction */
  direction: 'horizontal' | 'vertical'
  /** Panel sizes (percentages) */
  sizes: number[]
}

export interface PanelStates {
  sidebar: boolean
  conversation: boolean
  fileTree: boolean
  tools: boolean
  output: boolean
}

export interface RemoteState {
  /** Session ID for remote connection */
  sessionId: string | null
  /** Role: host or remote */
  role: 'host' | 'remote' | null
  /** Encryption enabled */
  encryptionEnabled: boolean
  /** Peer count */
  peerCount: number
}

//=============================================================================
// Serialization Utilities
//=============================================================================

/**
 * Serialize a conversation to JSON-compatible format
 */
export function serializeConversation(conversation: Conversation): SerializedConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(serializeMessage),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    status: conversation.status,
    messageCount: conversation.messageCount,
    hasMore: conversation.hasMore,
  }
}

/**
 * Deserialize a conversation from serialized format
 */
export function deserializeConversation(data: SerializedConversation): Conversation {
  return {
    id: data.id,
    title: data.title,
    messages: data.messages.map(deserializeMessage),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    status: data.status,
    messageCount: data.messageCount,
    hasMore: data.hasMore,
  }
}

/**
 * Serialize a message to JSON-compatible format
 */
export function serializeMessage(message: Message): SerializedMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    reasoningContent: 'reasoningContent' in message ? (message as { reasoningContent?: string }).reasoningContent : undefined,
    toolCalls: message.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
    toolResults: message.toolResults?.map((tr) => ({
      toolCallId: tr.toolCallId,
      name: tr.name,
      content: tr.content,
    })),
    timestamp: message.timestamp,
    usage: message.usage,
  }
}

/**
 * Deserialize a message from serialized format
 */
export function deserializeMessage(data: SerializedMessage): Message {
  return {
    id: data.id,
    role: data.role,
    content: data.content,
    ...(data.reasoningContent && { reasoningContent: data.reasoningContent }),
    ...(data.toolCalls && {
      toolCalls: data.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    }),
    ...(data.toolResults && {
      toolResults: data.toolResults.map((tr) => ({
        toolCallId: tr.toolCallId,
        name: tr.name,
        content: tr.content,
      })),
    }),
    timestamp: data.timestamp,
    usage: data.usage,
  }
}

//=============================================================================
// Session State Manager
//=============================================================================

export interface SessionStateManagerOptions {
  /** Maximum number of conversations to keep */
  maxConversations?: number
  /** Maximum number of messages per conversation */
  maxMessagesPerConversation?: number
  /** Include file handles (can be large) */
  includeFileHandles?: boolean
  /** Include memory entries */
  includeMemories?: boolean
}

const DEFAULT_OPTIONS: Required<SessionStateManagerOptions> = {
  maxConversations: 50,
  maxMessagesPerConversation: 100,
  includeFileHandles: false,
  includeMemories: true,
}

/**
 * Session State Manager
 *
 * Handles creating, saving, loading, and managing session states.
 */
export class SessionStateManager {
  private options: Required<SessionStateManagerOptions>
  private storageKey = 'browser-fs-analyzer-session'

  constructor(options: SessionStateManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  //===========================================================================
  // Session Creation
  //===========================================================================

  /**
   * Create a new empty session state
   */
  createSessionState(
    sessionId: string,
    name: string = 'Untitled Session'
  ): SessionState {
    return {
      metadata: {
        id: sessionId,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId: this.getDeviceId(),
        browserInfo: navigator.userAgent,
        version: '0.3.0', // Phase 5 version
      },
      conversations: [],
      files: {
        rootName: null,
        recentFiles: [],
        handles: {},
        activeFile: null,
      },
      agent: {
        fingerprint: null,
        memories: [],
        preferences: {
          model: 'glm-4.7',
          temperature: 0.7,
          maxIterations: 20,
          autoPrefetch: true,
          learningEnabled: true,
        },
        recommendedTools: [],
      },
      ui: {
        theme: 'system',
        layout: {
          direction: 'horizontal',
          sizes: [20, 50, 30],
        },
        panels: {
          sidebar: true,
          conversation: true,
          fileTree: true,
          tools: true,
          output: false,
        },
        commandHistory: [],
      },
    }
  }

  /**
   * Create session state from current application state
   */
  async createFromCurrentState(
    conversations: Conversation[],
    fingerprint: ProjectFingerprint | null,
    memories: MemoryEntry[],
    files: FileSystemState,
    ui: UIState
  ): Promise<SessionState> {
    const sessionId = this.generateSessionId()

    const serializedConversations = conversations
      .slice(-this.options.maxConversations)
      .map((conv) => this.truncateConversation(serializeConversation(conv)))

    return {
      metadata: {
        id: sessionId,
        name: this.generateSessionName(conversations),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId: this.getDeviceId(),
        browserInfo: navigator.userAgent,
        version: '0.3.0',
      },
      conversations: serializedConversations,
      files,
      agent: {
        fingerprint,
        memories: this.options.includeMemories ? memories.slice(-100) : [],
        preferences: {
          model: 'glm-4.7',
          temperature: 0.7,
          maxIterations: 20,
          autoPrefetch: true,
          learningEnabled: true,
        },
        recommendedTools: [],
      },
      ui,
    }
  }

  //===========================================================================
  // Serialization
  //===========================================================================

  /**
   * Serialize session state to JSON string
   */
  serialize(state: SessionState): string {
    return JSON.stringify(state, null, 2)
  }

  /**
   * Deserialize session state from JSON string
   */
  deserialize(data: string): SessionState | null {
    try {
      const state = JSON.parse(data) as SessionState

      // Validate required fields
      if (!state.metadata?.id || !state.metadata?.version) {
        console.warn('[SessionStateManager] Invalid session state: missing required fields')
        return null
      }

      // Validate version compatibility
      const [major] = state.metadata.version.split('.').map(Number)
      if (major !== 0) {
        console.warn(`[SessionStateManager] Unknown version: ${state.metadata.version}`)
      }

      return state
    } catch (error) {
      console.error('[SessionStateManager] Failed to deserialize session:', error)
      return null
    }
  }

  //===========================================================================
  // Local Storage
  //===========================================================================

  /**
   * Save session state to localStorage
   */
  async saveToStorage(state: SessionState): Promise<void> {
    try {
      const serialized = this.serialize(state)
      localStorage.setItem(this.storageKey, serialized)

      // Also save to IndexedDB for larger states
      await this.saveToIndexedDB(state)

      console.log(`[SessionStateManager] Saved session: ${state.metadata.id}`)
    } catch (error) {
      console.error('[SessionStateManager] Failed to save session:', error)
      throw error
    }
  }

  /**
   * Load session state from localStorage
   */
  async loadFromStorage(): Promise<SessionState | null> {
    try {
      // Try IndexedDB first for larger states
      const idbState = await this.loadFromIndexedDB()
      if (idbState) {
        return idbState
      }

      // Fall back to localStorage
      const data = localStorage.getItem(this.storageKey)
      if (data) {
        return this.deserialize(data)
      }

      return null
    } catch (error) {
      console.error('[SessionStateManager] Failed to load session:', error)
      return null
    }
  }

  /**
   * Save to IndexedDB for larger session states
   */
  private async saveToIndexedDB(state: SessionState): Promise<void> {
    const db = await this.openIndexedDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite')
      const store = transaction.objectStore('sessions')

      const request = store.put({
        id: state.metadata.id,
        ...state,
        savedAt: Date.now(),
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Load from IndexedDB
   */
  private async loadFromIndexedDB(): Promise<SessionState | null> {
    const db = await this.openIndexedDB()
    if (!db) return null

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly')
      const store = transaction.objectStore('sessions')
      const request = store.get(this.storageKey)

      request.onsuccess = () => {
        const result = request.result
        if (result) {
          const { id, savedAt, ...state } = result
          resolve(state as SessionState)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  private openIndexedDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('BrowserFSAnalyzerSessions', 1)

        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          const db = request.result
          if (db.version === 1) {
            if (!db.objectStoreNames.contains('sessions')) {
              db.createObjectStore('sessions', { keyPath: 'id' })
            }
          }
          resolve(db)
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id' })
          }
        }
      } catch {
        resolve(null)
      }
    })
  }

  //===========================================================================
  // Session List Management
  //===========================================================================

  /**
   * Get list of all saved sessions (metadata only)
   */
  async getSessionList(): Promise<SessionMetadata[]> {
    const db = await this.openIndexedDB()
    if (!db) return []

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly')
      const store = transaction.objectStore('sessions')
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        resolve(
          results
            .map(({ id, savedAt, ...metadata }) => metadata as SessionMetadata)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        )
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Delete a saved session
   */
  async deleteSession(sessionId: string): Promise<void> {
    localStorage.removeItem(this.storageKey)

    const db = await this.openIndexedDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite')
      const store = transaction.objectStore('sessions')
      const request = store.delete(sessionId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  //===========================================================================
  // Utility Methods
  //===========================================================================

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }

  /**
   * Generate a session name from conversations
   */
  private generateSessionName(conversations: Conversation[]): string {
    if (conversations.length === 0) {
      return 'Untitled Session'
    }

    // Use the first message of the first conversation as title
    const firstConv = conversations[0]
    const firstMessage = firstConv.messages.find((m) => m.role === 'user')

    if (firstMessage && typeof firstMessage.content === 'string') {
      // Truncate to 50 characters
      const text = firstMessage.content.trim().substring(0, 50)
      return text || 'Untitled Session'
    }

    return 'Untitled Session'
  }

  /**
   * Truncate conversation to max messages
   */
  private truncateConversation(conv: SerializedConversation): SerializedConversation {
    if (conv.messages.length <= this.options.maxMessagesPerConversation) {
      return conv
    }

    // Keep the first and last messages, truncate middle
    const firstMessages = conv.messages.slice(0, 3)
    const lastMessages = conv.messages.slice(-this.options.maxMessagesPerConversation + 3)

    return {
      ...conv,
      messages: [...firstMessages, ...lastMessages],
      hasMore: true,
    }
  }

  /**
   * Get device ID (anonymous)
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('device-id')
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem('device-id', deviceId)
    }
    return deviceId
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let managerInstance: SessionStateManager | null = null

export function getSessionStateManager(options?: SessionStateManagerOptions): SessionStateManager {
  if (!managerInstance) {
    managerInstance = new SessionStateManager(options)
  }
  return managerInstance
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetSessionStateManager(): void {
  managerInstance = null
}
