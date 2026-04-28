import { Badge } from '../../ui/Badge'
import { Card, CardContent } from '../../ui/Card'
import { Skeleton } from '../../ui/Skeleton'
import { cn } from '../../../lib/format'
import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'

interface AgentTemplatePickerPanelProps {
  onSelect: (templateId: AgentTemplateId) => void
  templates: AgentTemplateDefinition[]
}

interface AgentTemplatePickerPanelLoadingProps {
  count?: number
}

const accessMeta: Record<string, { label: string; dotClassName: string }> = {
  api: { label: 'API', dotClassName: 'bg-blue-500' },
  terminal: { label: '终端', dotClassName: 'bg-violet-500' },
  files: { label: '文件', dotClassName: 'bg-sky-500' },
  ssh: { label: 'SSH', dotClassName: 'bg-emerald-500' },
  ide: { label: 'IDE', dotClassName: 'bg-amber-500' },
  'web-ui': { label: 'Web UI', dotClassName: 'bg-teal-500' },
} as const

function TemplateCard({
  template,
  onSelect,
}: {
  template: AgentTemplateDefinition
  onSelect: () => void
}) {
  return (
    <button
      className={cn(
        'group h-full w-full text-left',
        !template.backendSupported
          ? 'cursor-not-allowed select-none opacity-90'
          : 'cursor-pointer',
      )}
      disabled={!template.backendSupported}
      onClick={onSelect}
      type="button"
    >
      <Card
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-[12px] border-zinc-200 bg-white text-left transition-[border-color,box-shadow] duration-200',
          !template.backendSupported
            ? 'bg-zinc-50/70'
            : 'hover:border-zinc-300 hover:shadow-[0_4px_10px_rgba(0,0,0,0.06)]',
        )}
      >
        <CardContent className="flex h-full flex-col gap-3.5 px-4 pb-5 !pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white"
                style={{
                  borderColor: `${template.brandColor}26`,
                  backgroundColor: `${template.brandColor}10`,
                }}
              >
                <img alt={`${template.name} logo`} className="h-9 w-9 object-cover" src={template.logo} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-[-0.01em] text-zinc-950">
                  {template.name}
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500">{template.shortName}</div>
              </div>
            </div>

            <Badge variant={template.backendSupported ? 'outline' : 'muted'}>
              {template.backendSupported ? '可创建' : '仅展示'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{template.docsLabel}</Badge>
            {template.actions.slice(0, 2).map((item) => (
              <Badge className="capitalize" key={item.key} variant="muted">
                {item.label}
              </Badge>
            ))}
          </div>

          <p className="line-clamp-2 text-sm leading-6 text-zinc-500">
            {template.description}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {template.access.map((access) => {
              const meta = accessMeta[access.key] || { label: access.label, dotClassName: 'bg-zinc-400' }
              return (
                <span
                  className="inline-flex h-6 items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white px-2 text-[11px] text-zinc-600"
                  key={access.key}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} />
                  {meta.label}
                </span>
              )
            })}
          </div>
        </CardContent>

      </Card>
    </button>
  )
}

export function AgentTemplatePickerPanelLoading({
  count = 6,
}: AgentTemplatePickerPanelLoadingProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: count }, (_, index) => (
        <Card className="overflow-hidden rounded-[12px] border-zinc-200 bg-white" key={index}>
          <CardContent className="space-y-3.5 px-4 pb-5 !pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[88%]" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-14 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-12 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function AgentTemplatePickerPanel({
  onSelect,
  templates,
}: AgentTemplatePickerPanelProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          onSelect={() => onSelect(template.id)}
          template={template}
        />
      ))}
    </div>
  )
}
