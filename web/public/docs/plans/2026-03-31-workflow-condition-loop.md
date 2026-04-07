# Workflow Condition Branch & Loop Iteration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conditional branching (`condition` node type) and loop iteration (controlled back-edges) to the workflow engine.

**Architecture:** Extend the existing strict DAG model into a directed graph with conditional edges and controlled cycles. Condition nodes evaluate rule expressions or AI judgments to select a branch label; edges carry optional `branch` fields to route execution. Back-edges with `LoopPolicy` enable iteration with max-iteration and exit-condition safety valves. The versioned `NodeOutputStore` provides JSON-structured outputs with history tracking, and reuses the existing `ContextManager` for history compression.

**Tech Stack:** TypeScript, Vitest, existing Zustand stores, existing `ContextManager` for token-aware compression.

---

### Task 1: Expression Evaluator

**Files:**
- Create: `web/src/agent/workflow/expression-eval.ts`
- Test: `web/src/agent/__tests__/expression-eval.test.ts`

**Step 1: Write the failing test**

```typescript
// web/src/agent/__tests__/expression-eval.test.ts
import { describe, expect, it } from 'vitest'
import { evaluateExpression } from '../workflow/expression-eval'

describe('evaluateExpression', () => {
  it('evaluates a simple numeric comparison', () => {
    expect(evaluateExpression('${review.score} >= 80', { 'review.score': 85 })).toBe(true)
    expect(evaluateExpression('${review.score} >= 80', { 'review.score': 75 })).toBe(false)
  })

  it('evaluates a boolean equality', () => {
    expect(evaluateExpression('${review.passed} == true', { 'review.passed': true })).toBe(true)
    expect(evaluateExpression('${review.passed} == true', { 'review.passed': false })).toBe(false)
  })

  it('evaluates AND combination', () => {
    const ctx = { 'review.score': 85, 'review.passed': true }
    expect(evaluateExpression('${review.score} >= 80 AND ${review.passed} == true', ctx)).toBe(true)
    expect(evaluateExpression('${review.score} >= 80 AND ${review.passed} == false', ctx)).toBe(false)
  })

  it('evaluates OR combination', () => {
    const ctx = { 'review.score': 75, 'review.passed': true }
    expect(evaluateExpression('${review.score} >= 80 OR ${review.passed} == true', ctx)).toBe(true)
  })

  it('returns false for missing variables', () => {
    expect(evaluateExpression('${missing.value} >= 80', {})).toBe(false)
  })

  it('handles string equality', () => {
    expect(evaluateExpression('${status} == "approved"', { status: 'approved' })).toBe(true)
    expect(evaluateExpression('${status} == "approved"', { status: 'rejected' })).toBe(false)
  })

  it('handles not-equal operator', () => {
    expect(evaluateExpression('${count} != 0', { count: 5 })).toBe(true)
    expect(evaluateExpression('${count} != 0', { count: 0 })).toBe(false)
  })

  it('handles less-than operators', () => {
    expect(evaluateExpression('${count} < 10', { count: 5 })).toBe(true)
    expect(evaluateExpression('${count} <= 5', { count: 5 })).toBe(true)
    expect(evaluateExpression('${count} > 3', { count: 5 })).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/expression-eval.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// web/src/agent/workflow/expression-eval.ts
export interface ExpressionContext {
  [variableName: string]: unknown
}

export interface ExpressionResult {
  value: boolean
  error?: string
}

const VARIABLE_RE = /\$\{([^}]+)\}/g
const COMPARISON_RE = /^\s*\$\{([^}]+)\}\s*(>=|<=|>|<|==|!=)\s*(.+?)\s*$/
const BOOLEAN_OP_RE = /\s+(AND|OR)\s+/i

function resolveVariable(name: string, ctx: ExpressionContext): unknown {
  return ctx[name]
}

function parseLiteral(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) return trimmed.slice(1, -1)
  return trimmed
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  const l = typeof left === 'number' ? left : Number(left)
  const r = typeof right === 'number' ? right : Number(right)

  if (!Number.isNaN(l) && !Number.isNaN(r)) {
    switch (operator) {
      case '>=': return l >= r
      case '<=': return l <= r
      case '>':  return l > r
      case '<':  return l < r
      case '==': return l === r
      case '!=': return l !== r
    }
  }

  const ls = String(left)
  const rs = String(right)
  switch (operator) {
    case '==': return ls === rs
    case '!=': return ls !== rs
    default:   return false
  }
}

function evaluateComparison(expr: string, ctx: ExpressionContext): boolean {
  const match = expr.match(COMPARISON_RE)
  if (!match) return false

  const [, varName, operator, rawRight] = match
  const left = resolveVariable(varName, ctx)
  if (left === undefined) return false

  const right = parseLiteral(rawRight)
  return compare(left, operator, right)
}

export function evaluateExpression(expression: string, ctx: ExpressionContext): boolean {
  const trimmed = expression.trim()
  if (!trimmed) return false

  const parts = trimmed.split(BOOLEAN_OP_RE)
  if (parts.length === 1) {
    return evaluateComparison(trimmed, ctx)
  }

  let result = evaluateComparison(parts[0], ctx)
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i].toUpperCase()
    const nextVal = evaluateComparison(parts[i + 1], ctx)
    result = op === 'AND' ? (result && nextVal) : (result || nextVal)
  }

  return result
}
```

