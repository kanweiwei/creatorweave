import { describe, expect, it, vi } from 'vitest'
import { processPiLoopEvents } from '../loop/process-loop-events'
import { applyPiAssistantUpdate } from '../loop/pi-events'

describe('process-loop-events', () => {
  it('appends assistant message and triggers message start fallback on update', async () => {
    async function* events() {
      yield { type: 'message_update', assistantMessageEvent: { type: 'text_start' } }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
    }

    const callbacks = { onMessageStart: vi.fn(), onMessagesUpdated: vi.fn() }
    const result = await processPiLoopEvents({
      loop: events() as never,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: callbacks as never,
      maxIterations: 20,
      applyAssistantUpdate: applyPiAssistantUpdate,
      mapPiToInternal: (message) =>
        ({
          id: 'a1',
          role: message.role,
          content: 'done',
          timestamp: Date.now(),
        }) as never,
      extractTextContent: () => null,
    })

    expect(callbacks.onMessageStart).toHaveBeenCalledOnce()
    expect(result.allMessages).toHaveLength(2)
    expect(result.reachedMaxIterations).toBe(false)
  })
})
