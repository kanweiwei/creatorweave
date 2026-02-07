/**
 * Workspace Settings Dialog - comprehensive settings management.
 *
 * Features:
 * - Layout preferences (panel sizes, reset to defaults)
 * - Display settings (theme, font size)
 * - Keyboard shortcuts customization
 * - Data management (clear recent files, reset workspace)
 * - Persist all settings
 */

import { useState } from 'react'
import { Settings, RotateCcw, Trash2, Keyboard, Monitor, X } from 'lucide-react'
import {
  BrandDialog,
  BrandButton,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
} from '@browser-fs-analyzer/ui'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useTheme } from '@/store/theme.store'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'

type SettingsTab = 'layout' | 'display' | 'shortcuts' | 'data'

interface WorkspaceSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkspaceSettingsDialog({ open, onOpenChange }: WorkspaceSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('layout')
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)

  const {
    panelSizes,
    display,
    resetPanelSizes,
    resetToDefaults,
    setSidebarWidth,
    setConversationRatio,
    setPreviewRatio,
    setFontSize,
    setShowLineNumbers,
    setWordWrap,
    setShowMiniMap,
    clearRecentFiles,
    recentFiles,
  } = useWorkspacePreferencesStore()

  const { setTheme, mode } = useTheme()

  const handleResetLayout = () => {
    if (confirm('Reset panel sizes to default values?')) {
      resetPanelSizes()
    }
  }

  const handleResetAll = () => {
    if (confirm('Reset all settings to default values?')) {
      resetToDefaults()
    }
  }

  const handleClearRecentFiles = () => {
    if (confirm('Clear all recent files history?')) {
      clearRecentFiles()
    }
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'layout', label: 'Layout', icon: <Monitor className="h-4 w-4" /> },
    { id: 'display', label: 'Display', icon: <Settings className="h-4 w-4" /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" /> },
    { id: 'data', label: 'Data', icon: <Trash2 className="h-4 w-4" /> },
  ]

  return (
    <>
      <BrandDialog open={open} onOpenChange={onOpenChange}>
        <BrandDialogContent className="max-w-4xl">
          <BrandDialogHeader>
            <BrandDialogTitle>Workspace Settings</BrandDialogTitle>
            <BrandDialogClose asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </BrandDialogClose>
          </BrandDialogHeader>

          <div className="flex h-[60vh]">
            {/* Sidebar tabs */}
            <div className="border-subtle w-48 border-r">
              <nav className="space-y-1 p-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'dark:bg-primary-900/30 dark:text-primary-300 bg-primary-50 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Layout Tab */}
              {activeTab === 'layout' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Panel Sizes
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Adjust the size and position of workspace panels
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Sidebar Width: {panelSizes.sidebarWidth}px
                      </label>
                      <input
                        type="range"
                        min="200"
                        max="400"
                        value={panelSizes.sidebarWidth}
                        onChange={(e) => setSidebarWidth(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Conversation Area: {panelSizes.conversationRatio}%
                      </label>
                      <input
                        type="range"
                        min="20"
                        max="80"
                        value={panelSizes.conversationRatio}
                        onChange={(e) => setConversationRatio(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Preview Panel: {panelSizes.previewRatio}%
                      </label>
                      <input
                        type="range"
                        min="30"
                        max="80"
                        value={panelSizes.previewRatio}
                        onChange={(e) => setPreviewRatio(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="border-subtle flex gap-2 border-t pt-4">
                    <BrandButton variant="outline" onClick={handleResetLayout}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset Layout
                    </BrandButton>
                  </div>
                </div>
              )}

              {/* Display Tab */}
              {activeTab === 'display' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Theme
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Choose your preferred color scheme
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as const).map((themeMode) => (
                      <button
                        key={themeMode}
                        onClick={() => setTheme(themeMode)}
                        className={`rounded-lg border-2 p-3 text-center capitalize transition-colors ${
                          mode === themeMode
                            ? 'dark:bg-primary-900/30 dark:text-primary-300 border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-subtle hover:border-neutral-300 dark:hover:border-neutral-700'
                        }`}
                      >
                        {themeMode}
                      </button>
                    ))}
                  </div>

                  <div className="border-subtle border-t pt-6">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Editor Settings
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Customize the code editor display
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Font Size
                      </label>
                      <select
                        value={display.fontSize}
                        onChange={(e) =>
                          setFontSize(e.target.value as 'small' | 'medium' | 'large')
                        }
                        className="border-subtle w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-neutral-900"
                      >
                        <option value="small">Small (12px)</option>
                        <option value="medium">Medium (14px)</option>
                        <option value="large">Large (16px)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Show Line Numbers
                      </label>
                      <input
                        type="checkbox"
                        checked={display.showLineNumbers}
                        onChange={(e) => setShowLineNumbers(e.target.checked)}
                        className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Word Wrap
                      </label>
                      <input
                        type="checkbox"
                        checked={display.wordWrap}
                        onChange={(e) => setWordWrap(e.target.checked)}
                        className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Show Mini Map
                      </label>
                      <input
                        type="checkbox"
                        checked={display.showMiniMap}
                        onChange={(e) => setShowMiniMap(e.target.checked)}
                        className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcuts Tab */}
              {activeTab === 'shortcuts' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Keyboard Shortcuts
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      View and customize keyboard shortcuts
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="border-subtle flex items-center justify-between rounded-md border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          Show All Shortcuts
                        </div>
                        <div className="text-xs text-neutral-500">
                          View the complete list of keyboard shortcuts
                        </div>
                      </div>
                      <BrandButton variant="outline" onClick={() => setShowShortcutsHelp(true)}>
                        <Keyboard className="mr-2 h-4 w-4" />
                        View
                      </BrandButton>
                    </div>
                  </div>

                  <div className="border-subtle rounded-md border bg-neutral-50 p-4 dark:bg-neutral-800">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      <strong>Tip:</strong> Press{' '}
                      <kbd className="border-subtle rounded border bg-white px-1.5 py-0.5 dark:bg-neutral-900">
                        Ctrl/Cmd + K
                      </kbd>{' '}
                      to open the command palette for quick access to all features.
                    </p>
                  </div>
                </div>
              )}

              {/* Data Tab */}
              {activeTab === 'data' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Data Management
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Manage workspace data and clear history
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="border-subtle flex items-center justify-between rounded-md border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          Recent Files
                        </div>
                        <div className="text-xs text-neutral-500">
                          {recentFiles.length} files in history
                        </div>
                      </div>
                      <BrandButton
                        variant="outline"
                        onClick={handleClearRecentFiles}
                        disabled={recentFiles.length === 0}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear
                      </BrandButton>
                    </div>

                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Warning:</strong> Clearing data cannot be undone. Make sure you want
                        to permanently remove this information.
                      </p>
                    </div>

                    <div className="border-subtle border-t pt-4">
                      <h4 className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Reset All Settings
                      </h4>
                      <p className="mb-3 text-xs text-neutral-500">
                        Reset all workspace preferences to default values
                      </p>
                      <BrandButton variant="outline" onClick={handleResetAll}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reset All
                      </BrandButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-subtle flex justify-end border-t px-6 py-4">
            <BrandButton variant="default" onClick={() => onOpenChange(false)}>
              Done
            </BrandButton>
          </div>
        </BrandDialogContent>
      </BrandDialog>

      {/* Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
    </>
  )
}