**Step 4: Run test to verify it passes**

Run: `cd web && pnpm test:run src/agent/__tests__/expression-eval.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add web/src/agent/workflow/expression-eval.ts web/src/agent/__tests__/expression-eval.test.ts
git commit -m "feat(workflow): add expression evaluator for condition nodes"
```

---

### Task 2: Update Type Definitions

**Files:**
- Modify: `web/src/agent/workflow/types.ts`

**Step 1: Write the failing test**

Add to `web/src/agent/__tests__/dag-validator.test.ts`:

```typescript
it('accepts condition node with valid branches and fallback edge', () => {
  const result = validateWorkflowDag({
    id: 'wf-cond',
    name: 'conditional',
    domain: 'generic',
    entryNodeId: 'plan',
    nodes: [
      {
        id: 'plan',
        kind: 'plan',
        agentRole: 'planner',
        inputRefs: [],
        outputKey: 'outline',
        retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
      },
      {
        id: 'check',
        kind: 'condition',
        agentRole: 'router',
        inputRefs: ['outline'],
        outputKey: 'decision',
        retryPolicy: { maxRetries: 0, timeoutMs: 5000 },
        conditionConfig: {
          mode: 'rule',
          branches: [
            { label: 'go', condition: '${outline.length} > 100' },
            { label: 'stop', condition: 'true' },
          ],
          fallbackBranch: 'stop',
        },
      },
    ],
    edges: [
      { from: 'plan', to: 'check' },
      { from: 'check', to: 'plan', branch: 'go', loopPolicy: { maxIterations: 3, accumulateHistory: false } },
      { from: 'check', to: 'plan', branch: 'stop' },
    ],
  })
  expect(result.valid).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/dag-validator.test.ts`
Expected: FAIL — `condition` is not assignable to `WorkflowNodeKind`

**Step 3: Write implementation — update types.ts**

```typescript
// web/src/agent/workflow/types.ts
export type WorkflowDomain = 'novel' | 'marketing' | 'education' | 'generic'

export type WorkflowNodeKind = 'plan' | 'produce' | 'review' | 'repair' | 'assemble' | 'condition'

export interface RetryPolicy {
  maxRetries: number
  timeoutMs: number
}

export interface ConditionBranch {
  label: string
  description?: string
  condition?: string
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
```

**Step 4: Run all existing workflow tests to verify backward compatibility**

Run: `cd web && pnpm test:run src/agent/__tests__/workflow`
Expected: Some tests may break due to `condition` being a new kind and `WorkflowEdge` having extra optional fields — fix any type errors.

**Step 5: Commit**

```bash
git add web/src/agent/workflow/types.ts
git commit -m "feat(workflow): extend types for condition nodes, conditional edges, and loop policy"
```

---

### Task 3: Versioned Output Store

**Files:**
- Modify: `web/src/agent/workflow/node-io.ts`
- Test: `web/src/agent/__tests__/node-io.test.ts` (create new)

**Step 1: Write the failing test**

