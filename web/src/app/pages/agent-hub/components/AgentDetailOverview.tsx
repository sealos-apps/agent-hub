import {
  ArrowUpRight,
  Copy,
  Download,
  Laptop,
  TerminalSquare,
} from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { getAgentSSHAccess } from '../../../../api'
import { Button } from '../../../../components/ui/Button'
import { Modal } from '../../../../components/ui/Modal'
import { StatusBadge } from '../../../../components/ui/StatusBadge'
import { formatModelProviderLabel } from '../../../../domains/agents/aiproxy'
import type { AgentListItem, AgentSSHAccessPayload, ClusterContext } from '../../../../domains/agents/types'
import { cn, formatTime } from '../../../../lib/format'

function Panel({
  title,
  description,
  extra,
  className,
  children,
}: {
  title: string
  description?: string
  extra?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('workbench-card overflow-hidden rounded-[12px] p-0', className)}>
      <div className="flex flex-col gap-4 bg-white px-6 pb-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[18px]/7 font-semibold tracking-[-0.01em] text-zinc-950">{title}</div>
            {description ? (
              <div className="mt-1 text-[14px]/5 text-zinc-500">{description}</div>
            ) : null}
          </div>
          {extra}
        </div>
        <div>{children}</div>
      </div>
    </section>
  )
}

function MetaItem({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px]/4 text-zinc-500">{label}</span>
      <span
        className={cn(
          'text-[13px]/5 font-medium text-zinc-900',
          mono && 'break-all font-mono text-xs text-zinc-700',
        )}
      >
        {value || '--'}
      </span>
    </div>
  )
}

function BasicInfoField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="text-[14px]/none text-zinc-500">{label}</div>
      <div
        className={cn(
          'min-w-0 text-[14px]/none text-zinc-600',
          mono && 'break-all font-mono text-[13px] leading-5 text-zinc-600',
        )}
      >
        {value || '--'}
      </div>
    </div>
  )
}

function BasicInfoCard({
  item,
  internalURL,
  onErrorMessage,
}: {
  item: AgentListItem
  internalURL: string
  onErrorMessage?: (message: string) => void
}) {
  return (
    <section className="workbench-card flex h-full flex-col overflow-hidden rounded-[12px] p-0">
      <div className="flex flex-1 flex-col gap-4 bg-white px-6 pb-5 pt-6">
        <div className="flex items-center gap-2">
          <div className="text-[18px]/7 font-semibold tracking-[-0.01em] text-zinc-950">基础信息</div>
          <div className="rounded-full border-[0.5px] border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px]/4 text-zinc-700">
            {item.template.name}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <BasicInfoField label="显示名称" value={item.aliasName || item.name} />

          <div className="grid gap-x-3 gap-y-5 min-[860px]:grid-cols-2">
            <BasicInfoField label="实例名称" mono value={item.name} />
            <BasicInfoField label="命名空间" mono value={item.namespace} />
            <BasicInfoField label="工作目录" mono value={item.workingDir || '--'} />
            <BasicInfoField label="最近同步" value={formatTime(item.updatedAt)} />
          </div>

          <div className="h-px bg-zinc-100" />

          <div className="grid gap-x-3 gap-y-5 min-[860px]:grid-cols-2">
            <BasicInfoField label="模型名称" value={item.model || '--'} />
            <BasicInfoField
              label="模型渠道"
              value={formatModelProviderLabel(item.modelProvider)}
            />
            <div className="min-[860px]:col-span-2">
              <BasicInfoField label="模型地址" value={item.modelBaseURL || '--'} />
            </div>
          </div>

          <div className="h-px bg-zinc-100" />

          <div className="flex flex-col gap-1">
            <div className="text-[14px]/none text-zinc-500">集群内服务地址</div>
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1 break-all text-[14px]/5 text-zinc-900">
                {internalURL}
              </div>
              <button
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
                onClick={() => copyText(internalURL, onErrorMessage)}
                title="复制服务地址"
                type="button"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3 text-[14px]/5">
          <span className="text-zinc-900">密钥来源:</span>
          <span className="text-zinc-600">{formatKeySourceLabel(item.keySource)}</span>
        </div>
      </div>
    </section>
  )
}

