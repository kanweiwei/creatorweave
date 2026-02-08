/**
 * LightningFS Wrapper for isomorphic-git
 *
 * Provides a filesystem interface compatible with isomorphic-git
 * using LightningFS (browser-optimized fork of LightningFS).
 */

import FS from '@isomorphic-git/lightningfs'
import type { FS as FsType } from '@isomorphic-git/lightningfs'

/**
 * LightningFS instance for Git operations
 */
let lightningFs: FsType | null = null

/**
 * Buffer polyfill for isomorphic-git
 */
let nodeBuffer: typeof import('buffer').Buffer | null = null

/**
 * Get or create the LightningFS instance
 * @returns LightningFS instance
 */
export function getLightningFS(): FsType {
  if (!lightningFs) {
    lightningFs = new FS('git-data') as FsType
  }
  return lightningFs
}

/**
 * Initialize the buffer polyfill
 * Required for isomorphic-git in browser environment
 * @returns Buffer module
 */
export async function initBuffer(): Promise<typeof import('buffer').Buffer> {
  if (!nodeBuffer) {
    const bufferModule = await import('buffer')
    nodeBuffer = bufferModule.Buffer
  }
  return nodeBuffer
}

/**
 * Get the buffer polyfill
 * @returns Buffer module
 */
export function getBuffer(): typeof import('buffer').Buffer | null {
  return nodeBuffer
}

/**
 * Type definition for isomorphic-git fs parameter
 */
export type GitFs = {
  promises: {
    /** Read file contents */
    readFile(
      path: string,
      options?: { encoding?: string; flag?: string }
    ): Promise<string | Uint8Array>
    /** Write file contents */
    writeFile(path: string, data: string | Uint8Array, options?: { flag?: string }): Promise<void>
    /** Delete file */
    unlink(path: string): Promise<void>
    /** Create directory */
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
    /** Remove directory */
    rmdir(path: string): Promise<void>
    /** Read directory contents */
    readdir(path: string): Promise<string[]>
    /** Check if file exists */
    stat(
      path: string
    ): Promise<{ size: number; mtime: number; ctime: number; type: 'file' | 'directory' }>
    /** Get file type */
    lstat(
      path: string
    ): Promise<{ size: number; mtime: number; ctime: number; type: 'file' | 'directory' }>
    /** Check if path is directory */
    isdir(path: string): Promise<boolean>
    /** Check if path is file */
    isfile(path: string): Promise<boolean>
    /** Rename/move file */
    rename(oldPath: string, newPath: string): Promise<void>
    /** Read symbolic link */
    readlink(path: string): Promise<string>
    /** Create symbolic link */
    symlink(target: string, path: string): Promise<void>
    /** Change permissions */
    chmod(path: string, mode: number): Promise<void>
    /** Get real path (resolve symlinks) */
    realpath(path: string): Promise<string>
    /** Watch for changes */
    watch(
      path: string,
      options?: { recursive?: boolean }
    ): AsyncIterable<{ filename: string; eventType: string }>
  }
}

/**
 * Create a Git-compatible fs object from LightningFS
 * @param prefix Optional path prefix for the git directory
 * @returns GitFs object compatible with isomorphic-git
 */
