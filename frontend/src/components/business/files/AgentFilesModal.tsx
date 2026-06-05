import type { AgentFileItem, FilesSessionState } from '../../../domains/agents/types'
import { useI18n } from '../../../i18n'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { AgentFilesWorkspace } from './AgentFilesWorkspace'

interface AgentFilesModalProps {
  open: boolean
  session: FilesSessionState | null
  onClose: () => void
  onSelectEntry: (item: AgentFileItem) => void
  onOpenEntry: (item: AgentFileItem) => void
  onEditEntry: (item: AgentFileItem) => void
  onPrefetchDirectory?: (path: string) => void
  onOpenParent: () => void
  onJumpToPath: (path: string) => void
  onRefresh: () => void
  onChangeContent: (value: string) => void
  onSave: () => void
  onDownload: (path: string) => void
  onDelete: (path: string) => void
  onCreateDirectory: (name: string) => void
  onCreateFile: (name: string) => void
  onUpload: (files: FileList | File[]) => void
}

export function AgentFilesModal({
  open,
  session,
  onClose,
  onSelectEntry,
  onOpenEntry,
  onEditEntry,
  onPrefetchDirectory,
  onOpenParent,
  onJumpToPath,
  onRefresh,
  onChangeContent,
  onSave,
  onDownload,
  onDelete,
  onCreateDirectory,
  onCreateFile,
  onUpload,
}: AgentFilesModalProps) {
  const { t } = useI18n()
  const displayName = session?.resource.aliasName || session?.resource.name || '--'

  return (
    <Modal
      description={t('files.modalDesc')}
      footer={
        <Button onClick={onClose} variant="secondary">
          {t('common.close')}
        </Button>
      }
      onClose={onClose}
      open={open}
      title={t('files.modalTitle', { name: displayName })}
      widthClassName="max-w-7xl"
    >
      <AgentFilesWorkspace
        onChangeContent={onChangeContent}
        onCreateDirectory={onCreateDirectory}
        onCreateFile={onCreateFile}
        onDelete={onDelete}
        onDownload={onDownload}
        onEditEntry={onEditEntry}
        onSelectEntry={onSelectEntry}
        onOpenEntry={onOpenEntry}
        onPrefetchDirectory={onPrefetchDirectory}
        onOpenParent={onOpenParent}
        onJumpToPath={onJumpToPath}
        onRefresh={onRefresh}
        onSave={onSave}
        onUpload={onUpload}
        session={session}
      />
    </Modal>
  )
}
