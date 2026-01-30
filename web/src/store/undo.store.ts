/**
 * Undo store - exposes undo manager state to React components.
 */

import { create } from 'zustand'
import type { FileModification } from '@/undo/undo-types'
import { getUndoManager } from '@/undo/undo-manager'

interface UndoState {
  /** All modifications (newest first) */
  modifications: FileModification[]
  /** Active (not undone) count */
  activeCount: number

  // Actions
  refresh: () => void
  undo: (modId: string) => Promise<boolean>
  clear: () => void
}

export const useUndoStore = create<UndoState>()((set) => {
  const manager = getUndoManager()

  // Auto-refresh when manager changes
  manager.subscribe(() => {
    set({
      modifications: manager.getModifications(),
      activeCount: manager.activeCount,
    })
  })

  return {
    modifications: [],
    activeCount: 0,

    refresh: () => {
      set({
        modifications: manager.getModifications(),
        activeCount: manager.activeCount,
      })
    },

    undo: async (modId: string) => {
      const result = await manager.undo(modId)
      return result
    },

    clear: () => {
      manager.clear()
    },
  }
})
