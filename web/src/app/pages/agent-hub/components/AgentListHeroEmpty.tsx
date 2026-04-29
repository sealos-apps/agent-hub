import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '../../../../lib/format'
import { Button } from '../../../../components/ui/Button'
import { useI18n } from '../../../../i18n'

type AgentListHeroEmptyMode = 'create' | 'search'

interface AgentListHeroEmptyProps {
  mode: AgentListHeroEmptyMode
  onAction?: () => void
}

function EmptyPagination() {
  const { t } = useI18n()

  return (
    <div className="flex items-center justify-between px-1 py-3 text-[14px] text-zinc-500">
      <div>{t('common.total', { total: 0 })}</div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-100 text-zinc-300"
            disabled
            type="button"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-100 text-zinc-300"
            disabled
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
        <div>
          <span className="font-medium text-zinc-900">1</span>
          <span className="px-2">/</span>
          <span>1</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-900"
            disabled
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-900"
            disabled
            type="button"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
        <div>{t('common.pageSize')}</div>
      </div>
    </div>
  )
}

function EmptyTableHeader() {
  const { t } = useI18n()

  return (
    <div className="rounded-[12px] border-zinc-200/90 bg-white px-5 py-3.5 text-[14px]/5 text-zinc-500 shadow-[0_1px_2px_rgba(24,24,27,0.03)] lg:px-6">
      <div className="overflow-x-auto">
        <div className="grid min-w-[892px] grid-cols-[minmax(188px,1.5fr)_minmax(124px,0.82fr)_minmax(160px,1fr)_minmax(136px,0.86fr)_minmax(188px,1fr)] items-center gap-4">
          <div className="min-w-0 truncate pr-2">{t('agent.instance')}</div>
          <div className="min-w-0 truncate pr-2">{t('agent.status')}</div>
          <div className="min-w-0 truncate pr-2">{t('agent.resourceSpec')}</div>
          <div className="min-w-0 truncate pr-2">{t('agent.updatedAt')}</div>
          <div className="min-w-0 truncate text-left">{t('agent.actions')}</div>
        </div>
      </div>
    </div>
  )
}

export function AgentListHeroEmpty({ mode, onAction }: AgentListHeroEmptyProps) {
  const { locale, t } = useI18n()
  const content = mode === 'create'
    ? {
      title: t('agent.emptyCreateTitle'),
      description: t('agent.emptyCreateDesc'),
      actionLabel: t('agent.emptyCreateAction'),
      image: '',
    }
    : {
      title: t('agent.emptySearchTitle'),
      description: t('agent.emptySearchDesc'),
      actionLabel: t('agent.emptySearchAction'),
    }
  const interactive = Boolean(onAction)
  const handleAction = () => {
    onAction?.()
  }

  const panelClassName = cn(
    'relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-zinc-300 bg-white px-4 py-8 sm:px-6 sm:py-10',
    interactive
      ? 'cursor-pointer transition-colors hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200'
      : '',
  )

  const panelContent = (
    <div className="relative z-10 flex w-full max-w-[760px] flex-col items-center gap-3 px-4 text-center">
        <div className="text-[24px]/8 font-semibold tracking-[-0.02em] text-zinc-950">{content.title}</div>
        <p
          className={cn(
            'text-[16px]/6 text-[#4d4d4d]',
            mode === 'create' && locale === 'zh-CN' ? 'max-w-none whitespace-nowrap' : 'max-w-[640px]',
          )}
        >
          {content.description}
        </p>
        {interactive ? (
          <Button
            className="mt-4 h-10 rounded-[10px] border-zinc-200 bg-white px-4 text-[14px] font-medium text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            onClick={(event) => {
              event.stopPropagation()
              handleAction()
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            {content.actionLabel}
          </Button>
        ) : null}
      </div>
  )

  return (
    <section className="flex min-h-[320px] flex-1 flex-col">
      <EmptyTableHeader />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {interactive ? (
          <div
            className={panelClassName}
            onClick={handleAction}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleAction()
              }
            }}
            role="button"
            tabIndex={0}
          >
            {panelContent}
          </div>
        ) : (
          <div className={panelClassName}>{panelContent}</div>
        )}
      </div>
      <EmptyPagination />
    </section>
  )
}
