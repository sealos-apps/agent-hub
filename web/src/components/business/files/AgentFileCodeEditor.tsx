import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'
import { cn } from '../../../lib/format'
import { getFileExtension } from './fileHelpers'

interface AgentFileCodeEditorProps {
  value: string
  path?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  className?: string
}

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
}: AgentFileCodeEditorProps) {
  const extensions = useMemo(
    () => [EditorView.lineWrapping, ...resolveLanguageExtensions(path)],
    [path],
  )

  return (
    <div
      className={cn(
        'h-full overflow-hidden rounded-[20px] border border-zinc-200 bg-white',
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
        value={value}
      />
    </div>
  )
}
