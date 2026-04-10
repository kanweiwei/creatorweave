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
  RESET_REQUIRES_TAB_CLOSURE,
  exportStorage,
  importStorage,
  getStorageMode,
} from './init'

export type { InitStorageOptions, InitStorageResult, StorageStatus, StorageMode } from './init'