export function createGitFs(prefix?: string): GitFs {
  const fs = getLightningFS()

  const promises = {
    /**
     * Read file contents
     */
    async readFile(
      path: string,
      options?: { encoding?: string; flag?: string }
    ): Promise<string | Uint8Array> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      const content = await fs.promises.readFile(fullPath, options)
      return content
    },

    /**
     * Write file contents
     */
    async writeFile(
      path: string,
      data: string | Uint8Array,
      options?: { flag?: string }
    ): Promise<void> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      await fs.promises.writeFile(fullPath, data, options)
    },

    /**
     * Delete file
     */
    async unlink(path: string): Promise<void> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      await fs.promises.unlink(fullPath)
    },

    /**
     * Create directory
     */
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      await fs.promises.mkdir(fullPath, options)
    },

    /**
     * Remove directory
     */
    async rmdir(path: string): Promise<void> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      await fs.promises.rmdir(fullPath)
    },

    /**
     * Read directory contents
     */
    async readdir(path: string): Promise<string[]> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      return await fs.promises.readdir(fullPath)
    },

    /**
     * Get file/directory stats
     */
    async stat(
      path: string
    ): Promise<{ size: number; mtime: number; ctime: number; type: 'file' | 'directory' }> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      try {
        const stat = await fs.promises.stat(fullPath)
        return {
          size: stat.size,
          mtime: stat.mtime?.getTime() ?? Date.now(),
          ctime: stat.ctime?.getTime() ?? Date.now(),
          type: stat.isDirectory() ? 'directory' : 'file',
        }
      } catch {
        // Try to handle edge cases
        throw new Error(`Cannot stat path: ${fullPath}`)
      }
    },

    /**
     * Get file/directory stats (lstat - doesn't follow symlinks)
     */
    async lstat(
      path: string
    ): Promise<{ size: number; mtime: number; ctime: number; type: 'file' | 'directory' }> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      try {
        const stat = await fs.promises.lstat(fullPath)
        return {
          size: stat.size,
          mtime: stat.mtime?.getTime() ?? Date.now(),
          ctime: stat.ctime?.getTime() ?? Date.now(),
          type: stat.isDirectory() ? 'directory' : 'file',
        }
      } catch {
        throw new Error(`Cannot lstat path: ${fullPath}`)
      }
    },

    /**
     * Check if path is directory
     */
    async isdir(path: string): Promise<boolean> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      try {
        const stat = await fs.promises.stat(fullPath)
        return stat.isDirectory()
      } catch {
        return false
      }
    },

    /**
     * Check if path is file
     */
    async isfile(path: string): Promise<boolean> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      try {
        const stat = await fs.promises.stat(fullPath)
        return stat.isFile()
      } catch {
        return false
      }
    },

    /**
     * Rename/move file or directory
     */
    async rename(oldPath: string, newPath: string): Promise<void> {
      const fullOldPath = prefix ? `${prefix}/${oldPath}` : oldPath
      const fullNewPath = prefix ? `${prefix}/${newPath}` : newPath
      await fs.promises.rename(fullOldPath, fullNewPath)
    },

    /**
     * Read symbolic link target
     */
    async readlink(path: string): Promise<string> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      return await fs.promises.readlink(fullPath)
    },

    /**
     * Create symbolic link
     */
    async symlink(target: string, path: string): Promise<void> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      await fs.promises.symlink(target, fullPath)
    },

    /**
     * Change file permissions
     */
    async chmod(path: string, mode: number): Promise<void> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      await fs.promises.chmod(fullPath, mode)
    },

    /**
     * Get real path (resolve symlinks)
     */
    async realpath(path: string): Promise<string> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      return await fs.promises.realpath(fullPath)
    },

    /**
     * Watch for file changes
     */
    async *watch(
      path: string,
      options?: { recursive?: boolean }
    ): AsyncIterable<{ filename: string; eventType: string }> {
      const fullPath = prefix ? `${prefix}/${path}` : path
      const watcher = fs.watch(fullPath, options)
      for await (const event of watcher) {
        yield { filename: event.filename, eventType: event.eventType }
      }
    },
  }

  return { promises }
}

/**
 * Default Git fs instance (no prefix)
 */
let defaultGitFs: GitFs | null = null

/**
 * Get or create the default Git fs instance
 * @returns GitFs object compatible with isomorphic-git
 */
export function getGitFs(): GitFs {
  if (!defaultGitFs) {
    defaultGitFs = createGitFs()
  }
  return defaultGitFs
}

/**
 * Initialize the Git fs module
 * Call this before performing any Git operations
 */
export async function initGitFs(): Promise<GitFs> {
  await initBuffer()
  return getGitFs()
}

/**
 * Reset the Git fs module
 * Useful for testing or cleanup
 */
export function resetGitFs(): void {
  lightningFs = null
  nodeBuffer = null
  defaultGitFs = null
}

/**
 * Check if a git repository exists at the given path
 * @param path Repository path (relative to fs root or with prefix)
 * @returns True if .git directory exists
 */
export async function isGitRepository(path: string): Promise<boolean> {
  const fs = getGitFs()
  return await fs.promises.isdir(`${path}/.git`)
}

/**
 * Create a bare git repository
 * @param path Repository path
 * @returns Promise that resolves when created
 */
export async function initGitRepository(path: string): Promise<void> {
  const fs = getGitFs()
  await fs.promises.mkdir(`${path}/.git`, { recursive: true })
}

/**
 * Get the git directory path
 * @param prefix Optional prefix
 * @returns Git directory path
 */
export function getGitDir(prefix?: string): string {
  return prefix ? `${prefix}/.git` : '.git'
}
