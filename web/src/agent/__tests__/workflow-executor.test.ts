import { describe, expect, it } from 'vitest'
import { executeWorkflowRun } from '../workflow/workflow-executor'
import type { WorkflowTemplate } from '../workflow/types'
import type { RubricDefinition } from '../workflow/rubric'

function createWorkflow(): WorkflowTemplate {
  return {
    id: 'wf-1',
    name: 'Novel Daily',
    domain: 'novel',
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
        id: 'produce',
        kind: 'produce',
        agentRole: 'writer',
        inputRefs: ['outline'],
        outputKey: 'draft',
        retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
      },
      {
        id: 'review',
        kind: 'review',
        agentRole: 'reviewer',
        inputRefs: ['draft'],
        outputKey: 'review_report',
        retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
      },
    ],
    edges: [
      { from: 'plan', to: 'produce' },
      { from: 'produce', to: 'review' },
    ],
  }
}

function createRubric(maxRepairRounds = 2): RubricDefinition {
  return {
    id: 'novel-rubric',
    version: 1,
    name: 'Novel Rubric',
    passCondition: 'total_score >= 80',
    retryPolicy: { maxRepairRounds },
    rules: [
      {
        id: 'paragraph_length',
        checker: 'paragraph_sentence_count',
        params: { min: 3, max: 6 },
        weight: 0.5,
        threshold: { violationRateLte: 0.05 },
        failAction: 'auto_repair',
        severity: 'high',
      },
    ],
  }
}

describe('executeWorkflowRun', () => {
  it('executes nodes in order and returns passed status', async () => {
    const executed: string[] = []

    const result = await executeWorkflowRun({
      workflow: createWorkflow(),
      rubric: createRubric(),
      executeNode: async ({ node }) => {
        executed.push(node.id)
        return { status: 'success' }
      },
    })

    expect(result.status).toBe('passed')
    expect(result.executionOrder).toEqual(['plan', 'produce', 'review'])
    expect(executed).toEqual(['plan', 'produce', 'review'])
  })

  it('retries review after repair and then passes', async () => {
    let reviewAttempts = 0
    let repairCalls = 0

    const result = await executeWorkflowRun({
      workflow: createWorkflow(),
      rubric: createRubric(2),
      executeNode: async ({ node }) => {
        if (node.kind !== 'review') {
          return { status: 'success' }
        }

        reviewAttempts += 1
        if (reviewAttempts === 1) {
          return { status: 'review_failed', reason: 'paragraph violations' }
        }

        return { status: 'success' }
      },
      repair: async () => {
        repairCalls += 1
      },
    })

    expect(result.status).toBe('passed')
    expect(result.repairRound).toBe(1)
    expect(reviewAttempts).toBe(2)
    expect(repairCalls).toBe(1)
  })

  it('returns needs_human when repair rounds are exhausted', async () => {
    const result = await executeWorkflowRun({
      workflow: createWorkflow(),
      rubric: createRubric(1),
      executeNode: async ({ node }) => {
        if (node.kind === 'review') {
          return { status: 'review_failed', reason: 'still failing' }
        }
        return { status: 'success' }
      },
      repair: async () => {
        return
      },
    })

    expect(result.status).toBe('needs_human')
    expect(result.repairRound).toBe(1)
    expect(result.errors.join(' ')).toContain('still failing')
  })
})

// ========== Conditional Branching Tests ==========

describe('Conditional Branching', () => {
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
        { from: 'check', to: 'start', branch: 'fail', loopPolicy: { maxIterations: 3, exitCondition: '${initialValue.score} >= 80', accumulateHistory: true } },
      ],
    }
  }

  it('routes to pass branch when condition is met', async () => {
    const executed: string[] = []

    const result = await executeWorkflowRun({
      workflow: createConditionalWorkflow(),
      rubric: createRubric(),
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
      rubric: createRubric(),
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
      rubric: createRubric(),
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
    // Should have executed start 4 times (maxIterations + 1 because we check AFTER incrementing)
    expect(executed.filter((id) => id === 'start').length).toBe(4)
  })
})
