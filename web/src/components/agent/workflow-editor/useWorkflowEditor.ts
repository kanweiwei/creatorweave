/**
 * useWorkflowEditor - state management hook for the DAG workflow editor.
 *
 * Adds editor-level behavior on top of React Flow state:
 * - Connection validation (self-loop / duplicate / cycle)
 * - Single-entry-node normalization
 * - Dirty detection + reset snapshot
 * - Custom workflow persistence
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
} from '@xyflow/react'
import { validateWorkflowDag } from '@/agent/workflow/dag-validator'
import type { WorkflowTemplate, CustomWorkflowTemplate, WorkflowDomain } from '@/agent/workflow/types'
import {
  templateToFlow,
  flowToTemplate,
  type WorkflowFlowNode,
  type WorkflowFlowEdge,
  type WorkflowNodeData,
} from './workflow-to-flow'
import {
  useCustomWorkflowStore,
  createEmptyWorkflow,
} from '@/store/custom-workflow.store'

export interface WorkflowEditorMeta {
  id: string
  name: string
  domain: WorkflowTemplate['domain']
  description?: string
  source?: 'built-in' | 'user-created' | 'imported'
}

interface EditorSnapshot {
  n: WorkflowFlowNode[]
  e: WorkflowFlowEdge[]
  m: WorkflowEditorMeta
}

function connectionExists(
  edges: WorkflowFlowEdge[],
  source: string,
  target: string
): boolean {
  return edges.some((edge) => edge.source === source && edge.target === target)
}

function wouldCreateCycle(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  source: string,
  target: string
): boolean {
  const nodeIds = new Set(nodes.map((n) => n.id))
  if (!nodeIds.has(source) || !nodeIds.has(target)) return true

  const adjacency = new Map<string, string[]>()
  for (const id of nodeIds) adjacency.set(id, [])
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target)
  }
  adjacency.get(source)?.push(target)

  // If target can reach source after adding source->target, a cycle is created.
  const stack = [target]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === source) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        stack.push(next)
      }
    }
  }

  return false
}

export function useWorkflowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowFlowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [meta, setMeta] = useState<WorkflowEditorMeta>({
    id: 'custom_v1',
    name: '自定义工作流',
    domain: 'generic',
  })

  const initialSnapshot = useRef<string>('')

  const isDirty = useMemo(() => {
    const current = JSON.stringify({ n: nodes, e: edges, m: meta })
    return current !== initialSnapshot.current
  }, [nodes, edges, meta])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  )

  const validationResult = useMemo(() => {
    const template = flowToTemplate(nodes, edges, meta)
    return validateWorkflowDag(template)
  }, [nodes, edges, meta])

  const loadTemplate = useCallback(
    (template: WorkflowTemplate) => {
      const { nodes: flowNodes, edges: flowEdges } = templateToFlow(template)
      const nextMeta = { id: template.id, name: template.name, domain: template.domain }

      setNodes(flowNodes)
      setEdges(flowEdges)
      setMeta(nextMeta)
      setSelectedNodeId(null)

      initialSnapshot.current = JSON.stringify({
        n: flowNodes,
        e: flowEdges,
        m: nextMeta,
      } satisfies EditorSnapshot)
    },
    [setNodes, setEdges]
  )

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<WorkflowNodeData>) => {
      setNodes((prev) => {
        if (patch.isEntry === true) {
          // Entry node must be unique.
          return prev.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...patch, isEntry: true } }
              : { ...node, data: { ...node.data, isEntry: false } }
          )
        }

        return prev.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
        )
      })
    },
    [setNodes]
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))

      setNodes((prev) => {
        const remaining = prev.filter((node) => node.id !== nodeId)
        if (remaining.length === 0) return remaining

        const hasEntry = remaining.some((node) => node.data.isEntry)
        if (hasEntry) return remaining

        // Ensure there is always one entry node.
        return remaining.map((node, index) =>
          index === 0 ? { ...node, data: { ...node.data, isEntry: true } } : node
        )
      })

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null)
      }
    },
    [setEdges, setNodes, selectedNodeId]
  )

  const isValidConnection = useCallback(
    (edgeOrConnection: Connection | Edge) => {
      const source = edgeOrConnection.source
      const target = edgeOrConnection.target
      if (!source || !target) return false
      if (source === target) return false
      if (connectionExists(edges, source, target)) return false
      if (wouldCreateCycle(nodes, edges, source, target)) return false
      return true
    },
    [nodes, edges]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = connection.source
      const target = connection.target
      if (!source || !target) return

      setEdges((prev) => {
        if (source === target) return prev
        if (connectionExists(prev, source, target)) return prev
        if (wouldCreateCycle(nodes, prev, source, target)) return prev

        return [
          ...prev,
          {
            id: `${source}-${target}`,
            source,
            target,
            type: 'workflowEdge',
          },
        ]
      })
    },
    [nodes, setEdges]
  )

  const exportTemplate = useCallback((): WorkflowTemplate => {
    return flowToTemplate(nodes, edges, meta)
  }, [nodes, edges, meta])

  const reset = useCallback(() => {
    if (!initialSnapshot.current) {
      setNodes([])
      setEdges([])
      setSelectedNodeId(null)
      return
    }

    const snapshot = JSON.parse(initialSnapshot.current) as EditorSnapshot
    setNodes(snapshot.n)
    setEdges(snapshot.e)
    setMeta(snapshot.m)
    setSelectedNodeId(null)
  }, [setNodes, setEdges])

  // ============================================================================
  // Custom Workflow Integration
  // ============================================================================

  const workflowStore = useCustomWorkflowStore()

  /**
   * Load a custom workflow from the store
   */
  const loadCustomWorkflow = useCallback(
    (workflow: CustomWorkflowTemplate) => {
      const template: WorkflowTemplate = {
        id: workflow.id,
        name: workflow.name,
        domain: workflow.domain,
        entryNodeId: workflow.entryNodeId,
        nodes: workflow.nodes,
        edges: workflow.edges,
      }
      loadTemplate(template)

      // Update meta with custom workflow info
      setMeta({
        id: workflow.id,
        name: workflow.name,
        domain: workflow.domain,
        description: workflow.description,
        source: workflow.source,
      })
    },
    [loadTemplate, setMeta]
  )

  /**
   * Save current workflow as a custom workflow
   */
  const saveCustomWorkflow = useCallback(async (): Promise<boolean> => {
    try {
      const template = exportTemplate()
      const now = Date.now()

      const customWorkflow: CustomWorkflowTemplate = {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        domain: meta.domain,
        entryNodeId: template.entryNodeId,
        nodes: template.nodes.map((n) => ({
          ...n,
          // Preserve custom node config if present
          modelConfig: undefined,
          promptTemplate: undefined,
          presetId: undefined,
        })),
        edges: template.edges,
        source: meta.source || 'user-created',
        version: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      }

      await workflowStore.saveWorkflow(customWorkflow)

      // Update snapshot to clear dirty state
      initialSnapshot.current = JSON.stringify({
        n: nodes,
        e: edges,
        m: meta,
      } satisfies EditorSnapshot)

      return true
    } catch (error) {
      console.error('[useWorkflowEditor] saveCustomWorkflow error:', error)
      return false
    }
  }, [exportTemplate, meta, nodes, edges, workflowStore])

  /**
   * Create a new empty workflow
   */
  const createNewWorkflow = useCallback(
    (name?: string, domain?: WorkflowDomain) => {
      const workflow = createEmptyWorkflow(name, domain)
      loadCustomWorkflow(workflow)
    },
    [loadCustomWorkflow]
  )

  /**
   * Check if current workflow is a custom workflow (not built-in)
   */
  const isCustomWorkflow = useMemo(() => {
    return meta.source !== undefined && meta.source !== 'built-in'
  }, [meta.source])

  return {
    nodes,
    edges,
    meta,
    selectedNodeId,
    selectedNode,
    isDirty,
    validationResult,
    onNodesChange,
    onEdgesChange,
    setMeta,
    setSelectedNodeId,
    loadTemplate,
    updateNodeData,
    deleteNode,
    onConnect,
    exportTemplate,
    isValidConnection,
    reset,

    // Custom workflow methods
    loadCustomWorkflow,
    saveCustomWorkflow,
    createNewWorkflow,
    isCustomWorkflow,
  }
}
