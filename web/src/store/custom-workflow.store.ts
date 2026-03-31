/**
 * Custom Workflow Store - Zustand store for custom workflow state.
 * Uses WorkflowRepository for SQLite persistence.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { getWorkflowRepository } from '@/sqlite/repositories/workflow.repository'
import type {
  CustomWorkflowTemplate,
  WorkflowSource,
  WorkflowDomain,
} from '@/agent/workflow/types'

/**
 * Generate a unique workflow ID
 */
function generateWorkflowId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 9)
  return `wf_${timestamp}${random}`
}

/**
 * Create a new empty workflow
 */
export function createEmptyWorkflow(
  name: string = '未命名工作流',
  domain: WorkflowDomain = 'custom'
): CustomWorkflowTemplate {
  const now = Date.now()
  return {
    id: generateWorkflowId(),
    name,
    domain,
    entryNodeId: '',
    nodes: [],
    edges: [],
    source: 'user-created',
    version: 1,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

interface CustomWorkflowState {
  /** All custom workflows */
  workflows: CustomWorkflowTemplate[]
  /** Currently active workflow being edited */
  activeWorkflowId: string | null
  /** Whether workflows have been loaded from SQLite */
  loaded: boolean
  /** Loading state */
  loading: boolean
  /** Saving state */
  saving: boolean
  /** Error state */
  error: string | null

  // Actions
  loadWorkflows: () => Promise<void>
  saveWorkflow: (workflow: CustomWorkflowTemplate) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  renameWorkflow: (id: string, newName: string) => Promise<void>
  duplicateWorkflow: (id: string) => Promise<CustomWorkflowTemplate | null>
  toggleEnabled: (id: string, enabled: boolean) => Promise<void>

  // Selection
  setActiveWorkflow: (id: string | null) => void
  getActiveWorkflow: () => CustomWorkflowTemplate | null

  // Import/Export
  exportWorkflow: (id: string) => string | null
  importWorkflow: (json: string) => Promise<CustomWorkflowTemplate | null>

  // Queries
  getWorkflowById: (id: string) => CustomWorkflowTemplate | null
  searchWorkflows: (keyword: string) => CustomWorkflowTemplate[]

  // Utility
  clearError: () => void
}

type CustomWorkflowStateWithImmer = CustomWorkflowState & {
  setState: (partial: Partial<CustomWorkflowState> | ((state: CustomWorkflowState) => void)) => void
}

export const useCustomWorkflowStore = create<CustomWorkflowStateWithImmer>()(
  immer((set, get) => ({
    setState: set,
    workflows: [],
    activeWorkflowId: null,
    loaded: false,
    loading: false,
    saving: false,
    error: null,

    loadWorkflows: async () => {
      const state = get()
      if (state.loading) return
      if (state.error) {
        console.warn(
          '[CustomWorkflowStore] Not loading - previous error exists. Call clearError() to retry.'
        )
        return
      }

      set({ loading: true })
      try {
        const repo = getWorkflowRepository()
        const workflows = await repo.findAll()
        set({ workflows, loaded: true, loading: false, error: null })
        console.log('[CustomWorkflowStore] Loaded', workflows.length, 'workflows')
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CustomWorkflowStore] loadWorkflows error:', error)
        set({ loading: false, error: errorMsg })
      }
    },

    saveWorkflow: async (workflow: CustomWorkflowTemplate) => {
      set({ saving: true })
      try {
        const repo = getWorkflowRepository()
        const now = Date.now()
        const updatedWorkflow = {
          ...workflow,
          updatedAt: now,
          createdAt: workflow.createdAt || now,
        }

        await repo.save(updatedWorkflow)

        set((state) => {
          const existingIndex = state.workflows.findIndex((w) => w.id === updatedWorkflow.id)
          if (existingIndex >= 0) {
            state.workflows[existingIndex] = updatedWorkflow
          } else {
            state.workflows.push(updatedWorkflow)
          }
          // Sort by updatedAt desc
          state.workflows.sort((a, b) => b.updatedAt - a.updatedAt)
        })

        console.log('[CustomWorkflowStore] Saved workflow:', updatedWorkflow.id)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CustomWorkflowStore] saveWorkflow error:', error)
        set({ error: errorMsg })
        throw error
      } finally {
        set({ saving: false })
      }
    },

    deleteWorkflow: async (id: string) => {
      try {
        const repo = getWorkflowRepository()
        await repo.delete(id)

        set((state) => {
          state.workflows = state.workflows.filter((w) => w.id !== id)
          if (state.activeWorkflowId === id) {
            state.activeWorkflowId = null
          }
        })

        console.log('[CustomWorkflowStore] Deleted workflow:', id)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CustomWorkflowStore] deleteWorkflow error:', error)
        set({ error: errorMsg })
        throw error
      }
    },

    renameWorkflow: async (id: string, newName: string) => {
      try {
        const repo = getWorkflowRepository()
        await repo.rename(id, newName)

        set((state) => {
          const workflow = state.workflows.find((w) => w.id === id)
          if (workflow) {
            workflow.name = newName
            workflow.updatedAt = Date.now()
          }
        })

        console.log('[CustomWorkflowStore] Renamed workflow:', id, 'to', newName)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CustomWorkflowStore] renameWorkflow error:', error)
        set({ error: errorMsg })
        throw error
      }
    },

    duplicateWorkflow: async (id: string): Promise<CustomWorkflowTemplate | null> => {
      const state = get()
      const original = state.workflows.find((w) => w.id === id)
      if (!original) return null

      const now = Date.now()
      const duplicate: CustomWorkflowTemplate = {
        ...original,
        id: generateWorkflowId(),
        name: `${original.name} (副本)`,
        source: 'user-created',
        createdAt: now,
        updatedAt: now,
      }

      await get().saveWorkflow(duplicate)
      return duplicate
    },

    toggleEnabled: async (id: string, enabled: boolean) => {
      try {
        const repo = getWorkflowRepository()
        await repo.toggleEnabled(id, enabled)

        set((state) => {
          const workflow = state.workflows.find((w) => w.id === id)
          if (workflow) {
            workflow.enabled = enabled
            workflow.updatedAt = Date.now()
          }
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CustomWorkflowStore] toggleEnabled error:', error)
        set({ error: errorMsg })
        throw error
      }
    },

    setActiveWorkflow: (id: string | null) => {
      set({ activeWorkflowId: id })
    },

    getActiveWorkflow: (): CustomWorkflowTemplate | null => {
      const state = get()
      if (!state.activeWorkflowId) return null
      return state.workflows.find((w) => w.id === state.activeWorkflowId) || null
    },

    exportWorkflow: (id: string): string | null => {
      const state = get()
      const workflow = state.workflows.find((w) => w.id === id)
      if (!workflow) return null

      const exportData = {
        version: 1,
        type: 'creatorweave-workflow',
        exportedAt: new Date().toISOString(),
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          domain: workflow.domain,
          entryNodeId: workflow.entryNodeId,
          nodes: workflow.nodes,
          edges: workflow.edges,
        },
      }

      return JSON.stringify(exportData, null, 2)
    },

    importWorkflow: async (json: string): Promise<CustomWorkflowTemplate | null> => {
      try {
        const data = JSON.parse(json)

        // Validate format
        if (data.type !== 'creatorweave-workflow') {
          throw new Error('Invalid workflow file format')
        }

        if (data.version !== 1) {
          throw new Error('Unsupported workflow version')
        }

        const imported = data.workflow
        const now = Date.now()

        // Create new workflow with new ID
        const workflow: CustomWorkflowTemplate = {
          id: generateWorkflowId(),
          name: imported.name || 'Imported Workflow',
          description: imported.description,
          domain: imported.domain || 'custom',
          entryNodeId: imported.entryNodeId || '',
          nodes: imported.nodes || [],
          edges: imported.edges || [],
          source: 'imported' as WorkflowSource,
          version: 1,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }

        await get().saveWorkflow(workflow)
        return workflow
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CustomWorkflowStore] importWorkflow error:', error)
        set({ error: errorMsg })
        return null
      }
    },

    getWorkflowById: (id: string): CustomWorkflowTemplate | null => {
      return get().workflows.find((w) => w.id === id) || null
    },

    searchWorkflows: (keyword: string): CustomWorkflowTemplate[] => {
      const lowerKeyword = keyword.toLowerCase()
      return get().workflows.filter(
        (w) =>
          w.name.toLowerCase().includes(lowerKeyword) ||
          (w.description?.toLowerCase().includes(lowerKeyword) ?? false)
      )
    },

    clearError: () => {
      set({ error: null })
    },
  }))
)

// Selector hooks for common queries
export const useActiveWorkflow = () =>
  useCustomWorkflowStore((state) => {
    if (!state.activeWorkflowId) return null
    return state.workflows.find((w) => w.id === state.activeWorkflowId) || null
  })

export const useWorkflowById = (id: string) =>
  useCustomWorkflowStore((state) => state.workflows.find((w) => w.id === id) || null)

export const useEnabledWorkflows = () =>
  useCustomWorkflowStore((state) => state.workflows.filter((w) => w.enabled))

export const useWorkflowsBySource = (source: WorkflowSource) =>
  useCustomWorkflowStore((state) => state.workflows.filter((w) => w.source === source))
