import { describe, expect, it } from 'vitest'
import { validateWorkflowDag } from '../workflow/dag-validator'
import type { WorkflowTemplate, WorkflowEdge } from '../workflow/types'

function createWorkflow(partial?: Partial<WorkflowTemplate>): WorkflowTemplate {
  return {
    id: 'wf-1',
    name: 'test workflow',
    domain: 'generic',
    entryNodeId: 'plan',
    nodes: [
      {
        id: 'plan',
        kind: 'plan',
        agentRole: 'planner',
        inputRefs: [],
        outputKey: 'plan_output',
        retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
      },
      {
        id: 'produce',
        kind: 'produce',
        agentRole: 'writer',
        inputRefs: ['plan_output'],
        outputKey: 'draft',
        retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
      },
      {
        id: 'review',
        kind: 'review',
        agentRole: 'reviewer',
        inputRefs: ['draft'],
        outputKey: 'review',
        retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
      },
    ],
    edges: [
      { from: 'plan', to: 'produce' },
      { from: 'produce', to: 'review' },
    ],
    ...partial,
  }
}

describe('validateWorkflowDag', () => {
  it('returns valid result for an acyclic workflow', () => {
    const result = validateWorkflowDag(createWorkflow())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.executionOrder).toEqual(['plan', 'produce', 'review'])
  })

  it('detects missing nodes referenced by edges', () => {
    const result = validateWorkflowDag(
      createWorkflow({
        edges: [
          { from: 'plan', to: 'produce' },
          { from: 'produce', to: 'ghost' },
        ],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('ghost')
  })

  it('detects cycle in workflow graph (back-edge without loopPolicy)', () => {
    const result = validateWorkflowDag(
      createWorkflow({
        edges: [
          { from: 'plan', to: 'produce' },
          { from: 'produce', to: 'review' },
          { from: 'review', to: 'plan' },
        ],
      })
    )
    expect(result.valid).toBe(false)
    // Now we detect back-edges and require loopPolicy
    expect(result.errors.join(' ')).toContain('loopPolicy')
  })

  it('detects nodes unreachable from entry node', () => {
    const result = validateWorkflowDag(
      createWorkflow({
        nodes: [
          ...createWorkflow().nodes,
          {
            id: 'orphan',
            kind: 'assemble',
            agentRole: 'assembler',
            inputRefs: [],
            outputKey: 'final',
            retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
          },
        ],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('unreachable')
    expect(result.errors.join(' ')).toContain('orphan')
  })

  it('detects duplicated node ids', () => {
    const duplicated = createWorkflow().nodes[0]
    const result = validateWorkflowDag(
      createWorkflow({
        nodes: [...createWorkflow().nodes, { ...duplicated }],
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('duplicate')
  })
})

// ============================================================================
// Condition Branching & Loop Tests
// ============================================================================

describe('conditional branching and loops', () => {
  function createConditionalWorkflow(edges?: WorkflowEdge[]): WorkflowTemplate {
    return {
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
        {
          id: 'assemble',
          kind: 'assemble',
          agentRole: 'packager',
          inputRefs: ['draft'],
          outputKey: 'final',
          retryPolicy: { maxRetries: 1, timeoutMs: 10000 },
        },
      ],
      edges: edges ?? [
        { from: 'plan', to: 'produce' },
        { from: 'produce', to: 'review' },
        { from: 'review', to: 'gate' },
        { from: 'gate', to: 'assemble', branch: 'pass' },
        {
          from: 'gate',
          to: 'produce',
          branch: 'fail',
          loopPolicy: {
            maxIterations: 3,
            exitCondition: '${review_report.score} >= 80',
            accumulateHistory: true,
            historyLimit: 3,
          },
        },
      ],
    }
  }

  it('accepts condition node with valid branches, fallback edge, and loop', () => {
    const result = validateWorkflowDag(createConditionalWorkflow())
    expect(result.valid).toBe(true)
  })

  it('rejects back-edge without loopPolicy', () => {
    const result = validateWorkflowDag(
      createConditionalWorkflow([
        { from: 'plan', to: 'produce' },
        { from: 'produce', to: 'review' },
        { from: 'review', to: 'plan' }, // back-edge without loopPolicy
      ])
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('loopPolicy')
  })

  it('rejects condition node without fallback edge', () => {
    const result = validateWorkflowDag(
      createConditionalWorkflow([
        { from: 'plan', to: 'produce' },
        { from: 'produce', to: 'review' },
        { from: 'review', to: 'gate' },
        { from: 'gate', to: 'assemble', branch: 'pass' },
        // missing: fallback edge without branch label
      ])
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('fallback')
  })

  it('rejects condition node without conditionConfig', () => {
    const wf = createConditionalWorkflow()
    const gateNode = wf.nodes.find((n) => n.id === 'gate')!
    delete gateNode.conditionConfig
    const result = validateWorkflowDag(wf)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('conditionConfig')
  })

  it('rejects loopPolicy with maxIterations <= 0', () => {
    const result = validateWorkflowDag(
      createConditionalWorkflow([
        { from: 'plan', to: 'produce' },
        { from: 'produce', to: 'review' },
        { from: 'review', to: 'gate' },
        { from: 'gate', to: 'assemble', branch: 'pass' },
        {
          from: 'gate',
          to: 'produce',
          branch: 'fail',
          loopPolicy: { maxIterations: 0, accumulateHistory: false },
        },
      ])
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('maxIterations')
  })
})
