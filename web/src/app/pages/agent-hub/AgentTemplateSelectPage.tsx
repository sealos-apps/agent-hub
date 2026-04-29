import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AgentTemplatePickerPanel,
  AgentTemplatePickerPanelLoading,
} from '../../../components/business/agents/AgentTemplatePickerPanel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SelectMenu } from '../../../components/ui/SelectMenu'
import {
  translateTemplateAccessLabel,
  translateTemplateActionLabel,
  translateTemplateDescription,
  translateTemplateDocsLabel,
  useI18n,
} from '../../../i18n'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHub } from './hooks/AgentHubControllerContext'

type TemplateSort = 'default' | 'name'

const TEMPLATE_MARKET_PREVIEW_COUNT = 10
const ENABLE_TEMPLATE_MARKET_PREVIEW =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_TEMPLATE_MARKET_MULTI_ROW_PREVIEW || '').toLowerCase() === 'true'

export function AgentTemplateSelectPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loading, templates } = useAgentHub()
  const [sort, setSort] = useState<TemplateSort>('default')
  const keyword = String(searchParams.get('q') || '')

  const normalizedKeyword = keyword.trim().toLowerCase()

  const filteredTemplates = useMemo(() => {
    let next = templates

    if (normalizedKeyword) {
      next = next.filter((template) =>
        [
          template.name,
          template.shortName,
          template.description,
          translateTemplateDescription(template.id, template.description, t),
          template.docsLabel,
          translateTemplateDocsLabel(template.id, template.docsLabel, t),
          template.access.map((item) => `${item.label} ${translateTemplateAccessLabel(item.key, item.label, t)}`).join(' '),
          template.actions.map((item) => `${item.label} ${translateTemplateActionLabel(item.key, item.label, t)}`).join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedKeyword),
      )
    }

    if (sort === 'name') {
      next = [...next].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }

    return next
  }, [normalizedKeyword, sort, t, templates])

  const visibleTemplates = useMemo(() => {
    if (!ENABLE_TEMPLATE_MARKET_PREVIEW || filteredTemplates.length === 0) {
      return filteredTemplates
    }

    return Array.from({ length: TEMPLATE_MARKET_PREVIEW_COUNT }, (_, index) => {
      const template = filteredTemplates[index % filteredTemplates.length]
      return {
        ...template,
        backendSupported: index % 5 === 3 ? false : template.backendSupported,
      }
    })
  }, [filteredTemplates])

  const sortOptions = [
    { label: t('template.defaultSort'), value: 'default' },
    { label: t('template.nameSort'), value: 'name' },
  ] satisfies Array<{ label: string; value: TemplateSort }>

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full w-full min-w-0 flex-col">
        <div className="flex h-full min-h-0 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div className="text-sm leading-6 text-zinc-500">{t('template.count', { count: visibleTemplates.length })}</div>
            <div className="w-full shrink-0 sm:w-[156px]">
              <SelectMenu
                onChange={(value) => setSort(value as TemplateSort)}
                options={sortOptions}
                value={sort}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <AgentTemplatePickerPanelLoading />
            ) : visibleTemplates.length ? (
              <AgentTemplatePickerPanel
                onSelect={(templateId) => navigate(`/agents/create?template=${templateId}`)}
                templates={visibleTemplates}
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50/60 p-8">
                <EmptyState description={t('template.emptyDesc')} title={t('template.emptyTitle')} />
              </div>
            )}
          </div>
        </div>
      </div>
    </AgentWorkspaceShell>
  )
}
