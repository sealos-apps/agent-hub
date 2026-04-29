import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AgentListItem } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Modal } from '../../ui/Modal'

interface DeleteAgentModalProps {
  open: boolean
  item: AgentListItem | null
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteAgentModal({
  open,
  item,
  submitting,
  onClose,
  onConfirm,
}: DeleteAgentModalProps) {
  const displayName = item?.aliasName || item?.name || '--'
  const requiredName = item?.name || ''
  const [confirmDraft, setConfirmDraft] = useState({ agentName: '', value: '' })
  const confirmName = confirmDraft.agentName === requiredName ? confirmDraft.value : ''
  const confirmed = Boolean(requiredName) && confirmName.trim() === requiredName

  const handleClose = () => {
    setConfirmDraft({ agentName: '', value: '' })
    onClose()
  }

  const handleConfirm = () => {
    if (!confirmed || submitting) return
    setConfirmDraft({ agentName: '', value: '' })
    onConfirm()
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={handleClose} variant="secondary">
            取消
          </Button>
          <Button disabled={submitting || !confirmed} onClick={handleConfirm} variant="danger">
            {submitting ? '删除中...' : '确认删除'}
          </Button>
        </>
      }
      onClose={handleClose}
      open={open}
      title="删除 Agent"
      widthClassName="max-w-xl"
    >
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <Trash2 size={30} />
        </div>
        <h3 className="text-lg font-semibold text-slate-950">确认删除这个 Agent 吗？</h3>
        <p className="mt-2 whitespace-nowrap text-sm leading-6 text-slate-500">
          将会联动删除实例 <span className="font-semibold text-slate-900">{displayName}</span>
          {item?.name ? <span className="text-slate-400">（{item.name}）</span> : null}
          {' '}及相关资源，操作不可撤销。
        </p>
        <div className="mt-5 w-full max-w-md text-left">
          <Input
            autoComplete="off"
            error={confirmName && !confirmed ? '输入的 Agent 名称不一致' : undefined}
            hint={requiredName ? `请输入 ${requiredName} 以确认删除。` : undefined}
            label="输入 Agent 名称"
            onChange={(event) => setConfirmDraft({ agentName: requiredName, value: event.target.value })}
            placeholder={requiredName}
            value={confirmName}
          />
        </div>
      </div>
    </Modal>
  )
}
