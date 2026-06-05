import type { AgentTemplateDefinition, AgentTemplateId } from '../../../domains/agents/types'
import { useI18n } from '../../../i18n'
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
  const { t } = useI18n()
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null

  return (
    <Modal
      description={t('template.pickerDesc')}
      footer={
        <Button disabled={!selectedTemplate?.backendSupported} onClick={onContinue}>
          {t('common.next')}
        </Button>
      }
      onClose={onClose}
      open={open}
      title={t('template.pickerTitle')}
      widthClassName="max-w-4xl"
    >
      <AgentTemplatePickerPanel onSelect={onSelect} templates={templates} />
    </Modal>
  )
}
