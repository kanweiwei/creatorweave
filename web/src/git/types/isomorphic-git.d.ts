/**
 * Type declarations for isomorphic-git
 * These types will be replaced when isomorphic-git is installed
 */

declare module 'isomorphic-git' {
  export interface LogOptions {
    depth?: number
    skip?: number
  }

  export interface DiffOptions {
    a?: string
    b?: string
    aName?: string
    bName?: string
  }

  export interface CommitObject {
    oid: string
    message: string
    tree: string
    parent: string[]
    author: {
      name: string
      email: string
      timestamp: number
    }
    committer: {
      name: string
      email: string
      timestamp: number
    }
    gpgsig?: string
  }

  export interface CommitLogEntry {
    commit: CommitObject
    oid: string
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const git: any
  export default git
  export { git }
}
