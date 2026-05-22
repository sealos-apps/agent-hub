import { LoaderCircle, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentListItem } from '../../../../domains/agents/types'

interface AgentNameCellProps {
  item: AgentListItem
  onOpenDetail: (item: AgentListItem) => void
  onRenameAlias: (item: AgentListItem, aliasName: string) => Promise<void> | void
}

export function AgentNameCell({
  item,
  onOpenDetail,
  onRenameAlias,
}: AgentNameCellProps) {
  const displayName = item.aliasName || item.name
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const skipBlurSubmitRef = useRef(false)

  useEffect(() => {
    if (!editing) {
      setDraft(displayName)
      return
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [displayName, editing])

  const startEditing = () => {
    skipBlurSubmitRef.current = false
    setDraft(displayName)
    setEditing(true)
  }

  const cancelEditing = () => {
    skipBlurSubmitRef.current = true
    setDraft(displayName)
    setEditing(false)
    setSaving(false)
  }

  const submitAlias = async () => {
    if (saving) return

    const nextAlias = draft.trim()
    if (!nextAlias || nextAlias === displayName) {
      setDraft(displayName)
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      await onRenameAlias(item, nextAlias)
      setEditing(false)
    } catch {
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-3.5 pr-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-[0.5px] border-zinc-200 bg-zinc-50/90">
        <img
          alt={`${item.template.name} logo`}
          className="h-9 w-9 object-cover"
          src={item.template.logo}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {editing ? (
            <div className="flex h-7 min-w-0 max-w-[220px] items-center gap-1 rounded-[7px] border border-blue-200 bg-white px-2 shadow-[0_0_0_2px_rgba(37,99,235,0.08)]">
              <input
                aria-label="修改 Agent 别名"
                className="min-w-0 flex-1 bg-transparent text-[14px]/5 font-medium text-zinc-950 outline-none"
                disabled={saving}
                onBlur={() => {
                  if (skipBlurSubmitRef.current) {
                    skipBlurSubmitRef.current = false
                    return
                  }
                  void submitAlias()
                }}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submitAlias()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEditing()
                  }
                }}
                ref={inputRef}
                value={draft}
              />
              {saving ? <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" /> : null}
            </div>
          ) : (
            <>
              <button
                className="block min-w-0 max-w-full truncate text-left text-[14px]/5 font-medium tracking-[-0.01em] text-zinc-950 transition hover:text-blue-600"
                onClick={() => onOpenDetail(item)}
                type="button"
              >
                {displayName}
              </button>
              <button
                aria-label={`修改 ${displayName} 的别名`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-800 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                onClick={startEditing}
                title="修改别名"
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px]/4 text-zinc-500">
          <span className="truncate">{item.template.name}</span>
          <span className="shrink-0 text-zinc-300">/</span>
          <span className="truncate font-mono text-[11px]/4 text-zinc-400">{item.name}</span>
        </div>
      </div>
    </div>
  )
}
