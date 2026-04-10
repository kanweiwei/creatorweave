import { describe, expect, it, vi } from 'vitest'
import { convertAgentMessagesToLlm } from '../loop/convert-bridge'

describe('convert-bridge', () => {
  it('increments convert call count and returns mapped pi messages', async () => {
    const result = await convertAgentMessagesToLlm({
      agentMessages: [
        {
          role: 'user',
          content: 'hello',
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 128000,
        estimateTokens: vi.fn(() => 1),
      } as never,
      contextManager: {
        getConfig: () => ({ maxContextTokens: 128000, reserveTokens: 4096 }),
        trimMessages: (msgs: unknown) => ({ messages: msgs as never[] }),
        trimMessagesToTarget: (msgs: unknown) => msgs as never[],
      } as never,
      callbacks: {},
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      summaryMinDroppedGroups: 2,
      summaryMinDroppedContentChars: 800,
      summaryMinIntervalConvertCalls: 8,
      compressionTargetRatio: 0.7,
      generateContextSummaryWithLLM: async () => ({ summary: null, mode: 'skip' }),
    })

    expect(result.convertCallCount).toBe(1)
    expect(result.piMessages).toHaveLength(1)
    expect(result.piMessages[0]).toMatchObject({ role: 'user', content: 'hello' })
  })
})