function ToneBadge({
  tone,
  children,
}: {
  tone: 'active' | 'pending' | 'muted'
  children: ReactNode
}) {
  const className = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    muted: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-[10px]/4 font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}

function StatusSummary({ item }: { item: AgentListItem }) {
  const workspaceEntry = (() => {
    if (item.chatAvailable && item.terminalAvailable) return '对话 + 终端'
    if (item.chatAvailable) return '对话'
    if (item.terminalAvailable) return '终端'
    return '初始化阶段'
  })()

  const phaseLabel = item.bootstrapPhase || (item.ready ? 'ready' : 'initializing')
  const statusHeadline = item.ready ? '实例已完成初始化' : '实例正在初始化'
  const summary =
    item.bootstrapMessage ||
    (item.ready ? '当前实例已经就绪，可以直接开始使用。' : '实例还在准备中，请稍后刷新查看。')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge compact status={item.status} />
            <ToneBadge tone={item.ready ? 'active' : 'pending'}>
              {item.ready ? '已就绪' : '准备中'}
            </ToneBadge>
          </div>
          <div className="mt-2 text-[13px]/5 font-medium text-zinc-900">{statusHeadline}</div>
        </div>

        <span className="shrink-0 rounded-full border-[0.5px] border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px]/4 font-medium text-zinc-600">
          {item.template.docsLabel}
        </span>
      </div>

      <div className="grid gap-x-3 gap-y-5 min-[860px]:grid-cols-3">
        <BasicInfoField label="运行状态" value={phaseLabel} />
        <BasicInfoField label="能力入口" value={workspaceEntry} />
        <BasicInfoField label="最近同步" value={formatTime(item.updatedAt)} />
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <div className="text-[14px]/none text-zinc-500">说明</div>
        <div className="mt-2 text-[14px]/5 text-zinc-600">{summary}</div>
      </div>
    </div>
  )
}

function resolveTone(access?: { enabled?: boolean; status?: string } | null): 'active' | 'pending' | 'muted' {
  if (!access) {
    return 'muted'
  }
  if (access.enabled) {
    return 'active'
  }
  if (access.status === 'pending') {
    return 'pending'
  }
  return 'muted'
}

function copyText(value: string, onErrorMessage?: (message: string) => void) {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
    onErrorMessage?.('当前环境不支持复制到剪贴板')
    return
  }
  void navigator.clipboard.writeText(value).catch(() => onErrorMessage?.('复制失败，请手动复制'))
}

function decodeBase64Text(value = '') {
  if (!value) return ''
  try {
    return atob(value)
  } catch {
    return ''
  }
}

function formatKeySourceLabel(value = '') {
  if (!value) return '--'
  const normalized = String(value).trim().toLowerCase()
  if (!normalized || normalized === 'unset') return '未准备'
  if (normalized === 'workspace-aiproxy') return '由工作区提供'
  return value
}

