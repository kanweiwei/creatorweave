import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, HardDrive, FileText, Puzzle } from 'lucide-react'
import { formatNumber, formatBytes } from '@/lib/utils'
import type { PluginInstance } from '@/types/plugin'

interface ProgressPanelProps {
  progress: number
  fileCount: number
  totalSize: number
  currentPath: string | null
  selectedPlugins?: PluginInstance[]
}

export function ProgressPanel({
  progress,
  fileCount,
  totalSize,
  currentPath,
  selectedPlugins = [],
}: ProgressPanelProps) {
  const pluginCount = selectedPlugins.length

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
          <h3 className="mt-4 text-xl font-semibold text-neutral-900">Analyzing...</h3>
          {pluginCount > 0 && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-success">
              <Puzzle className="h-4 w-4" />
              <span className="font-medium">
                {pluginCount === 1
                  ? `Using ${selectedPlugins[0].metadata.name}`
                  : `Using ${pluginCount} plugins`}
              </span>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">Progress</span>
                <span className="text-sm text-neutral-600">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-4">
                <FileText className="h-8 w-8 text-primary-600" />
                <div>
                  <p className="text-sm text-neutral-600">Files Found</p>
                  <p className="text-2xl font-bold text-neutral-900">{formatNumber(fileCount)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-4">
                <HardDrive className="h-8 w-8 text-success" />
                <div>
                  <p className="text-sm text-neutral-600">Total Size</p>
                  <p className="text-2xl font-bold text-neutral-900">{formatBytes(totalSize)}</p>
                </div>
              </div>
            </div>

            {currentPath && (
              <div className="mt-4 rounded-lg bg-neutral-50 p-3">
                <p className="mb-1 text-xs font-medium text-neutral-600">Current File</p>
                <p className="truncate font-mono text-xs text-neutral-700" title={currentPath}>
                  {currentPath}
                </p>
              </div>
            )}

            {pluginCount > 0 && (
              <div className="mt-4 rounded-lg border border-success/30 bg-success-bg p-3">
                <div className="flex items-center gap-2">
                  <Puzzle className="h-4 w-4 text-success" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-success">ACTIVE PLUGINS</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {selectedPlugins.map((p) => (
                        <span
                          key={p.metadata.id}
                          className="inline-flex items-center text-xs text-neutral-900"
                        >
                          {p.metadata.name} v{p.metadata.version}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
