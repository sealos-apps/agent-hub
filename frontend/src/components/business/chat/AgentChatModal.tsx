import type { ChatSessionState } from '../../../domains/agents/types'
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
  const displayName = session?.resource.aliasName || session?.resource.name || '--'

  return (
    <Modal
      description="部署成功后可以直接在这里验证 Agent 是否正常响应。"
      onClose={onClose}
      open={open}
      title={`对话验证 · ${displayName}`}
      widthClassName="max-w-5xl"
    >
      <AgentChatWorkspace onDraftChange={onDraftChange} onSend={onSend} session={session} />
    </Modal>
  )
}
