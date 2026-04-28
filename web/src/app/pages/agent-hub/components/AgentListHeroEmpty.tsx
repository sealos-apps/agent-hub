import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '../../../../lib/format'
import { Button } from '../../../../components/ui/Button'

type AgentListHeroEmptyMode = 'create' | 'search'

interface AgentListHeroEmptyProps {
  mode: AgentListHeroEmptyMode
  onAction?: () => void
}

function CreateAgentEmptyArtwork() {
  return (
    <svg
      aria-hidden="true"
      className="absolute left-1/2 top-[41%] z-[1] h-[100.32px] w-[281.12px] -translate-x-1/2 -translate-y-1/2 opacity-90"
      fill="none"
      viewBox="0 0 282 101"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="white" height="48.944" rx="11.4904" width="221.178" x="29.9725" y="0.509627" />
      <rect
        height="48.944"
        rx="11.4904"
        stroke="#D4D4D8"
        strokeDasharray="2.04 2.04"
        strokeWidth="1.01925"
        width="221.178"
        x="29.9725"
        y="0.509627"
      />
      <rect fill="url(#paint0_linear_create_agent_empty)" height="28.7023" rx="8.15404" width="28.7023" x="40.0934" y="10.6305" />
      <rect fill="url(#paint1_linear_create_agent_empty)" height="5.31032" rx="1.7735" width="68.4268" x="83.0652" y="22.3264" />
      <rect fill="white" height="61.9239" rx="11.3552" width="279.835" x="0.64478" y="37.7542" />
      <rect
        height="61.9239"
        rx="11.3552"
        stroke="#D4D4D8"
        strokeDasharray="2.58 2.58"
        strokeWidth="1.28956"
        width="279.835"
        x="0.64478"
        y="37.7542"
      />
      <rect fill="url(#paint2_linear_create_agent_empty)" height="36.3141" rx="10.3165" width="36.3141" x="13.4496" y="50.5591" />
      <rect fill="url(#paint3_linear_create_agent_empty)" height="6.71861" rx="2.24384" width="86.5736" x="67.8177" y="65.3567" />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint0_linear_create_agent_empty"
          x1="54.4445"
          x2="54.4445"
          y1="10.6305"
          y2="39.3327"
        >
          <stop stopColor="#F5F5F5" />
          <stop offset="1" stopColor="#EAEAEA" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint1_linear_create_agent_empty"
          x1="83.0652"
          x2="151.481"
          y1="24.9816"
          y2="26.5467"
        >
          <stop stopColor="#E8E8E8" />
          <stop offset="1" stopColor="#F2F2F2" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint2_linear_create_agent_empty"
          x1="31.6067"
          x2="31.6067"
          y1="50.5591"
          y2="86.8732"
        >
          <stop stopColor="#F5F5F5" />
          <stop offset="1" stopColor="#EAEAEA" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint3_linear_create_agent_empty"
          x1="67.8177"
          x2="154.378"
          y1="68.716"
          y2="70.6962"
        >
          <stop stopColor="#E8E8E8" />
          <stop offset="1" stopColor="#F2F2F2" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function CreateAgentEmptyBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="absolute left-1/2 top-[60%] h-[286px] w-[1200px] max-w-[160%] -translate-x-1/2 -translate-y-1/2 sm:max-w-none"
      fill="none"
      viewBox="0 0 900 214"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g opacity="0.55">
        <rect width="899.594" height="213.511" fill="url(#create_agent_empty_backdrop_pattern)" />
        <rect width="899.594" height="213.511" fill="url(#create_agent_empty_backdrop_top_fade)" />
        <rect width="899.594" height="213.511" fill="url(#create_agent_empty_backdrop_horizontal_fade)" />
      </g>
      <defs>
        <pattern
          id="create_agent_empty_backdrop_pattern"
          patternUnits="userSpaceOnUse"
          width="72"
          height="24"
          x="0"
          y="0"
        >
          <path d="M0 23.5H72" stroke="#E7E7EC" strokeOpacity="0.72" />
          <path d="M0.5 0V24" stroke="#E5E5EA" strokeOpacity="0.28" />
          <path d="M71.5 0V24" stroke="#E5E5EA" strokeOpacity="0.28" />
        </pattern>
        <linearGradient
          id="create_agent_empty_backdrop_top_fade"
          x1="463.298"
          y1="-21.2202"
          x2="463.298"
          y2="106.756"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="0.822512" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="create_agent_empty_backdrop_horizontal_fade"
          x1="0"
          y1="106.756"
          x2="899.594"
          y2="106.756"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="0.302885" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="0.49478" stopColor="#FFFFFF" stopOpacity="0.8" />
          <stop offset="0.668269" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const emptyCopy: Record<
  AgentListHeroEmptyMode,
  {
    title: string
    description: string
    actionLabel: string
    image?: string
  }
> = {
  create: {
    title: '创建你的第一个 Agent',
    description: '从模板市场开始配置实例，整个列表会回到标准的工作台管理视图。',
    actionLabel: '从模板市场开始',
  },
  search: {
    title: '没有相关 Agent',
    description: '没有找到匹配结果，试试更换关键词，或者直接清空当前搜索条件。',
    actionLabel: '清空搜索条件',
    image: '/images/search-empty.svg',
  },
}

function EmptyPagination() {
  return (
    <div className="flex items-center justify-between px-1 py-3 text-[14px] text-zinc-500">
      <div>总计：0</div>
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
        <div>30 /页</div>
      </div>
    </div>
  )
}

function EmptyTableHeader() {
  return (
    <div className="rounded-[12px] border-zinc-200/90 bg-white px-5 py-3.5 text-[14px]/5 text-zinc-500 shadow-[0_1px_2px_rgba(24,24,27,0.03)] lg:px-6">
      <div className="overflow-x-auto">
        <div className="grid min-w-[892px] grid-cols-[minmax(188px,1.5fr)_minmax(124px,0.82fr)_minmax(160px,1fr)_minmax(136px,0.86fr)_minmax(188px,1fr)] items-center gap-4">
          <div className="min-w-0 truncate pr-2">实例</div>
          <div className="min-w-0 truncate pr-2">状态</div>
          <div className="min-w-0 truncate pr-2">资源规格</div>
          <div className="min-w-0 truncate pr-2">更新时间</div>
          <div className="min-w-0 truncate text-left">操作</div>
        </div>
      </div>
    </div>
  )
}

export function AgentListHeroEmpty({ mode, onAction }: AgentListHeroEmptyProps) {
  const content = emptyCopy[mode]
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
    <>
      <div className="pointer-events-none absolute inset-0">
        {mode === 'create' ? (
          <>
            <CreateAgentEmptyBackdrop />
            <CreateAgentEmptyArtwork />
          </>
        ) : (
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-x-0 bottom-8 mx-auto w-[900px] max-w-[92%] opacity-50"
            src={content.image}
          />
        )}
        <div
          className={cn(
            'absolute inset-0',
            mode === 'create'
              ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.14)_30%,rgba(255,255,255,0.78)_100%)]'
              : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_9%,rgba(255,255,255,0.42)_42%,rgba(255,255,255,0.96)_100%)]',
          )}
        />
      </div>
      <div className="relative z-10 flex w-full max-w-[430px] translate-y-14 flex-col items-center gap-3 px-4 text-center sm:translate-y-16">
        <div className="text-[24px]/8 font-semibold tracking-[-0.02em] text-zinc-950">{content.title}</div>
        <p
          className={cn(
            'text-[16px]/6 text-[#4d4d4d]',
            mode === 'create' ? 'max-w-none whitespace-nowrap' : '',
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
    </>
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
