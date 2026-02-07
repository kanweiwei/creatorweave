/**
 * Workspace Preferences Store - manages UI layout and user preferences.
 *
 * Persists to localStorage using zustand persist middleware.
 * Handles panel sizes, active panels, recent files, and display settings.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'

// Enable Immer Map/Set support
enableMapSet()

/**
 * Recent file entry with metadata
 */
export interface RecentFile {
  path: string
  timestamp: number
  directoryHandleName?: string
}

/**
 * Panel size configuration
 */
export interface PanelSizes {
  sidebarWidth: number // px
  conversationRatio: number // percentage
  previewRatio: number // percentage
}

/**
 * Panel state configuration
 */
export interface PanelState {
  sidebarCollapsed: boolean
  activeResourceTab: 'files' | 'plugins' | 'changes'
  toolsPanelOpen: boolean
  skillsManagerOpen: boolean
  quickActionsOpen: boolean
}

/**
 * Display preferences
 */
export interface DisplayPreferences {
  fontSize: 'small' | 'medium' | 'large'
  showLineNumbers: boolean
  wordWrap: boolean
  showMiniMap: boolean
}

/**
 * Complete workspace preferences
 */
export interface WorkspacePreferences {
  panelSizes: PanelSizes
  panelState: PanelState
  display: DisplayPreferences
  recentFiles: RecentFile[]
  onboardingCompleted: boolean
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: WorkspacePreferences = {
  panelSizes: {
    sidebarWidth: 260,
    conversationRatio: 50,
    previewRatio: 60,
  },
  panelState: {
    sidebarCollapsed: false,
    activeResourceTab: 'files',
    toolsPanelOpen: false,
    skillsManagerOpen: false,
    quickActionsOpen: false,
  },
  display: {
    fontSize: 'medium',
    showLineNumbers: true,
    wordWrap: false,
    showMiniMap: true,
  },
  recentFiles: [],
  onboardingCompleted: false,
}

/**
 * Workspace preferences store state
 */
interface WorkspacePreferencesState extends WorkspacePreferences {
  // Panel sizes actions
  setSidebarWidth: (width: number) => void
  setConversationRatio: (ratio: number) => void
  setPreviewRatio: (ratio: number) => void
  resetPanelSizes: () => void

  // Panel state actions
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveResourceTab: (tab: 'files' | 'plugins' | 'changes') => void
  setToolsPanelOpen: (open: boolean) => void
  setSkillsManagerOpen: (open: boolean) => void
  setQuickActionsOpen: (open: boolean) => void

  // Display preferences actions
  setFontSize: (size: 'small' | 'medium' | 'large') => void
  setShowLineNumbers: (show: boolean) => void
  setWordWrap: (wrap: boolean) => void
  setShowMiniMap: (show: boolean) => void

  // Recent files actions
  addRecentFile: (file: RecentFile) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void

  // Onboarding actions
  setOnboardingCompleted: (completed: boolean) => void

  // Reset actions
  resetAll: () => void
  resetToDefaults: () => void
}

export const useWorkspacePreferencesStore = create<WorkspacePreferencesState>()(
  persist(
    immer((set) => ({
      ...DEFAULT_PREFERENCES,

      // Panel sizes actions
      setSidebarWidth: (width) =>
        set((state) => {
          state.panelSizes.sidebarWidth = Math.max(200, Math.min(400, width))
        }),

      setConversationRatio: (ratio) =>
        set((state) => {
          state.panelSizes.conversationRatio = Math.max(20, Math.min(80, ratio))
        }),

      setPreviewRatio: (ratio) =>
        set((state) => {
          state.panelSizes.previewRatio = Math.max(30, Math.min(80, ratio))
        }),

      resetPanelSizes: () =>
        set((state) => {
          state.panelSizes = { ...DEFAULT_PREFERENCES.panelSizes }
        }),

      // Panel state actions
      setSidebarCollapsed: (collapsed) =>
        set((state) => {
          state.panelState.sidebarCollapsed = collapsed
        }),

      setActiveResourceTab: (tab) =>
        set((state) => {
          state.panelState.activeResourceTab = tab
        }),

      setToolsPanelOpen: (open) =>
        set((state) => {
          state.panelState.toolsPanelOpen = open
        }),

      setSkillsManagerOpen: (open) =>
        set((state) => {
          state.panelState.skillsManagerOpen = open
        }),

      setQuickActionsOpen: (open) =>
        set((state) => {
          state.panelState.quickActionsOpen = open
        }),

      // Display preferences actions
      setFontSize: (size) =>
        set((state) => {
          state.display.fontSize = size
        }),

      setShowLineNumbers: (show) =>
        set((state) => {
          state.display.showLineNumbers = show
        }),

      setWordWrap: (wrap) =>
        set((state) => {
          state.display.wordWrap = wrap
        }),

      setShowMiniMap: (show) =>
        set((state) => {
          state.display.showMiniMap = show
        }),

      // Recent files actions
      addRecentFile: (file) =>
        set((state) => {
          // Remove existing entry if present
          state.recentFiles = state.recentFiles.filter((f) => f.path !== file.path)
          // Add to beginning
          state.recentFiles.unshift(file)
          // Keep only 10 most recent
          if (state.recentFiles.length > 10) {
            state.recentFiles = state.recentFiles.slice(0, 10)
          }
        }),

      removeRecentFile: (path) =>
        set((state) => {
          state.recentFiles = state.recentFiles.filter((f) => f.path !== path)
        }),

      clearRecentFiles: () =>
        set((state) => {
          state.recentFiles = []
        }),

      // Onboarding actions
      setOnboardingCompleted: (completed) =>
        set((state) => {
          state.onboardingCompleted = completed
        }),

      // Reset actions
      resetAll: () =>
        set((state) => {
          Object.assign(state, DEFAULT_PREFERENCES)
        }),

      resetToDefaults: () =>
        set((state) => {
          state.panelSizes = { ...DEFAULT_PREFERENCES.panelSizes }
          state.display = { ...DEFAULT_PREFERENCES.display }
        }),
    })),
    {
      name: 'bfosa-workspace-preferences',
      version: 1,
    }
  )
)

// Export types
export type { WorkspacePreferencesState }
