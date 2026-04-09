import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { searchDefinition, searchExecutor } from '../search.tool'

const searchInDirectoryMock = vi.fn()
const getFilesDirMock = vi.fn()
const getActiveConversationMock = vi.fn()
const getWorkspaceManagerMock = vi.fn()

vi.mock('@/workers/search-worker-manager', () => ({
  getSearchWorkerManager: () => ({
    searchInDirectory: searchInDirectoryMock,
  }),
}))

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => getWorkspaceManagerMock(),
}))

const directoryHandle = {
  getFileHandle: vi.fn(),
  getDirectoryHandle: vi.fn(),
} as unknown as FileSystemDirectoryHandle

const context: ToolContext = { directoryHandle }

function unwrapOk(result: string) {
  const parsed = JSON.parse(result)
  expect(parsed.ok).toBe(true)
  expect(parsed.version).toBe(2)
  return parsed.data
}

function unwrapError(result: string) {
  const parsed = JSON.parse(result)
  expect(parsed.ok).toBe(false)
  expect(parsed.version).toBe(2)
  return parsed.error
}

describe('search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchInDirectoryMock.mockResolvedValue({
      results: [{ path: 'src/a.ts', line: 3, column: 8, match: 'TODO', preview: 'const x = TODO' }],
      totalMatches: 1,
      scannedFiles: 4,
      skippedFiles: 1,
      truncated: false,
      deadlineExceeded: false,
    })
  })

  it('requires query', async () => {
    const result = await searchExecutor({ mode: 'literal' }, context)
    const error = unwrapError(result)
    expect(error.message).toContain('query is required')
  })

  it('declares query and mode as required in schema', () => {
    expect(searchDefinition.function.parameters.required).toEqual(['query', 'mode'])
  })

  it('requires mode', async () => {
    const result = await searchExecutor({ query: 'TODO' }, context)
    const error = unwrapError(result)
    expect(error.message).toContain('mode is required')
  })

  it('searches with provided directory handle', async () => {
    const result = await searchExecutor({ query: 'TODO', mode: 'literal', max_results: 20 }, context)
    const data = unwrapOk(result)

    expect(data.totalMatches).toBe(1)
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ query: 'TODO', regex: false, maxResults: 20 })
    )
  })

  it('falls back to active conversation files dir in opfs-only mode', async () => {
    // Mock getNativeDirectoryHandle returning null (no native directory)
    // and getFilesDir returning the directory handle (OPFS-only mode)
    getFilesDirMock.mockResolvedValue(directoryHandle)
    getActiveConversationMock.mockResolvedValue({
      conversation: {
        getNativeDirectoryHandle: vi.fn().mockResolvedValue(null),
        getFilesDir: getFilesDirMock,
        workspaceId: 'ws_1',
      },
      conversationId: 'conv_1',
    })

    // Mock workspace manager to return workspace with native dir = null
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn().mockResolvedValue({
        getNativeDirectoryHandle: vi.fn().mockResolvedValue(null),
        getFilesDir: getFilesDirMock,
      }),
    })

    const result = await searchExecutor({ query: 'TODO', mode: 'literal' }, { directoryHandle: null })
    unwrapOk(result)

    expect(getFilesDirMock).toHaveBeenCalled()
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ query: 'TODO', regex: false })
    )
  })

  it('returns error when no directory and no active conversation', async () => {
    getActiveConversationMock.mockResolvedValue(undefined)

    const result = await searchExecutor({ query: 'TODO', mode: 'literal' }, { directoryHandle: null })
    const error = unwrapError(result)

    expect(error.message).toContain('No active workspace')
  })

  it('rejects regex-like query when mode=literal', async () => {
    const result = await searchExecutor(
      {
        query: 'from.*project-fingerprint|from.*intelligence-coordinator',
        mode: 'literal',
      },
      context
    )
    const error = unwrapError(result)

    expect(error.message).toContain('query looks like regex')
    expect(error.hint).toContain('set mode="regex"')
    expect(searchInDirectoryMock).not.toHaveBeenCalled()
  })

  it('accepts regex-like query when mode=regex', async () => {
    const result = await searchExecutor(
      {
        query: 'Fingerprint|IntelligenceCoordinator|getFingerprintScanner|formatFingerprint',
        mode: 'regex',
      },
      context
    )
    unwrapOk(result)

    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({
        query: 'Fingerprint|IntelligenceCoordinator|getFingerprintScanner|formatFingerprint',
        regex: true,
      })
    )
  })

  it('returns structured path_not_found error from worker details', async () => {
    searchInDirectoryMock.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          code: 'path_not_found',
          message: 'Search path "web/src/agent" not found under current root "web"',
          requestedPath: 'web/src/agent',
          resolvedRootName: 'web',
        })
      )
    )

    const result = await searchExecutor(
      {
        query: 'ProjectFingerprint',
        mode: 'regex',
        path: 'web/src/agent',
      },
      context
    )
    const error = unwrapError(result)

    expect(error.code).toBe('path_not_found')
    expect(error.details.requestedPath).toBe('web/src/agent')
    expect(error.details.resolvedRootName).toBe('web')
    expect(error.hint).toContain('Try')
  })
})
