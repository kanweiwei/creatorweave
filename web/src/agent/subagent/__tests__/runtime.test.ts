import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/agent/message-types'
import type { SubagentTaskNotification, SubagentRuntime } from '@/agent/tools/tool-types'
import { __resetSubagentRuntimeRegistryForTests, getOrCreateSubagentRuntime } from '@/agent/subagent/runtime'

const hoisted = vi.hoisted(() => {
  const repo = {
    findByWorkspaceId: vi.fn(async () => []),
    saveBatch: vi.fn(async () => {}),
    transitionStatus: vi.fn(async () => ({ applied: true })),
    getStatus: vi.fn(async () => null),
  }

  const loopConfigs: any[] = []
  let runImpl: (messages: Message[], config: any) => Promise<Message[]> = async (messages) => messages

  return {
    repo,
    loopConfigs,
    setRunImpl: (impl: (messages: Message[], config: any) => Promise<Message[]>) => {
      runImpl = impl
    },
    getRunImpl: () => runImpl,
  }
})

vi.mock('@/sqlite', () => ({
  getSubagentRepository: () => hoisted.repo,
}))

vi.mock('@/agent/agent-loop', () => {
  class MockAgentLoop {
    private config: any

    constructor(config: any) {
      this.config = config
      hoisted.loopConfigs.push(config)
    }

    cancel(): void {
      // no-op in tests; run completion is controlled by deferred promises
    }

    async run(messages: Message[]): Promise<Message[]> {
      return hoisted.getRunImpl()(messages, this.config)
    }
  }

  return { AgentLoop: MockAgentLoop }
})

function createAssistantMessage(content: string): Message {
  return {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content,
    timestamp: Date.now(),
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
  }
}

function createStoredTask(input: {
  workspaceId: string
  agentId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed'
  name?: string
  messages?: Message[]
  queue?: Array<{ message: string; enqueued_at: number }>
}): Record<string, unknown> {
  const now = Date.now()
  return {
    agentId: input.agentId,
    workspaceId: input.workspaceId,
    name: input.name,
    description: 'persisted task',
    status: input.status,
    mode: 'act',
    messages: input.messages || [],
    queue: input.queue || [],
    usage: undefined,
    error: undefined,
    stopped: false,
    created_at: now - 5000,
    updated_at: now - 1000,
    last_activity_at: now - 1000,
  }
}

function createRuntime(workspaceId: string, notifications: SubagentTaskNotification[]): SubagentRuntime {
  return getOrCreateSubagentRuntime({
    workspaceId,
    provider: {} as any,
    toolRegistry: {} as any,
    contextManager: {
      getConfig: () => ({
        maxContextTokens: 128000,
        reserveTokens: 4096,
        enableSummarization: false,
        maxMessageGroups: 20,
      }),
    } as any,
    baseToolContext: {
      directoryHandle: null,
      workspaceId,
      agentMode: 'act',
    },
    onNotification: (event) => notifications.push(event),
  })
}

async function waitForStatus(runtime: SubagentRuntime, agentId: string, status: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const current = await runtime.getStatus({ agentId })
    if (current.status === status) return
    await Promise.resolve()
  }
  throw new Error(`status did not reach ${status}`)
}

