import { describe, expect, it } from 'vitest'
import {
  createWorkflowRunState,
  transitionWorkflowRunState,
  type WorkflowRunEvent,
} from '../workflow/run-state-machine'

function step(event: WorkflowRunEvent, rounds = 0, maxRounds = 2) {
  return transitionWorkflowRunState(createWorkflowRunState(maxRounds, rounds), event)
}

describe('transitionWorkflowRunState', () => {
  it('moves queued run to running on start event', () => {
    const next = step({ type: 'start' })
    expect(next.status).toBe('running')
  })

  it('marks run as passed when all nodes are complete', () => {
    const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
    const next = transitionWorkflowRunState(running, { type: 'all_nodes_passed' })
    expect(next.status).toBe('passed')
  })

  it('keeps run in running status and increments repair round when auto-repair is available', () => {
    const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
    const next = transitionWorkflowRunState(running, { type: 'review_failed' })

    expect(next.status).toBe('running')
    expect(next.repairRound).toBe(1)
  })

  it('moves run to needs_human when repair rounds are exhausted', () => {
    const runningAtLimit = transitionWorkflowRunState(createWorkflowRunState(2, 2), { type: 'start' })
    const next = transitionWorkflowRunState(runningAtLimit, { type: 'review_failed' })

    expect(next.status).toBe('needs_human')
    expect(next.repairRound).toBe(2)
  })

  it('allows human retry from needs_human and resets repair round', () => {
    const needsHuman = {
      ...createWorkflowRunState(2, 2),
      status: 'needs_human' as const,
    }

    const next = transitionWorkflowRunState(needsHuman, { type: 'human_retry' })

    expect(next.status).toBe('running')
    expect(next.repairRound).toBe(0)
    expect(next.manualInterventions).toBe(1)
  })

  it('allows human approval from needs_human', () => {
    const needsHuman = {
      ...createWorkflowRunState(2, 2),
      status: 'needs_human' as const,
    }

    const next = transitionWorkflowRunState(needsHuman, { type: 'human_approve' })
    expect(next.status).toBe('passed')
  })

  it('marks run as failed on fatal error', () => {
    const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
    const next = transitionWorkflowRunState(running, { type: 'fatal_error', reason: 'tool timeout' })
    expect(next.status).toBe('failed')
    expect(next.lastError).toBe('tool timeout')
  })

  it('throws on invalid transition', () => {
    expect(() => step({ type: 'human_approve' })).toThrow('invalid transition')
  })

  // Loop iteration events
  it('tracks loop iteration count on loop_iteration event', () => {
    const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
    const iterated = transitionWorkflowRunState(running, { type: 'loop_iteration' })
    expect(iterated.status).toBe('running')
    expect(iterated.currentIteration).toBe(1)
  })

  it('increments currentIteration on each loop_iteration', () => {
    const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
    const iter1 = transitionWorkflowRunState(running, { type: 'loop_iteration' })
    const iter2 = transitionWorkflowRunState(iter1, { type: 'loop_iteration' })
    const iter3 = transitionWorkflowRunState(iter2, { type: 'loop_iteration' })
    expect(iter3.currentIteration).toBe(3)
  })

  it('moves to needs_human on loop_timeout event', () => {
    const running = transitionWorkflowRunState(createWorkflowRunState(2, 0), { type: 'start' })
    const timedOut = transitionWorkflowRunState(running, { type: 'loop_timeout', reason: 'iteration timeout' })
    expect(timedOut.status).toBe('needs_human')
    expect(timedOut.lastError).toContain('iteration timeout')
  })

  it('resets currentIteration on human_retry', () => {
    const needsHuman = {
      ...createWorkflowRunState(2, 2),
      status: 'needs_human' as const,
      currentIteration: 5,
    }

    const next = transitionWorkflowRunState(needsHuman, { type: 'human_retry' })
    expect(next.currentIteration).toBe(0)
  })
})