```typescript
// web/src/agent/__tests__/node-io.test.ts
import { describe, expect, it } from 'vitest'
import { NodeOutputStore, gatherInputs } from '../workflow/node-io'

describe('NodeOutputStore', () => {
  it('stores and retrieves latest value', () => {
    const store = new NodeOutputStore()
    store.set('outline', { chapters: 5 })
    expect(store.getLatest('outline')).toEqual({ chapters: 5 })
  })

  it('returns undefined for missing key', () => {
    const store = new NodeOutputStore()
    expect(store.getLatest('missing')).toBeUndefined()
  })

  it('stores multiple rounds of history', () => {
    const store = new NodeOutputStore()
    store.set('draft', 'round-0-content')
    store.advanceRound()
    store.set('draft', 'round-1-content')
    store.advanceRound()
    store.set('draft', 'round-2-content')

    const history = store.getHistory('draft')
    expect(history).toHaveLength(3)
    expect(history[0].round).toBe(0)
    expect(history[0].content).toBe('round-0-content')
    expect(history[2].round).toBe(2)
  })

  it('getLatest returns most recent value', () => {
    const store = new NodeOutputStore()
    store.set('score', 65)
    store.advanceRound()
    store.set('score', 88)
    expect(store.getLatest('score')).toBe(88)
  })

  it('getRecent returns last N entries', () => {
    const store = new NodeOutputStore()
    store.set('v', 'a')
    store.advanceRound()
    store.set('v', 'b')
    store.advanceRound()
    store.set('v', 'c')
    store.advanceRound()
    store.set('v', 'd')

    const recent = store.getRecent('v', 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].content).toBe('c')
    expect(recent[1].content).toBe('d')
  })

  it('supports JSON path access', () => {
    const store = new NodeOutputStore()
    store.set('review', { score: 85, passed: true })
    expect(store.getLatestByPath('review', 'score')).toBe(85)
    expect(store.getLatestByPath('review', 'passed')).toBe(true)
    expect(store.getLatestByPath('review', 'missing')).toBeUndefined()
  })

  it('clears all data', () => {
    const store = new NodeOutputStore()
    store.set('a', 1)
    store.set('b', 2)
    store.clear()
    expect(store.getLatest('a')).toBeUndefined()
    expect(store.getLatest('b')).toBeUndefined()
  })
})

describe('gatherInputs', () => {
  it('collects upstream outputs by key', () => {
    const store = new NodeOutputStore()
    store.set('outline', 'my outline')
    store.set('draft', 'my draft')

    const inputs = gatherInputs(['outline'], store)
    expect(inputs.get('outline')).toBe('my outline')
    expect(inputs.has('draft')).toBe(false)
  })

  it('skips missing refs', () => {
    const store = new NodeOutputStore()
    const inputs = gatherInputs(['missing'], store)
    expect(inputs.size).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/node-io.test.ts`
Expected: FAIL — `getLatest` not found, `advanceRound` not found, etc.

**Step 3: Write implementation**

```typescript
// web/src/agent/workflow/node-io.ts
export interface HistoryEntry {
  round: number
  content: unknown
  timestamp: number
}

export class NodeOutputStore {
  private outputs = new Map<string, HistoryEntry[]>()
  private currentRound = 0

  set(outputKey: string, content: unknown): void {
    const entries = this.outputs.get(outputKey) || []
    entries.push({ round: this.currentRound, content, timestamp: Date.now() })
    this.outputs.set(outputKey, entries)
  }

  getLatest(outputKey: string): unknown {
    const entries = this.outputs.get(outputKey)
    if (!entries || entries.length === 0) return undefined
    return entries[entries.length - 1].content
  }

  getLatestByPath(outputKey: string, path: string): unknown {
    const value = this.getLatest(outputKey)
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'object' || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>)[path]
  }

  getHistory(outputKey: string): HistoryEntry[] {
    return this.outputs.get(outputKey)?.slice() || []
  }

  getRecent(outputKey: string, n: number): HistoryEntry[] {
    const entries = this.outputs.get(outputKey) || []
    return entries.slice(-n)
  }

  has(outputKey: string): boolean {
    const entries = this.outputs.get(outputKey)
    return entries !== undefined && entries.length > 0
  }

  advanceRound(): void {
    this.currentRound += 1
  }

  get currentRoundNumber(): number {
    return this.currentRound
  }

  clear(): void {
    this.outputs.clear()
    this.currentRound = 0
  }
}

export function gatherInputs(
  inputRefs: string[],
  store: NodeOutputStore
): Map<string, unknown> {
  const inputs = new Map<string, unknown>()
  for (const ref of inputRefs) {
    const content = store.getLatest(ref)
    if (content !== undefined) {
      inputs.set(ref, content)
    }
  }
  return inputs
}
```

