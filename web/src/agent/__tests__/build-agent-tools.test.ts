import { describe, expect, it, vi } from 'vitest'
import { buildAgentTools } from '../loop/build-agent-tools'

describe('build-agent-tools', () => {
  it('blocks write tools in plan mode', async () => {
    const toolRegistry = {
      getToolDefinitionsForMode: vi.fn(() => [
        {
          type: 'function',
          function: {
            name: 'write',
            description: 'write file',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]),
      execute: vi.fn(),
    } as any

    const tools = buildAgentTools({
      toolRegistry,
      mode: 'plan',
      callbacks: {},
      getAllMessages: () => [],
      getAbortSignal: () => undefined,
      getToolContext: () => ({ directoryHandle: null }),
      setToolContext: () => {},
      provider: { maxContextTokens: 128000, estimateTokens: () => 1 } as any,
      contextManager: { getConfig: () => ({ maxContextTokens: 128000, reserveTokens: 4096 }) } as any,
      toolExecutionTimeout: 30000,
      toolTimeoutExemptions: new Set<string>(['run_workflow']),
    })

    await expect(tools[0].execute('call_1', {})).rejects.toThrow('not available in plan mode')
    expect(toolRegistry.execute).not.toHaveBeenCalled()
  })
})
