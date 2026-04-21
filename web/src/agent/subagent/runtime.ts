import { type AgentMode } from '@/agent/agent-mode'
import { AgentLoop } from '@/agent/agent-loop'
import { ContextManager } from '@/agent/context-manager'
import { createUserMessage, generateId, type Message } from '@/agent/message-types'
import type { PiAIProvider } from '@/agent/llm/pi-ai-provider'
import type { ToolRegistry } from '@/agent/tool-registry'
import type {
  BatchSpawnSubagentInput,
  SpawnSubagentInput,
  SpawnSubagentSyncResult,
  SubagentRuntime,
  SubagentTaskNotification,
  SubagentTaskStatus,
  SubagentTaskSummary,
  SubagentTaskUsage,
  ToolContext,
} from '@/agent/tools/tool-types'

type SubagentTaskInternal = {
  agentId: string
  name?: string
  description: string
  status: SubagentTaskStatus
  created_at: number
  updated_at: number
  last_activity_at: number
  mode: AgentMode
  messages: Message[]
  queue: Array<{ message: string; enqueued_at: number }>
  max_queue_size: number
  overflow_action: 'reject' | 'drop_oldest'
  message_timeout_ms: number
  timeout_ms: number
  usage?: SubagentTaskUsage
  error?: { code: string; message: string }
  loop?: AgentLoop
  processing: boolean
  processingPromise?: Promise<void>
  stopped: boolean
  lifecycle_version: number
  running_notification_armed: boolean
  run_timeout?: ReturnType<typeof setTimeout>
}

