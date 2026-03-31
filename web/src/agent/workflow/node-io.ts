/**
 * NodeOutputStore — versioned key/value store for passing data between
 * workflow nodes. Each node writes its result via `outputKey` and downstream
 * nodes read via `inputRefs`.
 *
 * Supports history tracking for loop iterations with `advanceRound()`.
 */

export interface HistoryEntry {
  round: number
  content: unknown
  timestamp: number
}

export class NodeOutputStore {
  private outputs = new Map<string, HistoryEntry[]>()
  private currentRound = 0

  /**
   * Set a value for the given output key.
   * The value is stored with the current round number.
   */
  set(outputKey: string, content: unknown): void {
    const entries = this.outputs.get(outputKey) || []
    entries.push({ round: this.currentRound, content, timestamp: Date.now() })
    this.outputs.set(outputKey, entries)
  }

  /**
   * Get the latest value for a key (backwards compatible).
   * Returns string for backwards compatibility, or undefined.
   */
  get(outputKey: string): string | undefined {
    const value = this.getLatest(outputKey)
    if (value === undefined) return undefined
    if (typeof value === 'string') return value
    // For non-string values, return JSON stringified
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  /**
   * Get the latest value for a key, returning the raw value.
   */
  getLatest(outputKey: string): unknown {
    const entries = this.outputs.get(outputKey)
    if (!entries || entries.length === 0) return undefined
    return entries[entries.length - 1].content
  }

  /**
   * Get a nested property from the latest value using a path.
   * Example: getLatestByPath('review', 'score') returns review.score
   */
  getLatestByPath(outputKey: string, path: string): unknown {
    const value = this.getLatest(outputKey)
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'object' || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>)[path]
  }

  /**
   * Get all history entries for a key.
   */
  getHistory(outputKey: string): HistoryEntry[] {
    return this.outputs.get(outputKey)?.slice() || []
  }

  /**
   * Get the last N history entries for a key.
   */
  getRecent(outputKey: string, n: number): HistoryEntry[] {
    const entries = this.outputs.get(outputKey) || []
    return entries.slice(-n)
  }

  /**
   * Check if a key exists.
   */
  has(outputKey: string): boolean {
    const entries = this.outputs.get(outputKey)
    return entries !== undefined && entries.length > 0
  }

  /**
   * Advance to the next round (used for loop iterations).
   */
  advanceRound(): void {
    this.currentRound += 1
  }

  /**
   * Get the current round number.
   */
  get currentRoundNumber(): number {
    return this.currentRound
  }

  /**
   * Clear all stored data and reset round number.
   */
  clear(): void {
    this.outputs.clear()
    this.currentRound = 0
  }
}

/**
 * Collect upstream outputs referenced by a node's `inputRefs`.
 * Returns a map of `outputKey → content` for all resolved refs.
 * Missing refs are silently skipped (the node may still work without them).
 */
export function gatherInputs(
  inputRefs: string[],
  store: NodeOutputStore
): Map<string, unknown> {
  const inputs = new Map<string, unknown>()
  for (const ref of inputRefs) {
    const content = store.getLatest(ref)
    if (content !== undefined) {
      inputs.set(ref, content)
    }
  }
  return inputs
}
