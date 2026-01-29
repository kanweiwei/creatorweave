import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle,
  FileText,
  HardDrive,
  TrendingUp,
  Folder,
  Clock,
  RefreshCcw,
  Puzzle,
  X,
  Hash,
  Code,
  TextCursor,
  Copy,
} from 'lucide-react'
import { formatNumber, formatBytes, formatDuration } from '@/lib/utils'
import type { AnalysisResult } from '@/store/analysis.store'
import type { PluginInstance } from '@/types/plugin'
import { PluginHTMLRenderer } from './plugins/PluginHTMLRenderer'

interface ResultsPanelProps {
  result: AnalysisResult
  onReanalyze: () => void
  onSelectFolder: () => void
  selectedPlugins?: PluginInstance[]
  onClearPlugin?: () => void
}

/**
 * Plugin-specific metrics display
 */
function PluginMetrics({ metrics, pluginId }: { metrics: any; pluginId?: string }) {
  // Detect plugin type from metrics if pluginId is not provided
  const isLineCounter =
    pluginId === 'line-counter' ||
    (!pluginId && (metrics.total_lines !== undefined || metrics.total_blank_lines !== undefined))
  const isMd5Calculator =
    pluginId === 'md5-calculator' || (!pluginId && metrics.algorithm !== undefined)

  // Line Counter metrics
  if (isLineCounter && metrics.total_lines !== undefined) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <TextCursor className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-xs text-gray-600">Total Lines</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatNumber(metrics.total_lines)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <FileText className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-xs text-gray-600">Blank Lines</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatNumber(metrics.total_blank_lines || 0)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <Code className="h-5 w-5 text-purple-600" />
          <div>
            <p className="text-xs text-gray-600">Non-Blank</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatNumber((metrics.total_lines || 0) - (metrics.total_blank_lines || 0))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <Hash className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-xs text-gray-600">Characters</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatNumber(metrics.total_chars || 0)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // MD5 Calculator metrics
  if (isMd5Calculator) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
        <Hash className="h-5 w-5 text-purple-600" />
        <div>
          <p className="text-xs text-gray-600">Algorithm</p>
          <p className="text-sm font-semibold text-gray-900">{metrics.algorithm || 'MD5'}</p>
        </div>
      </div>
    )
  }

  // Default metrics display
  return (
    <div className="rounded-lg border bg-white p-4">
      <pre className="text-xs text-gray-700">{JSON.stringify(metrics, null, 2)}</pre>
    </div>
  )
}

