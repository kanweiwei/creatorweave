import { describe, expect, it } from 'vitest'
import type { Message } from '../message-types'
import {
  extractTextContent,
  internalToPiMessages,
  parseToolArgs,
  piToInternalMessage,
} from '../loop/message-mappers'

describe('message-mappers', () => {
  it('parseToolArgs returns invalid marker for malformed JSON', () => {
    expect(parseToolArgs('{bad-json')).toEqual({ __invalid_arguments: true })
  })

  it('internalToPiMessages preserves context summary and maps tool call args safely', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        role: 'user',
        content: 'old user message',
        timestamp: 1,
      },
      {
        id: 'm2',
        role: 'assistant',
        kind: 'context_summary',
        content: 'summary body',
        timestamp: 2,
      },
      {
        id: 'm3',
        role: 'assistant',
        content: 'run tool',
        toolCalls: [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'read',
              arguments: '{not-json',
            },
          },
        ],
        timestamp: 3,
      },
    ]

    const mapped = internalToPiMessages(
      messages,
      { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      'Earlier conversation summary:'
    )

    expect(mapped).toHaveLength(2)
    expect(mapped[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Earlier conversation summary:\nsummary body' }],
    })

    const assistant = mapped[1] as { role: string; content: Array<{ type: string; arguments?: unknown }> }
    expect(assistant.role).toBe('assistant')
    expect(assistant.content.find((item) => item.type === 'toolCall')).toMatchObject({
      type: 'toolCall',
      arguments: { __invalid_arguments: true },
    })
  })

  it('extractTextContent and piToInternalMessage map tool results correctly', () => {
    expect(
      extractTextContent([
        { type: 'text', text: 'hello' },
        { type: 'thinking', thinking: ' world' },
      ])
    ).toBe('hello world')

    const internal = piToInternalMessage({
      role: 'toolResult',
      toolCallId: 'tc2',
      toolName: 'search',
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
      timestamp: 10,
    } as never)

    expect(internal).toMatchObject({
      role: 'tool',
      toolCallId: 'tc2',
      name: 'search',
      content: 'ok',
    })
  })
})
