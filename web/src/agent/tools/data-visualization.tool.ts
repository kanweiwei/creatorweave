/**
 * Data Visualization Tool
 *
 * Generate charts and visualizations from data for data analysts.
 * Supports: bar, line, pie, scatter, histogram, heatmap
 *
 * @module data-visualization-tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Tool Definitions
// ============================================================================

export interface GenerateChartArgs {
  /** Chart type: bar, line, pie, scatter, histogram */
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram'
  /** Data as array of records or arrays */
  data: Record<string, unknown>[] | unknown[][]
  /** Column for x-axis or labels */
  label_column?: string
  /** Column for values */
  value_column?: string
  /** Column for categories (optional) */
  category_column?: string
  /** X column for scatter/histogram */
  x_column?: string
  /** Y column for scatter */
  y_column?: string
  /** Number of bins for histogram */
  bins?: number
  /** Chart title */
  title?: string
  /** Color scheme */
  colors?: string[]
}

export interface ExportVisualizationArgs {
  /** Visualization ID or data to export */
  visualization_id?: string
  /** Export format */
  format: 'png' | 'svg' | 'csv'
  /** Output filename */
  output_path?: string
}

export interface DataSummaryArgs {
  /** Data to summarize */
  data: Record<string, unknown>[] | unknown[][]
  /** Columns to include (default: all) */
  columns?: string[]
  /** Include statistics */
  include_stats?: boolean
  /** Include distributions */
  include_distributions?: boolean
}

export const generate_chart: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_chart',
    description:
      'Generate a chart visualization from data. Supports bar, line, pie, scatter, and histogram charts. Input data as array of objects or array of arrays with column names.',
    parameters: {
      type: 'object',
      properties: {
        chart_type: {
          type: 'string',
          enum: ['bar', 'line', 'pie', 'scatter', 'histogram'],
          description: 'Type of chart to generate',
        },
        data: {
          type: 'array',
          description: 'Data as array of objects or array of arrays',
        },
        label_column: {
          type: 'string',
          description: 'Column for x-axis labels (for bar, line, pie)',
        },
        value_column: {
          type: 'string',
          description: 'Column for numeric values (for bar, line, pie)',
        },
        category_column: {
          type: 'string',
          description: 'Column for grouping categories',
        },
        x_column: {
          type: 'string',
          description: 'X-axis column (for scatter, histogram)',
        },
        y_column: {
          type: 'string',
          description: 'Y-axis column (for scatter)',
        },
        bins: {
          type: 'number',
          description: 'Number of bins for histogram (default: 10)',
        },
        title: {
          type: 'string',
          description: 'Chart title',
        },
        colors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom color array',
        },
      },
      required: ['chart_type', 'data'],
    },
  },
}

export const export_visualization: ToolDefinition = {
  type: 'function',
  function: {
    name: 'export_visualization',
    description:
      'Export a visualization as PNG image, SVG, or data as CSV. Saves to the workspace directory.',
    parameters: {
      type: 'object',
      properties: {
        visualization_id: {
          type: 'string',
          description: 'ID of visualization to export',
        },
        format: {
          type: 'string',
          enum: ['png', 'svg', 'csv'],
          description: 'Export format',
        },
        output_path: {
          type: 'string',
          description: 'Output filename (default: auto-generated)',
        },
      },
      required: ['format'],
    },
  },
}

export const data_summary: ToolDefinition = {
  type: 'function',
  function: {
    name: 'data_summary',
    description:
      'Generate a summary of data including statistics and distributions. Useful for initial data exploration.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Data to summarize',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Columns to include (default: all)',
        },
        include_stats: {
          type: 'boolean',
          description: 'Include descriptive statistics (mean, std, min, max)',
        },
        include_distributions: {
          type: 'boolean',
          description: 'Include value distributions and frequencies',
        },
      },
      required: ['data'],
    },
  },
}

// ============================================================================
// Tool Executors
// ============================================================================

