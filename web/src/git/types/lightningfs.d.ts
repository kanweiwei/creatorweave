/**
 * Type declarations for @isomorphic-git/lightningfs
 * These types will be replaced when lightningfs is installed
 */

declare module '@isomorphic-git/lightningfs' {
  export interface LightningFSPromises {
    readFile(
      path: string,
      options?: { encoding?: string; flag?: string }
    ): Promise<string | Uint8Array>
    writeFile(path: string, data: string | Uint8Array, options?: { flag?: string }): Promise<void>
    unlink(path: string): Promise<void>
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
    rmdir(path: string): Promise<void>
    readdir(path: string): Promise<string[]>
    stat(path: string): Promise<{
      size: number
      mtime?: Date
      ctime?: Date
      isDirectory(): boolean
      isFile(): boolean
    }>
    lstat(path: string): Promise<{
      size: number
      mtime?: Date
      ctime?: Date
      isDirectory(): boolean
      isFile(): boolean
    }>
    rename(oldPath: string, newPath: string): Promise<void>
    readlink(path: string): Promise<string>
    symlink(target: string, path: string): Promise<void>
    chmod(path: string, mode: number): Promise<void>
    realpath(path: string): Promise<string>
    watch(
      path: string,
      options?: { recursive?: boolean }
    ): AsyncIterable<{ filename: string; eventType: string }>
  }

  export interface LightningFS {
    promises: LightningFSPromises
    watch(
      path: string,
      options?: { recursive?: boolean }
    ): AsyncIterable<{ filename: string; eventType: string }>
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LightningFS: any
  export default LightningFS
  export type FS = LightningFS
}