describe('subagent runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    __resetSubagentRuntimeRegistryForTests()
    hoisted.loopConfigs.length = 0
    hoisted.repo.findByWorkspaceId.mockImplementation(async () => [])
    hoisted.repo.transitionStatus.mockImplementation(async () => ({ applied: true }))
    hoisted.repo.getStatus.mockImplementation(async () => null)
    hoisted.setRunImpl(async (messages) => [...messages, createAssistantMessage('ok')])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks task failed on spawn timeout and sends timeout notification', async () => {
    let resolveRun = () => {}
    hoisted.setRunImpl(
      (messages) =>
        new Promise<Message[]>((resolve) => {
          resolveRun = () => resolve([...messages, createAssistantMessage('late')])
        })
    )

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-timeout-${Date.now()}`, notifications)
    const spawned = await runtime.spawn({
      description: 'timeout test',
      prompt: 'run',
      run_in_background: true,
      timeout_ms: 10,
    } as any)
    expect(spawned.status).toBe('async_launched')

    await vi.advanceTimersByTimeAsync(20)

    const status = await runtime.getStatus({ agentId: (spawned as { agentId: string }).agentId })
    expect(status.status).toBe('failed')
    expect(status.error?.code).toBe('SUBAGENT_TIMEOUT')
    expect(
      notifications.some((event) => event.status === 'failed' && event.exit_reason === 'timeout')
    ).toBe(true)

    resolveRun()
  })

  it('rejects enqueue when queue is full', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-queue-full-${Date.now()}`, notifications)
    const spawned = await runtime.spawn({
      description: 'queue full test',
      prompt: 'run',
      run_in_background: true,
    })
    const agentId = (spawned as { agentId: string }).agentId
    await waitForStatus(runtime, agentId, 'running')

    for (let i = 0; i < 100; i += 1) {
      const result = await runtime.sendMessage({ to: agentId, message: `msg-${i}` })
      expect(result.success).toBe(true)
    }

    const overflow = await runtime.sendMessage({ to: agentId, message: 'overflow', timeout_ms: 0 })
    expect(overflow.success).toBe(false)
    expect(overflow.message).toBe('QUEUE_FULL')
  })

  it('waits for enqueue timeout before returning QUEUE_FULL', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-enqueue-timeout-${Date.now()}`, notifications)
    const spawned = await runtime.spawn({
      description: 'enqueue timeout test',
      prompt: 'run',
      run_in_background: true,
    })
    const agentId = (spawned as { agentId: string }).agentId
    await waitForStatus(runtime, agentId, 'running')

    for (let i = 0; i < 100; i += 1) {
      const result = await runtime.sendMessage({ to: agentId, message: `msg-${i}`, timeout_ms: 0 })
      expect(result.success).toBe(true)
    }

    let settled = false
    let queueResult: { success: boolean; message: string } = { success: true, message: '' }
    const pending = runtime
      .sendMessage({ to: agentId, message: 'overflow', timeout_ms: 30 })
      .then((value) => {
        settled = true
        queueResult = value
      })
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(29)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(settled).toBe(true)
    expect(queueResult.success).toBe(false)
    expect(queueResult.message).toBe('QUEUE_FULL')
  })

  it('drops expired queued messages before enqueueing new ones', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-queue-timeout-${Date.now()}`, notifications)
    const spawned = await runtime.spawn({
      description: 'queue timeout test',
      prompt: 'run',
      run_in_background: true,
    })
    const agentId = (spawned as { agentId: string }).agentId
    await waitForStatus(runtime, agentId, 'running')

    const first = await runtime.sendMessage({ to: agentId, message: 'stale' })
    expect(first.success).toBe(true)

    await vi.advanceTimersByTimeAsync(300001)

    const second = await runtime.sendMessage({ to: agentId, message: 'fresh' })
    expect(second.success).toBe(true)

    const status = await runtime.getStatus({ agentId })
    expect(status.queue_depth).toBe(1)
  })

  it('keeps killed status when stop wins race against late completion', async () => {
    let resolveRun = () => {}
    hoisted.setRunImpl(
      (messages) =>
        new Promise<Message[]>((resolve) => {
          resolveRun = () => resolve([...messages, createAssistantMessage('completed late')])
        })
    )

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-race-${Date.now()}`, notifications)
    const spawned = await runtime.spawn({
      description: 'race test',
      prompt: 'run',
      run_in_background: true,
    })
    const agentId = (spawned as { agentId: string }).agentId
    await waitForStatus(runtime, agentId, 'running')

    const stopping = runtime.stop({ agentId, timeout_ms: 100 })
    resolveRun()
    await stopping

    const status = await runtime.getStatus({ agentId })
    expect(status.status).toBe('killed')
    expect(notifications.some((event) => event.status === 'killed')).toBe(true)
    expect(notifications.some((event) => event.status === 'completed')).toBe(false)
  })

  it('escalates soft stop to forced kill when cleanup timeout is reached', async () => {
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-stop-timeout-${Date.now()}`, notifications)
    const spawned = await runtime.spawn({
      description: 'stop timeout test',
      prompt: 'run',
      run_in_background: true,
    })
    const agentId = (spawned as { agentId: string }).agentId
    await waitForStatus(runtime, agentId, 'running')

    let stopped = false
    const stopping = runtime.stop({ agentId, timeout_ms: 40 }).then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)

    await vi.advanceTimersByTimeAsync(40)
    await stopping

    const status = await runtime.getStatus({ agentId })
    expect(status.status).toBe('killed')
    expect(status.error?.code).toBe('STOPPED_FORCE_TIMEOUT')
  })

  it('sends running notification only when a tool call happens', async () => {
    hoisted.setRunImpl(async (messages) => [...messages, createAssistantMessage('no tools used')])

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(`workspace-running-notify-${Date.now()}`, notifications)
    await runtime.spawn({
      description: 'no tool call',
      prompt: 'run',
      run_in_background: false,
    })

    expect(notifications.some((event) => event.status === 'running')).toBe(false)
  })

  it('hydrates running task as failed with SESSION_INTERRUPTED and supports alias lookup', async () => {
    const workspaceId = `workspace-hydrate-running-${Date.now()}`
    hoisted.repo.findByWorkspaceId.mockResolvedValueOnce([
      createStoredTask({
        workspaceId,
        agentId: 'subagent_persisted_1',
        status: 'running',
        name: 'persisted-alias',
        queue: [{ message: 'queued-before-restart', enqueued_at: Date.now() - 1000 }],
      }),
    ] as any)
    hoisted.setRunImpl(() => new Promise<Message[]>(() => {}))

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(workspaceId, notifications)
    const status = await runtime.getStatus({ agentId: 'persisted-alias' })
    expect(status.status).toBe('failed')
    expect(status.error?.code).toBe('SESSION_INTERRUPTED')

    const resumed = await runtime.sendMessage({ to: 'persisted-alias', message: 'resume work' })
    expect(resumed.success).toBe(true)
    expect(resumed.resumed).toBe(true)
  })

  it('hydrates pending task as failed and preserves transcript count for resume', async () => {
    const workspaceId = `workspace-hydrate-pending-${Date.now()}`
    hoisted.repo.findByWorkspaceId.mockResolvedValueOnce([
      createStoredTask({
        workspaceId,
        agentId: 'subagent_persisted_2',
        status: 'pending',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'first',
            timestamp: Date.now() - 3000,
          },
          {
            id: 'a1',
            role: 'assistant',
            content: 'answer',
            timestamp: Date.now() - 2000,
          },
        ],
      }),
    ] as any)

    const notifications: SubagentTaskNotification[] = []
    const runtime = createRuntime(workspaceId, notifications)
    const status = await runtime.getStatus({ agentId: 'subagent_persisted_2' })
    expect(status.status).toBe('failed')
    expect(status.error?.code).toBe('SESSION_INTERRUPTED')

    const resumed = await runtime.resume({
      agentId: 'subagent_persisted_2',
      prompt: 'continue from checkpoint',
    })
    expect(resumed.status).toBe('resumed')
    expect(resumed.transcript_entries_recovered).toBe(2)
  })
})