function parseData(data: unknown): { headers: string[]; values: unknown[][] } {
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === 'object' && !Array.isArray(data[0])) {
      // Array of objects
      const headers = Object.keys(data[0] as Record<string, unknown>)
      const values = (data as Record<string, unknown>[]).map((row) => headers.map((h) => row[h]))
      return { headers, values }
    }
    if (Array.isArray(data[0])) {
      // Array of arrays
      return { headers: [], values: data as unknown[][] }
    }
  }
  return { headers: [], values: [] }
}

function extractColumn(
  values: unknown[][],
  headers: string[],
  column: string | undefined
): number[] {
  if (!column) return []
  const colIndex = headers.indexOf(column)
  if (colIndex >= 0) {
    return values.map((row) => Number(row[colIndex]) || 0)
  }
  return []
}

function computeHistogram(values: number[], bins: number): { labels: string[]; counts: number[] } {
  if (values.length === 0) return { labels: [], counts: [] }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const binWidth = (max - min) / bins || 1
  const counts = new Array(bins).fill(0)
  const labels: string[] = []

  for (let i = 0; i < bins; i++) {
    const start = min + i * binWidth
    const end = start + binWidth
    labels.push(`${start.toFixed(1)}-${end.toFixed(1)}`)
  }

  values.forEach((v) => {
    const binIndex = Math.min(Math.floor((v - min) / binWidth), bins - 1)
    counts[binIndex]++
  })

  return { labels, counts }
}

