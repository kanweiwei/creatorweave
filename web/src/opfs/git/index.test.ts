import { beforeEach, describe, expect, it, vi } from 'vitest'

const listSnapshotsMock = vi.fn()
const listSnapshotOpsMock = vi.fn()
const listPendingOpsMock = vi.fn()
const getSnapshotFileContentMock = vi.fn()
const listSnapshotFilesMock = vi.fn()

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => ({
    listSnapshots: listSnapshotsMock,
    listSnapshotOps: listSnapshotOpsMock,
    listPendingOps: listPendingOpsMock,
    getSnapshotFileContent: getSnapshotFileContentMock,
    listSnapshotFiles: listSnapshotFilesMock,
  }),
}))

vi.mock('@/sqlite', () => ({
  getSQLiteDB: () => ({
    queryFirst: vi.fn(),
  }),
}))

import { formatGitDiff, gitDiff } from './index'
import { gitLog } from './index'
import { formatGitShow, gitShow } from './index'

describe('opfs/git gitDiff', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listSnapshotOpsMock.mockReset()
    listPendingOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listSnapshotFilesMock.mockReset()
  })

  it('returns real text line changes for snapshot mode', async () => {
    listSnapshotsMock.mockResolvedValue([
      { id: 'snap_new' },
      { id: 'snap_old' },
    ])
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op1',
        workspaceId: 'ws_1',
        snapshotId: 'snap_new',
        path: 'src/demo.txt',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_new',
      workspaceId: 'ws_1',
      path: 'src/demo.txt',
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'line1\nold line\nline3\n',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'line1\nnew line\nline3\n',
      afterContentBlob: null,
    })

    const result = await gitDiff('ws_1', { mode: 'snapshot', snapshotId: 'snap_new' })
    const rendered = formatGitDiff(result)

    expect(result.files).toHaveLength(1)
    expect(result.summary.insertions).toBeGreaterThanOrEqual(1)
    expect(result.summary.deletions).toBeGreaterThanOrEqual(1)
    expect(rendered).toContain('-old line')
    expect(rendered).toContain('+new line')
  })

  it('marks binary snapshot changes clearly', async () => {
    listSnapshotsMock.mockResolvedValue([{ id: 'snap_bin' }])
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op_bin',
        workspaceId: 'ws_1',
        snapshotId: 'snap_bin',
        path: 'assets/logo.png',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_bin',
      workspaceId: 'ws_1',
      path: 'assets/logo.png',
      opType: 'modify',
      beforeContentKind: 'binary',
      beforeContentText: null,
      beforeContentBlob: new Uint8Array([1, 2, 3]),
      afterContentKind: 'binary',
      afterContentText: null,
      afterContentBlob: new Uint8Array([4, 5]),
    })

    const result = await gitDiff('ws_1', { mode: 'snapshot', snapshotId: 'snap_bin' })
    const rendered = formatGitDiff(result)

    expect(result.files).toHaveLength(1)
    expect(rendered).toContain('[binary files differ]')
  })
})

describe('opfs/git gitLog', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listSnapshotOpsMock.mockReset()
    listPendingOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listSnapshotFilesMock.mockReset()
  })

  it('filters snapshots by status', async () => {
    listSnapshotsMock.mockResolvedValue([
      {
        id: 's3',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'c',
        source: 'tool',
        createdAt: 3,
        committedAt: 3,
        opCount: 1,
      },
      {
        id: 's2',
        workspaceId: 'ws_1',
        status: 'approved',
        summary: 'b',
        source: 'tool',
        createdAt: 2,
        committedAt: 2,
        opCount: 1,
      },
      {
        id: 's1',
        workspaceId: 'ws_1',
        status: 'rolled_back',
        summary: 'a',
        source: 'tool',
        createdAt: 1,
        committedAt: 1,
        opCount: 1,
      },
    ])

    const result = await gitLog('ws_1', { status: 'approved', limit: 10 })

    expect(result.commits.map((c) => c.id)).toEqual(['s2'])
  })

  it('filters snapshots by path prefix and computes hasMore after filtering', async () => {
    listSnapshotsMock.mockResolvedValue([
      {
        id: 's3',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'c',
        source: 'tool',
        createdAt: 3,
        committedAt: 3,
        opCount: 1,
      },
      {
        id: 's2',
        workspaceId: 'ws_1',
        status: 'approved',
        summary: 'b',
        source: 'tool',
        createdAt: 2,
        committedAt: 2,
        opCount: 1,
      },
      {
        id: 's1',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'a',
        source: 'tool',
        createdAt: 1,
        committedAt: 1,
        opCount: 1,
      },
    ])

    listSnapshotOpsMock.mockImplementation(async (_workspaceId: string, snapshotId: string) => {
      if (snapshotId === 's3') {
        return [{ path: 'src/a.ts' }]
      }
      if (snapshotId === 's2') {
        return [{ path: 'docs/readme.md' }]
      }
      return [{ path: 'src/b.ts' }]
    })

    const result = await gitLog('ws_1', { path: 'src/', limit: 1 })

    expect(result.commits.map((c) => c.id)).toEqual(['s3'])
    expect(result.hasMore).toBe(true)
  })
})

describe('opfs/git gitShow', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listSnapshotOpsMock.mockReset()
    listPendingOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listSnapshotFilesMock.mockReset()
  })

  it('includes snapshot diff when includeDiff=true', async () => {
    listSnapshotsMock.mockResolvedValue([
      {
        id: 'snap_1',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'update demo',
        source: 'tool',
        createdAt: 1,
        committedAt: 1,
        opCount: 1,
      },
    ])
    listSnapshotFilesMock.mockResolvedValue([
      {
        path: 'src/demo.txt',
        opType: 'modify',
        createdAt: 1,
        beforeContentKind: 'text',
        beforeContentSize: 10,
        afterContentKind: 'text',
        afterContentSize: 12,
      },
    ])
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op_1',
        workspaceId: 'ws_1',
        snapshotId: 'snap_1',
        path: 'src/demo.txt',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_1',
      workspaceId: 'ws_1',
      path: 'src/demo.txt',
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'old line\n',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'new line\n',
      afterContentBlob: null,
    })

    const result = await gitShow('ws_1', 'snap_1', { includeDiff: true })

    expect(result).not.toBeNull()
    expect(result?.diff).toBeDefined()
    const rendered = formatGitShow(result!)
    expect(rendered).toContain('Diff:')
    expect(rendered).toContain('-old line')
    expect(rendered).toContain('+new line')
  })
})
