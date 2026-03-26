import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { writeExecutor } from '../io.tool'

const writeFileMock = vi.fn()
const getPendingChangesMock = vi.fn(() => [])
const hasCachedFileMock = vi.fn(() => false)
const resolveVfsTargetMock = vi.fn()

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      writeFile: writeFileMock,
      getPendingChanges: getPendingChangesMock,
      hasCachedFile: hasCachedFileMock,
      readFile: vi.fn(),
    }),
  },
}))

vi.mock('@/store/remote.store', () => ({
  useRemoteStore: {
    getState: () => ({
      session: null,
    }),
  },
}))

vi.mock('../vfs-resolver', () => ({
  resolveVfsTarget: (...args: unknown[]) => resolveVfsTargetMock(...args),
}))

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    directoryHandle: null,
    projectId: 'project-1',
    currentAgentId: 'default',
    ...overrides,
  }
}

describe('io write tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('auto-creates missing agent for single write to agents namespace', async () => {
    const hasAgentMock = vi.fn(async () => false)
    const createAgentMock = vi.fn(async () => ({
      id: 'novel-editor',
    }))
    const readPathMock = vi.fn(async () => null)
    const writePathMock = vi.fn(async () => {})

    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: 'SOUL.md',
      agentId: 'novel-editor',
      projectId: 'project-1',
      agentManager: {
        hasAgent: hasAgentMock,
        createAgent: createAgentMock,
        readPath: readPathMock,
        writePath: writePathMock,
      },
    })

    const result = await writeExecutor(
      {
        path: 'vfs://agents/novel-editor/SOUL.md',
        content: 'soul',
      },
      makeContext()
    )

    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(createAgentMock).toHaveBeenCalledTimes(1)
    expect(writePathMock).toHaveBeenCalledWith('novel-editor', 'SOUL.md', 'soul')
  })

  it('auto-creates missing agent once for batch writes to agents namespace', async () => {
    const hasAgentMock = vi.fn(async () => false)
    const createAgentMock = vi.fn(async () => ({
      id: 'novel-editor',
    }))
    const readPathMock = vi.fn(async () => '# old')
    const writePathMock = vi.fn(async () => {})

    resolveVfsTargetMock.mockImplementation(async (path: string) => {
      const relPath = path.replace(/^vfs:\/\/agents\/[^/]+\//, '')
      return {
        kind: 'agent',
        path: relPath,
        agentId: 'novel-editor',
        projectId: 'project-1',
        agentManager: {
          hasAgent: hasAgentMock,
          createAgent: createAgentMock,
          readPath: readPathMock,
          writePath: writePathMock,
        },
      }
    })

    const result = await writeExecutor(
      {
        files: [
          { path: 'vfs://agents/novel-editor/SOUL.md', content: 'soul' },
          { path: 'vfs://agents/novel-editor/IDENTITY.md', content: 'identity' },
          { path: 'vfs://agents/novel-editor/AGENTS.md', content: 'agents' },
        ],
      },
      makeContext()
    )

    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.failed).toBe(0)
    expect(createAgentMock).toHaveBeenCalledTimes(1)
    expect(createAgentMock).toHaveBeenCalledWith('novel-editor')
    expect(writePathMock).toHaveBeenCalledTimes(3)
  })
})
