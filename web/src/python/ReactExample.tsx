/**
 * React Component Example - Python Code Execution
 *
 * This example shows how to integrate Pyodide Worker into a React component
 */

import { useState, useEffect, useRef } from 'react'
import { PyodideWorkerManager, downloadFileOutput } from './manager'

interface ExecutionResult {
  success: boolean
  result?: unknown
  stdout?: string
  stderr?: string
  images?: Array<{ filename: string; data: string }>
  outputFiles?: Array<{ name: string; content: ArrayBuffer }>
  executionTime: number
  error?: string
}

export function PythonExecutor() {
  const [code, setCode] = useState(`# 在这里输入 Python 代码
import pandas as pd
import numpy as np

# 创建示例数据
data = {
    '产品': ['A', 'B', 'C', 'D'],
    '销量': [100, 150, 120, 180],
    '价格': [10.5, 20.3, 15.8, 12.9]
}

df = pd.DataFrame(data)
print("数据预览:")
print(df)

print("\\n统计信息:")
print(df.describe())

# 返回结果
df.to_dict('records')
`)

  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const managerRef = useRef<PyodideWorkerManager | null>(null)

  // 初始化 manager
  useEffect(() => {
    managerRef.current = new PyodideWorkerManager()

    return () => {
      // 清理
      if (managerRef.current) {
        managerRef.current.terminate()
      }
    }
  }, [])

  const executeCode = async () => {
    if (!managerRef.current) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const executionResult = await managerRef.current.execute(
        code,
        [], // 无输入文件
        ['pandas', 'numpy'] // 需要的包
      )

      setResult(executionResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const clearOutput = () => {
    setResult(null)
    setError(null)
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Python 代码执行器</h1>

      {/* 代码输入 */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">Python 代码</label>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-64 w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          placeholder="输入 Python 代码..."
          disabled={loading}
        />
      </div>

      {/* 操作按钮 */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={executeCode}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '执行中...' : '执行代码'}
        </button>
        <button
          onClick={clearOutput}
          disabled={loading}
          className="rounded-lg bg-gray-200 px-6 py-2 text-gray-700 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          清除输出
        </button>
      </div>

      {/* 错误显示 */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="mb-2 font-semibold text-red-800">错误</h3>
          <pre className="whitespace-pre-wrap text-sm text-red-700">{error}</pre>
        </div>
      )}

      {/* 结果显示 */}
      {result && (
        <div className="space-y-6">
          {/* 执行状态 */}
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {result.success ? '✓ 执行成功' : '✗ 执行失败'}
            </span>
            <span className="text-sm text-gray-600">
              耗时: {result.executionTime.toFixed(2)} ms
            </span>
          </div>

          {/* 标准输出 */}
          {result.stdout && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="mb-2 font-semibold">输出</h3>
              <pre className="whitespace-pre-wrap font-mono text-sm">{result.stdout}</pre>
            </div>
          )}

          {/* 标准错误 */}
          {result.stderr && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <h3 className="mb-2 font-semibold text-yellow-800">标准错误</h3>
              <pre className="whitespace-pre-wrap font-mono text-sm text-yellow-700">
                {result.stderr}
              </pre>
            </div>
          )}

          {/* 返回值 */}
          {result.result !== undefined && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-2 font-semibold">返回值</h3>
              <pre className="overflow-auto text-sm">{JSON.stringify(result.result, null, 2)}</pre>
            </div>
          )}

          {/* Python 错误 */}
          {result.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="mb-2 font-semibold text-red-800">Python 错误</h3>
              <pre className="whitespace-pre-wrap font-mono text-sm text-red-700">
                {result.error}
              </pre>
            </div>
          )}

          {/* 图像输出 */}
          {result.images && result.images.length > 0 && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <h3 className="mb-4 font-semibold">生成的图像 ({result.images.length})</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {result.images.map((img, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-300 p-2">
                    <img
                      src={`data:image/png;base64,${img.data}`}
                      alt={img.filename}
                      className="h-auto w-full"
                    />
                    <p className="mt-2 text-center text-sm text-gray-600">{img.filename}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 输出文件 */}
          {result.outputFiles && result.outputFiles.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <h3 className="mb-4 font-semibold">输出文件 ({result.outputFiles.length})</h3>
              <div className="space-y-2">
                {result.outputFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border bg-white p-3"
                  >
                    <span className="font-mono text-sm">{file.name}</span>
                    <button
                      onClick={() => downloadFileOutput(file)}
                      className="rounded bg-green-600 px-4 py-1 text-sm text-white hover:bg-green-700"
                    >
                      下载
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 使用提示 */}
      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold">使用提示</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
          <li>首次执行会加载 Pyodide (几秒钟)</li>
          <li>支持 pandas, numpy, matplotlib 等常用包</li>
          <li>图像会自动显示在结果中</li>
          <li>输出文件可以直接下载</li>
          <li>默认超时 30 秒,防止长时间运行的代码</li>
        </ul>
      </div>
    </div>
  )
}
