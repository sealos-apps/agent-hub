import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { AgentTemplatePickerPanel } from './AgentTemplatePickerPanel'

interface AgentTemplatePickerModalProps {
  open: boolean
  templates: AgentTemplateDefinition[]
  selectedTemplateId: AgentTemplateId
  onClose: () => void
  onSelect: (templateId: AgentTemplateId) => void
  onContinue: () => void
}

export function AgentTemplatePickerModal({
  open,
  templates,
  selectedTemplateId,
  onClose,
  onSelect,
  onContinue,
}: AgentTemplatePickerModalProps) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null

  return (
    <Modal
      description="按照参考版本的创建路径，先选择 Agent 模板，再进入资源配置。"
      footer={
        <Button disabled={!selectedTemplate?.backendSupported} onClick={onContinue}>
          下一步
        </Button>
      }
      onClose={onClose}
      open={open}
      title="选择 Agent 模板"
      widthClassName="max-w-4xl"
    >
      <AgentTemplatePickerPanel onSelect={onSelect} templates={templates} />
    </Modal>
  )
}
