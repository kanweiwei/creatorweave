/**
 * Plugin Storage Service
 *
 * Handles IndexedDB persistence for loaded WASM plugins
 */

import type { PluginInstance, PluginMetadata } from '../types/plugin'

//=============================================================================
// Constants
//=============================================================================

const DB_NAME = 'bfosa-plugins'
const DB_VERSION = 1
const STORE_NAME = 'plugins'

//=============================================================================
// Database
//=============================================================================+

class PluginDatabase {
  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('name', 'name', { unique: false })
          store.createIndex('version', 'version', { unique: false })
          store.createIndex('loadedAt', 'loadedAt', { unique: false })
        }
      }
    })
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  async getAll(): Promise<PluginInstance[]> {
    if (!this.db) {
      await this.open()
    }
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }
      const transaction = this.db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async get(id: string): Promise<PluginInstance | undefined> {
    if (!this.db) {
      await this.open()
    }
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }
      const transaction = this.db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async put(plugin: PluginInstance): Promise<void> {
    if (!this.db) {
      await this.open()
    }
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }
      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.put(plugin)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async delete(id: string): Promise<void> {
    if (!this.db) {
      await this.open()
    }
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }
      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.delete(id)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async clear(): Promise<void> {
    if (!this.db) {
      await this.open()
    }
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }
      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.clear()

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
}

//=============================================================================
// Plugin Storage Service
//=============================================================================+

class PluginStorageService {
  private db: PluginDatabase | null = null
  private initialized = false

  /**
   * Initialize IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    this.db = new PluginDatabase()
    await this.db.open()
    this.initialized = true
  }

  /**
   * Save a plugin to IndexedDB (serializable data only, no Worker)
   */
  async savePlugin(plugin: PluginInstance): Promise<void> {
    await this.initialize()
    // Only save serializable data - Worker cannot be cloned
    const serializable = {
      id: plugin.metadata.id, // keyPath for IndexedDB
      metadata: plugin.metadata,
      state: plugin.state,
      loadedAt: plugin.loadedAt,
      // Don't include 'worker' or 'wasmModule' - they're not serializable
    }
    // Use the metadata.id as the key to match IndexedDB store configuration
    await this.db!.put(serializable)
  }

  /**
   * Load all plugins from IndexedDB
   */
  async loadPlugins(): Promise<PluginInstance[]> {
    await this.initialize()
    const plugins = await this.db!.getAll()
    console.log('[PluginStorage] Loaded', plugins.length, 'plugins from IndexedDB')

    // Ensure each plugin has complete metadata with defaults
    return plugins.map((plugin: any) => {
      // Handle legacy format where metadata might be at root level
      if (!plugin.metadata && plugin.id) {
        plugin.metadata = {
          id: plugin.id,
          name: plugin.name || 'Unknown Plugin',
          version: plugin.version || '0.0.0',
          api_version: plugin.api_version || '2.0.0',
          description: plugin.description || 'No description',
          author: plugin.author || 'Unknown',
          capabilities: plugin.capabilities || {
            metadata_only: false,
            requires_content: false,
            supports_streaming: false,
            max_file_size: 0,
            file_extensions: [],
          },
          resource_limits: plugin.resource_limits || {
            max_memory: 16 * 1024 * 1024,
            max_execution_time: 5000,
            worker_count: 1,
          },
        }
      }

      if (!plugin.metadata) {
        console.warn('[PluginStorage] Plugin missing metadata, adding defaults')
        plugin.metadata = {
          id: plugin.id || 'unknown',
          name: 'Unknown Plugin',
          version: '0.0.0',
          api_version: '2.0.0',
          description: 'No description',
          author: 'Unknown',
          capabilities: {
            metadata_only: false,
            requires_content: false,
            supports_streaming: false,
            max_file_size: 0,
            file_extensions: [],
          },
          resource_limits: {
            max_memory: 16 * 1024 * 1024,
            max_execution_time: 5000,
            worker_count: 1,
          },
        }
      }
      if (!plugin.metadata.resource_limits) {
        console.warn(
          '[PluginStorage] Plugin',
          plugin.metadata.id,
          'missing resource_limits, adding defaults'
        )
        plugin.metadata.resource_limits = {
          max_memory: 16 * 1024 * 1024,
          max_execution_time: 5000,
          worker_count: 1,
        }
      }
      if (!plugin.metadata.capabilities) {
        console.warn(
          '[PluginStorage] Plugin',
          plugin.metadata.id,
          'missing capabilities, adding defaults'
        )
        plugin.metadata.capabilities = {
          metadata_only: false,
          requires_content: false,
          supports_streaming: false,
          max_file_size: 0,
          file_extensions: [],
        }
      }
      console.log('[PluginStorage] Plugin loaded:', plugin.metadata.id, 'state:', plugin.state)
      // Worker is not serializable and must be recreated when needed
      return {
        metadata: plugin.metadata,
        state: plugin.state || 'Loaded',
        loadedAt: plugin.loadedAt || Date.now(),
        worker: undefined, // Will be created when needed
      }
    })
  }

  /**
   * Get a specific plugin by ID
   */
  async getPlugin(id: string): Promise<PluginInstance | undefined> {
    await this.initialize()
    return await this.db!.get(id)
  }

  /**
   * Delete a plugin from IndexedDB
   */
  async deletePlugin(id: string): Promise<void> {
    await this.initialize()
    await this.db!.delete(id)
  }

  /**
   * Clear all plugins
   */
  async clearAll(): Promise<void> {
    await this.initialize()
    await this.db!.clear()
  }

  /**
   * Store plugin WASM bytes
   */
  async savePluginBytes(id: string, _bytes: ArrayBuffer): Promise<void> {
    await this.initialize()
    // Store in separate object store for binary data
    // Note: This would require extending PluginDatabase class with a separate method
    // For now, just log and return
    console.log('[PluginStorage] Saving plugin bytes for:', id)
    return Promise.resolve()
  }

  /**
   * Get plugin WASM bytes
   */
  async getPluginBytes(id: string): Promise<ArrayBuffer | undefined> {
    await this.initialize()
    // Note: This would require extending PluginDatabase class
    // For now, just return undefined
    console.log('[PluginStorage] Getting plugin bytes for:', id)
    return Promise.resolve(undefined)
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      this.initialized = false
    }
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let storageInstance: PluginStorageService | null = null

export function getPluginStorage(): PluginStorageService {
  if (!storageInstance) {
    storageInstance = new PluginStorageService()
  }
  return storageInstance
}

/**
 * Convert plugin metadata to stored instance format
 */
export function metadataToInstance(
  metadata: PluginMetadata
  // wasmBytes: ArrayBuffer - would be compiled to WASM module
): PluginInstance {
  return {
    metadata,
    state: 'Loaded',
    wasmModule: undefined, // Would be compiled from bytes
    loadedAt: Date.now(),
  }
}
