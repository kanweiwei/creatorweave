import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteDatabaseManager } from '../sqlite-database'

class FakeWorker {
  static requests: Array<{ type: string; sql?: string; id?: string }> = []
  static inTransaction = false
  static beginWhileInTransaction = 0

  onmessage: ((event: MessageEvent<any>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor(_url: URL, _options?: WorkerOptions) {}

  postMessage(request: any) {
    FakeWorker.requests.push(request)
    queueMicrotask(() => {
      if (request.type === 'init') {
        this.onmessage?.({
          data: { type: 'init', id: request.id, success: true, mode: 'opfs' },
        } as MessageEvent)
        return
      }

      if (request.type === 'beginTransaction') {
        if (FakeWorker.inTransaction) {
          FakeWorker.beginWhileInTransaction += 1
          this.onmessage?.({
            data: {
              type: 'beginTransaction',
              id: request.id,
              error: 'cannot start a transaction within a transaction',
            },
          } as MessageEvent)
          return
        }
        FakeWorker.inTransaction = true
      }

      if (request.type === 'commit' || request.type === 'rollback') {
        FakeWorker.inTransaction = false
      }

      this.onmessage?.({ data: { type: request.type, id: request.id } } as MessageEvent)
    })
  }

  terminate() {}
}

describe('SQLiteDatabaseManager transaction serialization', () => {
  const OriginalWorker = globalThis.Worker
  const originalCrossOriginIsolated = (globalThis as any).crossOriginIsolated

  beforeEach(() => {
    const managerCtor = SQLiteDatabaseManager as any
    const globals = globalThis as any
    managerCtor.instance = null
    globals.Worker = FakeWorker as any
    globals.crossOriginIsolated = true
    FakeWorker.requests = []
    FakeWorker.inTransaction = false
    FakeWorker.beginWhileInTransaction = 0
  })

  afterEach(async () => {
    await SQLiteDatabaseManager.getInstance()
      .close()
      .catch(() => undefined)
    const managerCtor = SQLiteDatabaseManager as any
    const globals = globalThis as any
    managerCtor.instance = null
    globals.Worker = OriginalWorker
    globals.crossOriginIsolated = originalCrossOriginIsolated
  })

  it('serializes concurrent transactions so a second BEGIN is not sent before the first COMMIT', async () => {
    const db = SQLiteDatabaseManager.getInstance()
    await db.initialize()

    let releaseFirst!: () => void
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let firstCallbackStarted!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      firstCallbackStarted = resolve
    })

    const first = db.transaction(async () => {
      firstCallbackStarted()
      await firstCanFinish
      await db.execute('INSERT INTO test VALUES (1)')
    })

    await firstStarted

    let secondCallbackRan = false
    const second = db.transaction(async () => {
      secondCallbackRan = true
      await db.execute('INSERT INTO test VALUES (2)')
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(secondCallbackRan).toBe(false)
    expect(FakeWorker.beginWhileInTransaction).toBe(0)

    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(secondCallbackRan).toBe(true)
  })
})
