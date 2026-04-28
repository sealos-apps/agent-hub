import { Trash2 } from 'lucide-react'
import type { AgentListItem } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
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

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button disabled={submitting} onClick={onConfirm} variant="danger">
            {submitting ? '删除中...' : '确认删除'}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="删除 Agent"
      widthClassName="max-w-xl"
    >
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <Trash2 size={30} />
        </div>
        <h3 className="text-lg font-semibold text-slate-950">确认删除这个 Agent 吗？</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          将会联动删除实例 <span className="font-semibold text-slate-900">{displayName}</span>
          {item?.name ? <span className="text-slate-400">（{item.name}）</span> : null}
          {' '}相关资源。这个操作不可撤销。
        </p>
      </div>
    </Modal>
  )
}
