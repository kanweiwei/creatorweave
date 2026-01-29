/**
 * Plugin Manager Component - Neo-Brutal Tech Design
 *
 * Futuristic control deck aesthetic with high contrast UI
 */

import { useState, useEffect } from 'react'
import type { PluginInstance } from '../../types/plugin'
import { getPluginLoader } from '../../services/plugin-loader.service'
import { getPluginStorage } from '../../services/plugin-storage.service'

import { PluginUpload } from './PluginUpload'
import { PluginList } from './PluginList'
import { PluginFooter } from './PluginFooter'

interface PluginManagerProps {
  onPluginsSelect?: (plugins: PluginInstance[]) => void
  onSwitchToHome?: () => void
  selectedPlugins?: PluginInstance[]
}

type ViewMode = 'grid' | 'list'

// Mock test plugins for demonstration
// NOTE: Only include plugins that have actual WASM implementations in /public/wasm/
const MOCK_PLUGINS: PluginInstance[] = [
  {
    metadata: {
      id: 'line-counter',
      name: 'Line Counter',
      version: '0.1.0',
      api_version: '2.0.0',
      description: 'Count lines, characters, and blank lines in text files',
      author: 'BFOSA Team',
      capabilities: {
        metadata_only: false,
        requires_content: true,
        supports_streaming: true,
        max_file_size: 50 * 1024 * 1024,
        file_extensions: [
          '.txt',
          '.md',
          '.js',
          '.ts',
          '.jsx',
          '.tsx',
          '.rs',
          '.go',
          '.py',
          '.java',
          '.c',
          '.cpp',
          '.h',
          '.hpp',
        ],
      },
      resource_limits: {
        max_memory: 8 * 1024 * 1024,
        max_execution_time: 30000,
        worker_count: 1,
      },
    },
    state: 'Loaded',
    loadedAt: Date.now() - 10000,
  },
  {
    metadata: {
      id: 'md5-calculator',
      name: 'MD5 Calculator',
      version: '0.1.0',
      api_version: '2.0.0',
      description: 'Calculate MD5 hash of files',
      author: 'BFOSA Team',
      capabilities: {
        metadata_only: false,
        requires_content: true,
        supports_streaming: false,
        max_file_size: 100 * 1024 * 1024,
        file_extensions: ['*'],
      },
      resource_limits: {
        max_memory: 16 * 1024 * 1024,
        max_execution_time: 30000,
        worker_count: 1,
      },
    },
    state: 'Loaded',
    loadedAt: Date.now() - 20000,
  },
]

