import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AgentListItem } from '../../../domains/agents/types'
import { useI18n } from '../../../i18n'
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
  const { t } = useI18n()
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
            {t('common.cancel')}
          </Button>
          <Button disabled={submitting || !confirmed} onClick={handleConfirm} variant="danger">
            {submitting ? t('agent.deleting') : t('agent.confirmDelete')}
          </Button>
        </>
      }
      onClose={handleClose}
      open={open}
      title={t('agent.deleteModalTitle')}
      widthClassName="max-w-xl"
    >
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <Trash2 size={30} />
        </div>
        <h3 className="text-lg font-semibold text-slate-950">{t('agent.deleteModalHeading')}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          {t('agent.deleteModalDesc')}
        </p>
        {requiredName ? (
          <div className="mt-3 max-w-full rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            <span className="block truncate">{requiredName}</span>
          </div>
        ) : null}
        <div className="mt-5 w-full max-w-md text-left">
          <Input
            autoComplete="off"
            error={confirmName && !confirmed ? t('agent.deleteNameMismatch') : undefined}
            hint={requiredName ? t('agent.deleteNameHint', { name: requiredName }) : undefined}
            label={t('agent.deleteNameLabel')}
            onChange={(event) => setConfirmDraft({ agentName: requiredName, value: event.target.value })}
            placeholder={requiredName}
            value={confirmName}
          />
        </div>
      </div>
    </Modal>
  )
}
