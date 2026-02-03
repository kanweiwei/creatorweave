/* eslint-disable */
// @ts-nocheck - Mock objects don't match exact types but work correctly at runtime
/**
 * useUndoStore Unit Tests
 *
 * Tests for the undo store state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { UndoRecord } from '@/opfs/types/opfs-types'

// Create mock objects using hoisted - these must be defined inline, not via function
const mockWorkspace = vi.hoisted(() => ({
  getUndoRecords: vi.fn(() => []),
  undo: vi.fn().mockResolvedValue(true),
  redo: vi.fn().mockResolvedValue(true),
}))

const mockLegacyManager = vi.hoisted(() => ({
  getModifications: vi.fn(() => []),
  activeCount: 0,
  subscribe: vi.fn((_callback: () => void) => {
    return () => {}
  }),
  clear: vi.fn(),
  subscribeWasCalled: false as boolean,
}))

// Session manager mock needs to reference mockWorkspace
// We'll update it in beforeEach instead
const mockSessionManager = vi.hoisted(() => ({
  getSession: vi.fn(() => Promise.resolve(mockWorkspace as any)),
}))

const mockSessionStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({
    activeSessionId: 'session-1',
    updateCurrentCounts: vi.fn(),
  })),
}))

// Setup mocks before imports
vi.mock('@/undo/undo-manager', () => ({
  getUndoManager: vi.fn(() => {
    // Track that subscribe was called during module init
    mockLegacyManager.subscribe = vi.fn((_callback: () => void) => {
      mockLegacyManager.subscribeWasCalled = true
      return () => {}
    })
    return mockLegacyManager
  }),
}))

vi.mock('@/opfs/session', () => ({
  getSessionManager: vi.fn(() => Promise.resolve(mockSessionManager)),
}))

vi.mock('../session.store', () => ({
  useSessionStore: mockSessionStore,
}))

// Import after mocks are set up
import { useUndoStore } from '../undo.store'

describe('useUndoStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useUndoStore.setState({
      modifications: [],
      undoRecords: [],
      activeCount: 0,
      currentSessionId: null,
    })

    // Clear mock call history
    mockWorkspace.getUndoRecords.mockClear()
    mockWorkspace.undo.mockClear()
    mockWorkspace.redo.mockClear()
    mockLegacyManager.getModifications.mockClear()
    mockLegacyManager.clear.mockClear()

    // Reset mocks - update session manager to return correct workspace
    mockSessionManager.getSession.mockResolvedValue(mockWorkspace as any)
    mockWorkspace.getUndoRecords.mockReturnValue([])
    mockWorkspace.undo.mockResolvedValue(true)
    mockWorkspace.redo.mockResolvedValue(true)
    mockLegacyManager.getModifications.mockReturnValue([])
    mockLegacyManager.activeCount = 0
    mockSessionStore.getState.mockReturnValue({
      activeSessionId: 'session-1',
      updateCurrentCounts: vi.fn(),
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useUndoStore.getState()

      expect(state.modifications).toEqual([])
      expect(state.undoRecords).toEqual([])
      expect(state.activeCount).toBe(0)
      expect(state.currentSessionId).toBe(null)
    })
  })

  describe('refresh', () => {
    it('should load undo records for active session', async () => {
      const mockRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
        {
          id: 'undo-2',
          type: 'create',
          path: '/test/file2.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '',
          newContentPath: '/test/file2.txt',
        },
      ]

      mockWorkspace.getUndoRecords.mockReturnValue(mockRecords)

      const { refresh } = useUndoStore.getState()
      await refresh()

      const state = useUndoStore.getState()
      expect(state.undoRecords).toEqual(mockRecords)
      expect(state.currentSessionId).toBe('session-1')
      expect(state.activeCount).toBe(2)
    })

    it('should handle undone records correctly', async () => {
      const mockRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
        {
          id: 'undo-2',
          type: 'modify',
          path: '/test/file2.txt',
          timestamp: Date.now(),
          undone: true,
          oldContentPath: '/test/file2.old.txt',
          newContentPath: '/test/file2.txt',
        },
      ]

      mockWorkspace.getUndoRecords.mockReturnValue(mockRecords)

      const { refresh } = useUndoStore.getState()
      await refresh()

      expect(useUndoStore.getState().activeCount).toBe(1)
    })

    it('should clear state when no active session', async () => {
      mockSessionStore.getState.mockReturnValue({
        activeSessionId: null,
        updateCurrentCounts: vi.fn(),
      })

      const { refresh } = useUndoStore.getState()
      await refresh()

      const state = useUndoStore.getState()
      expect(state.undoRecords).toEqual([])
      expect(state.currentSessionId).toBe(null)
    })

    it('should handle missing workspace gracefully', async () => {
      mockSessionManager.getSession.mockResolvedValue(null)

      const { refresh } = useUndoStore.getState()
      await refresh()

      const state = useUndoStore.getState()
      expect(state.undoRecords).toEqual([])
      expect(state.activeCount).toBe(0)
    })
  })

  describe('undo', () => {
    it('should have mock workspace correctly set up', async () => {
      // Verify mock setup
      const workspace = await mockSessionManager.getSession('session-1')
      expect(workspace).toBeDefined()

      const result = await mockWorkspace.undo('test-id')
      expect(result).toBe(true)
    })

    it('should undo a record and refresh state', async () => {
      const afterRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: true,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
      ]

      // Clear any previous mock setup and set the expected return value
      mockWorkspace.getUndoRecords.mockClear()
      mockWorkspace.getUndoRecords.mockReturnValue(afterRecords)

      const { undo } = useUndoStore.getState()
      const result = await undo('undo-1')

      expect(result).toBe(true)
      expect(mockWorkspace.undo).toHaveBeenCalledWith('undo-1')

      const state = useUndoStore.getState()
      // Verify state was updated (using the mock return value)
      expect(state.undoRecords).toEqual(afterRecords)
      expect(state.activeCount).toBe(0)
    })

    it('should return false when no active session', async () => {
      mockSessionStore.getState.mockReturnValue({
        activeSessionId: null,
        updateCurrentCounts: vi.fn(),
      })

      const { undo } = useUndoStore.getState()
      const result = await undo('undo-1')

      expect(result).toBe(false)
    })

    it('should return false when session not found', async () => {
      mockSessionManager.getSession.mockResolvedValue(null)

      const { undo } = useUndoStore.getState()
      const result = await undo('undo-1')

      expect(result).toBe(false)
    })

    it('should handle undo errors gracefully', async () => {
      mockWorkspace.undo.mockRejectedValue(new Error('Undo failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { undo } = useUndoStore.getState()
      const result = await undo('undo-1')

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('redo', () => {
    it('should redo a record and refresh state', async () => {
      const afterRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
      ]

      // Clear any previous mock setup and set the expected return value
      mockWorkspace.getUndoRecords.mockClear()
      mockWorkspace.getUndoRecords.mockReturnValue(afterRecords)

      const { redo } = useUndoStore.getState()
      const result = await redo('undo-1')

      expect(result).toBe(true)
      expect(mockWorkspace.redo).toHaveBeenCalledWith('undo-1')

      const state = useUndoStore.getState()
      // Verify state was updated (using the mock return value)
      expect(state.undoRecords).toEqual(afterRecords)
      expect(state.activeCount).toBe(1)
    })

    it('should return false when no active session', async () => {
      mockSessionStore.getState.mockReturnValue({
        activeSessionId: null,
        updateCurrentCounts: vi.fn(),
      })

      const { redo } = useUndoStore.getState()
      const result = await redo('undo-1')

      expect(result).toBe(false)
    })
  })

  describe('undoLatest', () => {
    it('should undo the most recent record', async () => {
      const mockRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
        {
          id: 'undo-2',
          type: 'create',
          path: '/test/file2.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '',
          newContentPath: '/test/file2.txt',
        },
      ]

      // Populate store state directly
      useUndoStore.setState({ undoRecords: mockRecords as any })

      const { undoLatest } = useUndoStore.getState()
      const result = await undoLatest()

      expect(result).toBe(true)
      expect(mockWorkspace.undo).toHaveBeenCalledWith('undo-1')
    })

    it('should return false when no records', async () => {
      // Store already has empty state from beforeEach
      const { undoLatest } = useUndoStore.getState()
      const result = await undoLatest()

      expect(result).toBe(false)
      expect(mockWorkspace.undo).not.toHaveBeenCalled()
    })
  })

  describe('redoLatest', () => {
    it('should redo the most recently undone record', async () => {
      const mockRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
        {
          id: 'undo-2',
          type: 'create',
          path: '/test/file2.txt',
          timestamp: Date.now(),
          undone: true,
          oldContentPath: '',
          newContentPath: '/test/file2.txt',
        },
      ]

      // Populate store state directly
      useUndoStore.setState({ undoRecords: mockRecords as any })

      const { redoLatest } = useUndoStore.getState()
      const result = await redoLatest()

      expect(result).toBe(true)
      expect(mockWorkspace.redo).toHaveBeenCalledWith('undo-2')
    })

    it('should return false when no undone records', async () => {
      const mockRecords: UndoRecord[] = [
        {
          id: 'undo-1',
          type: 'modify',
          path: '/test/file.txt',
          timestamp: Date.now(),
          undone: false,
          oldContentPath: '/test/file.old.txt',
          newContentPath: '/test/file.txt',
        },
      ]

      useUndoStore.setState({ undoRecords: mockRecords as any })

      const { redoLatest } = useUndoStore.getState()
      const result = await redoLatest()

      expect(result).toBe(false)
      expect(mockWorkspace.redo).not.toHaveBeenCalled()
    })

    it('should return false when no records', async () => {
      // Store already has empty state from beforeEach
      const { redoLatest } = useUndoStore.getState()
      const result = await redoLatest()

      expect(result).toBe(false)
    })
  })

  describe('clear', () => {
    it('should clear undo records and reset active count', () => {
      useUndoStore.setState({
        undoRecords: [
          {
            id: 'undo-1',
            type: 'modify',
            path: '/test/file.txt',
            timestamp: Date.now(),
            undone: false,
            oldContentPath: '/test/file.old.txt',
            newContentPath: '/test/file.txt',
          },
        ] as any,
        activeCount: 1,
      })

      const { clear } = useUndoStore.getState()
      clear()

      const state = useUndoStore.getState()
      expect(state.undoRecords).toEqual([])
      expect(state.activeCount).toBe(0)

      expect(mockLegacyManager.clear).toHaveBeenCalled()
    })
  })

  describe('legacy manager integration', () => {
    it('should subscribe to legacy manager updates', () => {
      // Subscribe was called during module initialization
      expect(mockLegacyManager.subscribeWasCalled).toBe(true)
    })

    // Note: Testing actual callback updates is complex due to closure over the original manager
    // The subscription is verified above; functional testing is covered by integration tests
  })
})