function downloadTextFile(filename: string, content: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function buildDirectSSHCommand(payload: AgentSSHAccessPayload) {
  return `ssh -i ~/.ssh/${payload.configHost} -p ${payload.port} ${payload.userName}@${payload.host}`
}

function buildConfigHostSSHCommand(payload: AgentSSHAccessPayload) {
  return `ssh ${payload.configHost}`
}

function buildIDEUri(kind: 'cursor' | 'vscode' | 'zed' | 'gateway', payload: AgentSSHAccessPayload) {
  switch (kind) {
    case 'cursor':
    case 'vscode': {
      const prefix = kind === 'cursor' ? 'cursor://' : 'vscode://'
      return `${prefix}labring.devbox-aio?sshDomain=${encodeURIComponent(
        `${payload.userName}@${payload.host}`,
      )}&sshPort=${encodeURIComponent(String(payload.port))}&base64PrivateKey=${encodeURIComponent(
        payload.base64PrivateKey,
      )}&sshHostLabel=${encodeURIComponent(payload.configHost)}&workingDir=${encodeURIComponent(
        payload.workingDir,
      )}&token=${encodeURIComponent(payload.token)}`
    }
    case 'zed':
      return `zed://ssh/${payload.configHost}${payload.workingDir}`
    case 'gateway':
      return `jetbrains-gateway://connect#host=${payload.configHost}&type=ssh&deploy=false&projectPath=${encodeURIComponent(
        payload.workingDir,
      )}&user=${encodeURIComponent(payload.userName)}&port=${encodeURIComponent(String(payload.port))}`
  }
}

function SSHAccessModal({
  open,
  payload,
  onClose,
  onErrorMessage,
}: {
  open: boolean
  payload: AgentSSHAccessPayload | null
  onClose: () => void
  onErrorMessage?: (message: string) => void
}) {
  if (!open || !payload) return null

  const privateKey = decodeBase64Text(payload.base64PrivateKey)
  const directCommand = buildDirectSSHCommand(payload)
  const configCommand = buildConfigHostSSHCommand(payload)

  return (
    <Modal
      description="这里可以直接复制 SSH 连接信息或下载私钥。"
      onClose={onClose}
      open={open}
      title="SSH 连接"
      widthClassName="max-w-4xl"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <MetaItem label="Host" mono value={payload.host} />
          <MetaItem label="Port" mono value={String(payload.port)} />
          <MetaItem label="User" mono value={payload.userName} />
          <MetaItem label="工作目录" mono value={payload.workingDir} />
          <MetaItem label="快捷主机名" mono value={payload.configHost} />
          <MetaItem label="Token" mono value={payload.token} />
        </div>

        <div className="rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 p-4">
          <div className="text-sm font-medium text-zinc-950">连接命令</div>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border-[0.5px] border-zinc-200 bg-white px-3 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">直接连接</div>
              <div className="mt-2 break-all font-mono text-xs/5 text-zinc-700">{directCommand}</div>
            </div>
            <div className="rounded-lg border-[0.5px] border-zinc-200 bg-white px-3 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">快捷连接命令</div>
              <div className="mt-2 break-all font-mono text-xs/5 text-zinc-700">{configCommand}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copyText(directCommand, onErrorMessage)} type="button" variant="secondary">
            <Copy className="h-4 w-4" />
            复制命令
          </Button>
          <Button onClick={() => copyText(payload.token, onErrorMessage)} type="button" variant="secondary">
            <Copy className="h-4 w-4" />
            复制 Token
          </Button>
          <Button
            onClick={() => downloadTextFile(payload.configHost, privateKey)}
            type="button"
            variant="secondary"
          >
            <Download className="h-4 w-4" />
            下载私钥
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function IDEConnectModal({
  open,
  payload,
  onClose,
  onOpenSSHDetails,
}: {
  open: boolean
  payload: AgentSSHAccessPayload | null
  onClose: () => void
  onOpenSSHDetails: () => void
}) {
  if (!open || !payload) return null

  const openURI = (value: string) => {
    if (typeof window === 'undefined') return
    window.location.assign(value)
  }

  const ideCards: Array<{
    key: 'cursor' | 'vscode' | 'zed' | 'gateway'
    title: string
    description: string
  }> = [
    {
      key: 'cursor',
      title: 'Cursor',
      description: '用一键连接方式在 Cursor 打开当前实例。',
    },
    {
      key: 'vscode',
      title: 'VSCode',
      description: '用一键连接方式在 VSCode 打开当前实例。',
    },
    {
      key: 'zed',
      title: 'Zed',
      description: '通过 SSH 快捷主机名在 Zed 打开当前目录。',
    },
    {
      key: 'gateway',
      title: 'Gateway',
      description: '通过 JetBrains Gateway 连接并打开项目目录。',
    },
  ]

  return (
    <Modal
      description="选择一个 IDE，快速连接到当前实例。"
      onClose={onClose}
      open={open}
      title="IDE 连接"
      widthClassName="max-w-4xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-4 py-3 text-[12px]/5 text-zinc-600">
          当前快捷主机名为 <span className="font-mono text-zinc-700">{payload.configHost}</span>，工作目录为{' '}
          <span className="font-mono text-zinc-700">{payload.workingDir}</span>。
          如果本机还没完成 SSH 配置，请先打开 SSH 详情完成配置。
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {ideCards.map((card) => (
            <div className="rounded-xl border-[0.5px] border-zinc-200 bg-white p-4" key={card.key}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-950">{card.title}</div>
                <Laptop className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 text-[12px]/5 text-zinc-500">{card.description}</div>
              <div className="mt-4">
                <Button onClick={() => openURI(buildIDEUri(card.key, payload))} type="button" variant="secondary">
                  <ArrowUpRight className="h-4 w-4" />
                  打开 {card.title}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenSSHDetails} type="button" variant="secondary">
            <TerminalSquare className="h-4 w-4" />
            查看 SSH 详情
          </Button>
          <Button onClick={() => copyText(payload.configHost)} type="button" variant="secondary">
            <Copy className="h-4 w-4" />
            复制快捷主机名
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AccessCapabilityCard({
  title,
  value,
  detail,
  tone,
  openable = false,
  actions,
}: {
  title: string
  value: string
  detail: string
  tone: 'active' | 'pending' | 'muted'
  openable?: boolean
  actions?: ReactNode
}) {
  const canOperate = value !== '--'

  const handleCopy = () => {
    if (!canOperate) return
    copyText(value)
  }

  const handleOpen = () => {
    if (!openable || !canOperate || typeof window === 'undefined') return
    window.open(value, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="rounded-[10px] border-[0.5px] border-zinc-200 bg-zinc-50/60 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-400">{title}</div>
          <div className="mt-2 break-all font-mono text-[12px]/5 text-zinc-700">{value}</div>
        </div>
        <ToneBadge tone={tone}>
          {tone === 'active' ? '可用' : tone === 'pending' ? '准备中' : '未开放'}
        </ToneBadge>
      </div>

      <div className="mt-3 border-t border-zinc-100 pt-3 text-[12px]/5 text-zinc-500">{detail}</div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button disabled={!canOperate} onClick={handleCopy} size="sm" type="button" variant="secondary">
          <Copy className="h-3.5 w-3.5" />
          复制
        </Button>
        {openable ? (
          <Button disabled={!canOperate} onClick={handleOpen} size="sm" type="button" variant="secondary">
            <ArrowUpRight className="h-3.5 w-3.5" />
            打开
          </Button>
        ) : null}
        {actions}
      </div>
    </div>
  )
}

export function AgentDetailOverview({
  item,
  clusterContext,
  onErrorMessage,
}: {
  item: AgentListItem
  clusterContext: ClusterContext | null
  onErrorMessage?: (message: string) => void
}) {
  const internalURL = `${item.name}.${item.namespace}.svc.cluster.local:${item.template.port}`
  const apiAccess = item.accessByKey.api || null
  const sshAccess = item.sshAccess
  const ideAccess = item.ideAccess
  const webUIAccess = item.webUIAccess
  const [sshPayload, setSSHPayload] = useState<AgentSSHAccessPayload | null>(null)
  const [loadingAccess, setLoadingAccess] = useState<'ssh' | 'ide' | null>(null)
  const [sshModalOpen, setSSHModalOpen] = useState(false)
  const [ideModalOpen, setIDEModalOpen] = useState(false)
  const accessCards = [
    apiAccess
      ? (
        <AccessCapabilityCard
          detail={apiAccess.reason || (apiAccess.auth ? `鉴权方式：${apiAccess.auth}` : '当前模板未开放第三方 API 接入。')}
          key="api"
          openable
          title="API"
          tone={resolveTone(apiAccess)}
          value={apiAccess.url || '--'}
        />
      )
      : null,
    sshAccess
      ? (
        <AccessCapabilityCard
          actions={(
            <Button
              disabled={!sshAccess.enabled}
              onClick={() => void handleOpenSSHDetails()}
              size="sm"
              type="button"
              variant="secondary"
            >
              <TerminalSquare className="h-3.5 w-3.5" />
              {loadingAccess === 'ssh' ? '读取中...' : '详情'}
            </Button>
          )}
          detail={sshAccess.reason || `${sshAccess.userName || '--'} · ${sshAccess.workingDir || '--'}`}
          key="ssh"
          title="SSH"
          tone={resolveTone(sshAccess)}
          value={sshAccess.host && sshAccess.port ? `${sshAccess.userName || 'root'}@${sshAccess.host}:${sshAccess.port}` : '--'}
        />
      )
      : null,
    ideAccess
      ? (
        <AccessCapabilityCard
          actions={(
            <Button
              disabled={!ideAccess.enabled}
              onClick={() => void handleOpenIDE()}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Laptop className="h-3.5 w-3.5" />
              {loadingAccess === 'ide' ? '读取中...' : '连接'}
            </Button>
          )}
          detail={ideAccess.reason || (ideAccess.modes?.length ? `支持 ${ideAccess.modes.join(' / ')}` : '当前模板未开放 IDE 接入。')}
          key="ide"
          title="IDE"
          tone={resolveTone(ideAccess)}
          value={ideAccess.host && ideAccess.port ? `${ideAccess.host}:${ideAccess.port}` : '--'}
        />
      )
      : null,
    webUIAccess
      ? (
        <AccessCapabilityCard
          detail={webUIAccess.reason || '当前模板未提供独立 Web UI。'}
          key="web-ui"
          openable
          title="Web UI"
          tone={resolveTone(webUIAccess)}
          value={webUIAccess.url || '--'}
        />
      )
      : null,
  ].filter(Boolean)

  const loadSSHAccess = useCallback(async () => {
    if (sshPayload) {
      return sshPayload
    }
    if (!clusterContext) {
      throw new Error('当前工作区还没准备好，暂时无法读取 SSH 信息。')
    }

    const payload = await getAgentSSHAccess(item.name, clusterContext)
    setSSHPayload(payload)
    return payload
  }, [clusterContext, item.name, sshPayload])

  const handleOpenSSHDetails = useCallback(async () => {
    if (!sshAccess?.enabled) {
      onErrorMessage?.(sshAccess?.reason || '当前实例没有可用的 SSH 入口。')
      return
    }

    setLoadingAccess('ssh')
    try {
      await loadSSHAccess()
      setSSHModalOpen(true)
    } catch (error) {
      onErrorMessage?.(error instanceof Error ? error.message : '读取 SSH 接入信息失败')
    } finally {
      setLoadingAccess((current) => (current === 'ssh' ? null : current))
    }
  }, [loadSSHAccess, onErrorMessage, sshAccess?.enabled, sshAccess?.reason])

  const handleOpenIDE = useCallback(async () => {
    if (!ideAccess?.enabled) {
      onErrorMessage?.(ideAccess?.reason || '当前实例没有可用的 IDE 入口。')
      return
    }

    setLoadingAccess('ide')
    try {
      await loadSSHAccess()
      setIDEModalOpen(true)
    } catch (error) {
      onErrorMessage?.(error instanceof Error ? error.message : '读取 IDE 接入信息失败')
    } finally {
      setLoadingAccess((current) => (current === 'ide' ? null : current))
    }
  }, [ideAccess?.enabled, ideAccess?.reason, loadSSHAccess, onErrorMessage])

  return (
    <>
      <div className="grid w-full min-w-0 gap-2.5 pr-1 pb-1 min-[1180px]:grid-cols-[minmax(360px,0.92fr)_minmax(380px,1.08fr)]">
        <BasicInfoCard internalURL={internalURL} item={item} onErrorMessage={onErrorMessage} />

        <div className="flex min-w-0 flex-col gap-2.5 px-0.5">
          <Panel
            description="查看当前实例的初始化阶段、可用能力和最近同步时间。"
            extra={(
              <span className="shrink-0 text-[12px]/5 text-zinc-400">
                更新于 {formatTime(item.updatedAt)}
              </span>
            )}
            title="运行状态"
          >
            <StatusSummary item={item} />
          </Panel>

          <Panel
            description="展示当前 Agent 实际开放的连接入口，例如 API、SSH、IDE 或 Web UI。"
            title="连接方式"
          >
            {accessCards.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2">{accessCards}</div>
            ) : (
              <div className="rounded-xl border-[0.5px] border-zinc-200 bg-zinc-50 px-3.5 py-5 text-[12px]/5 text-zinc-500">
                当前模板暂时没有可用的外部连接入口。
              </div>
            )}
          </Panel>
        </div>
      </div>

      <SSHAccessModal
        onClose={() => setSSHModalOpen(false)}
        onErrorMessage={onErrorMessage}
        open={sshModalOpen}
        payload={sshPayload}
      />

      <IDEConnectModal
        onClose={() => setIDEModalOpen(false)}
        onOpenSSHDetails={() => {
          setIDEModalOpen(false)
          setSSHModalOpen(true)
        }}
        open={ideModalOpen}
        payload={sshPayload}
      />
    </>
  )
}
