/**
 * Session State Serialization Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  serializeConversation,
  deserializeConversation,
  serializeMessage,
  deserializeMessage,
} from '../session-state-serialization'
import type { Conversation, Message } from '@/components/agent/message-types'

describe('Session State Serialization', () => {
  describe('serializeMessage / deserializeMessage', () => {
    it('should serialize and deserialize a user message', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, AI!',
        timestamp: Date.now(),
      }

      const serialized = serializeMessage(message)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized.id).toBe(message.id)
      expect(deserialized.role).toBe(message.role)
      expect(deserialized.content).toBe(message.content)
      expect(deserialized.timestamp).toBe(message.timestamp)
    })

    it('should serialize and deserialize an assistant message with reasoning', () => {
      const message: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'I can help you with that.',
        reasoningContent: 'Let me think about this...',
        timestamp: Date.now(),
      }

      const serialized = serializeMessage(message)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized.id).toBe(message.id)
      expect(deserialized.role).toBe(message.role)
      expect(deserialized.content).toBe(message.content)
      expect(deserialized.reasoningContent).toBe(message.reasoningContent)
    })

    it('should serialize and deserialize a message with tool calls', () => {
      const message: Message = {
        id: 'msg-3',
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'tc-1',
            type: 'function',
            function: {
              name: 'file_read',
              arguments: '{"path": "/test.txt"}',
            },
          },
        ],
        timestamp: Date.now(),
      }

      const serialized = serializeMessage(message)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized.id).toBe(message.id)
      expect(deserialized.role).toBe(message.role)
      expect(deserialized.toolCalls).toHaveLength(1)
      expect(deserialized.toolCalls![0].function.name).toBe('file_read')
      expect(deserialized.toolCalls![0].function.arguments).toBe('{"path": "/test.txt"}')
    })

    it('should serialize and deserialize a message with tool results', () => {
      const message: Message = {
        id: 'msg-4',
        role: 'tool',
        content: 'File content here',
        toolResults: [
          {
            toolCallId: 'tc-1',
            name: 'file_read',
            content: 'File content here',
          },
        ],
        timestamp: Date.now(),
      }

      const serialized = serializeMessage(message)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized.id).toBe(message.id)
      expect(deserialized.role).toBe(message.role)
      expect(deserialized.toolResults).toHaveLength(1)
      expect(deserialized.toolResults![0].content).toBe('File content here')
    })

    it('should serialize and deserialize token usage', () => {
      const message: Message = {
        id: 'msg-5',
        role: 'assistant',
        content: 'Response',
        timestamp: Date.now(),
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      }

      const serialized = serializeMessage(message)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized.usage).toBeDefined()
      expect(deserialized.usage!.promptTokens).toBe(100)
      expect(deserialized.usage!.completionTokens).toBe(50)
      expect(deserialized.usage!.totalTokens).toBe(150)
    })
  })

  describe('serializeConversation / deserializeConversation', () => {
    it('should serialize and deserialize a complete conversation', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test Conversation',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello!',
            timestamp: Date.now(),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'idle',
        messageCount: 2,
        hasMore: false,
      }

      const serialized = serializeConversation(conversation)
      const deserialized = deserializeConversation(serialized)

      expect(deserialized.id).toBe(conversation.id)
      expect(deserialized.title).toBe(conversation.title)
      expect(deserialized.messages).toHaveLength(2)
      expect(deserialized.messageCount).toBe(2)
      expect(deserialized.status).toBe('idle')
    })

    it('should handle conversation with tool calls and results', () => {
      const conversation: Conversation = {
        id: 'conv-2',
        title: 'Code Analysis',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Analyze this file',
            timestamp: Date.now(),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'tc-1',
                type: 'function',
                function: {
                  name: 'file_read',
                  arguments: '{"path": "test.js"}',
                },
              },
            ],
            timestamp: Date.now(),
          },
          {
            id: 'msg-3',
            role: 'tool',
            content: 'console.log("hello")',
            toolResults: [
              {
                toolCallId: 'tc-1',
                name: 'file_read',
                content: 'console.log("hello")',
              },
            ],
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'idle',
        messageCount: 3,
        hasMore: false,
      }

      const serialized = serializeConversation(conversation)
      const deserialized = deserializeConversation(serialized)

      expect(deserialized.messages).toHaveLength(3)
      expect(deserialized.messages[1].toolCalls).toHaveLength(1)
      expect(deserialized.messages[2].toolResults).toHaveLength(1)
    })
  })
})
