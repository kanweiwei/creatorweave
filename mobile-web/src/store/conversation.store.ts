import { create } from 'zustand'
import type { ConversationStatus, Message, Conversation } from '@browser-fs-analyzer/conversation'

// Re-export types for convenience
export type { ConversationStatus, Message, Conversation }

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null

  // Actions
  setConversations: (data: Conversation[]) => void
  updateConversationMessages: (
    conversationId: string,
    page: number,
    messages: Message[],
    totalPages: number
  ) => void
  setActiveConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateStatus: (conversationId: string, status: ConversationStatus) => void
  clear: () => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  activeConversationId: null,

  setConversations: (data) => {
    set((state) => {
      const conversations = data.map((conv) => ({
        ...conv,
        currentPage: 1,
      }))
      return {
        conversations,
        activeConversationId: state.activeConversationId || data[0]?.id || null,
      }
    })
  },

  updateConversationMessages: (conversationId, page, messages, totalPages) => {
    set((state) => {
      const conversations = state.conversations.map((conv) => {
        if (conv.id !== conversationId) return conv

        if (page === 1) {
          return {
            ...conv,
            messages,
            currentPage: page,
            totalPages,
            hasMore: page < totalPages,
          }
        }

        return {
          ...conv,
          messages: [...conv.messages, ...messages],
          currentPage: page,
          totalPages,
          hasMore: page < totalPages,
        }
      })

      return { conversations }
    })
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id })
  },

  addMessage: (conversationId, message) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? { ...conv, messages: [...conv.messages, message] }
          : conv
      ),
    }))
  },

  updateStatus: (conversationId, status) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId ? { ...conv, status } : conv
      ),
    }))
  },

  clear: () => {
    set({
      conversations: [],
      activeConversationId: null,
    })
  },
}))
