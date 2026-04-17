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
        content: '上下文已压缩并生成摘要',
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
              content: 'Earlier conversation summary:\n这是压缩摘要',
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
    const summaryIndex = text.indexOf('这是压缩摘要')
    const compressionIndex = text.indexOf('上下文已压缩并生成摘要')
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
            content: '上下文已压缩并生成摘要',
            streaming: false,
          },
        ]}
      />
    )

    expect(container.querySelector('.lucide-bot')).toBeNull()
  })
})
