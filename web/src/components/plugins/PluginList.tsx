/**
 * Plugin List Component - Neo-Brutal Tech Design
 *
 * Grid/list layout with tech styling
 */

import type { PluginInstance } from '../../types/plugin'
import { PluginCard } from './PluginCard'

type ViewMode = 'grid' | 'list'
type SortBy = 'name' | 'version' | 'date'

interface PluginListProps {
  plugins: PluginInstance[]
  viewMode?: ViewMode
  filter?: string
  sortBy?: SortBy
  onSelect?: (plugin: PluginInstance) => void
  onDelete?: (pluginId: string) => void
  selectedPluginIds?: string[]
}

export function PluginList({
  plugins,
  viewMode = 'grid',
  filter = '',
  sortBy = 'name',
  onSelect,
  onDelete,
  selectedPluginIds = [],
}: PluginListProps) {
  // Filter plugins
  const filteredPlugins = plugins.filter((plugin) => {
    const search = filter.toLowerCase()
    return (
      plugin.metadata.name.toLowerCase().includes(search) ||
      plugin.metadata.id.toLowerCase().includes(search) ||
      plugin.metadata.description.toLowerCase().includes(search) ||
      plugin.metadata.author.toLowerCase().includes(search)
    )
  })

  // Sort plugins
  const sortedPlugins = [...filteredPlugins].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.metadata.name.localeCompare(b.metadata.name)
      case 'version':
        return compareVersions(b.metadata.version, a.metadata.version)
      case 'date':
        return (b.loadedAt || 0) - (a.loadedAt || 0)
      default:
        return 0
    }
  })

  // Empty state
  if (sortedPlugins.length === 0) {
    return (
      <div className="npl-empty">
        <div className="npl-empty-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <rect x="8" y="8" width="48" height="48" rx="4" opacity="0.3" />
            <path d="M24 32h16M32 24v16" opacity="0.5" />
          </svg>
        </div>
        <div className="npl-empty-title">
          {filter ? 'NO_MODULES_FOUND' : 'NO_MODULES_INSTALLED'}
        </div>
        <div className="npl-empty-subtitle">
          {filter
            ? `NO_RESULTS_FOR_SEARCH_QUERY: "${filter.toUpperCase()}"`
            : 'UPLOAD_A_WASM_MODULE_TO_BEGIN'}
        </div>
      </div>
    )
  }

  return (
    <div className={`npl-list npl-list--${viewMode}`}>
      {sortedPlugins.map((plugin) => (
        <PluginCard
          key={plugin.metadata.id}
          plugin={plugin}
          onSelect={() => onSelect?.(plugin)}
          onDelete={() => onDelete?.(plugin.metadata.id)}
          selected={selectedPluginIds.includes(plugin.metadata.id)}
        />
      ))}
    </div>
  )
}

/**
 * Compare semantic version strings
 */
function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const parts = v.split('.').map((p) => parseInt(p, 10))
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }

  const [aMajor, aMinor, aPatch] = parseVersion(a)
  const [bMajor, bMinor, bPatch] = parseVersion(b)

  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}
