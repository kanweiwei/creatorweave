import { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useEffect, useMemo, useState } from 'react'

let loaderConfigured = false

function ensureMonacoLoaderConfigured(): void {
  if (loaderConfigured) return
  loader.config({ monaco })
  loaderConfigured = true
}

function languageFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js')) return 'javascript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss')) return 'scss'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  return 'plaintext'
}

interface MonacoDiffEditorProps {
  original: string
  modified: string
  path: string
}

export default function MonacoDiffEditor({ original, modified, path }: MonacoDiffEditorProps) {
  ensureMonacoLoaderConfigured()

  const language = useMemo(() => languageFromPath(path), [path])
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const updateTheme = () => setIsDark(root.classList.contains('dark'))

    updateTheme()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          updateTheme()
          break
        }
      }
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  const theme = isDark ? 'vs-dark' : 'vs'

  return (
    <div className="h-full w-full" data-testid="monaco-diff-editor">
      <DiffEditor
        height="100%"
        language={language}
        original={original}
        modified={modified}
        theme={theme}
        options={{
          readOnly: true,
          automaticLayout: true,
          renderSideBySide: true,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          wordWrap: 'on',
          diffWordWrap: 'on',
          renderOverviewRuler: false,
          glyphMargin: false,
          lineDecorationsWidth: 8,
        }}
      />
    </div>
  )
}
