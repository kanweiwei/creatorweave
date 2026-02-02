export type ConversationStatus = 'idle' | 'pending' | 'streaming' | 'tool_calling' | 'error'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export interface MessageUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface Message {
  role: string
  content: string | null
  messageId: string
  timestamp: number
  reasoning?: string | null
  toolCalls?: ToolCall[]
  usage?: MessageUsage
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  status: ConversationStatus
  hasMore: boolean
  messageCount: number
  totalPages?: number
  currentPage?: number
}

export interface ConversationSyncMessage {
  type: 'sync:conversations'
  conversations: Conversation[]
  activeConversationId: string | null
  hostRootName: string | null
}
