/**
 * Plugin Card Component - Neo-Brutal Tech Design
 *
 * Data plate aesthetic with holographic feel
 */

import type { PluginInstance } from '../../types/plugin'

interface PluginCardProps {
  plugin: PluginInstance
  onSelect?: (plugin: PluginInstance) => void
  onDelete?: () => void
  selected?: boolean
}

export function PluginCard({ plugin, onSelect, onDelete, selected }: PluginCardProps) {
  const { metadata, state, error } = plugin

  const getStatusConfig = () => {
    switch (state) {
      case 'Loading':
        return { icon: 'spinner', color: 'cyan', text: 'LOADING', pulse: true }
      case 'Loaded':
        return { icon: 'check', color: 'green', text: 'ACTIVE', pulse: false }
      case 'Error':
        return { icon: 'error', color: 'red', text: 'FAULT', pulse: true }
      default:
        return { icon: 'unknown', color: 'gray', text: 'UNKNOWN', pulse: false }
    }
  }

  const status = getStatusConfig()
  const primaryExtension = metadata.capabilities.file_extensions[0] || '*'

  return (
    <div
      className={`npc-card ${selected ? 'npc-card--selected' : ''} npc-card--${status.color} relative`}
    >
      {/* Selection checkbox for multi-select */}
      {selected && (
        <div className="absolute right-2 top-2 z-10">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-green-600 text-xs font-bold text-white">
            ✓
          </div>
        </div>
      )}

      {/* Tech border effect */}
      <div className="npc-border npc-border--top"></div>
      <div className="npc-border npc-border--right"></div>
      <div className="npc-border npc-border--bottom"></div>
      <div className="npc-border npc-border--left"></div>

      {/* Corner markers */}
      <div className="npc-corner npc-corner--tl"></div>
      <div className="npc-corner npc-corner--tr"></div>
      <div className="npc-corner npc-corner--bl"></div>
      <div className="npc-corner npc-corner--br"></div>

      {/* Header */}
      <div className="npc-header">
        <div className="npc-icon-wrapper">
          <div className="npc-icon">{getFileIcon(primaryExtension)}</div>
          {status.pulse && <div className="npc-pulse"></div>}
        </div>
        <div className="npc-info">
          <h3 className="npc-name">{metadata.name}</h3>
          <div className="npc-meta-row">
            <span className="npc-version">v{metadata.version}</span>
            <span className="npc-separator">//</span>
            <span className="npc-id">{metadata.id}</span>
          </div>
        </div>
        <div className={`npc-status npc-status--${status.color}`}>
          <span
            className={`npc-status-indicator ${status.pulse ? 'npc-status-indicator--pulse' : ''}`}
          ></span>
          <span className="npc-status-text">{status.text}</span>
        </div>
      </div>

      {/* Body */}
      <div className="npc-body">
        <p className="npc-description">{metadata.description}</p>

        <div className="npc-specs">
          <div className="npc-spec-item">
            <span className="npc-spec-label">AUTHOR</span>
            <span className="npc-spec-value">{metadata.author}</span>
          </div>
          <div className="npc-spec-item">
            <span className="npc-spec-label">API</span>
            <span className="npc-spec-value">{metadata.api_version}</span>
          </div>
          <div className="npc-spec-item">
            <span className="npc-spec-label">MEMORY</span>
            <span className="npc-spec-value">
              {formatMemory(metadata.resource_limits?.max_memory ?? 16 * 1024 * 1024)}
            </span>
          </div>
        </div>

        {metadata.capabilities.file_extensions.length > 0 && (
          <div className="npc-extensions">
            <span className="npc-extensions-label">SUPPORTED_FORMATS</span>
            <div className="npc-extensions-list">
              {metadata.capabilities.file_extensions.slice(0, 6).map((ext) => (
                <span key={ext} className="npc-ext-badge">
                  {ext === '*' ? 'ALL' : ext.toUpperCase().replace('.', '')}
                </span>
              ))}
              {metadata.capabilities.file_extensions.length > 6 && (
                <span className="npc-ext-more">
                  +{metadata.capabilities.file_extensions.length - 6}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Capability indicators */}
        <div className="npc-caps">
          {metadata.capabilities.supports_streaming && (
            <div className="npc-cap">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M1 6h2l2 3 3-6 2 3 1 0" />
              </svg>
              <span>STREAMING</span>
            </div>
          )}
          {metadata.capabilities.metadata_only && (
            <div className="npc-cap">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M7 1H2v10h8V4" />
                <path d="M7 1v3h3" />
              </svg>
              <span>METADATA_ONLY</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer with actions */}
      <div className="npc-footer">
        <button
          className="npc-btn npc-btn--select"
          onClick={() => {
            console.log('[PluginCard] Button clicked for plugin:', metadata.id, 'state:', state)
            onSelect?.()
          }}
          disabled={state !== 'Loaded'}
        >
          <span className="npc-btn-text">{state === 'Loaded' ? 'LOAD_MODULE' : 'UNAVAILABLE'}</span>
          <svg
            className="npc-btn-arrow"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 7h8M7 3l4 4-4 4" />
          </svg>
        </button>
        <button className="npc-btn npc-btn--delete" onClick={onDelete} title="Remove module">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 4v8a1 1 0 001 1h2a1 1 0 001-1V4" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function getFileIcon(extension: string): JSX.Element {
  const ext = extension === '*' ? '?' : extension.replace('.', '').toUpperCase().slice(0, 3)
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="4" y="2" width="24" height="28" rx="2" />
      <path d="M10 12h12M10 17h12M10 22h8" opacity="0.5" />
      <text x="16" y="27" textAnchor="middle" fontSize="7" fill="currentColor" fontWeight="bold">
        {ext}
      </text>
    </svg>
  )
}

function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  }
  return `${(bytes / 1024).toFixed(0)}KB`
}
