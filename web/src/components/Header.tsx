import { Folder, Moon, Puzzle, X } from 'lucide-react'
import type { PluginInstance } from '@/types/plugin'

interface HeaderProps {
  onViewChange?: (view: 'home' | 'plugins') => void
  currentView?: 'home' | 'plugins'
  selectedPlugins?: PluginInstance[]
  onClearPlugin?: () => void
}

export function Header({
  onViewChange,
  currentView = 'home',
  selectedPlugins = [],
  onClearPlugin,
}: HeaderProps) {
  const pluginCount = selectedPlugins.length

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Folder className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Browser File System Analyzer</h1>
          </div>

          {onViewChange && (
            <nav className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onViewChange('home')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  currentView === 'home'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                分析
              </button>
              <button
                type="button"
                onClick={() => onViewChange('plugins')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  currentView === 'plugins'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Puzzle className="h-4 w-4" />
                插件
                {pluginCount > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {pluginCount}
                  </span>
                )}
              </button>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Selected plugins indicator */}
          {pluginCount > 0 && onClearPlugin && (
            <div className="hidden items-center gap-2 rounded-lg bg-green-50 px-3 py-1.5 text-sm sm:flex">
              <Puzzle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-700">
                {pluginCount === 1
                  ? selectedPlugins[0].metadata.name
                  : `${pluginCount} plugins selected`}
              </span>
              <button
                type="button"
                onClick={onClearPlugin}
                className="rounded p-0.5 text-green-600 hover:bg-green-100"
                title="Clear plugins"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Toggle theme"
          >
            <Moon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
