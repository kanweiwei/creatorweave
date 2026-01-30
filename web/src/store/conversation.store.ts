/**
 * Conversation store - manages chat history with IndexedDB persistence.
 * Uses Immer middleware for automatic immutable updates.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Conversation, Message } from '@/agent/message-types'
import { createConversation } from '@/agent/message-types'

const DB_NAME = 'bfosa-conversations'
const DB_VERSION = 1
const STORE_NAME = 'conversations'

/** Open IndexedDB for conversations */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Persist a conversation to IndexedDB */
async function persistConversation(conversation: Conversation): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(conversation)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Load all conversations from IndexedDB */
async function loadConversations(): Promise<Conversation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      const conversations = req.result as Conversation[]
      // Sort by updatedAt descending
      conversations.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(conversations)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Delete a conversation from IndexedDB */
async function deleteConversationFromDB(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Maximum title length */
const MAX_TITLE_LENGTH = 30

/** Truncate message content for use as title */
function truncateTitle(content: string): string {
  // Remove leading/trailing whitespace
  let trimmed = content.trim()

  // Remove newlines and multiple spaces
  trimmed = trimmed.replace(/\s+/g, ' ')

  // Truncate to max length
  if (trimmed.length <= MAX_TITLE_LENGTH) {
    return trimmed
  }

  return trimmed.slice(0, MAX_TITLE_LENGTH - 1) + '…'
}

/** Check if a conversation has the default auto-generated title */
function isDefaultTitle(title: string): boolean {
  return title.startsWith('Chat ')
}

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  loaded: boolean

  // Computed
  activeConversation: () => Conversation | null

  // Actions
  loadFromDB: () => Promise<void>
  createNew: (title?: string) => Conversation
  setActive: (id: string | null) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessages: (conversationId: string, messages: Message[]) => void
  deleteConversation: (id: string) => void
  updateTitle: (id: string, title: string) => void
}

export const useConversationStore = create<ConversationState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversationId: null,
    loaded: false,

    activeConversation: () => {
      const { conversations, activeConversationId } = get()
      if (!activeConversationId) return null
      return conversations.find((c) => c.id === activeConversationId) || null
    },

    loadFromDB: async () => {
      try {
        const conversations = await loadConversations()
        // Auto-activate the most recently updated conversation
        const activeId = conversations.length > 0 ? conversations[0].id : null
        set((state) => {
          state.conversations = conversations
          state.activeConversationId = activeId
          state.loaded = true
        })
      } catch (error) {
        console.error('[conversation.store] Failed to load conversations:', error)
        set((state) => {
          state.loaded = true
        })
      }
    },

    createNew: (title?: string) => {
      const conversation = createConversation(title)
      set((state) => {
        state.conversations.unshift(conversation)
        state.activeConversationId = conversation.id
      })
      persistConversation(conversation).catch(console.error)
      return conversation
    },

    setActive: (id) =>
      set((state) => {
        state.activeConversationId = id
      }),

    addMessage: (conversationId, message) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          conv.messages.push(message)
          conv.updatedAt = Date.now()

          // Auto-update title from first user message if still using default title
          if (message.role === 'user' && isDefaultTitle(conv.title) && message.content) {
            const userMessages = conv.messages.filter((m) => m.role === 'user')
            if (userMessages.length === 1) {
              // This is the first user message - update the title
              const newTitle = truncateTitle(message.content)
              console.log('[conversation.store] Auto-updating title:', conv.title, '→', newTitle)
              conv.title = newTitle
            }
          }
        }
      })
      // Persist after state update (not inside to avoid cloning Immer draft)
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv) persistConversation(conv).catch(console.error)
    },

    updateMessages: (conversationId, messages) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          const prevUserMessageCount = conv.messages.filter((m) => m.role === 'user').length

          conv.messages = messages
          conv.updatedAt = Date.now()

          // Auto-update title from first user message if still using default title
          const currentUserMessageCount = messages.filter((m) => m.role === 'user').length
          if (
            currentUserMessageCount === 1 &&
            prevUserMessageCount === 0 &&
            isDefaultTitle(conv.title)
          ) {
            const firstUserMessage = messages.find((m) => m.role === 'user')
            if (firstUserMessage?.content) {
              const newTitle = truncateTitle(firstUserMessage.content)
              console.log('[conversation.store] Auto-updating title:', conv.title, '→', newTitle)
              conv.title = newTitle
            }
          }
        }
      })
      // Persist after state update (not inside to avoid cloning Immer draft)
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv) persistConversation(conv).catch(console.error)
    },

    deleteConversation: (id) => {
      set((state) => {
        state.conversations = state.conversations.filter((c) => c.id !== id)
        if (state.activeConversationId === id) {
          state.activeConversationId = null
        }
      })
      deleteConversationFromDB(id).catch(console.error)
    },

    updateTitle: (id, title) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.title = title
          conv.updatedAt = Date.now()
        }
      })
      // Persist after state update (not inside to avoid cloning Immer draft)
      const conv = get().conversations.find((c) => c.id === id)
      if (conv) persistConversation(conv).catch(console.error)
    },
  }))
)
