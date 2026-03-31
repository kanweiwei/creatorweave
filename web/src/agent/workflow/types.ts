export type WorkflowDomain = 'novel' | 'marketing' | 'education' | 'generic' | 'custom'

export type WorkflowNodeKind = 'plan' | 'produce' | 'review' | 'repair' | 'assemble' | 'condition'

export interface RetryPolicy {
  maxRetries: number
  timeoutMs: number
}

export interface ConditionBranch {
  label: string
  description?: string
  condition?: string
  targetNode?: string
}

export interface ConditionConfig {
  mode: 'rule' | 'ai'
  branches: ConditionBranch[]
  fallbackBranch: string
  prompt?: string
}

export interface LoopPolicy {
  maxIterations: number
  exitCondition?: string
  iterationTimeoutMs?: number
  totalTimeoutMs?: number
  accumulateHistory: boolean
  historyLimit?: number
}

export interface WorkflowNode {
  id: string
  kind: WorkflowNodeKind
  agentRole: string
  taskInstruction?: string
  inputRefs: string[]
  outputKey: string
  retryPolicy: RetryPolicy
  conditionConfig?: ConditionConfig
}

export interface WorkflowEdge {
  from: string
  to: string
  branch?: string
  loopPolicy?: LoopPolicy
}

export interface WorkflowTemplate {
  id: string
  name: string
  domain: WorkflowDomain
  entryNodeId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowDagValidationResult {
  valid: boolean
  errors: string[]
  executionOrder: string[]
}

// ============================================================================
// Custom Workflow Types (User-created workflows)
// ============================================================================

export type WorkflowSource = 'built-in' | 'user-created' | 'imported'

export type ModelProvider = 'glm' | 'claude' | 'openai'

export interface NodeModelConfig {
  provider?: ModelProvider
  model?: string
  temperature?: number // 0.0 - 2.0
  maxTokens?: number
}

export interface CustomWorkflowNode extends WorkflowNode {
  // Extended configuration for custom workflows
  modelConfig?: NodeModelConfig
  promptTemplate?: string // Supports {{variable}} syntax
  presetId?: string // Reference to node preset if derived from one
}

export interface CustomWorkflowTemplate extends WorkflowTemplate {
  // Override nodes type to use extended node type
  nodes: CustomWorkflowNode[]

  // Metadata
  description?: string
  createdAt: number
  updatedAt: number
  version: number

  // Source tracking
  source: WorkflowSource
  enabled: boolean
}
