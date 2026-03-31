import { describe, expect, it } from 'vitest'
import { createWorkflowRunPlan } from '../workflow/workflow-runner'
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

function createRubric(): RubricDefinition {
  return {
    id: 'novel-rubric',
    version: 1,
    name: 'Novel Rubric',
    passCondition: 'total_score >= 80',
    retryPolicy: { maxRepairRounds: 2 },
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

describe('createWorkflowRunPlan', () => {
  it('creates runnable plan when workflow and rubric are valid', () => {
    const result = createWorkflowRunPlan(createWorkflow(), createRubric())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.executionOrder).toEqual(['plan', 'produce', 'review'])
    expect(result.initialRunState.status).toBe('queued')
    expect(result.initialRunState.maxRepairRounds).toBe(2)
  })

  it('returns dag errors when workflow has invalid back-edge', () => {
    const invalidWorkflow = createWorkflow()
    invalidWorkflow.edges.push({ from: 'review', to: 'plan' })

    const result = createWorkflowRunPlan(invalidWorkflow, createRubric())
    expect(result.ok).toBe(false)
    if (result.ok) return

    // Now we detect back-edges and require loopPolicy
    expect(result.errors.join(' ')).toContain('loopPolicy')
  })

  it('returns rubric errors when rubric is invalid', () => {
    const invalidRubric = createRubric()
    invalidRubric.rules = []

    const result = createWorkflowRunPlan(createWorkflow(), invalidRubric)
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.join(' ')).toContain('at least one rule')
  })
})