**Step 4: Update existing tests that import old `NodeOutputStore`**

The old API had `set(key, string)` and `get(key) → string | undefined`. The new API has `set(key, unknown)` and `getLatest(key) → unknown`. Check if any existing test files reference the old API and update them.

Search: `grep -r "NodeOutputStore" web/src/` to find all usages.

**Step 5: Run all workflow tests**

Run: `cd web && pnpm test:run src/agent/__tests__/node-io.test.ts src/agent/__tests__/workflow`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add web/src/agent/workflow/node-io.ts web/src/agent/__tests__/node-io.test.ts
git commit -m "feat(workflow): versioned output store with JSON support and history tracking"
```

---

### Task 4: DAG Validator — Allow Controlled Cycles + Condition Validation

**Files:**
- Modify: `web/src/agent/workflow/dag-validator.ts`

**Step 1: Write the failing tests**

Add to `web/src/agent/__tests__/dag-validator.test.ts`:

```typescript
describe('conditional branching and loops', () => {
  function createConditionalWorkflow(edges?: Partial<WorkflowEdge>[]): WorkflowTemplate {
    return {
      id: 'wf-cond',
      name: 'conditional',
      domain: 'generic',
      entryNodeId: 'plan',
      nodes: [
        { id: 'plan', kind: 'plan', agentRole: 'planner', inputRefs: [], outputKey: 'outline', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
        { id: 'produce', kind: 'produce', agentRole: 'writer', inputRefs: ['outline'], outputKey: 'draft', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
        { id: 'review', kind: 'review', agentRole: 'reviewer', inputRefs: ['draft'], outputKey: 'review', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
        {
          id: 'gate',
          kind: 'condition',
          agentRole: 'router',
          inputRefs: ['review'],
          outputKey: 'decision',
          retryPolicy: { maxRetries: 0, timeoutMs: 5000 },
          conditionConfig: {
            mode: 'rule',
            branches: [
              { label: 'pass', condition: '${review.score} >= 80' },
              { label: 'fail', condition: 'true' },
            ],
            fallbackBranch: 'fail',
          },
        },
        { id: 'assemble', kind: 'assemble', agentRole: 'packager', inputRefs: ['draft'], outputKey: 'final', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
      ],
      edges: edges ?? [
        { from: 'plan', to: 'produce' },
        { from: 'produce', to: 'review' },
        { from: 'review', to: 'gate' },
        { from: 'gate', to: 'assemble', branch: 'pass' },
        { from: 'gate', to: 'produce', branch: 'fail', loopPolicy: { maxIterations: 3, exitCondition: '${review.score} >= 80', accumulateHistory: true, historyLimit: 3 } },
      ],
    }
  }

  it('accepts condition node with valid branches, fallback edge, and loop', () => {
    const result = validateWorkflowDag(createConditionalWorkflow())
    expect(result.valid).toBe(true)
  })

  it('rejects back-edge without loopPolicy', () => {
    const result = validateWorkflowDag(createConditionalWorkflow([
      { from: 'plan', to: 'produce' },
      { from: 'produce', to: 'review' },
      { from: 'review', to: 'plan' },  // back-edge without loopPolicy
    ]))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('loopPolicy')
  })

  it('rejects condition node without fallback edge', () => {
    const result = validateWorkflowDag(createConditionalWorkflow([
      { from: 'plan', to: 'produce' },
      { from: 'produce', to: 'review' },
      { from: 'review', to: 'gate' },
      { from: 'gate', to: 'assemble', branch: 'pass' },
      // missing: fallback edge without branch
    ]))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('fallback')
  })

  it('rejects condition node without conditionConfig', () => {
    const wf = createConditionalWorkflow()
    const gateNode = wf.nodes.find(n => n.id === 'gate')!
    delete gateNode.conditionConfig
    const result = validateWorkflowDag(wf)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('conditionConfig')
  })

  it('rejects loopPolicy with maxIterations <= 0', () => {
    const result = validateWorkflowDag(createConditionalWorkflow([
      { from: 'plan', to: 'produce' },
      { from: 'produce', to: 'review' },
      { from: 'review', to: 'gate' },
      { from: 'gate', to: 'assemble', branch: 'pass' },
      { from: 'gate', to: 'produce', branch: 'fail', loopPolicy: { maxIterations: 0, accumulateHistory: false } },
    ]))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('maxIterations')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/dag-validator.test.ts`
Expected: FAIL — current validator rejects cycles outright

**Step 3: Write implementation — rewrite dag-validator.ts**

Key changes:
1. Remove cycle rejection — instead detect back-edges (edges pointing to earlier nodes in topological order) and require `loopPolicy`
2. Add condition node validation: must have `conditionConfig`, must have fallback edge
3. Keep all existing validations (duplicate IDs, missing nodes, unreachable nodes)

**Step 4: Run all dag-validator tests**

Run: `cd web && pnpm test:run src/agent/__tests__/dag-validator.test.ts`
Expected: ALL PASS (old + new tests)

**Step 5: Commit**

```bash
git add web/src/agent/workflow/dag-validator.ts web/src/agent/__tests__/dag-validator.test.ts
git commit -m "feat(workflow): allow controlled cycles and validate condition nodes in DAG validator"
```

---

### Task 5: Run State Machine — Loop Events

**Files:**
- Modify: `web/src/agent/workflow/run-state-machine.ts`

**Step 1: Write the failing tests**

Add to `web/src/agent/__tests__/run-state-machine.test.ts`:

```typescript
it('tracks loop iteration count on loop_iteration event', () => {
  const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
  const iterated = transitionWorkflowRunState(running, { type: 'loop_iteration' })
  expect(iterated.status).toBe('running')
  expect(iterated.currentIteration).toBe(1)
})

it('moves to failed on loop_timeout event', () => {
  const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
  const timedOut = transitionWorkflowRunState(running, { type: 'loop_timeout', reason: 'iteration timeout' })
  expect(timedOut.status).toBe('failed')
  expect(timedOut.lastError).toContain('iteration timeout')
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/run-state-machine.test.ts`
Expected: FAIL — `loop_iteration` / `loop_timeout` event types not recognized

**Step 3: Write implementation**

Add to `WorkflowRunState`:
```typescript
currentIteration: number
```

Add to `WorkflowRunEvent`:
```typescript
| { type: 'loop_iteration' }
| { type: 'loop_timeout'; reason: string }
```

Handle in `transitionWorkflowRunState`:
- `running` + `loop_iteration` → stay running, increment `currentIteration`
- `running` + `loop_timeout` → transition to `failed`

Update `createWorkflowRunState` to initialize `currentIteration: 0`.

**Step 4: Run all state machine tests**

Run: `cd web && pnpm test:run src/agent/__tests__/run-state-machine.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add web/src/agent/workflow/run-state-machine.ts web/src/agent/__tests__/run-state-machine.test.ts
git commit -m "feat(workflow): add loop iteration and timeout events to run state machine"
```

---

### Task 6: Workflow Executor — Conditional Routing + Loop Execution

**Files:**
- Modify: `web/src/agent/workflow/workflow-executor.ts`

This is the most complex task. The executor must:
1. Build an adjacency map from edges
2. Execute nodes, then look up outgoing edges
3. For condition nodes: evaluate and select branch
4. For back-edges: check loopPolicy and iterate
5. Respect timeout limits
6. Track all executed nodes

**Step 1: Write the failing tests**

Add to `web/src/agent/__tests__/workflow-executor.test.ts`:

```typescript
describe('conditional branching', () => {
  function createConditionalWorkflow(): WorkflowTemplate {
    return {
      id: 'wf-cond',
      name: 'conditional test',
      domain: 'generic',
      entryNodeId: 'plan',
      nodes: [
        { id: 'plan', kind: 'plan', agentRole: 'planner', inputRefs: [], outputKey: 'outline', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
        { id: 'produce', kind: 'produce', agentRole: 'writer', inputRefs: ['outline'], outputKey: 'draft', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
        { id: 'review', kind: 'review', agentRole: 'reviewer', inputRefs: ['draft'], outputKey: 'review_report', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
        {
          id: 'gate',
          kind: 'condition',
          agentRole: 'router',
          inputRefs: ['review_report'],
          outputKey: 'decision',
          retryPolicy: { maxRetries: 0, timeoutMs: 5000 },
          conditionConfig: {
            mode: 'rule',
            branches: [
              { label: 'pass', condition: '${review_report.score} >= 80' },
              { label: 'fail', condition: 'true' },
            ],
            fallbackBranch: 'fail',
          },
        },
        { id: 'assemble', kind: 'assemble', agentRole: 'packager', inputRefs: ['draft'], outputKey: 'final', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
      ],
      edges: [
        { from: 'plan', to: 'produce' },
        { from: 'produce', to: 'review' },
        { from: 'review', to: 'gate' },
        { from: 'gate', to: 'assemble', branch: 'pass' },
        { from: 'gate', to: 'produce', branch: 'fail', loopPolicy: { maxIterations: 3, exitCondition: '${review_report.score} >= 80', accumulateHistory: false } },
      ],
    }
  }

  it('routes to pass branch when condition is met', async () => {
    const executed: string[] = []
    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: { id: 'r1', version: 1, name: 'test', passCondition: 'true', retryPolicy: { maxRepairRounds: 0 }, rules: [{ id: 'r1', checker: 'test', params: {}, weight: 1, threshold: {}, failAction: 'stop' as const, severity: 'low' as const }] },
      executeNode: async ({ node }) => {
        executed.push(node.id)
        if (node.kind === 'review') {
          return { status: 'success', output: { score: 90 } }
        }
        return { status: 'success' }
      },
    })
    expect(result.status).toBe('passed')
    expect(executed).toContain('assemble')
  })

  it('loops back when condition is not met and eventually passes', async () => {
    let reviewCount = 0
    const executed: string[] = []

    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: { id: 'r1', version: 1, name: 'test', passCondition: 'true', retryPolicy: { maxRepairRounds: 0 }, rules: [{ id: 'r1', checker: 'test', params: {}, weight: 1, threshold: {}, failAction: 'stop' as const, severity: 'low' as const }] },
      executeNode: async ({ node }) => {
        executed.push(node.id)
        if (node.kind === 'review') {
          reviewCount++
          return { status: 'success', output: { score: reviewCount >= 3 ? 85 : 60 } }
        }
        if (node.kind === 'condition') {
          return { status: 'success', output: reviewCount >= 3 ? 'pass' : 'fail' }
        }
        return { status: 'success' }
      },
    })
    expect(result.status).toBe('passed')
    expect(reviewCount).toBeGreaterThanOrEqual(3)
    expect(executed).toContain('assemble')
  })

  it('exits with needs_human when maxIterations is reached', async () => {
    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: { id: 'r1', version: 1, name: 'test', passCondition: 'true', retryPolicy: { maxRepairRounds: 0 }, rules: [{ id: 'r1', checker: 'test', params: {}, weight: 1, threshold: {}, failAction: 'stop' as const, severity: 'low' as const }] },
      executeNode: async ({ node }) => {
        if (node.kind === 'review') {
          return { status: 'success', output: { score: 50 } }
        }
        if (node.kind === 'condition') {
          return { status: 'success', output: 'fail' }
        }
        return { status: 'success' }
      },
    })
    expect(result.status).toBe('needs_human')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/workflow-executor.test.ts`
Expected: FAIL — executor doesn't handle condition nodes or back-edges

**Step 3: Write implementation — rewrite workflow-executor.ts core loop**

The new executor logic:

```
1. Validate and plan as before
2. Build adjacency map: nodeId → WorkflowEdge[]
3. Start from entryNodeId
4. Loop:
   a. Execute current node
   b. If condition node → evaluate branches (rule mode: use expression-eval; ai mode: use executeNode output)
   c. Find matching outgoing edge (branch matches OR fallback)
   d. If edge has loopPolicy:
      - Check exitCondition using expression-eval against NodeOutputStore
      - Check currentIteration < maxIterations
      - If should continue loop → advanceRound, jump to edge.to
      - Else → go to next non-loop edge or end
   e. Otherwise → move to edge.to
   f. If no outgoing edges → workflow complete
5. Respect timeout: track elapsed time per iteration and total
```

Key implementation detail for condition evaluation:
- Rule mode: build ExpressionContext from NodeOutputStore using `getLatestByPath`
- AI mode: the `executeNode` callback returns the branch label directly as `output`

**Step 4: Run all executor tests**

Run: `cd web && pnpm test:run src/agent/__tests__/workflow-executor.test.ts`
Expected: ALL PASS (old linear tests + new condition/loop tests)

**Step 5: Commit**

```bash
git add web/src/agent/workflow/workflow-executor.ts web/src/agent/__tests__/workflow-executor.test.ts
git commit -m "feat(workflow): conditional routing and loop iteration in workflow executor"
```

---

### Task 7: Node Prompts — Condition Node Support

**Files:**
- Modify: `web/src/agent/workflow/node-prompts.ts`

**Step 1: Write the failing test**

```typescript
it('builds system prompt for condition node in rule mode', () => {
  const prompt = buildNodeSystemPrompt('condition', 'quality_router', undefined, {
    mode: 'rule',
    branches: [{ label: 'pass' }, { label: 'fail' }],
    fallbackBranch: 'fail',
  })
  expect(prompt).toContain('quality_router')
  expect(prompt).toContain('pass')
  expect(prompt).toContain('fail')
})

it('builds system prompt for condition node in ai mode', () => {
  const prompt = buildNodeSystemPrompt('condition', 'content_router', undefined, {
    mode: 'ai',
    branches: [{ label: 'accept', description: '质量优秀' }, { label: 'revise', description: '需要改进' }],
    fallbackBranch: 'revise',
    prompt: '判断内容质量并选择路径',
  })
  expect(prompt).toContain('accept')
  expect(prompt).toContain('revise')
  expect(prompt).toContain('质量优秀')
})
```

**Step 2: Run test to verify it fails**

Run: `cd web && pnpm test:run src/agent/__tests__/ --reporter=verbose 2>&1 | grep node-prompts`
Expected: FAIL — `kindInstructions` has no entry for `condition`

**Step 3: Write implementation**

Add to `kindInstructions`:
```typescript
condition: '请根据以下输入内容判断条件并选择分支。请以 JSON 格式返回：\n- "branch": 选择的分支标签 (string)\n\n示例格式：\n```json\n{"branch": "pass"}\n```',
```

Update `buildNodeSystemPrompt` to accept optional `ConditionConfig` and enhance prompt with branch details.

**Step 4: Run tests**

Run: `cd web && pnpm test:run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add web/src/agent/workflow/node-prompts.ts
git commit -m "feat(workflow): add condition node prompt templates"
```

---

### Task 8: Update Example Templates

**Files:**
- Modify: `web/src/agent/workflow/templates.ts`

**Step 1: Write the failing test**

Add to `web/src/agent/__tests__/workflow-templates.test.ts`:

```typescript
it('novel daily workflow with condition and loop is valid', () => {
  // Test that the updated template with condition gate passes DAG validation
  const result = createWorkflowRunPlan(defaultNovelDailyWorkflow, defaultNovelDailyRubric)
  expect(result.ok).toBe(true)
})
```

**Step 2: Update the novel daily template to include condition + loop**

Update `defaultNovelDailyWorkflow` in `templates.ts`:
- Add a `condition` node (`quality_gate`) after `review`
- Add edges: `review → quality_gate`, `quality_gate → assemble` (branch: pass), `quality_gate → produce` (branch: fail, with loopPolicy)

**Step 3: Run template tests**

Run: `cd web && pnpm test:run src/agent/__tests__/workflow-templates.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add web/src/agent/workflow/templates.ts web/src/agent/__tests__/workflow-templates.test.ts
git commit -m "feat(workflow): update novel daily template with condition gate and loop"
```

---

### Task 9: Integration Test — Full Workflow Run

**Files:**
- Create: `web/src/agent/__tests__/workflow-condition-loop.test.ts`

**Step 1: Write integration tests**

Test the complete scenarios from the requirements spec:
1. Condition branch → pass path (no loop)
2. Loop 3 rounds then exit
3. Hit maxIterations → needs_human
4. Rule mode vs AI mode branching
5. Expression evaluation against JSON output
6. History accumulation across rounds

**Step 2: Run all tests**

Run: `cd web && pnpm test:run src/agent/__tests__/workflow-condition-loop.test.ts`
Expected: ALL PASS

**Step 3: Run full test suite**

Run: `cd web && pnpm test:run`
Expected: ALL PASS — no regressions

**Step 4: Commit**

```bash
git add web/src/agent/__tests__/workflow-condition-loop.test.ts
git commit -m "test(workflow): integration tests for conditional branching and loop iteration"
```

---

## Execution Notes

- **Backward compatibility**: All existing linear workflows (no condition, no loop) must pass without modification.
- **Expression safety**: `evaluateExpression` only parses the defined grammar, no `eval()` or code execution.
- **ContextManager reuse**: Not directly imported in workflow code — the executor passes history to the `executeNode` callback which can use ContextManager externally. This keeps workflow engine decoupled.
- **Timeout handling**: Uses `Promise.race` with timeout promises in the executor loop.
