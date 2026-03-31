import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkspaceManagerMock } = vi.hoisted(() => ({
  getWorkspaceManagerMock: vi.fn(),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: getWorkspaceManagerMock,
}))

import { useOPFSStore } from '../opfs.store'
import { useWorkspaceStore } from '../workspace.store'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('useOPFSStore refresh race', () => {
  beforeEach(() => {
    getWorkspaceManagerMock.mockReset()

    useWorkspaceStore.setState({
      activeWorkspaceId: null,
    })

    useOPFSStore.setState({
      workspaceId: null,
      pendingChanges: [],
      approvedNotSyncedPaths: new Set(),
      cachedPaths: [],
      error: null,
    })
  })

  it('ignores stale refresh result from previous workspace after switch', async () => {
    const workspaceA = {
      getPendingChanges: vi.fn(() => [{ id: 'a1', path: 'a.txt', type: 'modify', fsMtime: 1, timestamp: 1 }]),
      getCachedPaths: vi.fn(() => ['a.txt']),
      getApprovedNotSyncedPaths: vi.fn(async () => {
        await sleep(80)
        return new Set<string>(['a.txt'])
      }),
    }

    const workspaceB = {
      getPendingChanges: vi.fn(() => [{ id: 'b1', path: 'b.txt', type: 'modify', fsMtime: 1, timestamp: 1 }]),
      getCachedPaths: vi.fn(() => ['b.txt']),
      getApprovedNotSyncedPaths: vi.fn(async () => new Set<string>(['b.txt'])),
    }

    const getWorkspace = vi.fn(async (workspaceId: string) => {
      if (workspaceId === 'ws-a') return workspaceA
      if (workspaceId === 'ws-b') return workspaceB
      return null
    })

    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace,
    })

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-a' })
    const refreshA = useOPFSStore.getState().refresh()

    await sleep(5)
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-b' })
    const refreshB = useOPFSStore.getState().refresh()

    await Promise.all([refreshA, refreshB])

    const state = useOPFSStore.getState()
    expect(state.workspaceId).toBe('ws-b')
    expect(state.cachedPaths).toEqual(['b.txt'])
    expect(Array.from(state.approvedNotSyncedPaths)).toEqual(['b.txt'])
    expect(state.pendingChanges.map((item) => item.path)).toEqual(['b.txt'])
  })
})
