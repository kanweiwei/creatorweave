/**
 * Tests for Data Visualization Tool
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  generate_chart_executor,
  export_visualization_executor,
  data_summary_executor,
} from '../data-visualization.tool'
import type { ToolContext } from '../tool-types'

describe('Data Visualization Tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
  })

  describe('generate_chart', () => {
    it('should generate bar chart', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'bar',
        data: [
          { category: 'A', value: 10 },
          { category: 'B', value: 20 },
          { category: 'C', value: 15 },
        ],
        label_column: 'category',
        value_column: 'value',
        title: 'Test Bar Chart',
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.chart_type).toBe('bar')
      expect(result.data_points).toBe(3)
      expect(result.visualization.type).toBe('bar')
      expect(result.visualization.title).toBe('Test Bar Chart')
    })

    it('should generate line chart', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'line',
        data: [
          { month: 'Jan', sales: 100 },
          { month: 'Feb', sales: 150 },
          { month: 'Mar', sales: 200 },
        ],
        label_column: 'month',
        value_column: 'sales',
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.chart_type).toBe('line')
      expect(result.data_points).toBe(3)
      expect(result.visualization.type).toBe('line')
    })

    it('should generate pie chart', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'pie',
        data: [
          { item: 'Apple', count: 30 },
          { item: 'Banana', count: 45 },
          { item: 'Cherry', count: 25 },
        ],
        label_column: 'item',
        value_column: 'count',
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.chart_type).toBe('pie')
      expect(result.visualization.type).toBe('pie')
    })

    it('should generate scatter plot', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'scatter',
        data: [
          { x: 1, y: 2 },
          { x: 2, y: 4 },
          { x: 3, y: 5 },
          { x: 4, y: 8 },
        ],
        x_column: 'x',
        y_column: 'y',
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.chart_type).toBe('scatter')
      expect(result.visualization.type).toBe('scatter')
    })

    it('should generate histogram', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'histogram',
        data: [
          { value: 1 },
          { value: 2 },
          { value: 3 },
          { value: 5 },
          { value: 7 },
          { value: 8 },
          { value: 9 },
          { value: 10 },
          { value: 12 },
          { value: 15 },
        ],
        x_column: 'value',
        bins: 5,
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.chart_type).toBe('histogram')
      expect(result.visualization.type).toBe('bar')
    })

    it('should handle unsupported chart type', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'unsupported',
        data: [],
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported chart type')
    })

    it('should handle array of arrays input', async () => {
      const args: Record<string, unknown> = {
        chart_type: 'bar',
        data: [
          ['A', 10],
          ['B', 20],
          ['C', 15],
        ],
        label_column: '0',
        value_column: '1',
      }

      const result = JSON.parse(await generate_chart_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.data_points).toBe(3)
    })
  })

  describe('export_visualization', () => {
    it('should export as PNG', async () => {
      const args = {
        format: 'png' as const,
        output_path: 'chart.png',
      }

      const result = JSON.parse(await export_visualization_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.format).toBe('png')
      expect(result.output_path).toBe('chart.png')
    })

    it('should export as CSV', async () => {
      const args = {
        format: 'csv' as const,
      }

      const result = JSON.parse(await export_visualization_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.format).toBe('csv')
    })

    it('should use auto-generated filename', async () => {
      const args = {
        format: 'svg' as const,
      }

      const result = JSON.parse(await export_visualization_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.output_path).toContain('visualization_')
      expect(result.output_path).toContain('.svg')
    })
  })

  describe('data_summary', () => {
    it('should generate basic statistics', async () => {
      const args: Record<string, unknown> = {
        data: [
          { id: 1, value: 10 },
          { id: 2, value: 20 },
          { id: 3, value: 30 },
          { id: 4, value: 40 },
          { id: 5, value: 50 },
        ],
        columns: ['value'],
        include_stats: true,
        include_distributions: false,
      }

      const result = JSON.parse(await data_summary_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.columns).toContain('value')
      expect(result.summary.value).toBeDefined()
      expect(result.summary.value.mean).toBe(30)
      expect(result.summary.value.min).toBe(10)
      expect(result.summary.value.max).toBe(50)
    })

    it('should include distributions', async () => {
      const args: Record<string, unknown> = {
        data: [
          { name: 'A', category: 'X' },
          { name: 'B', category: 'Y' },
          { name: 'C', category: 'X' },
          { name: 'D', category: 'X' },
          { name: 'E', category: 'Y' },
        ],
        columns: ['category'],
        include_stats: false,
        include_distributions: true,
      }

      const result = JSON.parse(await data_summary_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.category_distribution).toBeDefined()
      expect(result.summary.category_distribution.unique_values).toBe(2)
    })

    it('should handle all columns by default', async () => {
      const args: Record<string, unknown> = {
        data: [
          { a: 1, b: 2, c: 3 },
          { a: 4, b: 5, c: 6 },
        ],
        include_stats: true,
        include_distributions: false,
      }

      const result = JSON.parse(await data_summary_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.columns.length).toBe(3)
    })

    it('should calculate standard deviation', async () => {
      const args: Record<string, unknown> = {
        data: [{ val: 10 }, { val: 20 }, { val: 30 }, { val: 40 }, { val: 50 }],
        columns: ['val'],
        include_stats: true,
        include_distributions: false,
      }

      const result = JSON.parse(await data_summary_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.val.std).toBeDefined()
      // Std for [10,20,30,40,50] is ~14.14
      expect(Math.abs((result.summary.val.std as number) - 14.14)).toBeLessThan(0.1)
    })
  })
})
