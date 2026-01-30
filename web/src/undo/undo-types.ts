/**
 * Undo system types - tracks file modifications for reversal.
 */

export type ModificationType = 'create' | 'modify' | 'delete'

export interface FileModification {
  /** Unique modification ID */
  id: string
  /** Relative file path */
  path: string
  /** Type of modification */
  type: ModificationType
  /** Content before modification (null for newly created files) */
  oldContent: string | null
  /** Content after modification (null for deleted files) */
  newContent: string | null
  /** When the modification occurred */
  timestamp: number
  /** Which agent message triggered this modification */
  agentMessageId?: string
  /** Whether this modification has been undone */
  undone: boolean
}
