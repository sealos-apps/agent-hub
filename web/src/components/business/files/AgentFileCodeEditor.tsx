import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import CodeMirror from '@uiw/react-codemirror'
import { tags } from '@lezer/highlight'
import { useMemo } from 'react'
import { cn } from '../../../lib/format'
import { getFileExtension } from './fileHelpers'

interface AgentFileCodeEditorProps {
  value: string
  path?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  className?: string
  theme?: 'light' | 'dark'
}

const darkEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#05070a',
      color: '#e5e7eb',
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#f8fafc',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '13px',
      lineHeight: '1.65',
      padding: '16px 0',
    },
    '.cm-editor': {
      backgroundColor: '#05070a',
      height: '100%',
    },
    '.cm-focused': {
      outline: 'none',
    },
    '.cm-gutters': {
      backgroundColor: '#05070a',
      borderRight: '1px solid rgba(148, 163, 184, 0.16)',
      color: '#64748b',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(148, 163, 184, 0.10)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(148, 163, 184, 0.10)',
      color: '#cbd5e1',
    },
    '.cm-line': {
      padding: '0 20px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(56, 189, 248, 0.28)',
    },
    '.cm-scroller': {
      backgroundColor: '#05070a',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    '.cm-cursor': {
      borderLeftColor: '#f8fafc',
    },
  },
  { dark: true },
)

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c084fc' },
  { tag: tags.operatorKeyword, color: '#c084fc' },
  { tag: tags.atom, color: '#f472b6' },
  { tag: tags.bool, color: '#f472b6' },
  { tag: tags.null, color: '#f472b6' },
  { tag: tags.string, color: '#86efac' },
  { tag: tags.special(tags.string), color: '#67e8f9' },
  { tag: tags.number, color: '#fbbf24' },
  { tag: tags.comment, color: '#64748b', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#e2e8f0' },
  { tag: tags.definition(tags.variableName), color: '#93c5fd' },
  { tag: tags.function(tags.variableName), color: '#67e8f9' },
  { tag: tags.propertyName, color: '#f9a8d4' },
  { tag: tags.typeName, color: '#fcd34d' },
  { tag: tags.className, color: '#fcd34d' },
  { tag: tags.attributeName, color: '#93c5fd' },
  { tag: tags.regexp, color: '#fdba74' },
  { tag: tags.tagName, color: '#fb7185' },
  { tag: tags.heading, color: '#f8fafc', fontWeight: '600' },
  { tag: tags.link, color: '#38bdf8', textDecoration: 'underline' },
])

const resolveLanguageExtensions = (path = '') => {
  const extension = getFileExtension(path)
  const normalizedName = String(path || '').trim().toLowerCase()

  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') {
    return [markdown()]
  }

  if (extension === 'js' || extension === 'jsx') {
    return [javascript({ jsx: true })]
  }

  if (extension === 'ts' || extension === 'tsx') {
    return [javascript({ typescript: true, jsx: true })]
  }

  if (extension === 'json') {
    return [json()]
  }

  if (extension === 'html' || extension === 'htm') {
    return [html()]
  }

  if (extension === 'xml' || extension === 'svg') {
    return [xml()]
  }

  if (extension === 'css' || extension === 'scss' || extension === 'less') {
    return [css()]
  }

  if (extension === 'yaml' || extension === 'yml') {
    return [yaml()]
  }

  if (extension === 'py') {
    return [python()]
  }

  if (extension === 'sql') {
    return [sql()]
  }

  if (normalizedName === 'dockerfile' || normalizedName === 'makefile') {
    return []
  }

  return []
}

export function AgentFileCodeEditor({
  value,
  path = '',
  readOnly = false,
  onChange,
  className,
  theme = 'light',
}: AgentFileCodeEditorProps) {
  const darkMode = theme === 'dark'
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      ...(darkMode ? [darkEditorTheme, syntaxHighlighting(darkHighlightStyle)] : []),
      ...resolveLanguageExtensions(path),
    ],
    [darkMode, path],
  )

  return (
    <div
      className={cn(
        'h-full overflow-hidden rounded-[20px] border',
        darkMode ? 'border-zinc-800 bg-[#05070a]' : 'border-zinc-200 bg-white',
        className,
      )}
    >
      <CodeMirror
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
        }}
        className="h-full text-[13px]"
        editable={!readOnly}
        extensions={extensions}
        height="100%"
        onChange={onChange}
        readOnly={readOnly}
        theme={theme}
        value={value}
      />
    </div>
  )
}
