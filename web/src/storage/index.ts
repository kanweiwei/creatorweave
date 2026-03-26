/**
 * Storage Module
 *
 * Unified SQLite-based storage for the app.
 *
 * @module storage
 */

// Initialization and utilities
export {
  initStorage,
  setupAutoSave,
  getStorageStatus,
  clearAllStorage,
  clearSQLiteAndProjectsDirectory,
  exportStorage,
  importStorage,
  getStorageMode,
} from './init'

export type { InitStorageOptions, InitStorageResult, StorageStatus, StorageMode } from './init'
