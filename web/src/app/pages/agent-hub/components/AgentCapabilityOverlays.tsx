import type {
  AgentFileItem,
  ChatSessionState,
  FilesSessionState,
} from '../../../../domains/agents/types'
import { AgentChatModal } from '../../../../components/business/chat/AgentChatModal'
import { AgentFilesModal } from '../../../../components/business/files/AgentFilesModal'

interface AgentCapabilityOverlaysProps {
  chatSession: ChatSessionState | null
  onCloseChat: () => void
  onChatDraftChange: (value: string) => void
  onSendChat: () => void
  filesSession: FilesSessionState | null
  onCloseFiles: () => void
  onChangeFileContent: (value: string) => void
  onCreateDirectory: (name: string) => void
  onCreateFile: (name: string) => void
  onDeleteFile: (path: string) => void
  onDownloadFile: (path: string) => void
  onEditFileEntry: (item: AgentFileItem) => void
  onSelectFileEntry: (item: AgentFileItem) => void
  onOpenFileEntry: (item: AgentFileItem) => void
  onPrefetchDirectory?: (path: string) => void
  onOpenPath: (path: string) => void
  onOpenParentDirectory: () => void
  onRefreshFiles: () => void
  onSaveFile: () => void
  onUploadFiles: (files: FileList | File[]) => void
}

export function AgentCapabilityOverlays({
  chatSession,
  onCloseChat,
  onChatDraftChange,
  onSendChat,
  filesSession,
  onCloseFiles,
  onChangeFileContent,
  onCreateDirectory,
  onCreateFile,
  onDeleteFile,
  onDownloadFile,
  onEditFileEntry,
  onSelectFileEntry,
  onOpenFileEntry,
  onPrefetchDirectory,
  onOpenPath,
  onOpenParentDirectory,
  onRefreshFiles,
  onSaveFile,
  onUploadFiles,
}: AgentCapabilityOverlaysProps) {
  return (
    <>
      <AgentChatModal
        onClose={onCloseChat}
        onDraftChange={onChatDraftChange}
        onSend={onSendChat}
        open={Boolean(chatSession)}
        session={chatSession}
      />

      <AgentFilesModal
        onChangeContent={onChangeFileContent}
        onClose={onCloseFiles}
        onCreateDirectory={onCreateDirectory}
        onCreateFile={onCreateFile}
        onDelete={onDeleteFile}
        onDownload={onDownloadFile}
        onEditEntry={onEditFileEntry}
        onSelectEntry={onSelectFileEntry}
        onOpenEntry={onOpenFileEntry}
        onPrefetchDirectory={onPrefetchDirectory}
        onOpenParent={onOpenParentDirectory}
        onJumpToPath={onOpenPath}
        onRefresh={onRefreshFiles}
        onSave={onSaveFile}
        onUpload={onUploadFiles}
        open={Boolean(filesSession)}
        session={filesSession}
      />
    </>
  )
}
