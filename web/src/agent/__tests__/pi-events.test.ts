import { describe, expect, it, vi } from 'vitest'
import { applyPiAssistantUpdate } from '../loop/pi-events'

describe('pi-events', () => {
  it('emits toolcall delta with mapped toolCallId', () => {
    const callbacks = {
      onToolCallDelta: vi.fn(),
    }
    const map = new Map<number, string>()

    applyPiAssistantUpdate(
      {
        type: 'toolcall_start',
        contentIndex: 1,
        partial: {
          content: [
            { type: 'text', text: 'ignored' },
            { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a' } },
          ],
        },
      } as never,
      callbacks as never,
      undefined,
      map
    )

    applyPiAssistantUpdate(
      {
        type: 'toolcall_delta',
        contentIndex: 1,
        delta: '{"path":"b"}',
      } as never,
      callbacks as never,
      undefined,
      map
    )

    expect(callbacks.onToolCallDelta).toHaveBeenCalledWith(1, '{"path":"b"}', 'call_1')
  })
})
