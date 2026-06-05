import type { ChatSessionState } from '../../../domains/agents/types'
import { useI18n } from '../../../i18n'
import { Modal } from '../../ui/Modal'
import { AgentChatWorkspace } from './AgentChatWorkspace'

interface AgentChatModalProps {
  open: boolean
  session: ChatSessionState | null
  onClose: () => void
  onDraftChange: (value: string) => void
  onSend: () => void
}

export function AgentChatModal({
  open,
  session,
  onClose,
  onDraftChange,
  onSend,
}: AgentChatModalProps) {
  const { t } = useI18n()
  const displayName = session?.resource.aliasName || session?.resource.name || '--'

  return (
    <Modal
      description={t('chat.modalDesc')}
      onClose={onClose}
      open={open}
      title={t('chat.modalTitle', { name: displayName })}
      widthClassName="max-w-5xl"
    >
      <AgentChatWorkspace onDraftChange={onDraftChange} onSend={onSend} session={session} />
    </Modal>
  )
}
