import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { readDirectoryExecutor } from '../read-directory.tool'

const getActiveWorkspaceMock = vi.fn()
const getCurrentHandleMock = vi.fn()

vi.mock('@/store/workspace.store', () => ({
  getActiveWorkspace: () => getActiveWorkspaceMock(),
}))

vi.mock('@/store/folder-access.store', () => ({
  useFolderAccessStore: {
    getState: () => ({
      getCurrentHandle: () => getCurrentHandleMock(),
    }),
  },
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
    getActiveWorkspaceMock.mockResolvedValue(undefined)
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
})
