import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssistantTurnBubble } from '../AssistantTurnBubble'
import type { DraftAssistantStep } from '@/agent/message-types'

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

describe('AssistantTurnBubble timeline ordering', () => {
  it('renders summary/runtime events by timestamp order during processing', () => {
    const runtimeSteps: DraftAssistantStep[] = [
      {
        id: 'tool-1',
        timestamp: 300,
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'run_workflow',
            arguments: '{}',
          },
        },
        args: '{}',
        streaming: false,
      },
      {
        id: 'compression-1',
        timestamp: 250,
        type: 'compression',
        content: 'Context compressed and summary generated',
        streaming: false,
      },
    ]

    const { container } = render(
      <AssistantTurnBubble
        turn={{
          type: 'assistant',
          messages: [
            {
              id: 'summary-1',
              role: 'assistant',
              content: 'Earlier conversation summary:\nCompressed summary content',
              kind: 'context_summary',
              timestamp: 200,
              toolCalls: [],
            },
          ],
          timestamp: 200,
          totalUsage: null,
        }}
        toolResults={new Map()}
        isProcessing={true}
        runtimeSteps={runtimeSteps}
      />
    )

    const text = container.textContent || ''
    const summaryIndex = text.indexOf('Compressed summary content')
    const compressionIndex = text.indexOf('Context compressed and summary generated')
    const toolIndex = text.indexOf('run_workflow')

    expect(summaryIndex).toBeGreaterThanOrEqual(0)
    expect(compressionIndex).toBeGreaterThan(summaryIndex)
    expect(toolIndex).toBeGreaterThan(compressionIndex)
  })

  it('does not render bot avatar when showAvatar is false', () => {
    const { container } = render(
      <AssistantTurnBubble
        turn={{ type: 'assistant', messages: [], timestamp: Date.now(), totalUsage: null }}
        toolResults={new Map()}
        isProcessing={true}
        showAvatar={false}
        runtimeSteps={[
          {
            id: 'compression-1',
            timestamp: Date.now(),
            type: 'compression',
            content: 'Context compressed and summary generated',
            streaming: false,
          },
        ]}
      />
    )

    expect(container.querySelector('.lucide-bot')).toBeNull()
  })

  it('does not duplicate executing tool call from committed message and runtime state', () => {
    const toolCall = {
      id: 'tool-dup-1',
      type: 'function' as const,
      function: {
        name: 'batch_spawn',
        arguments: '{}',
      },
    }

    const { container } = render(
      <AssistantTurnBubble
        turn={{
          type: 'assistant',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Preparing to dispatch tasks',
              toolCalls: [toolCall],
              timestamp: 100,
            },
          ],
          timestamp: 100,
          totalUsage: null,
        }}
        toolResults={new Map()}
        isProcessing={true}
        currentToolCall={toolCall}
      />
    )

    const text = container.textContent || ''
    const count = text.split('batch_spawn').length - 1
    expect(count).toBe(1)
  })

  it('does not duplicate executing tool call from runtime steps and current tool call', () => {
    const toolCall = {
      id: 'tool-dup-2',
      type: 'function' as const,
      function: {
        name: 'batch_spawn',
        arguments: '{}',
      },
    }

    const runtimeSteps: DraftAssistantStep[] = [
      {
        id: 'tool-step-1',
        timestamp: 200,
        type: 'tool_call',
        toolCall,
        args: '{}',
        streaming: true,
      },
    ]

    const { container } = render(
      <AssistantTurnBubble
        turn={{
          type: 'assistant',
          messages: [],
          timestamp: 100,
          totalUsage: null,
        }}
        toolResults={new Map()}
        isProcessing={true}
        runtimeSteps={runtimeSteps}
        currentToolCall={toolCall}
      />
    )

    const text = container.textContent || ''
    const count = text.split('batch_spawn').length - 1
    expect(count).toBe(1)
  })

  it('hides stale compression step from a previous loop iteration', () => {
    const runtimeSteps: DraftAssistantStep[] = [
      {
        id: 'compression-1',
        timestamp: 200,
        type: 'compression',
        content: 'Context compressed and summary generated',
        streaming: false,
      },
      {
        id: 'tool-1',
        timestamp: 400,
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          type: 'function',
          function: { name: 'read', arguments: '{}' },
        },
        args: '{}',
        streaming: true,
      },
    ]

    // A committed message with timestamp after the compression means the loop
    // has moved past that iteration — the compression card should be hidden.
    const { container } = render(
      <AssistantTurnBubble
        turn={{
          type: 'assistant',
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'I will read the file.',
              toolCalls: [],
              timestamp: 300,
            },
          ],
          timestamp: 300,
          totalUsage: null,
        }}
        toolResults={new Map()}
        isProcessing={true}
        runtimeSteps={runtimeSteps}
      />
    )

    const text = container.textContent || ''
    expect(text).not.toContain('Context compressed and summary generated')
    expect(text).toContain('read')
  })

  it('shows compression step when no committed messages are newer', () => {
    const runtimeSteps: DraftAssistantStep[] = [
      {
        id: 'compression-1',
        timestamp: 300,
        type: 'compression',
        content: 'Context compressed and summary generated',
        streaming: false,
      },
    ]

    const { container } = render(
      <AssistantTurnBubble
        turn={{
          type: 'assistant',
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Thinking...',
              toolCalls: [],
              timestamp: 200,
            },
          ],
          timestamp: 200,
          totalUsage: null,
        }}
        toolResults={new Map()}
        isProcessing={true}
        runtimeSteps={runtimeSteps}
      />
    )

    const text = container.textContent || ''
    expect(text).toContain('Context compressed and summary generated')
  })
})
