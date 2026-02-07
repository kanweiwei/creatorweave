/**
 * DataVisualization - 数据可视化组件
 *
 * 支持展示：
 * - Python matplotlib 生成的图片
 * - 数据表格（带排序、筛选）
 * - 简单统计图表（柱状图、折线图、饼图）
 * - 图表导出功能
 */

import { useState, useMemo } from 'react'
import {
  X,
  Download,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Search,
  BarChart3,
  LineChart,
  PieChart,
} from 'lucide-react'

//=============================================================================
// Types
//=============================================================================

export type VisualizationType = 'image' | 'table' | 'bar' | 'line' | 'pie' | 'stats'

export interface VisualizationData {
  type: VisualizationType
  title?: string
  // Image data (base64 or URL)
  imageData?: string
  imageFilename?: string
  // Table data
  tableData?: Record<string, unknown>[] | string[][]
  tableColumns?: string[]
  // Chart data
  chartData?: ChartDataPoint[] | Record<string, unknown>[]
  // Stats
  stats?: Record<string, number>
}

interface ChartDataPoint {
  label: string
  value: number
  category?: string
}

interface DataVisualizationProps {
  data: VisualizationData
  onClose?: () => void
  onExport?: () => void
}

//=============================================================================
// Sub Components
//=============================================================================

// Image Display
function ImageViewer({
  src,
  filename,
  onExport,
}: {
  src: string
  filename?: string
  onExport?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="max-w-full overflow-auto rounded-lg border border-neutral-200 bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={filename || 'Chart'} className="h-auto max-w-full" />
      </div>
      {filename && <p className="text-sm text-neutral-500">{filename}</p>}
      {onExport && (
        <button
          onClick={onExport}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <Download className="h-4 w-4" />
          Export Image
        </button>
      )}
    </div>
  )
}

