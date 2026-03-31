/**
 * Bidirectional conversion between WorkflowTemplate and React Flow nodes/edges.
 *
 * Layout uses topological sort for layer assignment, then distributes nodes
 * horizontally within each layer.
 */

import type { Node, Edge } from '@xyflow/react'
import type {
  WorkflowTemplate,
  WorkflowNode,
  WorkflowNodeKind,
  NodeModelConfig,
} from '@/agent/workflow/types'
import { NODE_WIDTH, NODE_HORIZONTAL_GAP, LAYER_VERTICAL_GAP } from './constants'

// ── Node data shape stored on each React Flow node ──────────────────────

export interface WorkflowNodeData {
  [key: string]: unknown
  kind: WorkflowNodeKind
  agentRole: string
  taskInstruction: string
  outputKey: string
  isEntry: boolean
  maxRetries: number
  timeoutMs: number
  // Extended configuration for custom workflows
  modelConfig?: NodeModelConfig
  promptTemplate?: string
  presetId?: string
}

// React Flow expects `data` to be a plain object; the generic parameter
// lets useNodesState / useEdgesState infer the correct types.
export type WorkflowFlowNode = Node<WorkflowNodeData, 'workflowNode'>
export type WorkflowFlowEdge = Edge

// ── Template → Flow ─────────────────────────────────────────────────────

/**
 * Compute the topological layer (0-indexed) for each node.
 * Layer 0 = nodes with no incoming edges, layer N = max distance from roots.
 */
function computeLayers(
  nodes: WorkflowNode[],
  edges: { from: string; to: string }[]
): Map<string, number> {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    const deg = inDegree.get(edge.to)
    const neighbors = adjacency.get(edge.from)
    if (deg !== undefined) neighbors?.push(edge.to)
    if (deg !== undefined) inDegree.set(edge.to, deg + 1)
  }

  // BFS layering
  const layers = new Map<string, number>()
  const queue: Array<{ id: string; layer: number }> = []

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push({ id, layer: 0 })
    }
  }

  let qi = 0
  while (qi < queue.length) {
    const { id, layer } = queue[qi++]
    layers.set(id, layer)
    for (const neighbor of adjacency.get(id) || []) {
      const d = inDegree.get(neighbor)
      if (d !== undefined) {
        inDegree.set(neighbor, d - 1)
        if (d - 1 === 0) {
          queue.push({ id: neighbor, layer: layer + 1 })
        }
      }
    }
  }

  // Fallback: nodes not visited (shouldn't happen for valid DAGs)
  for (const node of nodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0)
    }
  }

  return layers
}

export function templateToFlow(
  template: WorkflowTemplate
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const layers = computeLayers(template.nodes, template.edges)

  // Group nodes by layer
  const byLayer = new Map<number, WorkflowNode[]>()
  for (const node of template.nodes) {
    const layer = layers.get(node.id) ?? 0
    let group = byLayer.get(layer)
    if (!group) {
      group = []
      byLayer.set(layer, group)
    }
    group.push(node)
  }

  // Compute positions: center each layer horizontally
  const flowNodes: WorkflowFlowNode[] = []
  for (const [layer, nodesInLayer] of byLayer.entries()) {
    const totalWidth = nodesInLayer.length * NODE_WIDTH + (nodesInLayer.length - 1) * (NODE_HORIZONTAL_GAP - NODE_WIDTH)
    const startX = -totalWidth / 2

    nodesInLayer.forEach((node, i) => {
      // Cast to CustomWorkflowNode to access extended fields
      const customNode = node as import('@/agent/workflow/types').CustomWorkflowNode

      flowNodes.push({
        id: node.id,
        type: 'workflowNode',
        position: {
          x: startX + i * NODE_HORIZONTAL_GAP,
          y: layer * LAYER_VERTICAL_GAP,
        },
        data: {
          kind: node.kind,
          agentRole: node.agentRole,
          taskInstruction: node.taskInstruction || '',
          outputKey: node.outputKey,
          isEntry: node.id === template.entryNodeId,
          maxRetries: node.retryPolicy.maxRetries,
          timeoutMs: node.retryPolicy.timeoutMs,
          // Extended fields for custom workflows
          modelConfig: customNode.modelConfig,
          promptTemplate: customNode.promptTemplate,
          presetId: customNode.presetId,
        },
      })
    })
  }

  const flowEdges: WorkflowFlowEdge[] = template.edges.map((edge) => ({
    id: `${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: 'workflowEdge',
  }))

  return { nodes: flowNodes, edges: flowEdges }
}

// ── Flow → Template ─────────────────────────────────────────────────────

export function flowToTemplate(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  meta: { id: string; name: string; domain: WorkflowTemplate['domain'] }
): WorkflowTemplate {
  // Build a lookup for quick edge access
  const incomingEdges = new Map<string, WorkflowFlowEdge[]>()
  for (const edge of edges) {
    let list = incomingEdges.get(edge.target)
    if (!list) {
      list = []
      incomingEdges.set(edge.target, list)
    }
    list.push(edge)
  }

  // Collect outputKey values from source nodes for inputRefs
  const nodeOutputMap = new Map<string, string>()
  for (const node of nodes) {
    nodeOutputMap.set(node.id, node.data.outputKey)
  }

  const workflowNodes: WorkflowNode[] = nodes.map((node) => {
    const inEdges = incomingEdges.get(node.id) || []
    const inputRefs = inEdges
      .map((e) => nodeOutputMap.get(e.source))
      .filter((v): v is string => !!v)
    const taskInstruction =
      typeof node.data.taskInstruction === 'string' ? node.data.taskInstruction.trim() : ''

    // Base node properties
    const baseNode: WorkflowNode = {
      id: node.id,
      kind: node.data.kind,
      agentRole: node.data.agentRole,
      ...(taskInstruction ? { taskInstruction } : {}),
      inputRefs,
      outputKey: node.data.outputKey,
      retryPolicy: {
        maxRetries: node.data.maxRetries,
        timeoutMs: node.data.timeoutMs,
      },
    }

    // Add extended properties for custom workflows
    const extendedNode = baseNode as import('@/agent/workflow/types').CustomWorkflowNode
    if (node.data.modelConfig) {
      extendedNode.modelConfig = node.data.modelConfig
    }
    if (node.data.promptTemplate) {
      extendedNode.promptTemplate = node.data.promptTemplate
    }
    if (node.data.presetId) {
      extendedNode.presetId = node.data.presetId
    }

    return baseNode
  })

  // Infer entryNodeId: first node with isEntry=true, or first node with no incoming edges
  const entryCandidate = nodes.find((n) => n.data.isEntry)
  let entryNodeId = entryCandidate?.id
  if (!entryNodeId) {
    const nodesWithNoIncoming = nodes.filter(
      (n) => !incomingEdges.has(n.id) || incomingEdges.get(n.id)!.length === 0
    )
    entryNodeId = nodesWithNoIncoming[0]?.id || (nodes[0]?.id ?? '')
  }

  const workflowEdges = edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
  }))

  return {
    id: meta.id,
    name: meta.name,
    domain: meta.domain,
    entryNodeId,
    nodes: workflowNodes,
    edges: workflowEdges,
  }
}
