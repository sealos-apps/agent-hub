import type { AgentFileItem, FilesSessionState } from '../../../domains/agents/types'
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
  const displayName = session?.resource.aliasName || session?.resource.name || '--'

  return (
    <Modal
      description="管理当前 Agent 工作目录中的文件，支持目录切换、Markdown 预览与常用文本编辑。"
      footer={
        <Button onClick={onClose} variant="secondary">
          关闭
        </Button>
      }
      onClose={onClose}
      open={open}
      title={`文件管理 · ${displayName}`}
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
