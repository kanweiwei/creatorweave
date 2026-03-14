import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/streaming-bus', () => ({
  emitThinkingStart: vi.fn(),
  emitThinkingDelta: vi.fn(),
  emitToolStart: vi.fn(),
  emitComplete: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../workspace.store', () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({
      createWorkspace: vi.fn(() => Promise.resolve()),
      refreshPendingChanges: vi.fn(() => Promise.resolve()),
    })),
  },
}))

vi.mock('../settings.store', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      getEffectiveProviderConfig: vi.fn(() => ({
        apiKeyProviderKey: 'openai',
        baseUrl: 'https://example.com',
        modelName: 'mock-model',
      })),
    })),
  },
}))

vi.mock('@/sqlite', () => ({
  initSQLiteDB: vi.fn(() => Promise.resolve()),
  getApiKeyRepository: vi.fn(() => ({
    load: vi.fn(() => Promise.resolve('test-key')),
  })),
  getConversationRepository: vi.fn(() => ({
    findAll: vi.fn(() => Promise.resolve([])),
    save: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  })),
}))

vi.mock('@/agent/providers/types', () => ({
  LLM_PROVIDER_CONFIGS: {
    openai: {
      baseURL: 'https://example.com',
      modelName: 'mock-model',
    },
  },
}))

vi.mock('@/agent/llm/provider-factory', () => ({
  createLLMProvider: vi.fn(() => ({
    maxContextTokens: 128000,
  })),
}))

vi.mock('@/agent/context-manager', () => ({
  ContextManager: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/agent/tool-registry', () => ({
  getToolRegistry: vi.fn(() => ({})),
}))

vi.mock('@/agent/follow-up-generator', () => ({
  generateFollowUp: vi.fn(() => Promise.resolve('')),
}))

vi.mock('@/mcp/elicitation-handler.tsx', () => ({
  getElicitationHandler: vi.fn(() => ({
    handleBinaryElicitation: vi.fn(() => Promise.resolve({})),
  })),
}))

vi.mock('@/agent/thread-utils', () => ({
  createThread: vi.fn(),
  mergeThreads: vi.fn(),
  deleteThread: vi.fn(),
  getNextThread: vi.fn(),
  getPreviousThread: vi.fn(),
  forkThread: vi.fn(),
}))

vi.mock('@/agent/agent-loop', () => {
  class MockAgentLoop {
    cancel() {}

    async run(messages: any[], callbacks: any) {
      const toolA = {
        id: 'call_A',
        type: 'function',
        function: { name: 'glob', arguments: '{}' },
      }
      const toolB = {
        id: 'call_B',
        type: 'function',
        function: { name: 'list_files', arguments: '{}' },
      }

      callbacks.onToolCallStart?.(toolA)
      callbacks.onToolCallStart?.(toolB)
      callbacks.onToolCallDelta?.(0, '{"path":"a"', 'call_A')
      ;(globalThis as any).__conversationStoreTestHook?.('after_a_delta')

      callbacks.onToolCallComplete?.(toolA, 'result A')
      ;(globalThis as any).__conversationStoreTestHook?.('after_a_complete')

      callbacks.onToolCallDelta?.(1, '{"path":"b"', 'call_B')
      ;(globalThis as any).__conversationStoreTestHook?.('after_b_delta')

      callbacks.onToolCallComplete?.(toolB, 'result B')
      ;(globalThis as any).__conversationStoreTestHook?.('after_b_complete')

      return [
        ...messages,
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Done',
          timestamp: Date.now(),
        },
      ]
    }
  }

  return {
    AgentLoop: MockAgentLoop,
  }
})

import { useConversationStore } from '../conversation.store'

describe('conversation.store.sqlite tool-call routing', () => {
  beforeEach(() => {
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      loaded: true,
      agentLoops: new Map(),
      streamingQueues: new Map(),
      suggestedFollowUps: new Map(),
      mountedConversations: new Map(),
    } as any)
    delete (globalThis as any).__conversationStoreTestHook
  })

  it('should finalize non-current tool steps by toolCallId in interleaved calls', async () => {
    const store = useConversationStore.getState()
    const conv = store.createNew('test')

    const snapshots: Array<{
      label: string
      currentToolCallId: string | null
      stepA?: { streaming: boolean; args: string; result?: string }
      stepB?: { streaming: boolean; args: string; result?: string }
    }> = []

    ;(globalThis as any).__conversationStoreTestHook = (label: string) => {
      const c = useConversationStore.getState().conversations.find((x) => x.id === conv.id)
      const stepA = c?.draftAssistant?.steps.find((s) => s.id === 'tool-call_A' && s.type === 'tool_call') as any
      const stepB = c?.draftAssistant?.steps.find((s) => s.id === 'tool-call_B' && s.type === 'tool_call') as any
      snapshots.push({
        label,
        currentToolCallId: c?.currentToolCall?.id || null,
        stepA: stepA
          ? { streaming: stepA.streaming, args: stepA.args, result: stepA.result }
          : undefined,
        stepB: stepB
          ? { streaming: stepB.streaming, args: stepB.args, result: stepB.result }
          : undefined,
      })
    }

    await useConversationStore.getState().runAgent(conv.id, 'openai' as any, 'mock-model', 1024, null)

    const aComplete = snapshots.find((s) => s.label === 'after_a_complete')
    expect(aComplete).toBeDefined()
    expect(aComplete?.currentToolCallId).toBe('call_B')
    expect(aComplete?.stepA?.streaming).toBe(false)
    expect(aComplete?.stepA?.result).toBe('result A')
    expect(aComplete?.stepB?.streaming).toBe(true)

    const bDelta = snapshots.find((s) => s.label === 'after_b_delta')
    expect(bDelta?.stepB?.args).toContain('{"path":"b"')

    const bComplete = snapshots.find((s) => s.label === 'after_b_complete')
    expect(bComplete?.stepB?.streaming).toBe(false)
    expect(bComplete?.stepB?.result).toBe('result B')
  })
})
