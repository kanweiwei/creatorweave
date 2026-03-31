/**
 * WorkflowCanvas - React Flow canvas with refined styling.
 * Figma-style clean canvas with context menu support.
 */

import { useCallback, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type IsValidConnection,
  type OnEdgesChange,
  type OnNodesChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { MemoizedWorkflowNodeCard } from './WorkflowNodeCard'
import { MemoizedWorkflowEdgeCustom } from './WorkflowEdgeCustom'
import { AddNodeToolbar } from './AddNodeToolbar'
import { CanvasContextMenu } from './CanvasContextMenu'
import type { WorkflowFlowNode, WorkflowFlowEdge, WorkflowNodeData } from './workflow-to-flow'
import type { WorkflowNodeKind } from '@/agent/workflow/types'

const nodeTypes = { workflowNode: MemoizedWorkflowNodeCard }
const edgeTypes = { workflowEdge: MemoizedWorkflowEdgeCustom }

interface ContextMenuState {
  x: number
  y: number
  type: 'pane' | 'node'
  nodeId?: string
}

interface WorkflowCanvasProps {
  nodes: WorkflowFlowNode[]
  edges: WorkflowFlowEdge[]
  onNodesChange: OnNodesChange<WorkflowFlowNode>
  onEdgesChange: OnEdgesChange<WorkflowFlowEdge>
  onConnect: (connection: Connection) => void
  isValidConnection: IsValidConnection<WorkflowFlowEdge>
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  onUpdateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void
  onDeleteNode: (nodeId: string) => void
}

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  selectedNodeId: _selectedNodeId,
  setSelectedNodeId,
  onUpdateNodeData,
  onDeleteNode,
}: WorkflowCanvasProps) {
  const { screenToFlowPosition, addNodes, getNodes, fitView } = useReactFlow()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Context menu: pane right-click
  const handlePaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target?.closest('.react-flow__node') ||
        target?.closest('.react-flow__edge') ||
        target?.closest('.react-flow__controls') ||
        target?.closest('.react-flow__minimap')
      ) {
        return
      }

      e.preventDefault()
      const current = e.currentTarget as HTMLElement
      const rect = current.getBoundingClientRect()
      const clientX = 'clientX' in e ? e.clientX : 0
      const clientY = 'clientY' in e ? e.clientY : 0
      setContextMenu({
        x: clientX - rect.left,
        y: clientY - rect.top,
        type: 'pane',
      })
    },
    []
  )

  // Context menu: node right-click
  const handleNodeContextMenu: NodeMouseHandler<WorkflowFlowNode> = useCallback(
    (e, node) => {
      e.preventDefault()
      e.stopPropagation()
      const flowEl = (e.target as HTMLElement).closest('.react-flow')
      if (!flowEl) return
      const rect = flowEl.getBoundingClientRect()
      const clientX = 'clientX' in e ? e.clientX : 0
      const clientY = 'clientY' in e ? e.clientY : 0
      setContextMenu({
        x: clientX - rect.left,
        y: clientY - rect.top,
        type: 'node',
        nodeId: node.id,
      })
    },
    []
  )

  // Click handlers
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setContextMenu(null)
  }, [setSelectedNodeId])

  const handleNodeClick: NodeMouseHandler<WorkflowFlowNode> = useCallback(
    (_, node) => {
      setSelectedNodeId(node.id)
      setContextMenu(null)
    },
    [setSelectedNodeId]
  )

  const handleSetEntry = useCallback(
    (nodeId: string) => {
      const allNodes = getNodes()
      allNodes.forEach((n) => {
        if (n.data.isEntry && n.id !== nodeId) {
          onUpdateNodeData(n.id, { isEntry: false })
        }
      })
      onUpdateNodeData(nodeId, { isEntry: true })
      setContextMenu(null)
    },
    [getNodes, onUpdateNodeData]
  )

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      onDeleteNode(nodeId)
      setContextMenu(null)
      setSelectedNodeId(null)
    },
    [onDeleteNode, setSelectedNodeId]
  )

  const handleAddNode = useCallback(
    (kind: WorkflowNodeKind, x: number, y: number) => {
      const id = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const position = screenToFlowPosition({ x, y })

      addNodes([
        {
          id,
          type: 'workflowNode',
          position,
          data: {
            kind,
            agentRole: `${kind}_agent`,
            taskInstruction: '',
            outputKey: `${kind}_output`,
            isEntry: getNodes().length === 0,
            maxRetries: 1,
            timeoutMs: 15000,
          },
        },
      ])
      setContextMenu(null)
    },
    [screenToFlowPosition, addNodes, getNodes]
  )

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2 })
    setContextMenu(null)
  }, [fitView])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        defaultEdgeOptions={{
          type: 'workflowEdge',
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
          style: { strokeWidth: 1.5 },
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-neutral-100/50 dark:bg-neutral-950"
      >
        {/* Subtle dot grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#d4d4d4"
          className="dark:!fill-neutral-700"
        />

        {/* Refined controls */}
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          className="!bottom-4 !left-4 !bg-white/95 !rounded-xl !border !border-neutral-200/60 !shadow-lg !backdrop-blur-md dark:!bg-neutral-900/95 dark:!border-neutral-700/60 [&_button]:!border-0 [&_button]:!rounded-lg [&_button]:!bg-transparent hover:!bg-neutral-100 dark:hover:!bg-neutral-800"
        />

        {/* Mini map */}
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as WorkflowNodeData
            const config: Record<string, string> = {
              plan: '#818cf8',
              produce: '#2dd4bf',
              review: '#fb7185',
              repair: '#fbbf24',
              assemble: '#a78bfa',
            }
            return config[data?.kind] || '#a1a1aa'
          }}
          maskColor="rgba(255,255,255,0.85)"
          className="!bottom-4 !right-4 !rounded-xl !border !border-neutral-200/60 !bg-white/95 !shadow-lg !backdrop-blur-md dark:!bg-neutral-900/95 dark:!border-neutral-700/60 dark:!mask-neutral-900/85"
          pannable
          zoomable
        />

        {/* Add node toolbar */}
        <AddNodeToolbar />

        {/* Context menu */}
        {contextMenu && (
          <CanvasContextMenu
            menu={contextMenu}
            onAddNode={handleAddNode}
            onSetEntry={handleSetEntry}
            onDeleteNode={handleDeleteNode}
            onFitView={handleFitView}
            onClose={() => setContextMenu(null)}
          />
        )}
      </ReactFlow>
    </div>
  )
}
