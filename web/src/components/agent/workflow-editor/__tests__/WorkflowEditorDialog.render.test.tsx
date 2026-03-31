import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  loadTemplateMock,
  createNewWorkflowMock,
  loadCustomWorkflowMock,
  onNodesChangeMock,
  onEdgesChangeMock,
  onConnectMock,
  isValidConnectionMock,
  setSelectedNodeIdMock,
  updateNodeDataMock,
  deleteNodeMock,
  resetMock,
  saveCustomWorkflowMock,
  exportTemplateMock,
  useWorkflowEditorMock,
  loadWorkflowsMock,
} = vi.hoisted(() => ({
  loadTemplateMock: vi.fn(),
  createNewWorkflowMock: vi.fn(),
  loadCustomWorkflowMock: vi.fn(),
  onNodesChangeMock: vi.fn(),
  onEdgesChangeMock: vi.fn(),
  onConnectMock: vi.fn(),
  isValidConnectionMock: vi.fn(() => true),
  setSelectedNodeIdMock: vi.fn(),
  updateNodeDataMock: vi.fn(),
  deleteNodeMock: vi.fn(),
  resetMock: vi.fn(),
  saveCustomWorkflowMock: vi.fn(async () => true),
  exportTemplateMock: vi.fn(() => ({
    id: 'template_v1',
    name: 'Template',
    domain: 'generic',
    entryNodeId: 'n1',
    nodes: [],
    edges: [],
  })),
  useWorkflowEditorMock: vi.fn(),
  loadWorkflowsMock: vi.fn(async () => undefined),
}))

vi.mock('@creatorweave/ui', () => ({
  BrandDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  BrandDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BrandDialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BrandButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  BrandSelect: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BrandSelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BrandSelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BrandSelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BrandSelectSeparator: () => <hr />,
  BrandSelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  BrandSelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock('@/agent/workflow/templates', () => ({
  listWorkflowTemplateBundles: () => [
    {
      id: 'template_v1',
      label: 'Template V1',
      workflow: {
        id: 'template_v1',
        name: 'Template',
        domain: 'generic',
        entryNodeId: 'n1',
        nodes: [],
        edges: [],
      },
    },
  ],
}))

vi.mock('@/store/custom-workflow.store', () => ({
  useEnabledWorkflows: () => [],
  useCustomWorkflowStore: () => ({
    loadWorkflows: loadWorkflowsMock,
  }),
}))

vi.mock('../useWorkflowEditor', () => ({
  useWorkflowEditor: useWorkflowEditorMock,
}))

vi.mock('../WorkflowCanvas', () => ({
  WorkflowCanvas: () => <div data-testid="workflow-canvas" />,
}))

vi.mock('../NodePropertiesPanel', () => ({
  NodePropertiesPanel: () => <div data-testid="node-properties-panel" />,
}))

import { WorkflowEditorDialog } from '../WorkflowEditorDialog'

describe('WorkflowEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkflowEditorMock.mockImplementation(() => ({
      nodes: [],
      edges: [],
      meta: { id: 'template_v1', name: 'Template', domain: 'generic' },
      selectedNodeId: null,
      selectedNode: null,
      isDirty: false,
      validationResult: { valid: true, errors: [], executionOrder: [] },
      onNodesChange: onNodesChangeMock,
      onEdgesChange: onEdgesChangeMock,
      setMeta: vi.fn(),
      setSelectedNodeId: setSelectedNodeIdMock,
      loadTemplate: loadTemplateMock,
      updateNodeData: updateNodeDataMock,
      deleteNode: deleteNodeMock,
      onConnect: onConnectMock,
      exportTemplate: exportTemplateMock,
      isValidConnection: isValidConnectionMock,
      reset: resetMock,
      loadCustomWorkflow: loadCustomWorkflowMock,
      saveCustomWorkflow: saveCustomWorkflowMock,
      createNewWorkflow: createNewWorkflowMock,
      isCustomWorkflow: false,
    }))
  })

  it('loads initial template only once when opened', async () => {
    render(
      <WorkflowEditorDialog
        open={true}
        onOpenChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(loadTemplateMock).toHaveBeenCalledTimes(1)
    })
  })
})
