import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { APP_NAME } from '../../../../branding'
import { Button } from '../../../../components/ui/Button'
import { SearchField } from '../../../../components/ui/SearchField'
import { cn } from '../../../../lib/format'

interface AgentWorkspaceShellProps {
  children: ReactNode
  className?: string
  headerActions?: ReactNode
}

type ShellView = 'agents' | 'market' | 'create' | 'detail'

function SparkLogo() {
  return (
    <span className="spark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

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
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const view = useMemo(() => resolveView(location.pathname), [location.pathname])

  const breadcrumb = useMemo(() => {
    switch (view) {
      case 'agents':
        return (
          <>
            <b className="text-[#223047]">我的 Agent</b>
            <span>/</span>
            <span>总览</span>
          </>
        )
      case 'market':
        return (
          <>
            <b className="text-[#223047]">Agent 市场</b>
            <span>/</span>
            <span>选择模板</span>
          </>
        )
      case 'create':
        return (
          <>
            <b className="text-[#223047]">Agent 市场</b>
            <span>/</span>
            <span>创建 Agent</span>
          </>
        )
      default:
        return (
          <>
            <b className="text-[#223047]">Agent 详情</b>
            <span>/</span>
            <span>运行监控</span>
          </>
        )
    }
  }, [view])

  const showCreateStepper = false
  const showHeaderSearch = view === 'agents' || view === 'market'
  const headerSearchValue = showHeaderSearch ? String(searchParams.get('q') || '') : ''
  const [headerSearchDraft, setHeaderSearchDraft] = useState(headerSearchValue)
  const headerSearchPlaceholder = view === 'market' ? '搜索模板、能力或标签' : '搜索别名或实例名'
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
        <div className="flex shrink-0 items-center gap-2.5">
          <Button
            onClick={() => navigate('/agents/templates')}
            size="md"
            variant="secondary"
          >
            浏览模板
          </Button>
          <Button
            className="shadow-[0_10px_20px_rgba(37,99,255,0.18)]"
            onClick={() => navigate('/agents/templates')}
            size="md"
            variant="primary"
          >
            ＋ 创建 Agent
          </Button>
        </div>
      )
    }

    return null
  }
  const topActions = headerActions ?? renderTopActions()
  const showRightTools = showRightBack || showHeaderSearch || showCreateStepper || Boolean(topActions)

  return (
    <div className="h-screen overflow-hidden bg-white text-[var(--color-text)]">
      <section
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden bg-white',
          className,
        )}
      >
        <header className="relative z-10 flex min-h-[78px] flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--color-border)] bg-[rgba(255,255,255,.96)] px-5 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            {showLeftBack ? (
              <Button
                aria-label="返回"
                className="h-9 w-9 p-0"
                leading={<ArrowLeft className="h-4 w-4" />}
                onClick={() => navigate(backTarget)}
                size="sm"
                variant="ghost"
              >
                <span className="sr-only">返回</span>
              </Button>
            ) : null}

            {showBrand ? (
              <>
                <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-xl font-extrabold">
                  <SparkLogo />
                  <span>{APP_NAME}</span>
                </div>
                <span className="hidden h-6 w-px bg-[var(--color-border)] md:block" />
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
            <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:flex-nowrap">
              {showHeaderSearch ? (
                <SearchField
                  aria-label={headerSearchPlaceholder}
                  className="w-full min-w-[220px] sm:w-[280px] lg:w-[360px]"
                  onChange={(event) => handleHeaderSearchChange(event.target.value)}
                  placeholder={headerSearchPlaceholder}
                  value={headerSearchDraft}
                />
              ) : null}

              {showRightBack ? (
                <Button
                  aria-label="返回"
                  className="h-9 w-9 p-0"
                  leading={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => navigate(backTarget)}
                  size="sm"
                  variant="ghost"
                >
                  <span className="sr-only">返回</span>
                </Button>
              ) : null}

              {showCreateStepper ? (
                <div className="hidden items-center gap-2 text-[13px] font-semibold text-[#8a94a6] xl:flex">
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-white">
                      ✓
                    </span>
                    选择模板
                  </span>
                  <span className="h-px w-16 bg-[#dce2eb]" />
                  <span className="flex items-center gap-1.5 text-[var(--color-brand)]">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] text-white">
                      2
                    </span>
                    配置资源
                  </span>
                  <span className="h-px w-16 bg-[#dce2eb]" />
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-[#cfd7e5] bg-white text-[#6b7280]">
                      3
                    </span>
                    确认部署
                  </span>
                </div>
              ) : null}

              {topActions}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-white">{children}</div>
      </section>
    </div>
  )
}