export function PluginManager({
  onPluginsSelect,
  onSwitchToHome,
  selectedPlugins: externalSelectedPlugins = [],
}: PluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'version' | 'date'>('name')
  const [selectedPluginIds, setSelectedPluginIds] = useState<string[]>([])

  // Sync external selected plugins
  useEffect(() => {
    if (externalSelectedPlugins.length > 0) {
      const ids = externalSelectedPlugins.map((p) => p.metadata.id)
      setSelectedPluginIds(ids)
    } else {
      setSelectedPluginIds([])
    }
  }, [externalSelectedPlugins])

  // Load plugins from IndexedDB on mount
  useEffect(() => {
    loadPlugins()
  }, [])

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const storage = getPluginStorage()
      const savedPlugins = await storage.loadPlugins()

      if (savedPlugins.length > 0) {
        // Filter out plugins that don't have WASM implementations
        const validPlugins = savedPlugins.filter((p) => {
          const wasmId = p.metadata.id.replace(/-/g, '_')
          // Check if this is a built-in plugin with WASM file
          const builtinPlugins = ['line_counter', 'md5_calculator', 'browser_fs_analyzer_wasm']
          return builtinPlugins.includes(wasmId)
        })

        if (validPlugins.length > 0) {
          setPlugins(validPlugins)
        } else {
          // Use mock plugins for demo
          setPlugins(MOCK_PLUGINS)
        }

        // If we filtered out invalid plugins, clear them from storage
        if (validPlugins.length !== savedPlugins.length) {
          console.log(`Filtered out ${savedPlugins.length - validPlugins.length} invalid plugins`)
          await storage.clearAll()
          // Save valid plugins back
          for (const plugin of validPlugins) {
            await storage.savePlugin(plugin)
          }
        }
      } else {
        // Use mock plugins for demo
        setPlugins(MOCK_PLUGINS)
      }
    } catch (error) {
      console.error('Failed to load plugins:', error)
      // Fallback to mock plugins
      setPlugins(MOCK_PLUGINS)
    } finally {
      setLoading(false)
    }
  }

  const handlePluginUpload = async (file: File) => {
    try {
      const wasmBytes = await file.arrayBuffer()
      const loader = getPluginLoader()
      const instance = await loader.loadPlugin(wasmBytes)

      // Save to IndexedDB
      const storage = getPluginStorage()
      await storage.savePlugin(instance)
      await storage.savePluginBytes(instance.metadata.id, wasmBytes)

      setPlugins((prev) => [...prev, instance])
    } catch (error) {
      console.error('Failed to upload plugin:', error)
      throw error
    }
  }

  const handlePluginDelete = async (pluginId: string) => {
    try {
      const loader = getPluginLoader()
      await loader.unloadPlugin(pluginId)

      // Delete from IndexedDB
      const storage = getPluginStorage()
      await storage.deletePlugin(pluginId)
      await storage.deletePluginBytes(pluginId)

      setPlugins((prev) => prev.filter((p) => p.metadata.id !== pluginId))

      // Clear selection if deleted
      if (selectedPluginIds.includes(pluginId)) {
        setSelectedPluginIds((prev) => prev.filter((id) => id !== pluginId))
        // Notify parent of updated selection
        const updatedPlugins = plugins.filter(
          (p) => p.metadata.id !== pluginId && selectedPluginIds.includes(p.metadata.id)
        )
        if (onPluginsSelect) {
          onPluginsSelect(updatedPlugins)
        }
      }
    } catch (error) {
      console.error('Failed to delete plugin:', error)
    }
  }

  const handlePluginSelect = (plugin: PluginInstance) => {
    const isSelected = selectedPluginIds.includes(plugin.metadata.id)
    let newIds: string[]
    let newSelectedPlugins: PluginInstance[]

    if (isSelected) {
      // Deselect
      newIds = selectedPluginIds.filter((id) => id !== plugin.metadata.id)
      newSelectedPlugins = plugins.filter((p) => newIds.includes(p.metadata.id))
    } else {
      // Select
      newIds = [...selectedPluginIds, plugin.metadata.id]
      newSelectedPlugins = [...plugins.filter((p) => newIds.includes(p.metadata.id))]
    }

    setSelectedPluginIds(newIds)

    // Notify parent of updated selection
    if (onPluginsSelect) {
      onPluginsSelect(newSelectedPlugins)
    }
  }

  const handleGoToHome = () => {
    if (onSwitchToHome) {
      onSwitchToHome()
    }
  }

  const handleResetPlugins = async () => {
    try {
      const storage = getPluginStorage()
      await storage.clearAll()
      // Reload with mock plugins
      await loadPlugins()
    } catch (error) {
      console.error('Failed to reset plugins:', error)
    }
  }

  const getStats = () => {
    return {
      total: plugins.length,
      loaded: plugins.filter((p) => p.state === 'Loaded').length,
      error: plugins.filter((p) => p.state === 'Error').length,
      loading: plugins.filter((p) => p.state === 'Loading').length,
    }
  }

  if (loading) {
    return (
      <div className="npm-container">
        <div className="npm-loading">
          <div className="npm-loading-spinner"></div>
          <div className="npm-loading-text">INITIALIZING PLUGIN SYSTEM</div>
          <div className="npm-loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="npm-container">
      {/* Header Section */}
      <header className="npm-header">
        <div className="npm-header-main">
          <div className="npm-title-block">
            <div className="npm-title-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div>
              <h1 className="npm-title">PLUGIN MODULES</h1>
              <div className="npm-subtitle">EXTENDABLE WASM MODULE SYSTEM</div>
            </div>
          </div>
          <div className="npm-header-actions">
            <button
              className={`npm-view-btn npm-view-btn--icon ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="1.5" y="1.5" width="6" height="6" />
                <rect x="10.5" y="1.5" width="6" height="6" />
                <rect x="1.5" y="10.5" width="6" height="6" />
                <rect x="10.5" y="10.5" width="6" height="6" />
              </svg>
            </button>
            <button
              className={`npm-view-btn npm-view-btn--icon ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="1.5" y="2.25" width="15" height="2.25" rx="0.5" />
                <rect x="1.5" y="7.5" width="15" height="2.25" rx="0.5" />
                <rect x="1.5" y="12.75" width="15" height="2.25" rx="0.5" />
              </svg>
            </button>
            <button
              className="npm-view-btn npm-view-btn--icon"
              onClick={handleResetPlugins}
              title="Reset plugins (clear cache)"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2.5 9h13M9 2.5v13" />
                <circle cx="9" cy="9" r="7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="npm-controls-bar">
          <div className="npm-search-wrapper">
            <svg
              className="npm-search-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="7" cy="7" r="5" />
              <line x1="11" y1="11" x2="14" y2="14" />
            </svg>
            <input
              type="text"
              className="npm-search"
              placeholder="SEARCH_MODULES..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="npm-search-clear" onClick={() => setFilter('')}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="3" y1="3" x2="11" y2="11" />
                  <line x1="11" y1="3" x2="3" y2="11" />
                </svg>
              </button>
            )}
          </div>

          <select
            className="npm-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="name">SORT_BY_NAME</option>
            <option value="version">SORT_BY_VERSION</option>
            <option value="date">SORT_BY_DATE_LOADED</option>
          </select>

          <div className="npm-status-indicator">
            <span className="npm-status-dot npm-status-dot--active"></span>
            <span className="npm-status-text">SYSTEM_ONLINE</span>
          </div>
        </div>
      </header>

      {/* Upload Section */}
      <section className="npm-upload-section">
        <PluginUpload onUpload={handlePluginUpload} />
      </section>

      {/* Selection Status Bar */}
      {selectedPluginIds.length > 0 && (
        <section className="npm-selection-bar">
          <div className="nsb-content">
            <span className="nsb-count">
              {selectedPluginIds.length} MODULE{selectedPluginIds.length > 1 ? 'S' : ''} SELECTED
            </span>
            <button
              className="nsb-clear"
              onClick={() => {
                setSelectedPluginIds([])
                onPluginsSelect?.([])
              }}
            >
              CLEAR ALL
            </button>
          </div>
        </section>
      )}

      {/* Plugin List */}
      <section className="npm-plugins-section">
        <PluginList
          plugins={plugins}
          viewMode={viewMode}
          filter={filter}
          sortBy={sortBy}
          onSelect={handlePluginSelect}
          onDelete={handlePluginDelete}
          selectedPluginIds={selectedPluginIds}
        />
      </section>

      {/* Footer */}
      <PluginFooter stats={getStats()} />
    </div>
  )
}