type RuntimeDeps = {
  workspaceId: string
  provider: PiAIProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  baseToolContext: ToolContext
  onNotification?: (event: SubagentTaskNotification) => void
}

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent executing a specific task. Follow the instructions precisely.
When done, provide a concise summary of what you accomplished.
If you encounter errors, describe them clearly including what you tried and what failed.`

const SUBAGENT_CONTROL_TOOLS = new Set([
  'spawn_subagent',
  'batch_spawn',
  'send_message_to_subagent',
  'stop_subagent',
  'resume_subagent',
  'get_subagent_status',
  'list_subagents',
])

const DEFAULT_EXECUTION_TIMEOUT_MS = 300000
const MAX_EXECUTION_TIMEOUT_MS = 3600000
const DEFAULT_ENQUEUE_TIMEOUT_MS = 5000
const DEFAULT_STOP_TIMEOUT_MS = 10000
const DEFAULT_QUEUE_SIZE = 100
const DEFAULT_OVERFLOW_ACTION: 'reject' | 'drop_oldest' = 'reject'
const DEFAULT_MESSAGE_TIMEOUT_MS = 300000
const SUMMARY_MAX_CHARS = 500
const CAS_MAX_RETRIES = 3
const CAS_RETRY_DELAY_MS = 10

class SubagentRuntimeImpl implements SubagentRuntime {
  private tasks = new Map<string, SubagentTaskInternal>()
  private nameToId = new Map<string, string>()
  private deps: RuntimeDeps
  private hydrationPromise: Promise<void>

  constructor(deps: RuntimeDeps) {
    this.deps = deps
    this.hydrationPromise = this.hydrateFromSQLite()
  }

  updateDeps(deps: RuntimeDeps): void {
    this.deps = deps
  }

  async spawn(
    input: SpawnSubagentInput
  ): Promise<SpawnSubagentSyncResult | { status: 'async_launched'; agentId: string }> {
    await this.ensureHydrated()
    const description = (input.description || '').trim()
    const prompt = (input.prompt || '').trim()
    const name = typeof input.name === 'string' ? input.name.trim() : undefined
    const mode = input.mode || this.deps.baseToolContext.agentMode || 'act'
    const runInBackground = input.run_in_background !== false
    const timeoutMs = this.parseExecutionTimeout(input.timeout_ms)

    if (!description) {
      throw new Error('INVALID_INPUT: description is required')
    }
    if (!prompt) {
      throw new Error('INVALID_INPUT: prompt is required')
    }
    if (name) {
      const existing = this.nameToId.get(name)
      if (existing) {
        throw new Error('NAME_CONFLICT: name already exists')
      }
    }

    const now = Date.now()
    const agentId = `subagent_${generateId()}`
    const task: SubagentTaskInternal = {
      agentId,
      name,
      description,
      status: 'pending',
      created_at: now,
      updated_at: now,
      last_activity_at: now,
      mode,
      messages: [],
      queue: [{ message: prompt, enqueued_at: now }],
      max_queue_size: DEFAULT_QUEUE_SIZE,
      overflow_action: DEFAULT_OVERFLOW_ACTION,
      message_timeout_ms: DEFAULT_MESSAGE_TIMEOUT_MS,
      timeout_ms: timeoutMs,
      processing: false,
      stopped: false,
      lifecycle_version: 0,
      running_notification_armed: false,
    }

    this.tasks.set(agentId, task)
    if (name) this.nameToId.set(name, agentId)
    this.persistToSQLite()

    if (runInBackground) {
      this.ensureProcessing(task)
      return {
        status: 'async_launched',
        agentId,
      }
    }

    await this.ensureProcessing(task)
    const latest = this.tasks.get(agentId)
    if (!latest) {
      throw new Error('TASK_NOT_FOUND')
    }
    if (latest.status !== 'completed') {
      throw new Error(latest.error?.code || 'SUBAGENT_FAILED')
    }
    return {
      status: 'completed',
      content: this.extractLatestAssistantContent(latest.messages),
      usage: latest.usage,
    }
  }

  async sendMessage(input: {
    to: string
    message: string
    timeout_ms?: number
    overflow_action?: 'reject' | 'drop_oldest'
  }): Promise<{
    success: boolean
    message: string
    queued_at?: number
    queue_position?: number
    resumed?: boolean
    resume_error?: { code: string; message: string; recoverable: boolean }
  }> {
    await this.ensureHydrated()
    const to = (input.to || '').trim()
    const message = (input.message || '').trim()
    if (!message) {
      return {
        success: false,
        message: 'INVALID_MESSAGE',
      }
    }
    const task = this.getByIdOrName(to)
    if (!task) {
      return {
        success: false,
        message: 'TASK_NOT_FOUND',
      }
    }

    if (task.status === 'completed') {
      return {
        success: false,
        message: 'TASK_ALREADY_COMPLETED',
      }
    }
    const parsedEnqueueTimeout = this.parseEnqueueTimeout(input.timeout_ms)
    if (!parsedEnqueueTimeout.ok) {
      return {
        success: false,
        message: 'INVALID_INPUT',
      }
    }
    const overflowAction = input.overflow_action || task.overflow_action

    this.pruneExpiredQueue(task)
    if (task.status === 'failed' || task.status === 'killed') {
      this.setStatus(task, 'pending')
      task.stopped = false
      task.error = undefined
      const enqueue = await this.enqueueWithPolicy(task, message, {
        overflow_action: overflowAction,
        timeout_ms: parsedEnqueueTimeout.timeout_ms,
      })
      if (!enqueue.success) {
        return {
          success: false,
          message: enqueue.message,
        }
      }
      task.updated_at = enqueue.queued_at
      task.last_activity_at = enqueue.queued_at
      this.persistToSQLite()
      this.ensureProcessing(task)
      return {
        success: true,
        message: 'resumed',
        queued_at: enqueue.queued_at,
        queue_position: enqueue.queue_position,
        resumed: true,
      }
    }

    const enqueue = await this.enqueueWithPolicy(task, message, {
      overflow_action: overflowAction,
      timeout_ms: parsedEnqueueTimeout.timeout_ms,
    })
    if (!enqueue.success) {
      return {
        success: false,
        message: enqueue.message,
      }
    }
    task.updated_at = enqueue.queued_at
    task.last_activity_at = enqueue.queued_at
    this.persistToSQLite()
    this.ensureProcessing(task)
    return {
      success: true,
      message: 'queued',
      queued_at: enqueue.queued_at,
      queue_position: enqueue.queue_position,
    }
  }

  async stop(input: {
    agentId: string
    force?: boolean
    timeout_ms?: number
  }): Promise<{ success: boolean; already_stopped?: boolean }> {
    await this.ensureHydrated()
    const task = this.getByIdOrName((input.agentId || '').trim())
    if (!task) {
      throw new Error('TASK_NOT_FOUND')
    }
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'killed') {
      return { success: true, already_stopped: true }
    }
    const parsedStopTimeout = this.parseStopTimeout(input.timeout_ms)
    if (!parsedStopTimeout.ok) {
      throw new Error('INVALID_INPUT: timeout_ms must be a non-negative number')
    }
    if (input.force) {
      await this.killTask(task, {
        code: 'STOPPED_FORCE',
        message: 'Subagent stopped by force.',
        recoverable: false,
      })
      return { success: true }
    }
    task.stopped = true
    task.running_notification_armed = false
    task.loop?.cancel()
    const processingPromise = task.processingPromise
    if (processingPromise) {
      const didFinish = await this.waitForPromiseOrTimeout(processingPromise, parsedStopTimeout.timeout_ms)
      if (!didFinish) {
        await this.killTask(task, {
          code: 'STOPPED_FORCE_TIMEOUT',
          message: `Subagent stop timed out after ${parsedStopTimeout.timeout_ms}ms; force stopped.`,
          recoverable: false,
        })
        return { success: true }
      }
    }
    await this.killTask(task, {
      code: 'STOPPED',
      message: 'Subagent stopped.',
      recoverable: false,
    })
    return { success: true }
  }

  async resume(input: {
    agentId: string
    prompt: string
    timeout_ms?: number
  }): Promise<{
    status: 'resumed'
    agentId: string
    resumed_from: string | null
    transcript_entries_recovered: number
  }> {
    await this.ensureHydrated()
    const task = this.getByIdOrName((input.agentId || '').trim())
    if (!task) {
      throw new Error('TASK_NOT_FOUND')
    }
    const prompt = (input.prompt || '').trim()
    if (!prompt) {
      throw new Error('INVALID_INPUT: prompt is required')
    }
    const recovered = task.messages.length
    if (typeof input.timeout_ms === 'number') {
      task.timeout_ms = this.parseExecutionTimeout(input.timeout_ms)
    }
    this.setStatus(task, 'pending')
    task.stopped = false
    task.error = undefined
    this.clearRunTimeout(task)
    task.queue.push({ message: prompt, enqueued_at: Date.now() })
    task.updated_at = Date.now()
    task.last_activity_at = task.updated_at
    this.persistToSQLite()
    this.ensureProcessing(task)
    return {
      status: 'resumed',
      agentId: task.agentId,
      resumed_from: null,
      transcript_entries_recovered: recovered,
    }
  }

  async getStatus(input: {
    agentId: string
  }): Promise<{
    agentId: string
    status: SubagentTaskStatus
    description: string
    created_at: number
    updated_at: number
    last_activity_at: number
    queue_depth: number
    usage?: SubagentTaskUsage
    error?: { code: string; message: string }
  }> {
    await this.ensureHydrated()
    const task = this.getByIdOrName((input.agentId || '').trim())
    if (!task) {
      throw new Error('TASK_NOT_FOUND')
    }
    return {
      agentId: task.agentId,
      status: task.status,
      description: task.description,
      created_at: task.created_at,
      updated_at: task.updated_at,
      last_activity_at: task.last_activity_at,
      queue_depth: task.queue.length,
      usage: task.usage,
      error: task.error,
    }
  }

  async list(input: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{
    agents: SubagentTaskSummary[]
    total: number
  }> {
    await this.ensureHydrated()
    const statusFilter = typeof input.status === 'string' ? input.status.trim() : ''
    const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Number(input.limit))) : 50
    const offset = Number.isFinite(input.offset) ? Math.max(0, Math.floor(Number(input.offset))) : 0

    const all = Array.from(this.tasks.values())
      .filter((task) => !statusFilter || task.status === statusFilter)
      .sort((a, b) => b.updated_at - a.updated_at)

    return {
      agents: all.slice(offset, offset + limit).map((task) => ({
        agentId: task.agentId,
        name: task.name,
        description: task.description,
        status: task.status,
        created_at: task.created_at,
        updated_at: task.updated_at,
      })),
      total: all.length,
    }
  }

  async batchSpawn(input: BatchSpawnSubagentInput): Promise<{
    launched: Array<{
      task_index: number
      agentId: string
    }>
    rejected: Array<{
      task_index: number
      reason: string
      error_code: string
    }>
  }> {
    await this.ensureHydrated()
    const tasks = Array.isArray(input.tasks) ? input.tasks : []
    const maxConcurrency = Number.isFinite(input.max_concurrency)
      ? Math.max(1, Math.min(20, Math.floor(Number(input.max_concurrency))))
      : 5
    const runInBackground = input.run_in_background !== false

    const launched: Array<{ task_index: number; agentId: string }> = []
    const rejected: Array<{ task_index: number; reason: string; error_code: string }> = []

    let cursor = 0
    const workers = Array.from({ length: Math.min(maxConcurrency, Math.max(tasks.length, 1)) }).map(
      async () => {
        while (cursor < tasks.length) {
          const taskIndex = cursor
          cursor += 1
          const task = tasks[taskIndex]
          try {
            const result = await this.spawn({
              ...task,
              run_in_background: runInBackground,
            })
            if (result.status === 'async_launched') {
              launched.push({ task_index: taskIndex, agentId: result.agentId })
            } else {
              const existing = this.findByDescriptionAndLatest(task.description)
              launched.push({ task_index: taskIndex, agentId: existing?.agentId || '' })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            rejected.push({
              task_index: taskIndex,
              reason: message,
              error_code: message.includes('NAME_CONFLICT')
                ? 'NAME_CONFLICT'
                : message.includes('INVALID_INPUT')
                  ? 'INVALID_INPUT'
                  : 'BATCH_SPAWN_FAILED',
            })
          }
        }
      }
    )
    await Promise.all(workers)

    return { launched, rejected }
  }

  private async killTask(
    task: SubagentTaskInternal,
    input: { code: string; message: string; recoverable: boolean }
  ): Promise<void> {
    task.stopped = true
    task.running_notification_armed = false
    task.error = { code: input.code, message: input.message }
    const transitioned = await this.applyStatusTransition(task, ['pending', 'running', 'failed'], 'killed')
    if (!transitioned) {
      return
    }
    this.clearRunTimeout(task)
    this.emitNotification({
      event_type: 'task_notification',
      agentId: task.agentId,
      status: 'killed',
      summary: this.toSummary(task.error.message),
      exit_reason: 'stopped',
      error: {
        code: task.error.code,
        message: task.error.message,
        recoverable: input.recoverable,
      },
      timestamp: Date.now(),
    })
    task.loop?.cancel()
  }

  private getByIdOrName(idOrName: string): SubagentTaskInternal | undefined {
    if (!idOrName) return undefined
    const direct = this.tasks.get(idOrName)
    if (direct) return direct
    const mapped = this.nameToId.get(idOrName)
    return mapped ? this.tasks.get(mapped) : undefined
  }

  private ensureProcessing(task: SubagentTaskInternal): Promise<void> {
    if (task.processing && task.processingPromise) {
      return task.processingPromise
    }
    task.processing = true
    task.processingPromise = this.processQueue(task).finally(() => {
      task.processing = false
      task.processingPromise = undefined
      this.persistToSQLite()
    })
    return task.processingPromise
  }

  private async processQueue(task: SubagentTaskInternal): Promise<void> {
    while (task.queue.length > 0) {
      if (task.status === 'killed' || task.stopped) {
        task.running_notification_armed = false
        this.clearRunTimeout(task)
        return
      }
      this.pruneExpiredQueue(task)
      if (task.queue.length === 0) {
        return
      }
      const queued = task.queue.shift()
      if (!queued) return

      task.running_notification_armed = true
      const runningTransition = await this.applyStatusTransition(
        task,
        ['pending', 'running'],
        'running'
      )
      if (!runningTransition) {
        task.running_notification_armed = false
        return
      }
      const runningVersion = task.lifecycle_version
      this.armRunTimeout(task, runningVersion)

      try {
        const loop = this.ensureLoop(task)
        task.messages.push(createUserMessage(queued.message))
        const startedAt = Date.now()
        task.messages = await loop.run(task.messages)
        if (
          task.stopped ||
          task.status !== 'running' ||
          task.lifecycle_version !== runningVersion
        ) {
          task.running_notification_armed = false
          this.clearRunTimeout(task)
          return
        }
        task.running_notification_armed = false
        const transitionedToCompleted = await this.applyStatusTransition(task, 'running', 'completed')
        if (!transitionedToCompleted) {
          this.clearRunTimeout(task)
          return
        }
        const completedAt = task.updated_at
        this.clearRunTimeout(task)

        const latestAssistant = [...task.messages].reverse().find((msg) => msg.role === 'assistant')
        if (latestAssistant?.usage) {
          task.usage = {
            total_tokens: latestAssistant.usage.totalTokens,
            input_tokens: latestAssistant.usage.promptTokens,
            output_tokens: latestAssistant.usage.completionTokens,
            duration_ms: Math.max(0, completedAt - startedAt),
            tool_calls: task.messages.filter((msg) => msg.role === 'tool').length,
          }
        }
        const finalResult = this.extractLatestAssistantContent(task.messages)
        const structured = this.parseStructuredResult(finalResult)
        this.emitNotification({
          event_type: 'task_notification',
          agentId: task.agentId,
          status: 'completed',
          summary: this.toSummary(`Subagent "${task.description}" completed.`),
          result: finalResult,
          result_schema_id: structured ? 'subagent.result.v1' : undefined,
          result_json: structured || undefined,
          exit_reason: 'completed',
          usage: task.usage,
          timestamp: completedAt,
        })
      } catch (error) {
        if (
          task.stopped ||
          task.status !== 'running' ||
          task.lifecycle_version !== runningVersion
        ) {
          task.running_notification_armed = false
          this.clearRunTimeout(task)
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        task.running_notification_armed = false
        task.error = { code: 'SUBAGENT_FAILED', message }
        const transitionedToFailed = await this.applyStatusTransition(task, 'running', 'failed')
        if (!transitionedToFailed) {
          this.clearRunTimeout(task)
          return
        }
        this.clearRunTimeout(task)
        this.emitNotification({
          event_type: 'task_notification',
          agentId: task.agentId,
          status: 'failed',
          summary: this.toSummary(`Subagent "${task.description}" failed.`),
          exit_reason: 'error',
          error: {
            code: task.error.code,
            message: task.error.message,
            recoverable: true,
          },
          timestamp: task.updated_at,
        })
        return
      }
    }
  }

  private ensureLoop(task: SubagentTaskInternal): AgentLoop {
    if (task.loop) return task.loop

    const contextConfig = this.deps.contextManager.getConfig()
    const subContextManager = new ContextManager({
      maxContextTokens: contextConfig.maxContextTokens,
      reserveTokens: contextConfig.reserveTokens,
      enableSummarization: contextConfig.enableSummarization,
      maxMessageGroups: contextConfig.maxMessageGroups,
      systemPrompt: SUBAGENT_SYSTEM_PROMPT,
    })
    const taskContext: ToolContext = {
      ...this.deps.baseToolContext,
      agentMode: task.mode,
      subagentRuntime: undefined,
      readFileState: new Map(),
    }

    task.loop = new AgentLoop({
      provider: this.deps.provider,
      toolRegistry: this.deps.toolRegistry,
      contextManager: subContextManager,
      systemPrompt: SUBAGENT_SYSTEM_PROMPT,
      toolContext: taskContext,
      mode: task.mode,
      beforeToolCall: ({ toolName }) => {
        if (task.running_notification_armed) {
          task.running_notification_armed = false
          this.emitNotification({
            event_type: 'task_notification',
            agentId: task.agentId,
            status: 'running',
            summary: this.toSummary(`Subagent "${task.description}" is running.`),
            timestamp: Date.now(),
          })
        }
        if (SUBAGENT_CONTROL_TOOLS.has(toolName)) {
          return {
            block: true,
            reason: `Tool "${toolName}" is blocked in subagent runtime.`,
          }
        }
        return undefined
      },
    })

    return task.loop
  }

  private extractLatestAssistantContent(messages: Message[]): string {
    const assistant = [...messages].reverse().find((msg) => msg.role === 'assistant')
    return (assistant?.content || '').trim()
  }

  private parseStructuredResult(content: string): Record<string, unknown> | null {
    const trimmed = content.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return null
    } catch {
      return null
    }
  }

  private parseExecutionTimeout(raw: number | undefined): number {
    if (typeof raw !== 'number') return DEFAULT_EXECUTION_TIMEOUT_MS
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new Error('INVALID_INPUT: timeout_ms must be a positive number')
    }
    const normalized = Math.floor(raw)
    if (normalized > MAX_EXECUTION_TIMEOUT_MS) {
      throw new Error('TIMEOUT_EXCEEDS_MAX')
    }
    return normalized
  }

  private parseEnqueueTimeout(
    raw: number | undefined
  ): { ok: true; timeout_ms: number } | { ok: false } {
    if (typeof raw !== 'number') return { ok: true, timeout_ms: DEFAULT_ENQUEUE_TIMEOUT_MS }
    if (!Number.isFinite(raw) || raw < 0) return { ok: false }
    const normalized = Math.floor(raw)
    if (normalized > MAX_EXECUTION_TIMEOUT_MS) return { ok: false }
    return { ok: true, timeout_ms: normalized }
  }

  private parseStopTimeout(raw: number | undefined): { ok: true; timeout_ms: number } | { ok: false } {
    if (typeof raw !== 'number') return { ok: true, timeout_ms: DEFAULT_STOP_TIMEOUT_MS }
    if (!Number.isFinite(raw) || raw < 0) return { ok: false }
    const normalized = Math.floor(raw)
    if (normalized > MAX_EXECUTION_TIMEOUT_MS) return { ok: false }
    return { ok: true, timeout_ms: normalized }
  }

  private setStatus(task: SubagentTaskInternal, next: SubagentTaskStatus): void {
    if (task.status === next) return
    task.status = next
    task.lifecycle_version += 1
  }

  private async applyStatusTransition(
    task: SubagentTaskInternal,
    fromStatus: SubagentTaskStatus | SubagentTaskStatus[],
    toStatus: SubagentTaskStatus
  ): Promise<boolean> {
    const expectedStatuses = Array.isArray(fromStatus) ? fromStatus : [fromStatus]
    let lastPersistedStatus: SubagentTaskStatus | null = null
    for (let attempt = 1; attempt <= CAS_MAX_RETRIES; attempt += 1) {
      const updatedAt = Date.now()
      const persisted = await this.persistStatusTransition(task, fromStatus, toStatus, updatedAt)
      if (persisted.applied) {
        this.setStatus(task, toStatus)
        task.updated_at = updatedAt
        task.last_activity_at = updatedAt
        if (!persisted.usedCAS) {
          this.persistToSQLite()
        }
        return true
      }
      const currentStatus = persisted.currentStatus || null
      lastPersistedStatus = currentStatus
      if (!persisted.usedCAS) {
        this.setStatus(task, toStatus)
        task.updated_at = updatedAt
        task.last_activity_at = updatedAt
        this.persistToSQLite()
        return true
      }

      const retriable = currentStatus === null || expectedStatuses.includes(currentStatus)
      if (retriable && attempt < CAS_MAX_RETRIES) {
        await this.sleep(CAS_RETRY_DELAY_MS * attempt)
        continue
      }

      if (currentStatus && task.status !== currentStatus) {
        this.setStatus(task, currentStatus)
      }
      return false
    }

    const readback = await this.readPersistedStatus(task.agentId)
    if (readback === toStatus) {
      this.setStatus(task, toStatus)
      return true
    }
    if (readback && task.status !== readback) {
      this.setStatus(task, readback)
      return false
    }
    if (lastPersistedStatus && task.status !== lastPersistedStatus) {
      this.setStatus(task, lastPersistedStatus)
      return false
    }
    return false
  }

  private async persistStatusTransition(
    task: SubagentTaskInternal,
    fromStatus: SubagentTaskStatus | SubagentTaskStatus[],
    toStatus: SubagentTaskStatus,
    updatedAt: number
  ): Promise<{ applied: boolean; currentStatus?: SubagentTaskStatus; usedCAS: boolean }> {
    if (typeof process !== 'undefined' && process.env.VITEST) {
      return { applied: true, usedCAS: false }
    }
    try {
      const { getSubagentRepository } = await import('@/sqlite')
      const repo = getSubagentRepository() as {
        transitionStatus?: (input: {
          workspaceId: string
          agentId: string
          fromStatus: SubagentTaskStatus | SubagentTaskStatus[]
          toStatus: SubagentTaskStatus
          mode: AgentMode
          messages: Message[]
          queue: Array<{ message: string; enqueued_at: number }>
          usage?: SubagentTaskUsage
          error?: { code: string; message: string }
          stopped: boolean
          updated_at: number
          last_activity_at: number
        }) => Promise<{ applied: boolean; currentStatus?: SubagentTaskStatus }>
      }
      if (typeof repo.transitionStatus === 'function') {
        const result = await repo.transitionStatus({
          workspaceId: this.deps.workspaceId,
          agentId: task.agentId,
          fromStatus,
          toStatus,
          mode: task.mode,
          messages: task.messages,
          queue: task.queue,
          usage: task.usage,
          error: task.error,
          stopped: task.stopped,
          updated_at: updatedAt,
          last_activity_at: updatedAt,
        })
        return {
          applied: result.applied,
          currentStatus: result.currentStatus,
          usedCAS: true,
        }
      }
    } catch {
      // Ignore persistence conflict checks when SQLite is unavailable.
    }
    return { applied: true, usedCAS: false }
  }

  private async readPersistedStatus(agentId: string): Promise<SubagentTaskStatus | null> {
    try {
      const { getSubagentRepository } = await import('@/sqlite')
      const repo = getSubagentRepository() as {
        getStatus?: (workspaceId: string, agentId: string) => Promise<SubagentTaskStatus | null>
      }
      if (typeof repo.getStatus === 'function') {
        return await repo.getStatus(this.deps.workspaceId, agentId)
      }
    } catch {
      // Ignore readback failures; caller keeps in-memory state.
    }
    return null
  }

  private enqueueMessage(
    task: SubagentTaskInternal,
    message: string,
    enqueuedAt: number,
    options?: { overflow_action?: 'reject' | 'drop_oldest' }
  ): { success: true; queue_position: number } | { success: false; message: 'QUEUE_FULL' } {
    this.pruneExpiredQueue(task, enqueuedAt)
    const overflowAction = options?.overflow_action || task.overflow_action
    if (task.queue.length >= task.max_queue_size) {
      if (overflowAction === 'drop_oldest') {
        task.queue.shift()
      } else {
        return { success: false, message: 'QUEUE_FULL' }
      }
    }
    task.queue.push({ message, enqueued_at: enqueuedAt })
    return { success: true, queue_position: task.queue.length }
  }

  private async enqueueWithPolicy(
    task: SubagentTaskInternal,
    message: string,
    options: {
      overflow_action: 'reject' | 'drop_oldest'
      timeout_ms: number
    }
  ): Promise<
    | { success: true; queue_position: number; queued_at: number }
    | { success: false; message: 'QUEUE_FULL' | 'TASK_ALREADY_COMPLETED' }
  > {
    if (options.overflow_action === 'drop_oldest') {
      const queuedAt = Date.now()
      const enqueue = this.enqueueMessage(task, message, queuedAt, {
        overflow_action: options.overflow_action,
      })
      if (!enqueue.success) {
        return { success: false, message: enqueue.message }
      }
      return { success: true, queue_position: enqueue.queue_position, queued_at: queuedAt }
    }

    const deadline = Date.now() + options.timeout_ms
    while (true) {
      if (task.status === 'completed') {
        return { success: false, message: 'TASK_ALREADY_COMPLETED' }
      }
      const queuedAt = Date.now()
      const enqueue = this.enqueueMessage(task, message, queuedAt, {
        overflow_action: 'reject',
      })
      if (enqueue.success) {
        return { success: true, queue_position: enqueue.queue_position, queued_at: queuedAt }
      }
      if (Date.now() >= deadline) {
        return { success: false, message: 'QUEUE_FULL' }
      }
      await this.sleep(Math.max(1, Math.min(50, deadline - Date.now())))
    }
  }

  private pruneExpiredQueue(task: SubagentTaskInternal, now = Date.now()): void {
    if (task.queue.length === 0) return
    const maxAge = task.message_timeout_ms
    task.queue = task.queue.filter((item) => now - item.enqueued_at <= maxAge)
  }

  private armRunTimeout(task: SubagentTaskInternal, lifecycleVersion: number): void {
    this.clearRunTimeout(task)
    task.run_timeout = setTimeout(() => {
      void this.handleRunTimeout(task, lifecycleVersion)
    }, task.timeout_ms)
  }

  private async handleRunTimeout(task: SubagentTaskInternal, lifecycleVersion: number): Promise<void> {
    task.run_timeout = undefined
    if (task.status !== 'running') return
    if (task.lifecycle_version !== lifecycleVersion) return
    task.running_notification_armed = false
    task.error = {
      code: 'SUBAGENT_TIMEOUT',
      message: `Subagent timed out after ${task.timeout_ms}ms.`,
    }
    const transitionedToFailed = await this.applyStatusTransition(task, 'running', 'failed')
    if (!transitionedToFailed) {
      return
    }
    this.emitNotification({
      event_type: 'task_notification',
      agentId: task.agentId,
      status: 'failed',
      summary: this.toSummary(`Subagent "${task.description}" timed out.`),
      exit_reason: 'timeout',
      error: {
        code: task.error.code,
        message: task.error.message,
        recoverable: true,
      },
      timestamp: task.updated_at,
    })
    task.loop?.cancel()
  }

  private clearRunTimeout(task: SubagentTaskInternal): void {
    if (!task.run_timeout) return
    clearTimeout(task.run_timeout)
    task.run_timeout = undefined
  }

  private toSummary(value: string): string {
    const trimmed = value.trim()
    if (trimmed.length <= SUMMARY_MAX_CHARS) return trimmed
    return trimmed.slice(0, SUMMARY_MAX_CHARS)
  }

  private async waitForPromiseOrTimeout(target: Promise<unknown>, timeoutMs: number): Promise<boolean> {
    if (timeoutMs <= 0) return false
    return Promise.race([
      target.then(() => true, () => true),
      this.sleep(timeoutMs).then(() => false),
    ])
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }

  private emitNotification(event: SubagentTaskNotification): void {
    try {
      this.deps.onNotification?.(event)
    } catch (error) {
      console.warn('[SubagentRuntime] task notification delivery failed', {
        agentId: event.agentId,
        status: event.status,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async ensureHydrated(): Promise<void> {
    await this.hydrationPromise
  }

  private persistToSQLite(): void {
    void this.persistToSQLiteInternal()
  }

  private async persistToSQLiteInternal(): Promise<void> {
    try {
      const { getSubagentRepository } = await import('@/sqlite')
      const repo = getSubagentRepository()
      const serializable = Array.from(this.tasks.values()).map((task) => this.toStoredTask(task))
      await repo.saveBatch(this.deps.workspaceId, serializable)
    } catch {
      // ignore persistence failures for runtime continuity
    }
  }

  private async hydrateFromSQLite(): Promise<void> {
    try {
      const { getSubagentRepository } = await import('@/sqlite')
      const repo = getSubagentRepository()
      const parsed = await repo.findByWorkspaceId(this.deps.workspaceId)
      for (const item of parsed) {
        const revived: SubagentTaskInternal = {
          agentId: item.agentId,
          name: item.name,
          description: item.description,
          status:
            item.status === 'running' || item.status === 'pending' ? 'failed' : item.status,
          error:
            item.status === 'running' || item.status === 'pending'
              ? { code: 'SESSION_INTERRUPTED', message: 'Subagent interrupted by session restart.' }
              : item.error,
          created_at: item.created_at,
          updated_at: item.updated_at,
          last_activity_at: item.last_activity_at,
          mode: item.mode,
          messages: item.messages,
          queue: item.queue,
          max_queue_size: DEFAULT_QUEUE_SIZE,
          overflow_action: DEFAULT_OVERFLOW_ACTION,
          message_timeout_ms: DEFAULT_MESSAGE_TIMEOUT_MS,
          timeout_ms: DEFAULT_EXECUTION_TIMEOUT_MS,
          usage: item.usage,
          processing: false,
          processingPromise: undefined,
          loop: undefined,
          stopped: item.stopped ?? false,
          lifecycle_version: 0,
          running_notification_armed: false,
          run_timeout: undefined,
        }
        this.tasks.set(revived.agentId, revived)
        if (revived.name) this.nameToId.set(revived.name, revived.agentId)
      }
    } catch {
      // ignore hydration failures; runtime remains usable in-memory
    }
  }

  private toStoredTask(task: SubagentTaskInternal): {
    agentId: string
    workspaceId: string
    name?: string
    description: string
    status: SubagentTaskStatus
    mode: AgentMode
    messages: Message[]
    queue: Array<{ message: string; enqueued_at: number }>
    usage?: SubagentTaskUsage
    error?: { code: string; message: string }
    stopped: boolean
    created_at: number
    updated_at: number
    last_activity_at: number
  } {
    return {
      agentId: task.agentId,
      workspaceId: this.deps.workspaceId,
      name: task.name,
      description: task.description,
      status: task.status,
      mode: task.mode,
      messages: task.messages,
      queue: task.queue,
      usage: task.usage,
      error: task.error,
      stopped: task.stopped,
      created_at: task.created_at,
      updated_at: task.updated_at,
      last_activity_at: task.last_activity_at,
    }
  }

  private findByDescriptionAndLatest(description: string): SubagentTaskInternal | undefined {
    return Array.from(this.tasks.values())
      .filter((task) => task.description === description)
      .sort((a, b) => b.created_at - a.created_at)[0]
  }
}

const runtimeRegistry = new Map<string, SubagentRuntimeImpl>()

export function __resetSubagentRuntimeRegistryForTests(): void {
  runtimeRegistry.clear()
}

export function getOrCreateSubagentRuntime(input: {
  workspaceId: string
  provider: PiAIProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  baseToolContext: ToolContext
  onNotification?: (event: SubagentTaskNotification) => void
}): SubagentRuntime {
  const key = input.workspaceId || 'default'
  const existing = runtimeRegistry.get(key)
  const deps: RuntimeDeps = {
    workspaceId: key,
    provider: input.provider,
    toolRegistry: input.toolRegistry,
    contextManager: input.contextManager,
    baseToolContext: input.baseToolContext,
    onNotification: input.onNotification,
  }
  if (existing) {
    existing.updateDeps(deps)
    return existing
  }
  const created = new SubagentRuntimeImpl(deps)
  runtimeRegistry.set(key, created)
  return created
}
