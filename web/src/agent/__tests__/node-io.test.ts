import { describe, expect, it } from 'vitest'
import { NodeOutputStore, gatherInputs } from '../workflow/node-io'

describe('NodeOutputStore', () => {
  it('stores and retrieves latest value', () => {
    const store = new NodeOutputStore()
    store.set('outline', { chapters: 5 })
    expect(store.getLatest('outline')).toEqual({ chapters: 5 })
  })

  it('returns undefined for missing key', () => {
    const store = new NodeOutputStore()
    expect(store.getLatest('missing')).toBeUndefined()
  })

  it('stores multiple rounds of history', () => {
    const store = new NodeOutputStore()
    store.set('draft', 'round-0-content')
    store.advanceRound()
    store.set('draft', 'round-1-content')
    store.advanceRound()
    store.set('draft', 'round-2-content')

    const history = store.getHistory('draft')
    expect(history).toHaveLength(3)
    expect(history[0].round).toBe(0)
    expect(history[0].content).toBe('round-0-content')
    expect(history[2].round).toBe(2)
  })

  it('getLatest returns most recent value', () => {
    const store = new NodeOutputStore()
    store.set('score', 65)
    store.advanceRound()
    store.set('score', 88)
    expect(store.getLatest('score')).toBe(88)
  })

  it('getRecent returns last N entries', () => {
    const store = new NodeOutputStore()
    store.set('v', 'a')
    store.advanceRound()
    store.set('v', 'b')
    store.advanceRound()
    store.set('v', 'c')
    store.advanceRound()
    store.set('v', 'd')

    const recent = store.getRecent('v', 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].content).toBe('c')
    expect(recent[1].content).toBe('d')
  })

  it('supports JSON path access', () => {
    const store = new NodeOutputStore()
    store.set('review', { score: 85, passed: true })
    expect(store.getLatestByPath('review', 'score')).toBe(85)
    expect(store.getLatestByPath('review', 'passed')).toBe(true)
    expect(store.getLatestByPath('review', 'missing')).toBeUndefined()
  })

  it('clears all data', () => {
    const store = new NodeOutputStore()
    store.set('a', 1)
    store.set('b', 2)
    store.clear()
    expect(store.getLatest('a')).toBeUndefined()
    expect(store.getLatest('b')).toBeUndefined()
  })

  it('tracks current round number', () => {
    const store = new NodeOutputStore()
    expect(store.currentRoundNumber).toBe(0)
    store.advanceRound()
    expect(store.currentRoundNumber).toBe(1)
    store.advanceRound()
    expect(store.currentRoundNumber).toBe(2)
  })

  it('backwards compatible get/has still work', () => {
    const store = new NodeOutputStore()
    store.set('outline', 'chapter 1: ...')
    expect(store.has('outline')).toBe(true)
    expect(store.get('outline')).toBe('chapter 1: ...')
  })
})

describe('gatherInputs', () => {
  it('collects upstream outputs by key', () => {
    const store = new NodeOutputStore()
    store.set('outline', 'my outline')
    store.set('draft', 'my draft')

    const inputs = gatherInputs(['outline'], store)
    expect(inputs.get('outline')).toBe('my outline')
    expect(inputs.has('draft')).toBe(false)
  })

  it('skips missing refs', () => {
    const store = new NodeOutputStore()
    const inputs = gatherInputs(['missing'], store)
    expect(inputs.size).toBe(0)
  })
})
