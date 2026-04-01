import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

describe('WorkspaceRuntime baseline mtime', () => {
  it('uses native mtime as baseline when directory handle is provided', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.metadata = { lastAccessedAt: 0 }
    runtime.filesIndex = new Set<string>()

    runtime.hasFileInIndex = vi.fn(() => true)
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'old-opfs',
      mtime: 111,
      size: 10,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'old-native',
      metadata: {
        path: 'src/a.ts',
        mtime: 222,
        size: 10,
        contentType: 'text',
      },
    }))
    runtime.writeToFilesDir = vi.fn(async () => {})
    runtime.saveMetadata = vi.fn(async () => {})
    runtime.pendingManager = {
      markAsCreated: vi.fn(async () => {}),
      add: vi.fn(async () => {}),
    }

    await runtime.writeFile('src/a.ts', 'next-content', {} as FileSystemDirectoryHandle)

    expect(runtime.pendingManager.add).toHaveBeenCalledWith('src/a.ts', 222)
    expect(runtime.pendingManager.markAsCreated).not.toHaveBeenCalled()
  })
})
