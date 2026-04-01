import { describe, expect, it } from 'vitest'
import { executeWorkflowRun } from '../workflow/workflow-executor'
import type { RubricDefinition } from '../workflow/rubric'
import type { WorkflowTemplate } from '../workflow/types'

function createSimpleRubric(): RubricDefinition {
  return {
    id: 'test-rubric',
    version: 1,
    name: 'Test Rubric',
    passCondition: 'total_score >= 80',
    retryPolicy: { maxRepairRounds: 2 },
    rules: [
      {
        id: 'quality_check',
        checker: 'quality_score',
        params: { minScore: 80 },
        weight: 1,
        threshold: { passEq: true },
        failAction: 'auto_repair',
        severity: 'high',
      },
    ],
  }
}

describe('Conditional Branching Integration', () => {
  function createConditionalWorkflow(): WorkflowTemplate {
    return {
      id: 'wf-cond',
      name: 'Conditional Flow',
      domain: 'generic',
      entryNodeId: 'start',
      nodes: [
        {
          id: 'start',
          kind: 'produce',
          agentRole: 'producer',
          inputRefs: [],
          outputKey: 'initialValue',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
        {
          id: 'check',
          kind: 'condition',
          agentRole: 'checker',
          inputRefs: ['initialValue'],
          outputKey: 'result',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
          conditionConfig: {
            mode: 'rule',
            branches: [
              { label: 'pass', condition: '${initialValue.score} >= 80' },
              { label: 'fail', condition: '${initialValue.score} < 80' },
            ],
            fallbackBranch: 'fail',
          },
        },
        {
          id: 'end',
          kind: 'produce',
          agentRole: 'producer',
          inputRefs: ['result'],
          outputKey: 'finalOutput',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
      ],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: 'end', branch: 'pass' },
        {
          from: 'check',
          to: 'start',
          branch: 'fail',
          loopPolicy: { maxIterations: 3, exitCondition: '${initialValue.score} >= 80', accumulateHistory: true },
        },
      ],
    }
  }

  it('routes to pass branch when condition is met (no loop)', async () => {
    const executed: string[] = []

    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: createSimpleRubric(),
      executeNode: async ({ node, store }) => {
        executed.push(node.id)
        if (node.id === 'start') {
          store.set('initialValue', { score: 85 })
        }
        return { status: 'success' }
      },
    })

    expect(result.status).toBe('passed')
    expect(executed).toEqual(['start', 'check', 'end'])
  })

  it('loops back when condition is not met and eventually passes', async () => {
    const executed: string[] = []
    let iteration = 0

    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: createSimpleRubric(),
      executeNode: async ({ node, store }) => {
        executed.push(`${node.id}-${iteration}`)

        if (node.id === 'start') {
          // Score improves each iteration
          const score = 60 + iteration * 15
          store.set('initialValue', { score })
          iteration++
        }
        return { status: 'success' }
      },
    })

    expect(result.status).toBe('passed')
    // Should see: start-0, check-0, start-1, check-1, start-2, check-2, end
    expect(executed.length).toBeGreaterThan(3)
    expect(executed).toContain('start-0')
    expect(executed.some((e) => e.startsWith('end'))).toBe(true)
  })

  it('exits with needs_human when maxIterations is reached', async () => {
    const executed: string[] = []

    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: createSimpleRubric(),
      executeNode: async ({ node, store }) => {
        executed.push(node.id)
        if (node.id === 'start') {
          // Score never reaches 80
          store.set('initialValue', { score: 50 })
        }
        return { status: 'success' }
      },
    })

    expect(result.status).toBe('needs_human')
    // Should have executed start 4 times (initial + 3 loops)
    expect(executed.filter((id) => id === 'start').length).toBe(4)
  })
})

describe('Expression Evaluation Against JSON Output', () => {
  it('evaluates nested JSON path in condition', async () => {
    const workflow: WorkflowTemplate = {
      id: 'wf-json',
      name: 'JSON Path Test',
      domain: 'generic',
      entryNodeId: 'produce',
      nodes: [
        {
          id: 'produce',
          kind: 'produce',
          agentRole: 'producer',
          inputRefs: [],
          outputKey: 'output',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
        {
          id: 'check',
          kind: 'condition',
          agentRole: 'checker',
          inputRefs: ['output'],
          outputKey: 'decision',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
          conditionConfig: {
            mode: 'rule',
            branches: [
              { label: 'pass', condition: '${output.metrics.score} >= 80' },
              { label: 'fail', condition: 'true' },
            ],
            fallbackBranch: 'fail',
          },
        },
        {
          id: 'done',
          kind: 'assemble',
          agentRole: 'packager',
          inputRefs: ['output'],
          outputKey: 'final',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
      ],
      edges: [
        { from: 'produce', to: 'check' },
        { from: 'check', to: 'done', branch: 'pass' },
        { from: 'check', to: 'done', branch: 'fail' },
      ],
    }

    const result = await executeWorkflowRun({
      workflow,
      rubric: createSimpleRubric(),
      executeNode: async ({ node, store }) => {
        if (node.id === 'produce') {
          store.set('output', {
            content: 'test content',
            metrics: { score: 85, wordCount: 100 },
          })
        }
        return { status: 'success' }
      },
    })

    expect(result.status).toBe('passed')
  })
})

describe('History Accumulation', () => {
  it('accumulates history across loop iterations', async () => {
    const workflow: WorkflowTemplate = {
      id: 'wf-history',
      name: 'History Test',
      domain: 'generic',
      entryNodeId: 'produce',
      nodes: [
        {
          id: 'produce',
          kind: 'produce',
          agentRole: 'producer',
          inputRefs: [],
          outputKey: 'draft',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
        {
          id: 'check',
          kind: 'condition',
          agentRole: 'checker',
          inputRefs: ['draft'],
          outputKey: 'decision',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
          conditionConfig: {
            mode: 'rule',
            branches: [
              { label: 'pass', condition: '${draft.version} >= 3' },
              { label: 'fail', condition: 'true' },
            ],
            fallbackBranch: 'fail',
          },
        },
        {
          id: 'done',
          kind: 'assemble',
          agentRole: 'packager',
          inputRefs: ['draft'],
          outputKey: 'final',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
      ],
      edges: [
        { from: 'produce', to: 'check' },
        { from: 'check', to: 'done', branch: 'pass' },
        {
          from: 'check',
          to: 'produce',
          branch: 'fail',
          loopPolicy: { maxIterations: 5, exitCondition: '${draft.version} >= 3', accumulateHistory: true },
        },
      ],
    }

    let version = 0
    const history: number[] = []

    const result = await executeWorkflowRun({
      workflow,
      rubric: createSimpleRubric(),
      executeNode: async ({ node, store }) => {
        if (node.id === 'produce') {
          version++
          store.set('draft', { content: `v${version}`, version })
          history.push(version)
        }
        return { status: 'success' }
      },
    })

    expect(result.status).toBe('passed')
    expect(history).toContain(3) // Should have reached version 3
  })
})
