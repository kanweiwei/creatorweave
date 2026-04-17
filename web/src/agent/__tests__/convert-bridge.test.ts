import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../loop/tool-execution', async () => {
  const actual = await vi.importActual<typeof import('../loop/tool-execution')>(
    '../loop/tool-execution'
  )
  return {
    ...actual,
    ensureLatestToolResultFitsContext: vi.fn(actual.ensureLatestToolResultFitsContext),
  }
})

import { convertAgentMessagesToLlm } from '../loop/convert-bridge'
import { ensureLatestToolResultFitsContext } from '../loop/tool-execution'

describe('convert-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('continues with emergency trim when latest-tool-fit check fails', async () => {
    vi.mocked(ensureLatestToolResultFitsContext).mockImplementation(() => {
      throw new Error('tool result cannot fit')
    })

    const trimMessagesToTarget = vi.fn((msgs: unknown) => msgs as never[])

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
        trimMessagesToTarget,
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

    expect(trimMessagesToTarget).toHaveBeenCalled()
    expect(result.convertCallCount).toBe(1)
    expect(result.piMessages.length).toBeGreaterThan(0)
  })
})
