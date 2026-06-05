import { Bot, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatSessionState } from '../../../domains/agents/types'
import { useI18n } from '../../../i18n'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'

interface AgentChatWorkspaceProps {
  session: ChatSessionState | null
  onDraftChange: (value: string) => void
  onSend: () => void
  onOpen?: () => void
  emptyTitle?: string
  emptyDescription?: string
}

export function AgentChatWorkspace({
  session,
  onDraftChange,
  onSend,
  onOpen,
  emptyTitle,
  emptyDescription,
}: AgentChatWorkspaceProps) {
  const { t } = useI18n()
  const resolvedEmptyTitle = emptyTitle || t('chat.workspace')
  const resolvedEmptyDescription = emptyDescription || t('chat.defaultEmptyDesc')
  const [isComposing, setIsComposing] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [session?.messages])

  if (!session) {
    return (
      <Card className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-[16px] border-zinc-200 bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <Bot size={22} />
        </div>
        <div className="mt-4 text-[15px] font-semibold text-zinc-950">{resolvedEmptyTitle}</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">{resolvedEmptyDescription}</p>
        {onOpen ? (
          <div className="mt-4">
            <Button className="h-10 rounded-[10px] px-4 text-[14px] leading-5" onClick={onOpen}>
              <Bot size={16} />
              {t('chat.start')}
            </Button>
          </div>
        ) : null}
      </Card>
    )
  }

  return (
    <div className="workbench-card-strong flex min-h-[460px] flex-col overflow-hidden rounded-[16px] border-zinc-200 bg-white xl:h-full xl:min-h-[460px]">
      <div className="border-b border-zinc-100 bg-white px-6 pt-6 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-[18px]/7 font-semibold tracking-[-0.01em] text-zinc-950">
              {t('chat.workspace')}
            </div>
            <div className="mt-2 text-sm leading-6 text-zinc-500">
              {t('chat.workspaceDesc')}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[12px] text-zinc-500">
              <span className="inline-flex h-7 items-center rounded-[8px] border border-zinc-200 bg-zinc-50 px-2.5 font-medium text-zinc-600">
                {session.resource.aliasName || session.resource.name}
              </span>
              <span className="inline-flex h-7 items-center rounded-[8px] border border-zinc-200 bg-zinc-50 px-2.5 font-medium text-zinc-500">
                {t('chat.model', { model: session.resource.model || '--' })}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500 xl:justify-end">
            <span className="inline-flex h-7 items-center rounded-[8px] border border-zinc-200 bg-zinc-50 px-2.5 font-medium text-zinc-500">
              {t('chat.status', { status: session.status })}
            </span>
            <span className="inline-flex h-7 items-center rounded-[8px] border border-zinc-200 bg-zinc-50 px-2.5 font-medium text-zinc-500">
              {t('chat.transport', { transport: session.transport })}
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        <div className="flex min-h-[350px] flex-col overflow-hidden rounded-[14px] border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] xl:h-full xl:min-h-[350px] xl:min-h-0">
          <div className="border-b border-zinc-100 px-4 py-4">
            <div className="text-[12px]/5 font-semibold text-zinc-950">{t('chat.messages')}</div>
            <div className="mt-1 text-[11px]/4 text-zinc-500">{t('chat.messagesDesc')}</div>
          </div>

          <div
            className="bg-zinc-50/70 px-4 py-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
            ref={messagesContainerRef}
          >
            <div className="space-y-3">
            {!session.messages.length ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-white px-5 text-center text-sm text-zinc-400">
                {t('chat.emptyMessages')}
                </div>
            ) : (
              session.messages.map((message) => (
                <div
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[86%] xl:max-w-[82%] rounded-[14px] px-4 py-3 text-[14px] leading-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
                      message.role === 'user'
                        ? 'rounded-br-[8px] bg-[var(--color-brand)] text-white'
                        : 'rounded-bl-[8px] border border-zinc-200 bg-white text-zinc-800'
                    }`}
                  >
                    <div
                      className={`mb-1 text-[11px] font-medium ${
                        message.role === 'user' ? 'text-white/80' : 'text-zinc-500'
                      }`}
                    >
                      {message.role === 'user' ? t('chat.me') : 'Agent'}
                    </div>
                    {message.content}
                  </div>
                </div>
              ))
            )}
            </div>
          </div>

          {session.error ? (
            <div className="mx-4 mb-4 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {session.error}
            </div>
          ) : null}

          <div className="border-t border-zinc-100 bg-white px-4 py-4">
            <div className="relative">
              <textarea
                className="min-h-[108px] w-full rounded-[16px] border border-zinc-200 bg-white px-4 py-3 pr-[132px] text-[14px] leading-6 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand)]/10"
                onChange={(event) => onDraftChange(event.target.value)}
                onCompositionEnd={() => setIsComposing(false)}
                onCompositionStart={() => setIsComposing(true)}
                onKeyDown={(event) => {
                  if (isComposing || event.nativeEvent.isComposing) return
                  if (event.key !== 'Enter') return
                  if (event.shiftKey || event.metaKey) {
                    return
                  }
                  event.preventDefault()
                  if (!session.draft.trim() || session.status === 'connecting') return
                  onSend()
                }}
                placeholder={t('chat.inputPlaceholder')}
                value={session.draft}
              />
              <Button
                className="absolute bottom-4 right-4 h-10 rounded-[12px] px-4 text-[14px] leading-5 shadow-none"
                disabled={!session.draft.trim() || session.status === 'connecting'}
                leading={<Send size={16} />}
                onClick={onSend}
              >
                {session.status === 'connecting' ? t('chat.sending') : t('chat.send')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
