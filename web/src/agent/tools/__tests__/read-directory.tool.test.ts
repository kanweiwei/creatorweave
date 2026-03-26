import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { readDirectoryExecutor } from '../read-directory.tool'

const getActiveConversationMock = vi.fn()
const getCurrentHandleMock = vi.fn()
const resolveVfsTargetMock = vi.fn()

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

vi.mock('@/store/folder-access.store', () => ({
  useFolderAccessStore: {
    getState: () => ({
      getCurrentHandle: () => getCurrentHandleMock(),
    }),
  },
}))

vi.mock('../vfs-resolver', () => ({
  resolveVfsTarget: (...args: unknown[]) => resolveVfsTargetMock(...args),
}))

function createEmptyDirectoryHandle(name = 'root'): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      return
    },
    getDirectoryHandle: vi.fn(async () => createEmptyDirectoryHandle('child')),
  } as unknown as FileSystemDirectoryHandle
}

describe('read_directory tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActiveConversationMock.mockResolvedValue(undefined)
    getCurrentHandleMock.mockReturnValue(null)
  })

  it('falls back to folder-access current handle when context handle is missing', async () => {
    getCurrentHandleMock.mockReturnValue(createEmptyDirectoryHandle())

    const result = await readDirectoryExecutor(
      { pattern: '**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    expect(result).toContain('No files matching pattern')
    expect(result).not.toContain('No directory selected.')
  })

  it('returns no-directory error when all handle sources are unavailable', async () => {
    const result = await readDirectoryExecutor(
      { pattern: '**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('No directory selected.')
  })

  it('supports glob scans on vfs agents namespace', async () => {
    const getDirectoryHandle = vi.fn(async () => ({
      handle: createEmptyDirectoryHandle('agent-root'),
      exists: false,
    }))
    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: '',
      agentId: 'default',
      projectId: 'project-1',
      agentManager: {
        getDirectoryHandle,
      },
    })

    const result = await readDirectoryExecutor(
      { path: 'vfs://agents/default', pattern: 'src/**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    expect(result).toContain('No files matching pattern')
    expect(getDirectoryHandle).toHaveBeenCalledWith('default', 'src', { allowMissing: true })
  })
})
