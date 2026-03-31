import type {
  WorkflowDagValidationResult,
  WorkflowEdge,
  WorkflowTemplate,
} from './types'

function buildNodeIdSet(workflow: WorkflowTemplate): Set<string> {
  return new Set(workflow.nodes.map((node) => node.id))
}

function findDuplicateNodeIds(workflow: WorkflowTemplate): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const node of workflow.nodes) {
    if (seen.has(node.id)) {
      duplicates.push(node.id)
      continue
    }
    seen.add(node.id)
  }

  return duplicates
}

function validateEdges(nodeIds: Set<string>, edges: WorkflowEdge[]): string[] {
  const errors: string[] = []

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`edge references unknown source node: ${edge.from}`)
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`edge references unknown target node: ${edge.to}`)
    }
    if (edge.from === edge.to) {
      errors.push(`self-loop is not allowed for node: ${edge.from}`)
    }
  }

  return errors
}

/**
 * Build a map of node id to its position in a topological-like order.
 * For DAG portions, this gives a valid ordering. For back-edges, the
 * target will have a lower position number.
 */
function buildNodePositions(workflow: WorkflowTemplate): Map<string, number> {
  const positions = new Map<string, number>()
  const visited = new Set<string>()
  let position = 0

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    positions.set(nodeId, position++)

    // Find all outgoing edges and visit targets
    for (const edge of workflow.edges) {
      if (edge.from === nodeId) {
        visit(edge.to)
      }
    }
  }

  visit(workflow.entryNodeId)

  // Handle any unreachable nodes
  for (const node of workflow.nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, position++)
    }
  }

  return positions
}

/**
 * Detect back-edges (edges pointing to earlier nodes in execution order).
 * These require loopPolicy to be valid.
 */
function detectBackEdges(
  workflow: WorkflowTemplate,
  positions: Map<string, number>
): WorkflowEdge[] {
  const backEdges: WorkflowEdge[] = []

  for (const edge of workflow.edges) {
    const fromPos = positions.get(edge.from) ?? 0
    const toPos = positions.get(edge.to) ?? 0

    if (toPos <= fromPos) {
      backEdges.push(edge)
    }
  }

  return backEdges
}

function validateBackEdges(
  backEdges: WorkflowEdge[],
  errors: string[]
): void {
  for (const edge of backEdges) {
    if (!edge.loopPolicy) {
      errors.push(
        `back-edge from "${edge.from}" to "${edge.to}" requires loopPolicy`
      )
      continue
    }

    if (edge.loopPolicy.maxIterations <= 0) {
      errors.push(
        `loopPolicy.maxIterations must be > 0 for edge "${edge.from}" → "${edge.to}"`
      )
    }
  }
}

function validateConditionNodes(
  workflow: WorkflowTemplate,
  errors: string[]
): void {
  const conditionNodes = workflow.nodes.filter((n) => n.kind === 'condition')

  for (const node of conditionNodes) {
    // Check for conditionConfig
    if (!node.conditionConfig) {
      errors.push(`condition node "${node.id}" requires conditionConfig`)
      continue
    }

    const config = node.conditionConfig

    // Validate branches
    if (!config.branches || config.branches.length === 0) {
      errors.push(`condition node "${node.id}" must have at least one branch`)
    }

    // Validate fallbackBranch exists in branches
    const branchLabels = new Set(config.branches.map((b) => b.label))
    if (!branchLabels.has(config.fallbackBranch)) {
      errors.push(
        `condition node "${node.id}" fallbackBranch "${config.fallbackBranch}" not found in branches`
      )
    }

    // Check that outgoing edges cover all branches
    const outgoingEdges = workflow.edges.filter((e) => e.from === node.id)

    // At minimum, we need an edge for the fallback branch
    const hasFallbackEdge = outgoingEdges.some(
      (e) => e.branch === config.fallbackBranch || e.branch === undefined
    )
    if (!hasFallbackEdge) {
      errors.push(
        `condition node "${node.id}" missing edge for fallbackBranch "${config.fallbackBranch}"`
      )
    }
  }
}

