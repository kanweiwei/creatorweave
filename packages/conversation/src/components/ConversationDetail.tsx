/**
 * ConversationDetail - displays messages of a conversation with pagination.
 * Matches Host端 ConversationView styles for consistency.
 */

import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import type { Conversation, ConversationStatus } from '../types/conversation'

interface ConversationDetailProps {
  conversation: Conversation | null
  status: ConversationStatus
  onLoadMore?: () => void
  className?: string
}

export function ConversationDetail({
  conversation,
  status,
  onLoadMore,
  className = '',
}: ConversationDetailProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  if (!conversation) {
    return (
      <div className={`flex h-full items-center justify-center text-neutral-400 ${className}`}>
        <div className="text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">请选择一个会话</p>
        </div>
      </div>
    )
  }

  const isLoading = status === 'pending' || status === 'streaming' || status === 'tool_calling'

  return (
    <div className={`flex h-full flex-col bg-white ${className}`}>
      {/* Messages area - matches Host端 ConversationView */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          {conversation.messages.length === 0 && !isLoading && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-neutral-400">
                <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm">暂无消息</p>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-4">
            {conversation.messages.map((msg, index) => (
              <MessageBubble key={msg.messageId || index} message={msg} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <ThinkingIndicator
                status={status === 'tool_calling' ? 'tool_calling' : 'thinking'}
              />
            )}

            {/* Load more button */}
            {conversation.hasMore && onLoadMore && (
              <div className="flex justify-center py-4">
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-200"
                >
                  加载更多消息
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
