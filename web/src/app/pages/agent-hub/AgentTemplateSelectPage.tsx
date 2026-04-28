import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AgentTemplatePickerPanel,
  AgentTemplatePickerPanelLoading,
} from '../../../components/business/agents/AgentTemplatePickerPanel'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SelectMenu } from '../../../components/ui/SelectMenu'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHub } from './hooks/AgentHubControllerContext'

type TemplateSort = 'default' | 'name'

export function AgentTemplateSelectPage() {
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
          template.docsLabel,
          template.access.map((item) => item.label).join(' '),
          template.actions.map((item) => item.label).join(' '),
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
  }, [normalizedKeyword, sort, templates])

  const sortOptions = [
    { label: '默认排序', value: 'default' },
    { label: '按名称排序', value: 'name' },
  ] satisfies Array<{ label: string; value: TemplateSort }>

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full w-full min-w-0 flex-col">
        <div className="flex h-full min-h-0 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div className="text-sm leading-6 text-zinc-500">当前展示 {filteredTemplates.length} 个模板</div>
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
            ) : filteredTemplates.length ? (
              <AgentTemplatePickerPanel
                onSelect={(templateId) => navigate(`/agents/create?template=${templateId}`)}
                templates={filteredTemplates}
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50/60 p-8">
                <EmptyState description="没有找到匹配的模板，试试更换关键词。" title="没有相关模板" />
              </div>
            )}
          </div>
        </div>
      </div>
    </AgentWorkspaceShell>
  )
}
