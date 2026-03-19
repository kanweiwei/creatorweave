import { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useEffect, useMemo, useRef, useState } from 'react'

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

export type DiffCommentTarget = {
  side: 'original' | 'modified'
  startLine: number
  endLine: number
}

interface LineComment {
  side: 'original' | 'modified'
  startLine: number
  endLine: number
}

interface MonacoDiffEditorProps {
  original: string
  modified: string
  path: string
  comments?: LineComment[]
  onLineSelectForComment?: (target: DiffCommentTarget) => void
}

export default function MonacoDiffEditor({
  original,
  modified,
  path,
  comments = [],
  onLineSelectForComment,
}: MonacoDiffEditorProps) {
  ensureMonacoLoaderConfigured()

  const language = useMemo(() => languageFromPath(path), [path])
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const originalMouseDisposableRef = useRef<monaco.IDisposable | null>(null)
  const modifiedMouseDisposableRef = useRef<monaco.IDisposable | null>(null)
  const originalAnchorRef = useRef<number | null>(null)
  const modifiedAnchorRef = useRef<number | null>(null)

  useEffect(() => {
    originalAnchorRef.current = null
    modifiedAnchorRef.current = null
  }, [path])

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

  useEffect(() => {
    const diffEditor = diffEditorRef.current
    const monacoNs = monacoRef.current
    if (!diffEditor || !monacoNs) return

    const originalEditor = diffEditor.getOriginalEditor()
    const modifiedEditor = diffEditor.getModifiedEditor()

    const originalDecorations = comments
      .filter((item) => item.side === 'original')
      .map((item) => ({
        range: new monacoNs.Range(item.startLine, 1, item.endLine, 1),
        options: {
          isWholeLine: true,
          className: 'cw-commented-line',
          glyphMarginClassName: 'cw-comment-glyph',
          glyphMarginHoverMessage: { value: '该行有评论' },
        },
      }))

    const modifiedDecorations = comments
      .filter((item) => item.side === 'modified')
      .map((item) => ({
        range: new monacoNs.Range(item.startLine, 1, item.endLine, 1),
        options: {
          isWholeLine: true,
          className: 'cw-commented-line',
          glyphMarginClassName: 'cw-comment-glyph',
          glyphMarginHoverMessage: { value: '该行有评论' },
        },
      }))

    originalEditor.deltaDecorations([], originalDecorations)
    modifiedEditor.deltaDecorations([], modifiedDecorations)
  }, [comments])

  useEffect(() => {
    return () => {
      originalMouseDisposableRef.current?.dispose()
      modifiedMouseDisposableRef.current?.dispose()
    }
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
        onMount={(editor, monacoNs) => {
          diffEditorRef.current = editor
          monacoRef.current = monacoNs

          const bindMouse = (
            targetEditor: monaco.editor.ICodeEditor,
            side: 'original' | 'modified'
          ): monaco.IDisposable => {
            return targetEditor.onMouseDown((event) => {
              const targetType = event.target.type
              const isGutter =
                targetType === monacoNs.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                targetType === monacoNs.editor.MouseTargetType.GUTTER_LINE_NUMBERS

              if (!isGutter) return
              const line = event.target.position?.lineNumber
              if (!line) return
              const isShiftPressed = Boolean(event.event.browserEvent?.shiftKey)
              const anchorRef = side === 'original' ? originalAnchorRef : modifiedAnchorRef
              const anchor = anchorRef.current

              if (!isShiftPressed || anchor === null) {
                anchorRef.current = line
                onLineSelectForComment?.({ side, startLine: line, endLine: line })
                return
              }

              const startLine = Math.min(anchor, line)
              const endLine = Math.max(anchor, line)
              onLineSelectForComment?.({ side, startLine, endLine })
            })
          }

          originalMouseDisposableRef.current?.dispose()
          modifiedMouseDisposableRef.current?.dispose()
          originalMouseDisposableRef.current = bindMouse(editor.getOriginalEditor(), 'original')
          modifiedMouseDisposableRef.current = bindMouse(editor.getModifiedEditor(), 'modified')
        }}
        options={{
          readOnly: true,
          automaticLayout: true,
          renderSideBySide: true,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          wordWrap: 'on',
          diffWordWrap: 'on',
          renderOverviewRuler: false,
          glyphMargin: true,
          lineDecorationsWidth: 8,
        }}
      />
    </div>
  )
}