// Table Viewer with sorting and filtering
function TableViewer({
  data,
  columns,
}: {
  data: Record<string, unknown>[] | string[][]
  columns?: string[]
}) {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')

  // Normalize data to array of objects
  const normalizedData = useMemo(() => {
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      // Convert string[][] to object[]
      const firstRow = data[0] as unknown[]
      const cols = columns || (Array.isArray(firstRow) ? firstRow.map((_, i) => `col${i}`) : [])
      return (data as string[][]).map((row) => {
        const obj: Record<string, unknown> = {}
        row.forEach((val, idx) => {
          obj[cols[idx] || `col${idx}`] = val
        })
        return obj
      })
    }
    return data as Record<string, unknown>[]
  }, [data, columns])

  // Get columns from data
  const tableColumns = useMemo(() => {
    if (columns) return columns
    if (normalizedData.length > 0) {
      return Object.keys(normalizedData[0])
    }
    return []
  }, [columns, normalizedData])

  // Filter and sort data
  const filteredSortedData = useMemo(() => {
    let result = [...normalizedData]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((row) =>
        tableColumns.some((col) =>
          String(row[col] || '')
            .toLowerCase()
            .includes(query)
        )
      )
    }

    // Apply sort
    if (sortColumn) {
      result.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }
        const aStr = String(aVal || '')
        const bStr = String(bVal || '')
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
      })
    }

    return result
  }, [normalizedData, tableColumns, searchQuery, sortColumn, sortDirection])

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Limit display rows for performance
  const displayData = filteredSortedData.slice(0, 100)
  const hasMore = filteredSortedData.length > 100

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search table..."
            className="focus:border-primary-300 w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <span className="text-sm text-neutral-500">
          {filteredSortedData.length} row{filteredSortedData.length !== 1 ? 's' : ''}
          {hasMore && ` (showing first 100)`}
        </span>
      </div>

      {/* Table */}
      <div className="max-h-[400px] overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50">
            <tr>
              {tableColumns.map((column) => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className="cursor-pointer select-none px-4 py-3 text-left font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                >
                  <div className="flex items-center gap-2">
                    <span>{column}</span>
                    {sortColumn === column ? (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="h-4 w-4 text-primary-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-primary-600" />
                      )
                    ) : (
                      <ChevronDown className="h-4 w-4 text-neutral-400" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {displayData.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                {tableColumns.map((column) => (
                  <td key={column} className="whitespace-nowrap px-4 py-3 text-neutral-700">
                    {String(row[column] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {displayData.length === 0 && (
          <div className="py-8 text-center text-neutral-500">No data found</div>
        )}
      </div>
    </div>
  )
}

// Simple Bar Chart
function BarChart({ data }: { data: ChartDataPoint[] }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="w-full">
      <div className="flex h-64 items-end gap-2">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="group flex flex-1 flex-col items-center gap-2"
            title={`${item.label}: ${item.value}`}
          >
            <div
              className="w-full rounded-t-sm bg-primary-500 transition-all group-hover:bg-primary-600"
              style={{ height: `${(item.value / maxValue) * 100}%` }}
            />
            <span className="w-full truncate text-center text-xs text-neutral-600">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Simple Stats Display
function StatsViewer({ stats }: { stats: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Object.entries(stats).map(([key, value]) => (
        <div
          key={key}
          className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center"
        >
          <p className="text-sm font-medium capitalize text-neutral-600">{key}</p>
          <p className="mt-1 text-2xl font-semibold text-primary-600">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      ))}
    </div>
  )
}

//=============================================================================
// Main Component
//=============================================================================

export function DataVisualization({ data, onClose, onExport }: DataVisualizationProps) {
  const [viewMode, setViewMode] = useState<'embedded' | 'fullscreen'>('embedded')

  const renderContent = () => {
    switch (data.type) {
      case 'image':
        if (!data.imageData) return null
        return (
          <ImageViewer src={data.imageData} filename={data.imageFilename} onExport={onExport} />
        )

      case 'table':
        if (!data.tableData) return null
        return <TableViewer data={data.tableData} columns={data.tableColumns} />

      case 'bar':
        if (!data.chartData) return null
        return <BarChart data={data.chartData as ChartDataPoint[]} />

      case 'line':
        if (!data.chartData) return null
        // For now, use bar chart as fallback
        return (
          <div className="py-8 text-center text-neutral-500">
            <LineChart className="mx-auto mb-4 h-12 w-12 text-neutral-300" />
            <p>Line chart visualization coming soon</p>
            <p className="mt-2 text-sm">Currently displaying as bar chart</p>
            <BarChart data={data.chartData as ChartDataPoint[]} />
          </div>
        )

      case 'pie':
        if (!data.chartData) return null
        return (
          <div className="py-8 text-center text-neutral-500">
            <PieChart className="mx-auto mb-4 h-12 w-12 text-neutral-300" />
            <p>Pie chart visualization coming soon</p>
            <p className="mt-2 text-sm">Currently displaying as bar chart</p>
            <BarChart data={data.chartData as ChartDataPoint[]} />
          </div>
        )

      case 'stats':
        if (!data.stats) return null
        return <StatsViewer stats={data.stats} />

      default:
        return (
          <div className="py-8 text-center text-neutral-500">
            <BarChart3 className="mx-auto mb-4 h-12 w-12 text-neutral-300" />
            <p>Unsupported visualization type</p>
          </div>
        )
    }
  }

  return (
    <div
      className={`rounded-2xl bg-white shadow-xl ${
        viewMode === 'fullscreen' ? 'fixed inset-4 z-50 flex flex-col' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <div>
          <h3 className="font-semibold text-neutral-900">{data.title || 'Data Visualization'}</h3>
          <p className="mt-0.5 text-sm capitalize text-neutral-500">
            {data.type} {data.type === 'image' && data.imageFilename && `• ${data.imageFilename}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'embedded' ? 'fullscreen' : 'embedded')}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            title={viewMode === 'embedded' ? 'Fullscreen' : 'Exit fullscreen'}
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`p-6 ${viewMode === 'fullscreen' ? 'flex-1 overflow-auto' : ''}`}>
        {renderContent()}
      </div>
    </div>
  )
}

//=============================================================================
// Helper: Extract visualization from Python tool result
//=============================================================================

export function extractVisualizationFromPythonResult(result: {
  images?: Array<{ filename: string; data: string }>
  stdout?: string
  stderr?: string
}): VisualizationData | null {
  // Check for matplotlib images
  if (result.images && result.images.length > 0) {
    return {
      type: 'image',
      imageData: result.images[0].data,
      imageFilename: result.images[0].filename,
      title: 'Generated Chart',
    }
  }

  // Check for table-like output in stdout
  if (result.stdout) {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(result.stdout)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Check if it's an array of objects (table-like)
        if (typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
          return {
            type: 'table',
            tableData: parsed as Record<string, unknown>[],
            title: 'Data Table',
          }
        }
        // Check if it's an array of arrays (table-like)
        if (Array.isArray(parsed[0])) {
          return {
            type: 'table',
            tableData: parsed as string[][],
            title: 'Data Table',
          }
        }
      }
    } catch {
      // Not JSON, check for table pattern
      const lines = result.stdout.trim().split('\n')
      if (lines.length > 2) {
        // Might be a tabular output
        return {
          type: 'table',
          tableData: lines.map((line) => line.split(/\s{2,}|\t/)),
          title: 'Data Table',
        }
      }
    }
  }

  return null
}
