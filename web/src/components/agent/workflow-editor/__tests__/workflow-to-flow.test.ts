import { describe, it, expect } from 'vitest'
import type { WorkflowTemplate } from '@/agent/workflow/types'
import { templateToFlow, flowToTemplate } from '../workflow-to-flow'

const linearTemplate: WorkflowTemplate = {
  id: 'test_linear',
  name: '线性链',
  domain: 'generic',
  entryNodeId: 'a',
  nodes: [
    { id: 'a', kind: 'plan', agentRole: 'planner', inputRefs: [], outputKey: 'outline', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
    { id: 'b', kind: 'produce', agentRole: 'writer', inputRefs: ['outline'], outputKey: 'draft', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
    { id: 'c', kind: 'review', agentRole: 'reviewer', inputRefs: ['draft'], outputKey: 'report', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ],
}

const branchTemplate: WorkflowTemplate = {
  id: 'test_branch',
  name: '分支合并',
  domain: 'generic',
  entryNodeId: 'start',
  nodes: [
    { id: 'start', kind: 'plan', agentRole: 'planner', inputRefs: [], outputKey: 'plan', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
    { id: 'write', kind: 'produce', agentRole: 'writer', inputRefs: ['plan'], outputKey: 'draft', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
    { id: 'review', kind: 'review', agentRole: 'reviewer', inputRefs: ['draft'], outputKey: 'report', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
    { id: 'pack', kind: 'assemble', agentRole: 'packager', inputRefs: ['draft', 'report'], outputKey: 'package', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
  ],
  edges: [
    { from: 'start', to: 'write' },
    { from: 'write', to: 'review' },
    { from: 'write', to: 'pack' },
    { from: 'review', to: 'pack' },
  ],
}

describe('templateToFlow', () => {
  it('converts linear chain', () => {
    const { nodes, edges } = templateToFlow(linearTemplate)

    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)

    // Entry node should be marked
    const entryNode = nodes.find((n) => n.id === 'a')!
    expect(entryNode.data.isEntry).toBe(true)
    expect(entryNode.data.kind).toBe('plan')

    // Edge IDs follow `${from}-${to}` convention
    expect(edges[0].id).toBe('a-b')
    expect(edges[0].source).toBe('a')
    expect(edges[0].target).toBe('b')
  })

  it('positions nodes in layers', () => {
    const { nodes } = templateToFlow(linearTemplate)

    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    const c = nodes.find((n) => n.id === 'c')!

    // a is in layer 0, b in layer 1, c in layer 2
    expect(a.position.y).toBeLessThan(b.position.y)
    expect(b.position.y).toBeLessThan(c.position.y)
  })

  it('handles single node template', () => {
    const singleNode: WorkflowTemplate = {
      id: 'single',
      name: '单节点',
      domain: 'generic',
      entryNodeId: 'only',
      nodes: [
        { id: 'only', kind: 'plan', agentRole: 'solo', inputRefs: [], outputKey: 'out', retryPolicy: { maxRetries: 1, timeoutMs: 10000 } },
      ],
      edges: [],
    }

    const { nodes, edges } = templateToFlow(singleNode)
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0)
    expect(nodes[0].data.isEntry).toBe(true)
  })

  it('handles empty template', () => {
    const empty: WorkflowTemplate = {
      id: 'empty',
      name: '空',
      domain: 'generic',
      entryNodeId: '',
      nodes: [],
      edges: [],
    }

    const { nodes, edges } = templateToFlow(empty)
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })
})

describe('flowToTemplate', () => {
  it('roundtrips linear chain', () => {
    const { nodes, edges } = templateToFlow(linearTemplate)
    const restored = flowToTemplate(nodes, edges, {
      id: linearTemplate.id,
      name: linearTemplate.name,
      domain: linearTemplate.domain,
    })

    expect(restored.id).toBe(linearTemplate.id)
    expect(restored.name).toBe(linearTemplate.name)
    expect(restored.entryNodeId).toBe('a')
    expect(restored.nodes).toHaveLength(3)
    expect(restored.edges).toHaveLength(2)

    // Check inputRefs reconstructed from edges
    const nodeB = restored.nodes.find((n) => n.id === 'b')!
    expect(nodeB.inputRefs).toEqual(['outline'])
  })

  it('preserves taskInstruction through roundtrip', () => {
    const withInstruction: WorkflowTemplate = {
      ...linearTemplate,
      nodes: linearTemplate.nodes.map((n) =>
        n.id === 'b'
          ? {
              ...n,
              taskInstruction: '将相关内容组织在同一段落，每段 3-5 句。',
            }
          : n
      ),
    }

    const { nodes, edges } = templateToFlow(withInstruction)
    const restored = flowToTemplate(nodes, edges, {
      id: withInstruction.id,
      name: withInstruction.name,
      domain: withInstruction.domain,
    })

    const nodeB = restored.nodes.find((n) => n.id === 'b')!
    expect(nodeB.taskInstruction).toBe('将相关内容组织在同一段落，每段 3-5 句。')
  })

  it('roundtrips branch template', () => {
    const { nodes, edges } = templateToFlow(branchTemplate)
    const restored = flowToTemplate(nodes, edges, {
      id: branchTemplate.id,
      name: branchTemplate.name,
      domain: branchTemplate.domain,
    })

    expect(restored.nodes).toHaveLength(4)
    expect(restored.edges).toHaveLength(4)

    // pack node should have inputRefs from both write (draft) and review (report)
    const packNode = restored.nodes.find((n) => n.id === 'pack')!
    expect(packNode.inputRefs).toContain('draft')
    expect(packNode.inputRefs).toContain('report')
  })

  it('infers entryNodeId from isEntry flag', () => {
    const { nodes, edges } = templateToFlow(linearTemplate)
    const restored = flowToTemplate(nodes, edges, {
      id: 'test',
      name: 'test',
      domain: 'generic',
    })

    expect(restored.entryNodeId).toBe('a')
  })

  it('infers entryNodeId from nodes with no incoming edges when isEntry is missing', () => {
    const { nodes, edges } = templateToFlow(linearTemplate)
    // Clear isEntry flags
    for (const node of nodes) {
      node.data = { ...node.data, isEntry: false }
    }

    const restored = flowToTemplate(nodes, edges, {
      id: 'test',
      name: 'test',
      domain: 'generic',
    })

    expect(restored.entryNodeId).toBe('a')
  })
})