function topologicalSort(workflow: WorkflowTemplate): {
  order: string[]
  hasCycle: boolean
} {
  const indegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of workflow.nodes) {
    indegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  // Only count non-back-edges for topological sort
  const positions = buildNodePositions(workflow)
  for (const edge of workflow.edges) {
    const fromPos = positions.get(edge.from) ?? 0
    const toPos = positions.get(edge.to) ?? 0

    // Skip back-edges for topological sort
    if (toPos <= fromPos) continue

    const toDegree = indegree.get(edge.to)
    const neighbors = adjacency.get(edge.from)
    if (toDegree === undefined || neighbors === undefined) {
      continue
    }
    indegree.set(edge.to, toDegree + 1)
    neighbors.push(edge.to)
  }

  const queue: string[] = []
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId)
    }
  }

  const order: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      break
    }

    order.push(current)

    const neighbors = adjacency.get(current) || []
    for (const neighbor of neighbors) {
      const degree = indegree.get(neighbor)
      if (degree === undefined) {
        continue
      }
      indegree.set(neighbor, degree - 1)
      if (degree - 1 === 0) {
        queue.push(neighbor)
      }
    }
  }

  // We allow controlled cycles now, so we don't fail on cycles
  // Instead, we add remaining nodes to the order
  for (const node of workflow.nodes) {
    if (!order.includes(node.id)) {
      order.push(node.id)
    }
  }

  return {
    order,
    hasCycle: false, // We now allow controlled cycles
  }
}

function findUnreachableNodes(workflow: WorkflowTemplate): string[] {
  // Build adjacency including back-edges (they don't affect reachability)
  const adjacency = new Map<string, string[]>()
  for (const node of workflow.nodes) {
    adjacency.set(node.id, [])
  }

  for (const edge of workflow.edges) {
    const neighbors = adjacency.get(edge.from)
    if (!neighbors) {
      continue
    }
    neighbors.push(edge.to)
  }

  const visited = new Set<string>()
  const stack = [workflow.entryNodeId]

  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || visited.has(nodeId)) {
      continue
    }

    visited.add(nodeId)
    const neighbors = adjacency.get(nodeId) || []
    for (const nextNode of neighbors) {
      stack.push(nextNode)
    }
  }

  const unreachable: string[] = []
  for (const node of workflow.nodes) {
    if (!visited.has(node.id)) {
      unreachable.push(node.id)
    }
  }

  return unreachable
}

export function validateWorkflowDag(workflow: WorkflowTemplate): WorkflowDagValidationResult {
  const errors: string[] = []

  if (!workflow.nodes.length) {
    return {
      valid: false,
      errors: ['workflow must include at least one node'],
      executionOrder: [],
    }
  }

  const nodeIds = buildNodeIdSet(workflow)

  if (!nodeIds.has(workflow.entryNodeId)) {
    errors.push(`entry node does not exist: ${workflow.entryNodeId}`)
  }

  const duplicateNodeIds = findDuplicateNodeIds(workflow)
  if (duplicateNodeIds.length > 0) {
    errors.push(`duplicate node ids: ${duplicateNodeIds.join(', ')}`)
  }

  errors.push(...validateEdges(nodeIds, workflow.edges))

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      executionOrder: [],
    }
  }

  // Validate condition nodes
  validateConditionNodes(workflow, errors)

  // Detect and validate back-edges (controlled cycles)
  const positions = buildNodePositions(workflow)
  const backEdges = detectBackEdges(workflow, positions)
  validateBackEdges(backEdges, errors)

  // Check for unreachable nodes
  const unreachableNodes = findUnreachableNodes(workflow)
  if (unreachableNodes.length > 0) {
    errors.push(`unreachable nodes from entry node: ${unreachableNodes.join(', ')}`)
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      executionOrder: [],
    }
  }

  const { order } = topologicalSort(workflow)

  return {
    valid: true,
    errors: [],
    executionOrder: order,
  }
}
