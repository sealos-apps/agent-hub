import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { APP_LOGO_URL, APP_NAME } from '../../../../branding'
import { Button } from '../../../../components/ui/Button'
import { SearchField } from '../../../../components/ui/SearchField'
import { LanguageSwitch, useI18n } from '../../../../i18n'
import { cn } from '../../../../lib/format'

interface AgentWorkspaceShellProps {
  children: ReactNode
  className?: string
  headerActions?: ReactNode
}

type ShellView = 'agents' | 'market' | 'create' | 'detail'

function resolveView(pathname: string): ShellView {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPathname === '/agents/templates') return 'market'
  if (normalizedPathname === '/agents/create') return 'create'
  if (normalizedPathname.startsWith('/agents/')) return 'detail'
  return 'agents'
}

export function AgentWorkspaceShell({
  children,
  className,
  headerActions,
}: AgentWorkspaceShellProps) {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const view = useMemo(() => resolveView(location.pathname), [location.pathname])

  const breadcrumb = useMemo(() => {
    switch (view) {
      case 'agents':
        return (
          <>
            <b className="text-[#223047]">{t('nav.myAgents')}</b>
            <span>/</span>
            <span>{t('nav.overview')}</span>
          </>
        )
      case 'market':
        return (
          <>
            <b className="text-[#223047]">{t('nav.market')}</b>
            <span>/</span>
            <span>{t('nav.selectTemplate')}</span>
          </>
        )
      case 'create':
        return (
          <>
            <b className="text-[#223047]">{t('nav.market')}</b>
            <span>/</span>
            <span>{t('nav.createAgent')}</span>
          </>
        )
      default:
        return (
          <>
            <b className="text-[#223047]">{t('nav.agentList')}</b>
            <span>/</span>
            <span>{t('nav.agentDetail')}</span>
          </>
        )
    }
  }, [t, view])

  const showCreateStepper = false
  const showHeaderSearch = view === 'agents' || view === 'market'
  const headerSearchValue = showHeaderSearch ? String(searchParams.get('q') || '') : ''
  const [headerSearchDraft, setHeaderSearchDraft] = useState(headerSearchValue)
  const headerSearchPlaceholder = view === 'market' ? t('search.templates') : t('search.agents')
  const showBack = view !== 'agents'
  const showLeftBack = showBack && (view === 'market' || view === 'create' || view === 'detail')
  const showRightBack = showBack && !showLeftBack
  const showBrand = view !== 'market' && view !== 'create' && view !== 'detail'
  const backTarget = view === 'create' ? '/agents/templates' : '/agents'

  useEffect(() => {
    setHeaderSearchDraft(headerSearchValue)
  }, [headerSearchValue])

  useEffect(() => {
    if (!showHeaderSearch) return

    const normalizedDraft = headerSearchDraft.trim()
    if (normalizedDraft === headerSearchValue) return

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(location.search)
      if (normalizedDraft) {
        next.set('q', normalizedDraft)
      } else {
        next.delete('q')
      }
      setSearchParams(next, { replace: true })
    }, 240)

    return () => window.clearTimeout(timer)
  }, [headerSearchDraft, headerSearchValue, location.search, setSearchParams, showHeaderSearch])

  const handleHeaderSearchChange = (value: string) => {
    setHeaderSearchDraft(value)
  }

  const renderTopActions = () => {
    if (view === 'agents') {
      return (
        <div className="flex shrink-0 items-center gap-2 min-[860px]:gap-2.5">
          <Button
            className="min-[720px]:h-9 min-[720px]:px-3 min-[720px]:text-[13px] min-[860px]:h-10 min-[860px]:px-4 min-[860px]:text-[14px]"
            onClick={() => navigate('/agents/templates')}
            size="md"
            variant="secondary"
          >
            {t('nav.browseTemplates')}
          </Button>
          <LanguageSwitch className="hidden min-[720px]:inline-flex" />
          <Button
            className="shadow-[0_10px_20px_rgba(37,99,255,0.18)] min-[720px]:h-9 min-[720px]:px-3 min-[720px]:text-[13px] min-[860px]:h-10 min-[860px]:px-4 min-[860px]:text-[14px]"
            onClick={() => navigate('/agents/templates')}
            size="md"
            variant="primary"
          >
            ＋ {t('nav.createAgent')}
          </Button>
        </div>
      )
    }

    return null
  }
  const topActions = headerActions ?? renderTopActions()
  const showRightTools = showRightBack || showHeaderSearch || showCreateStepper || Boolean(topActions)

  const isDetailView = view === 'detail'
  const isAgentsView = view === 'agents'

  return (
    <div className={cn('h-screen overflow-hidden text-[var(--color-text)]', isDetailView ? 'bg-[#f5f7fb]' : 'bg-white')}>
      <section
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden',
          isDetailView ? 'bg-[#f5f7fb]' : 'bg-white',
          className,
        )}
      >
        <header
          className={cn(
            'relative z-10 flex items-center border-b border-[var(--color-border)] bg-[rgba(255,255,255,.96)]',
            isAgentsView
              ? 'min-h-[72px] flex-wrap gap-x-3 gap-y-2 px-4 py-3 sm:px-5 min-[720px]:flex-nowrap'
              : 'flex-wrap gap-x-4 gap-y-3 px-5 sm:px-7',
            view === 'detail' ? 'min-h-[58px] py-2' : isAgentsView ? '' : 'min-h-[78px] py-3',
          )}
        >
          <div className={cn('flex min-w-0 items-center', isAgentsView ? 'shrink-0 gap-2.5' : 'gap-3')}>
            {showLeftBack ? (
              <Button
                aria-label={t('common.back')}
                className="h-9 w-9 p-0"
                leading={<ArrowLeft className="h-4 w-4" />}
                onClick={() => navigate(backTarget)}
                size="sm"
                variant="ghost"
              >
                <span className="sr-only">{t('common.back')}</span>
              </Button>
            ) : null}

            {showBrand ? (
              <>
                <div className={cn('flex shrink-0 items-center whitespace-nowrap font-extrabold', isAgentsView ? 'gap-2.5 text-lg min-[860px]:text-xl' : 'gap-3 text-xl')}>
                  <img
                    alt={`${APP_NAME} logo`}
                    className="h-7 w-7 rounded-[8px] object-cover"
                    src={APP_LOGO_URL}
                  />
                  <span>{APP_NAME}</span>
                </div>
                <span className="hidden h-6 w-px bg-[var(--color-border)] min-[720px]:block" />
              </>
            ) : null}

            <div
              className={cn(
                'min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-[#697386]',
                view === 'market' || view === 'create' || view === 'detail' ? 'flex' : 'hidden md:flex',
              )}
            >
              {breadcrumb}
            </div>
          </div>

          {showRightTools ? (
            <div
              className={cn(
                'ml-auto flex items-center justify-end gap-2',
                isAgentsView
                  ? 'w-full flex-wrap min-[720px]:w-auto min-[720px]:flex-nowrap'
                  : 'w-full flex-wrap md:w-auto md:flex-nowrap',
              )}
            >
              {showHeaderSearch ? (
                <SearchField
                  aria-label={headerSearchPlaceholder}
                  className={cn(
                    isAgentsView
                      ? 'w-full min-w-[150px] sm:w-[240px] min-[720px]:w-[180px] min-[860px]:w-[240px] lg:w-[320px]'
                      : 'w-full min-w-[220px] sm:w-[280px] lg:w-[360px]',
                  )}
                  onChange={(event) => handleHeaderSearchChange(event.target.value)}
                  placeholder={headerSearchPlaceholder}
                  value={headerSearchDraft}
                />
              ) : null}

              {showRightBack ? (
                <Button
                  aria-label={t('common.back')}
                  className="h-9 w-9 p-0"
                  leading={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => navigate(backTarget)}
                  size="sm"
                  variant="ghost"
                >
                  <span className="sr-only">{t('common.back')}</span>
                </Button>
              ) : null}

              {showCreateStepper ? (
                <div className="hidden items-center gap-2 text-[13px] font-semibold text-[#8a94a6] xl:flex">
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-white">
                      ✓
                    </span>
                    {t('nav.selectTemplate')}
                  </span>
                  <span className="h-px w-16 bg-[#dce2eb]" />
                  <span className="flex items-center gap-1.5 text-[var(--color-brand)]">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-white">
                      2
                    </span>
                    {t('agent.resourceSpec')}
                  </span>
                  <span className="h-px w-16 bg-[#dce2eb]" />
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[#cfd7e5] bg-white text-[#6b7280]">
                      3
                    </span>
                    {t('common.confirmDeploy')}
                  </span>
                </div>
              ) : null}

              {topActions}
            </div>
          ) : null}
        </header>

        <div className={cn('min-h-0 flex-1 overflow-hidden', isDetailView ? 'bg-[#f5f7fb]' : 'bg-white')}>{children}</div>
      </section>
    </div>
  )
}
