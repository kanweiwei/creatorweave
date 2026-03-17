import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { commitChangesExecutor, rollbackChangesetExecutor } from '../changeset.tool'

const commitDraftChangesetMock = vi.fn()
const rollbackChangesetMock = vi.fn()
const updateCurrentCountsMock = vi.fn()
const refreshPendingChangesMock = vi.fn()
const getActiveWorkspaceMock = vi.fn()

vi.mock('@/store/workspace.store', () => ({
  getActiveWorkspace: () => getActiveWorkspaceMock(),
  useWorkspaceStore: {
    getState: () => ({
      updateCurrentCounts: updateCurrentCountsMock,
      refreshPendingChanges: refreshPendingChangesMock,
    }),
  },
}))

const context: ToolContext = {
  directoryHandle: null,
}

describe('changeset tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateCurrentCountsMock.mockResolvedValue(undefined)
    refreshPendingChangesMock.mockResolvedValue(undefined)
  })

  it('checkpoint returns committed payload when draft exists', async () => {
    commitDraftChangesetMock.mockResolvedValue({ changesetId: 'cs_1', opCount: 3 })
    getActiveWorkspaceMock.mockResolvedValue({
      workspace: { commitDraftChangeset: commitDraftChangesetMock },
    })

    const result = await commitChangesExecutor({ summary: 'batch update' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.committed).toBe(true)
    expect(parsed.changesetId).toBe('cs_1')
    expect(parsed.opCount).toBe(3)
  })

  it('checkpoint returns no-op when no draft exists', async () => {
    commitDraftChangesetMock.mockResolvedValue(null)
    getActiveWorkspaceMock.mockResolvedValue({
      workspace: { commitDraftChangeset: commitDraftChangesetMock },
    })

    const result = await commitChangesExecutor({}, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.committed).toBe(false)
  })

  it('revert_checkpoint validates required checkpoint_id', async () => {
    const result = await rollbackChangesetExecutor({}, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('checkpoint_id is required')
  })

  it('revert_checkpoint returns unresolved paths', async () => {
    rollbackChangesetMock.mockResolvedValue({ reverted: 1, unresolved: ['src/a.ts'] })
    getActiveWorkspaceMock.mockResolvedValue({
      workspace: { rollbackChangeset: rollbackChangesetMock },
    })

    const result = await rollbackChangesetExecutor({ checkpoint_id: 'cs_1' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(false)
    expect(parsed.reverted).toBe(1)
    expect(parsed.unresolved).toEqual(['src/a.ts'])
  })
})
