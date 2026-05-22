import { cn } from '../../../../lib/format'
import { Button } from '../../../../components/ui/Button'
import { useI18n } from '../../../../i18n'

type AgentListHeroEmptyMode = 'create' | 'search'

interface AgentListHeroEmptyProps {
  mode: AgentListHeroEmptyMode
  onAction?: () => void
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
    'relative mb-4 flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-zinc-300 bg-white px-4 py-8 sm:mb-5 sm:px-6 sm:py-10',
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
    </section>
  )
}
