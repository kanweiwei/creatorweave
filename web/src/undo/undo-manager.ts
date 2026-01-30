/**
 * Undo Manager - records file modifications and supports reversal.
 *
 * Usage:
 * - Tools call recordModification() after writing/editing files
 * - UI calls undo() to revert a specific modification
 * - Modifications are stored in memory (volatile per session)
 */

import type { FileModification, ModificationType } from './undo-types'
import { resolveFileHandle, createFileWithDirs } from '@/services/fsAccess.service'

let nextId = 1
function generateModId(): string {
  return `mod-${Date.now()}-${nextId++}`
}

export class UndoManager {
  private modifications: FileModification[] = []
  private directoryHandle: FileSystemDirectoryHandle | null = null
  private onChange: (() => void) | null = null

  /** Set the root directory handle for file operations */
  setDirectoryHandle(handle: FileSystemDirectoryHandle | null): void {
    this.directoryHandle = handle
  }

  /** Subscribe to changes */
  subscribe(fn: () => void): () => void {
    this.onChange = fn
    return () => {
      if (this.onChange === fn) this.onChange = null
    }
  }

  private notify(): void {
    this.onChange?.()
  }

  /** Record a file modification */
  recordModification(
    path: string,
    type: ModificationType,
    oldContent: string | null,
    newContent: string | null,
    agentMessageId?: string
  ): FileModification {
    const mod: FileModification = {
      id: generateModId(),
      path,
      type,
      oldContent,
      newContent,
      timestamp: Date.now(),
      agentMessageId,
      undone: false,
    }
    this.modifications.push(mod)
    this.notify()
    return mod
  }

  /** Undo a specific modification by ID */
  async undo(modId: string): Promise<boolean> {
    if (!this.directoryHandle) {
      throw new Error('No directory handle set for undo operations')
    }

    const mod = this.modifications.find((m) => m.id === modId)
    if (!mod || mod.undone) return false

    try {
      switch (mod.type) {
        case 'create': {
          // File was created - delete it by writing empty content
          // Note: File System Access API doesn't have a direct delete file method
          // We mark it as undone and the file remains (user can manually delete)
          // For a better UX, we could write back an empty file or use remove()
          if (mod.oldContent === null) {
            // Try to remove the file using the directory handle
            const parts = mod.path.split('/')
            const fileName = parts.pop()!
            let dir = this.directoryHandle
            for (const part of parts) {
              dir = await dir.getDirectoryHandle(part)
            }
            try {
              await dir.removeEntry(fileName)
            } catch {
              // removeEntry might not be supported everywhere
              console.warn(`[UndoManager] Could not delete file: ${mod.path}`)
            }
          }
          break
        }

        case 'modify': {
          // File was modified - restore old content
          if (mod.oldContent !== null) {
            const fileHandle = await resolveFileHandle(this.directoryHandle, mod.path)
            const writable = await fileHandle.createWritable()
            await writable.write(mod.oldContent)
            await writable.close()
          }
          break
        }

        case 'delete': {
          // File was deleted - recreate with old content
          if (mod.oldContent !== null) {
            const fileHandle = await createFileWithDirs(this.directoryHandle, mod.path)
            const writable = await fileHandle.createWritable()
            await writable.write(mod.oldContent)
            await writable.close()
          }
          break
        }
      }

      mod.undone = true
      this.notify()
      return true
    } catch (error) {
      console.error(`[UndoManager] Failed to undo modification ${modId}:`, error)
      throw error
    }
  }

  /** Get all modifications (newest first) */
  getModifications(): FileModification[] {
    return [...this.modifications].reverse()
  }

  /** Get modifications for a specific file */
  getFileModifications(path: string): FileModification[] {
    return this.modifications.filter((m) => m.path === path).reverse()
  }

  /** Get modifications triggered by a specific agent message */
  getMessageModifications(agentMessageId: string): FileModification[] {
    return this.modifications.filter((m) => m.agentMessageId === agentMessageId)
  }

  /** Get count of active (not undone) modifications */
  get activeCount(): number {
    return this.modifications.filter((m) => !m.undone).length
  }

  /** Clear all modification history */
  clear(): void {
    this.modifications = []
    this.notify()
  }
}

/** Singleton instance */
let instance: UndoManager | null = null

export function getUndoManager(): UndoManager {
  if (!instance) {
    instance = new UndoManager()
  }
  return instance
}
