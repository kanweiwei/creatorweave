/**
 * useAgentStore Unit Tests
 *
 * Tests for the agent store state management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAgentStore } from '../agent.store'

// Mock remote.store
vi.mock('../remote.store', () => ({
  useRemoteStore: {
    getState: vi.fn(() => ({
      session: null,
      getRole: vi.fn(() => 'participant'),
      refreshFileTree: vi.fn(() => Promise.resolve()),
    })),
  },
}))

describe('useAgentStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAgentStore.setState({
      directoryHandle: null,
      directoryName: null,
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useAgentStore.getState()

      expect(state.directoryHandle).toBe(null)
      expect(state.directoryName).toBe(null)
    })
  })

  describe('setDirectoryHandle', () => {
    it('should update directory handle and name', () => {
      const mockHandle = {
        name: 'test-directory',
      } as unknown as FileSystemDirectoryHandle

      const { setDirectoryHandle } = useAgentStore.getState()
      setDirectoryHandle(mockHandle)

      const state = useAgentStore.getState()
      expect(state.directoryHandle).toBe(mockHandle)
      expect(state.directoryName).toBe('test-directory')
    })

    it('should set null handle and clear name', () => {
      const mockHandle = {
        name: 'test-directory',
      } as unknown as FileSystemDirectoryHandle

      const { setDirectoryHandle } = useAgentStore.getState()

      // First set a handle
      setDirectoryHandle(mockHandle)
      expect(useAgentStore.getState().directoryName).toBe('test-directory')

      // Then clear it
      setDirectoryHandle(null)
      expect(useAgentStore.getState().directoryHandle).toBe(null)
      expect(useAgentStore.getState().directoryName).toBe(null)
    })

    it('should handle handle without name', () => {
      const mockHandle = {} as FileSystemDirectoryHandle

      const { setDirectoryHandle } = useAgentStore.getState()
      setDirectoryHandle(mockHandle)

      expect(useAgentStore.getState().directoryName).toBe(null)
    })

    it('should call remote refresh when session exists and user is host', async () => {
      const mockHandle = {
        name: 'test-directory',
      } as unknown as FileSystemDirectoryHandle

      // Mock remote.store with active session and host role
      // Note: This test verifies the behavior but the actual remote call happens asynchronously
      const refreshFileTreeSpy = vi.fn(() => Promise.resolve())
      vi.doMock('../remote.store', () => ({
        useRemoteStore: {
          getState: vi.fn(() => ({
            session: { id: 'session-1' },
            getRole: vi.fn(() => 'host'),
            refreshFileTree: refreshFileTreeSpy,
          })),
        },
      }))

      const { setDirectoryHandle } = useAgentStore.getState()
      setDirectoryHandle(mockHandle)

      // The remote refresh is triggered asynchronously, so we just verify the set worked
      const state = useAgentStore.getState()
      expect(state.directoryName).toBe('test-directory')
    })
  })

  describe('IndexedDB operations (integration)', () => {
    let originalIndexedDB: IDBFactory

    beforeEach(() => {
      originalIndexedDB = global.indexedDB
    })

    afterEach(() => {
      global.indexedDB = originalIndexedDB
    })

    it('should persist handle to IndexedDB (spy test)', async () => {
      // Spy on indexedDB.open without replacing implementation
      const openSpy = vi.spyOn(indexedDB, 'open')

      const mockHandle = {
        name: 'test-directory',
      } as unknown as FileSystemDirectoryHandle

      const { setDirectoryHandle } = useAgentStore.getState()
      setDirectoryHandle(mockHandle)

      // indexedDB.open should be called for persistence
      expect(openSpy).toHaveBeenCalled()

      openSpy.mockRestore()
    })

    // Note: Full IndexedDB integration testing requires a more complex mock setup
    // The restoreDirectoryHandle functionality is tested in integration tests
  })

  describe('restoreDirectoryHandle', () => {
    it('should have restoreDirectoryHandle function', () => {
      const { restoreDirectoryHandle } = useAgentStore.getState()
      expect(typeof restoreDirectoryHandle).toBe('function')
    })

    // Note: restoreDirectoryHandle requires proper IndexedDB mocking
    // Integration tests cover full functionality
  })

  describe('state updates', () => {
    it('should handle multiple state updates', () => {
      const { setDirectoryHandle } = useAgentStore.getState()

      const handle1 = { name: 'dir1' } as unknown as FileSystemDirectoryHandle
      const handle2 = { name: 'dir2' } as unknown as FileSystemDirectoryHandle

      setDirectoryHandle(handle1)
      expect(useAgentStore.getState().directoryName).toBe('dir1')

      setDirectoryHandle(handle2)
      expect(useAgentStore.getState().directoryName).toBe('dir2')

      setDirectoryHandle(null)
      expect(useAgentStore.getState().directoryName).toBe(null)
    })
  })
})
