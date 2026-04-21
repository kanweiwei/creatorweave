import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubagentRepository } from '../subagent.repository'

const hoisted = vi.hoisted(() => {
  const db = {
    queryAll: vi.fn(),
    queryFirst: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(async (callback: () => Promise<void>) => callback()),
  }
  return { db }
})

vi.mock('../../sqlite-database', async () => {
  const actual = await vi.importActual<typeof import('../../sqlite-database')>(
    '../../sqlite-database'
  )
  return {
    ...actual,
    getSQLiteDB: () => hoisted.db,
  }
})

describe('SubagentRepository', () => {
  beforeEach(() => {
    hoisted.db.queryAll.mockReset()
    hoisted.db.queryFirst.mockReset()
    hoisted.db.execute.mockReset()
    hoisted.db.transaction.mockReset()
    hoisted.db.transaction.mockImplementation(async (callback: () => Promise<void>) => callback())
  })

  it('returns applied=true when CAS transition updates one row', async () => {
    hoisted.db.queryFirst
      .mockResolvedValueOnce({ count: 1 }) // SELECT changes()
      .mockResolvedValueOnce(null)

    const repo = new SubagentRepository()
    const result = await repo.transitionStatus({
      workspaceId: 'w1',
      agentId: 'a1',
      fromStatus: ['pending', 'running'],
      toStatus: 'completed',
      mode: 'act',
      messages: [],
      queue: [],
      stopped: false,
      updated_at: 1,
      last_activity_at: 1,
    })

    expect(result.applied).toBe(true)
    expect(hoisted.db.execute).toHaveBeenCalledTimes(1)
    const sql = hoisted.db.execute.mock.calls[0]?.[0] as string
    expect(sql).toContain('status IN (?, ?)')
  })

  it('returns currentStatus when CAS transition conflicts', async () => {
    hoisted.db.queryFirst
      .mockResolvedValueOnce({ count: 0 }) // SELECT changes()
      .mockResolvedValueOnce({ status: 'killed' }) // SELECT status

    const repo = new SubagentRepository()
    const result = await repo.transitionStatus({
      workspaceId: 'w1',
      agentId: 'a1',
      fromStatus: 'running',
      toStatus: 'completed',
      mode: 'act',
      messages: [],
      queue: [],
      stopped: false,
      updated_at: 2,
      last_activity_at: 2,
    })

    expect(result.applied).toBe(false)
    expect(result.currentStatus).toBe('killed')
    expect(hoisted.db.queryFirst).toHaveBeenCalledTimes(2)
  })

  it('getStatus returns null when row is missing', async () => {
    hoisted.db.queryFirst.mockResolvedValueOnce(null)

    const repo = new SubagentRepository()
    const status = await repo.getStatus('w1', 'missing')

    expect(status).toBeNull()
  })

  it('saveBatch uses upsert without workspace-wide delete', async () => {
    const repo = new SubagentRepository()
    await repo.saveBatch('w1', [
      {
        agentId: 'a1',
        workspaceId: 'w1',
        description: 'desc',
        status: 'pending',
        mode: 'act',
        messages: [],
        queue: [],
        stopped: false,
        created_at: 1,
        updated_at: 1,
        last_activity_at: 1,
      },
    ])

    expect(hoisted.db.transaction).toHaveBeenCalledTimes(1)
    expect(hoisted.db.execute).toHaveBeenCalledTimes(1)
    const sql = hoisted.db.execute.mock.calls[0]?.[0] as string
    expect(sql).toContain('ON CONFLICT(agent_id) DO UPDATE SET')
    expect(sql).not.toContain('DELETE FROM subagent_tasks')
  })
})