export function ResultsPanel({
  result,
  onReanalyze,
  onSelectFolder,
  selectedPlugins = [],
  onClearPlugin,
}: ResultsPanelProps) {
  const pluginCount = selectedPlugins.length

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
          <h3 className="mt-4 text-2xl font-bold text-gray-900">Analysis Complete</h3>

          {pluginCount > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2">
                <Puzzle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  {pluginCount === 1
                    ? `Analyzed with ${selectedPlugins[0].metadata.name} v${selectedPlugins[0].metadata.version}`
                    : `Analyzed with ${pluginCount} plugins`}
                </span>
              </div>
              <button
                onClick={onClearPlugin}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Clear plugins"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-blue-600" />
              <p className="text-2xl font-bold text-gray-900">{formatNumber(result.fileCount)}</p>
              <p className="text-sm text-gray-600">Total Files</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <HardDrive className="mx-auto mb-2 h-8 w-8 text-green-600" />
              <p className="text-2xl font-bold text-gray-900">{formatBytes(result.totalSize)}</p>
              <p className="text-sm text-gray-600">Total Size</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <TrendingUp className="mx-auto mb-2 h-8 w-8 text-purple-600" />
              <p className="text-2xl font-bold text-gray-900">{formatBytes(result.averageSize)}</p>
              <p className="text-sm text-gray-600">Average Size</p>
            </CardContent>
          </Card>
        </div>

        {/* Plugin result section */}
        {result.pluginResults && result.pluginResults.length > 0 && (
          <Card className="mb-6 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Puzzle className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold text-gray-900">Plugin Results</h4>
                </div>
                <div className="text-xs text-gray-500">
                  {result.pluginResults.length} plugin{result.pluginResults.length > 1 ? 's' : ''}
                </div>
              </div>

              <div className="space-y-3">
                {result.pluginResults.map((pluginResult) => {
                  // Check if plugin returned HTML content (at top level OR in metrics)
                  const isHtmlRender = (pluginResult as any).render_type === 'html'
                  const htmlContent = isHtmlRender
                    ? (pluginResult as any)
                    : (pluginResult.metrics as any)?.render_type === 'html'
                      ? (pluginResult.metrics as any)
                      : null

                  if (htmlContent?.render_type === 'html') {
                    return (
                      <PluginHTMLRenderer
                        key={pluginResult.pluginId || 'html'}
                        result={htmlContent}
                        analysisData={result}
                        onAction={(action, data) => {
                          console.log('Plugin action:', action, data)
                          if (action === 'export') {
                            navigator.clipboard.writeText(JSON.stringify(pluginResult))
                          } else if (action === 'copy') {
                            navigator.clipboard.writeText(pluginResult.summary || '')
                          }
                        }}
                      />
                    )
                  }

                  // Use the stored metadata from pluginResult, fallback to selectedPlugins
                  const pluginId = pluginResult.pluginId || ''
                  const pluginName =
                    pluginResult.pluginName ||
                    selectedPlugins.find((p) => p.metadata.id === pluginId)?.metadata.name ||
                    `Plugin ${pluginId}`
                  return (
                    <div
                      key={pluginResult.summary || pluginId}
                      className="rounded-lg border border-green-200 bg-white p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Puzzle className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-gray-900">{pluginName}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {pluginResult.filesProcessed} processed
                        </div>
                      </div>

                      <p className="text-sm text-gray-700">{pluginResult.summary}</p>

                      {pluginResult.metrics != null && (
                        <PluginMetrics metrics={pluginResult.metrics} pluginId={pluginId} />
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* File Results with MD5 Hashes */}
        {result.fileResults && result.fileResults.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-purple-600" />
                  <h4 className="font-semibold text-gray-900">File Results</h4>
                </div>
                <span className="text-sm text-gray-500">{result.fileResults.length} files</span>
              </div>
              <div className="space-y-2">
                {result.fileResults.map((file, index) => {
                  const md5Hash =
                    file.output?.data && typeof file.output.data === 'object'
                      ? (file.output.data as any).md5
                      : null

                  return (
                    <div
                      key={file.path || index}
                      className="group flex items-center justify-between rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900" title={file.path}>
                          {file.name}
                        </p>
                        {md5Hash ? (
                          <div className="mt-1 flex items-center gap-2">
                            <code className="select-all rounded bg-purple-50 px-2 py-0.5 font-mono text-xs text-purple-600">
                              {md5Hash}
                            </code>
                            <button
                              onClick={() => navigator.clipboard.writeText(md5Hash)}
                              className="rounded p-1 opacity-0 transition-opacity hover:bg-purple-100 group-hover:opacity-100"
                              title="Copy MD5"
                            >
                              <Copy className="h-3 w-3 text-gray-500" />
                            </button>
                          </div>
                        ) : file.output?.error ? (
                          <p className="mt-1 text-xs text-red-600">Error: {file.output.error}</p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">No data available</p>
                        )}
                      </div>
                      <div className="ml-4 text-right">
                        <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                        <p
                          className={`text-xs font-medium ${
                            file.success ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {file.success ? '✓ Success' : '✗ Failed'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {result.maxFile && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h4 className="mb-4 font-semibold text-gray-900">Largest File</h4>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{result.maxFile.name}</p>
                  <p className="text-sm text-gray-600" title={result.maxFile.path}>
                    {result.maxFile.path.length > 60
                      ? '...' + result.maxFile.path.slice(-57)
                      : result.maxFile.path}
                  </p>
                </div>
                <p className="ml-4 text-lg font-semibold text-gray-900">
                  {formatBytes(result.maxFile.size)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
            <Folder className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm text-gray-600">Folders</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatNumber(result.folderCount)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
            <Clock className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm text-gray-600">Duration</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDuration(result.duration)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={onReanalyze} variant="default" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Reanalyze
          </Button>
          <Button onClick={onSelectFolder} variant="outline" className="gap-2">
            Select Different Folder
          </Button>
        </div>
      </div>
    </div>
  )
}