export const generate_chart_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const chart_type = args.chart_type as GenerateChartArgs['chart_type']
    const data = args.data as GenerateChartArgs['data']
    const title = args.title as string | undefined
    const colors = args.colors as string[] | undefined

    const { headers, values } = parseData(data)

    // Extract columns based on chart type
    const labelColumn = (args.label_column as string) || headers[0]

    let chartData: Record<string, unknown>

    switch (chart_type) {
      case 'bar': {
        const labels = extractColumn(values, headers, labelColumn).map(String)
        const dataPoints = extractColumn(
          values,
          headers,
          (args.value_column as string) || headers[1]
        )
        chartData = {
          type: 'bar',
          title: title || 'Bar Chart',
          chartData: labels.map((label, i) => ({
            label,
            value: dataPoints[i] || 0,
          })),
          chartOptions: { xAxis: labelColumn, yAxis: (args.value_column as string) || headers[1] },
        }
        break
      }

      case 'line': {
        const labels = extractColumn(values, headers, labelColumn).map(String)
        const dataPoints = extractColumn(
          values,
          headers,
          (args.value_column as string) || headers[1]
        )
        chartData = {
          type: 'line',
          title: title || 'Line Chart',
          chartData: labels.map((label, i) => ({
            label,
            value: dataPoints[i] || 0,
          })),
          chartOptions: { xAxis: labelColumn, yAxis: (args.value_column as string) || headers[1] },
        }
        break
      }

      case 'pie': {
        const labels = extractColumn(values, headers, labelColumn).map(String)
        const dataPoints = extractColumn(
          values,
          headers,
          (args.value_column as string) || headers[1]
        )
        chartData = {
          type: 'pie',
          title: title || 'Pie Chart',
          chartData: labels.map((label, i) => ({
            label,
            value: dataPoints[i] || 0,
          })),
        }
        break
      }

      case 'scatter': {
        const xValues = extractColumn(values, headers, (args.x_column as string) || headers[0])
        const yValues = extractColumn(values, headers, (args.y_column as string) || headers[1])
        chartData = {
          type: 'scatter',
          title: title || 'Scatter Plot',
          chartData: xValues.map((x, i) => ({
            label: `${x}`,
            value: yValues[i] || 0,
            x,
            y: yValues[i],
          })),
          chartOptions: {
            xAxis: (args.x_column as string) || headers[0],
            yAxis: (args.y_column as string) || headers[1],
          },
        }
        break
      }

      case 'histogram': {
        const xValues = extractColumn(values, headers, (args.x_column as string) || headers[0])
        const bins = (args.bins as number) || 10
        const { labels: binLabels, counts } = computeHistogram(xValues, bins)
        chartData = {
          type: 'bar',
          title: title || 'Histogram',
          chartData: binLabels.map((label, i) => ({
            label,
            value: counts[i],
          })),
          chartOptions: { xAxis: `bins (${bins})`, yAxis: 'frequency' },
        }
        break
      }

      default:
        return JSON.stringify({
          success: false,
          error: `Unsupported chart type: ${chart_type}`,
        })
    }

    // Add colors if provided
    if (colors && colors.length > 0) {
      chartData.chartOptions = {
        ...(chartData.chartOptions as Record<string, string>),
        colorBy: colors.join(','),
      }
    }

    return JSON.stringify({
      success: true,
      visualization_id: `viz_${Date.now()}`,
      chart_type,
      data_points: Array.isArray(chartData.chartData)
        ? (chartData.chartData as { label: string; value: number }[]).length
        : 0,
      visualization: chartData,
      message: `Generated ${chart_type} chart with ${
        Array.isArray(chartData.chartData)
          ? (chartData.chartData as { label: string; value: number }[]).length
          : 0
      } data points`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const export_visualization_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const format = args.format as ExportVisualizationArgs['format']
    const output_path = args.output_path as string | undefined
    const filename = output_path || `visualization_${Date.now()}.${format}`

    // For browser environment, we generate a downloadable file reference
    // The actual export is handled by the DataVisualization component
    return JSON.stringify({
      success: true,
      visualization_id: args.visualization_id as string | undefined,
      format,
      output_path: filename,
      message: `Visualization queued for export as ${format.toUpperCase()}`,
      download_url: `data:text/plain;base64,${btoa(JSON.stringify({ format, timestamp: Date.now() }))}`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const data_summary_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const data = args.data as DataSummaryArgs['data']
    const columns = args.columns as DataSummaryArgs['columns']
    const include_stats = (args.include_stats as boolean) ?? true
    const include_distributions = (args.include_distributions as boolean) ?? true
    const { headers, values } = parseData(data)

    const targetColumns = columns || headers
    const summary: Record<string, unknown> = {}

    if (include_stats) {
      targetColumns.forEach((col) => {
        const colValues = extractColumn(values, headers, col)
        if (colValues.length > 0) {
          const numericValues = colValues.filter((v) => !isNaN(v))
          if (numericValues.length > 0) {
            const sorted = [...numericValues].sort((a, b) => a - b)
            const sum = numericValues.reduce((a, b) => a + b, 0)
            summary[col] = {
              count: numericValues.length,
              mean: sum / numericValues.length,
              median: sorted[Math.floor(sorted.length / 2)],
              min: sorted[0],
              max: sorted[sorted.length - 1],
              std: Math.sqrt(
                numericValues.reduce(
                  (acc, val) => acc + Math.pow(val - sum / numericValues.length, 2),
                  0
                ) / numericValues.length
              ),
            }
          }
        }
      })
    }

    if (include_distributions) {
      targetColumns.forEach((col) => {
        const colValues = extractColumn(values, headers, col)
        if (colValues.length > 0) {
          const valueCounts: Record<string, number> = {}
          colValues.forEach((v) => {
            const key = String(v)
            valueCounts[key] = (valueCounts[key] || 0) + 1
          })
          const sortedCounts = Object.entries(valueCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
          summary[`${col}_distribution`] = {
            unique_values: Object.keys(valueCounts).length,
            top_values: sortedCounts.map(([value, count]) => ({ value, count })),
          }
        }
      })
    }

    return JSON.stringify({
      success: true,
      columns: targetColumns,
      row_count: values.length,
      summary,
      message: `Summarized ${targetColumns.length} columns with ${values.length} rows`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
