import {
  ChevronRight,
  ChevronUp,
  Eye,
  File,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Info,
  PencilLine,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { AgentFileItem, FilesSessionState } from '../../../domains/agents/types'
import { useI18n, type TranslateFn } from '../../../i18n'
import { cn } from '../../../lib/format'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Input } from '../../ui/Input'
import { SearchField } from '../../ui/SearchField'
import { AgentFileCodeEditor } from './AgentFileCodeEditor'
import { AgentMarkdownPreview } from './AgentMarkdownPreview'
import {
  isBrowserPreviewableFile,
  isImagePreviewableFile,
  isMarkdownLikeFile,
  isTextPreviewableFile,
} from './fileHelpers'

interface AgentFilesWorkspaceProps {
  session: FilesSessionState | null
  onOpen?: () => void
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

type EntrySection = {
  key: 'directories' | 'files' | 'others'
  label: string
  items: AgentFileItem[]
  emptyText: string
}

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '--'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round((size / 1024) * 10) / 10} KB`
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`
}

const getEntryKindLabel = (item: AgentFileItem, t: TranslateFn) => {
  if (item.type === 'dir') return t('files.directory')
  if (isMarkdownLikeFile(item.name)) return 'Markdown'
  if (isImagePreviewableFile(item.name)) return t('files.image')
  if (isBrowserPreviewableFile(item.name)) return t('files.document')
  if (isTextPreviewableFile(item.name)) return t('files.text')
  return t('files.file')
}

const getEntryHelperText = (item: AgentFileItem, t: TranslateFn) => {
  if (item.type === 'dir') return t('files.kindDirectory')
  if (isMarkdownLikeFile(item.name)) return t('files.kindMarkdown')
  if (isTextPreviewableFile(item.name)) return t('files.kindText')
  if (isImagePreviewableFile(item.name) || isBrowserPreviewableFile(item.name)) return t('files.kindInlinePreview')
  return t('files.kindDownloadOnly')
}

export function AgentFilesWorkspace({
  session,
  onOpen,
  onSelectEntry,
  onOpenEntry,
  onEditEntry,
  onPrefetchDirectory: _onPrefetchDirectory,
  onOpenParent,
  onJumpToPath,
  onRefresh,
  onChangeContent,
  onSave,
  onDownload: _onDownload,
  onDelete: _onDelete,
  onCreateDirectory,
  onCreateFile,
  onUpload,
}: AgentFilesWorkspaceProps) {
  const { t } = useI18n()
  void _onPrefetchDirectory
  void _onDownload
  void _onDelete
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [directoryDraft, setDirectoryDraft] = useState<{ basePath: string; value: string } | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dropActive, setDropActive] = useState(false)

  const directoryInput =
    session && directoryDraft?.basePath === session.currentPath
      ? directoryDraft.value
      : session?.currentPath || ''

  const handleCreateFile = () => {
    const name = window.prompt(t('files.createFilePrompt'))
    if (!name?.trim()) return
    onCreateFile(name)
  }

  const handleCreateDirectory = () => {
    const name = window.prompt(t('files.createDirectoryPrompt'))
    if (!name?.trim()) return
    onCreateDirectory(name)
  }

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files?.length) {
      onUpload(files)
    }
    event.target.value = ''
  }

  const handleJumpToPath = () => {
    if (!directoryInput.trim()) return
    onJumpToPath(directoryInput.trim())
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDropActive(false)
    const files = event.dataTransfer?.files
    if (files?.length) {
      onUpload(files)
    }
  }

  const renderItemIcon = (item: AgentFileItem) => {
    if (item.type === 'dir') return <Folder size={16} className="text-sky-600" />
    if (item.type === 'file') {
      if (isMarkdownLikeFile(item.name)) return <FileText size={16} className="text-emerald-600" />
      if (isImagePreviewableFile(item.name) || isBrowserPreviewableFile(item.name)) {
        return <File size={16} className="text-violet-500" />
      }
      if (isTextPreviewableFile(item.name)) return <FileCode2 size={16} className="text-slate-500" />
      return <File size={16} className="text-slate-500" />
    }
    return <File size={16} className="text-slate-400" />
  }

  const items = session?.items || []
  const keyword = searchKeyword.trim().toLowerCase()
  const visibleItems = !keyword
    ? items
    : items.filter((item) => item.name.toLowerCase().includes(keyword) || item.path.toLowerCase().includes(keyword))

  const entrySections = useMemo<EntrySection[]>(() => {
    const directories = visibleItems.filter((item) => item.type === 'dir')
    const files = visibleItems.filter((item) => item.type === 'file')
    const others = visibleItems.filter((item) => item.type === 'other')

    return [
      { key: 'directories', label: t('files.directoriesCount', { count: directories.length }), items: directories, emptyText: t('files.noDirectories') },
      { key: 'files', label: t('files.filesCount', { count: files.length }), items: files, emptyText: t('files.noFiles') },
      { key: 'others', label: t('files.othersCount', { count: others.length }), items: others, emptyText: t('files.noOthers') },
    ]
  }, [t, visibleItems])

  const selectedItem = session?.selectedItem || null
  const openedItem = session?.openedItem || null
  const focusedItem = openedItem || selectedItem
  const activeTextContent = session?.dirty ? session.draftContent : session?.previewContent || ''
  const selectedFileName = focusedItem?.name || ''
  const canGoUp = Boolean(session && session.currentPath !== session.rootPath)
  const canSave = Boolean(
    session?.openedItem &&
      session.openedItem.type === 'file' &&
      isTextPreviewableFile(session.openedItem.name) &&
      session.dirty &&
      !session.saving,
  )
  const canEdit = Boolean(selectedItem && selectedItem.type === 'file' && isTextPreviewableFile(selectedItem.name))
  const canPreview = Boolean(selectedItem)
  const openedCanEdit = Boolean(openedItem && openedItem.type === 'file' && isTextPreviewableFile(openedItem.name))
  const markdownActive = Boolean(openedItem && isMarkdownLikeFile(openedItem.name))
  const imageActive = Boolean(openedItem && isImagePreviewableFile(openedItem.name))
  const browserPreviewActive = Boolean(openedItem && isBrowserPreviewableFile(openedItem.name))
  const textPreviewActive = Boolean(openedItem && openedItem.type === 'file' && isTextPreviewableFile(openedItem.name))
  const selectionDetached = Boolean(selectedItem && openedItem && selectedItem.path !== openedItem.path)

  if (!session) {
    return (
      <Card className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-[16px] border-zinc-200 bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <Folder size={22} />
        </div>
        <div className="mt-4 text-[15px] font-semibold text-zinc-950">{t('files.workspace')}</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">
          {t('files.connectDesc')}
        </p>
        {onOpen ? (
          <div className="mt-4">
            <Button onClick={onOpen} variant="secondary">
              <Folder size={16} />
              {t('files.openWorkspace')}
            </Button>
          </div>
        ) : null}
      </Card>
    )
  }

  return (
    <div
      className={cn(
        'workbench-card-strong flex min-h-[480px] flex-col overflow-hidden rounded-[16px] border-zinc-200 bg-white xl:h-full xl:min-h-0',
        dropActive ? 'ring-2 ring-blue-500/20 ring-offset-0' : '',
      )}
      onDragEnter={(event) => {
        event.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropActive(false)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDropActive(true)
      }}
      onDrop={handleDrop}
    >
      <div className="border-b border-zinc-100 bg-white px-6 pt-6 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-[18px]/7 font-semibold tracking-[-0.01em] text-zinc-950">
              {t('files.workspace')}
            </div>
            <div className="mt-2 text-sm leading-6 text-zinc-500">
              {t('files.workspaceDesc')}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <Button disabled={!canGoUp} onClick={onOpenParent} size="sm" type="button" variant="ghost">
              <ChevronUp size={16} />
              {t('files.parent')}
            </Button>
            <Button onClick={onRefresh} size="sm" type="button" variant="ghost">
              <RefreshCw size={16} />
              {t('common.refresh')}
            </Button>
            <Button onClick={() => uploadInputRef.current?.click()} size="sm" type="button" variant="ghost">
              <Upload size={16} />
              {t('files.upload')}
            </Button>
            <Button onClick={handleCreateFile} size="sm" type="button" variant="ghost">
              <FilePlus2 size={16} />
              {t('files.file')}
            </Button>
            <Button onClick={handleCreateDirectory} size="sm" type="button" variant="ghost">
              <FolderPlus size={16} />
              {t('files.directory')}
            </Button>
            <div className="ml-1 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[10px]/4 text-zinc-500">
              <Info size={12} />
              <span>{t('files.dragUploadSupported')}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-[520px]">
            <Input
              className="h-10 rounded-[10px] border-zinc-200 bg-white px-3.5 text-[14px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              onChange={(event) =>
                setDirectoryDraft({
                  basePath: session.currentPath,
                  value: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleJumpToPath()
                }
              }}
              placeholder={t('files.pathPlaceholder')}
              size="md"
              value={directoryInput}
            />
            <Button
              className="h-10 rounded-[10px] px-4 text-[14px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              onClick={handleJumpToPath}
              size="md"
              type="button"
              variant="secondary"
            >
              {t('files.open')}
            </Button>
          </div>

          <div className="min-w-0 lg:w-[320px] lg:flex-none">
            <SearchField
              className="[&_input]:h-10 [&_input]:rounded-[10px] [&_input]:border-zinc-200 [&_input]:bg-white [&_input]:px-3.5 [&_input]:pl-9 [&_input]:text-[14px] [&_input]:leading-5 [&_input]:shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder={t('files.searchPlaceholder')}
              size="md"
              value={searchKeyword}
            />
          </div>
        </div>

        {session.error ? (
          <div className="mt-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px]/5 text-rose-700">
            {session.error}
          </div>
        ) : null}

      </div>

      <div className="px-6 pb-6 pt-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        <div className="grid min-h-[320px] gap-4 md:min-h-[360px] xl:h-full xl:min-h-[420px] xl:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.45fr)]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="border-b border-zinc-100 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px]/5 font-semibold text-zinc-950">{t('files.fileList')}</div>
                  <div className="mt-1 text-[11px]/4 text-zinc-500">{t('files.fileListDesc')}</div>
                </div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px]/4 font-medium text-zinc-500">
                  {t('files.itemCount', { count: visibleItems.length })}
                </span>
              </div>
            </div>

            <div className="p-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {session.browsing ? (
                <div className="flex h-full min-h-[180px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50 text-[12px] text-zinc-500 md:min-h-[200px]">
                  {t('files.readingDirectory')}
                </div>
              ) : !visibleItems.length ? (
                <div className="flex h-full min-h-[180px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50 px-5 text-center text-[12px] text-zinc-400 md:min-h-[200px]">
                  {t('files.noMatchingContent')}
                </div>
              ) : (
                <div className="space-y-3">
                  {entrySections.map((section) => (
                    <div key={section.key}>
                      <div className="mb-1.5 flex items-center justify-between px-1 text-[10px]/4 font-medium uppercase tracking-[0.08em] text-zinc-400">
                        <span>{section.label}</span>
                      </div>
                      {section.items.length ? (
                        <div className="space-y-1.5">
                          {section.items.map((item) => {
                            const selected = selectedItem?.path === item.path
                            const opened = openedItem?.path === item.path
                            const itemLabel = getEntryKindLabel(item, t)

                            return (
                              <div
                                className={cn(
                                  'rounded-xl border px-2.5 py-2 transition',
                                  selected
                                    ? 'border-zinc-200 bg-zinc-50 shadow-[0_1px_2px_rgba(24,24,27,0.04)]'
                                    : 'border-transparent bg-white hover:border-zinc-200 hover:bg-zinc-50/70',
                                )}
                                key={item.path}
                              >
                                <div className="flex gap-2.5">
                                  <button
                                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                                    onClick={() => onSelectEntry(item)}
                                    onDoubleClick={() => {
                                      if (item.type === 'dir' || item.type === 'file') {
                                        onOpenEntry(item)
                                      }
                                    }}
                                    type="button"
                                  >
                                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-zinc-200 bg-white">
                                      {renderItemIcon(item)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 items-center justify-between gap-3">
                                        <div className="truncate text-[12px]/5 font-medium text-zinc-950">{item.name}</div>
                                        <div className="flex items-center gap-1.5">
                                          {opened ? (
                                            <span className="inline-flex h-7 items-center rounded-[6px] bg-zinc-900 px-2.5 text-[10px]/4 font-medium text-white">
                                              {t('files.opened')}
                                            </span>
                                          ) : null}
                                          <span className="inline-flex h-7 items-center rounded-[6px] bg-zinc-100 px-2.5 text-[10px]/4 font-medium text-zinc-500">
                                            {itemLabel}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-1 truncate text-[11px]/4 text-zinc-400">
                                        {getEntryHelperText(item, t)}
                                      </div>
                                      <div className="mt-1.5 flex items-center gap-2 text-[10px]/4 text-zinc-400">
                                        <span>{item.type === 'dir' ? t('files.directory') : formatFileSize(item.size)}</span>
                                        <span className="truncate">{item.path}</span>
                                      </div>
                                    </div>
                                  </button>

                                  <div className="flex shrink-0 flex-col items-end gap-2.5">
                                    <Button
                                      className="px-2"
                                      onClick={() => onOpenEntry(item)}
                                      size="xs"
                                      type="button"
                                      variant="secondary"
                                    >
                                      {item.type === 'dir' ? (
                                        <>
                                          <ChevronRight size={14} />
                                          {t('files.enter')}
                                        </>
                                      ) : (
                                        <>
                                          <Eye size={14} />
                                          {t('files.preview')}
                                        </>
                                      )}
                                    </Button>
                                    {item.type === 'file' && isTextPreviewableFile(item.name) ? (
                                      <Button
                                        className="px-2"
                                        onClick={() => onEditEntry(item)}
                                        size="xs"
                                        type="button"
                                        variant="secondary"
                                      >
                                        <PencilLine size={14} />
                                        {t('files.edit')}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[11px]/5 text-zinc-400">
                          {section.emptyText}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-zinc-100 px-4 py-4">
              <div className="min-w-0">
                <div className="truncate text-[13px]/6 font-semibold text-zinc-950">
                  {selectedFileName || t('files.previewAndEdit')}
                </div>
                <div className="mt-1 truncate font-mono text-[11px]/4 text-zinc-400">
                  {focusedItem?.path || t('files.selectObjectHint')}
                </div>
                {selectionDetached ? (
                  <div className="mt-1 text-[11px]/4 text-zinc-500">
                    {t('files.selectionDetached', { selected: selectedItem?.name || '', opened: openedItem?.name || '' })}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {canPreview ? (
                  <Button
                    className="text-[10px]"
                    onClick={() => selectedItem && onOpenEntry(selectedItem)}
                    size="sm"
                    type="button"
                    variant={openedItem && session.detailMode === 'preview' ? 'primary' : 'secondary'}
                  >
                    <Eye size={14} />
                    {selectedItem?.type === 'dir' ? t('files.enter') : t('files.preview')}
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    className="text-[10px]"
                    onClick={() => selectedItem && onEditEntry(selectedItem)}
                    size="sm"
                    type="button"
                    variant={openedItem && session.detailMode === 'edit' ? 'primary' : 'secondary'}
                  >
                    <PencilLine size={14} />
                    {t('files.edit')}
                  </Button>
                ) : null}
                {session.dirty ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px]/4 font-medium text-amber-700">
                    {t('files.unsaved')}
                  </span>
                ) : null}
                <Button disabled={!canSave} onClick={onSave} size="sm" type="button" variant="secondary">
                  <Save size={16} />
                  {t('common.save')}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-zinc-50 p-3">
              {!selectedItem ? (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                  {t('files.noSelectionDesc')}
                </div>
              ) : selectedItem.type === 'dir' && !openedItem ? (
                <div className="flex h-full min-h-[190px] flex-col items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center md:min-h-[220px] lg:min-h-[240px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                    <Folder size={22} />
                  </div>
                  <div className="mt-3 text-[14px] font-medium text-zinc-950">{selectedItem.name}</div>
                  <p className="mt-2 max-w-md text-[12px]/5 text-zinc-500">
                    {t('files.directorySelectedDesc')}
                  </p>
                  <div className="mt-3">
                    <Button onClick={() => onOpenEntry(selectedItem)} size="sm" type="button" variant="secondary">
                      <ChevronRight size={16} />
                      {t('files.enterDirectory')}
                    </Button>
                  </div>
                </div>
              ) : session.previewing || session.reading ? (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-zinc-200 bg-white text-[12px] text-zinc-500 md:min-h-[220px] lg:min-h-[240px]">
                  {session.detailMode === 'edit' ? t('files.loadingEditable') : t('files.loadingPreview')}
                </div>
              ) : !openedItem ? (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                  {t('files.objectNotOpened')}
                </div>
              ) : openedItem.type === 'dir' ? (
                <div className="flex h-full min-h-[190px] flex-col items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center md:min-h-[220px] lg:min-h-[240px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                    <Folder size={22} />
                  </div>
                  <div className="mt-3 text-[14px] font-medium text-zinc-950">{openedItem.name}</div>
                  <p className="mt-2 max-w-md text-[12px]/5 text-zinc-500">
                    {t('files.directoryOpenedDesc')}
                  </p>
                </div>
              ) : session.detailMode === 'edit' && openedCanEdit ? (
                markdownActive ? (
                  <div className="grid h-full min-h-[220px] gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:min-h-[250px]">
                    <AgentFileCodeEditor
                      onChange={onChangeContent}
                      path={openedItem.path}
                      value={session.draftContent}
                    />
                    <AgentMarkdownPreview content={session.draftContent} />
                  </div>
                ) : (
                  <AgentFileCodeEditor
                    onChange={onChangeContent}
                    path={openedItem.path}
                    value={session.draftContent}
                  />
                )
              ) : textPreviewActive ? (
                markdownActive ? (
                  <AgentMarkdownPreview content={activeTextContent} />
                ) : (
                  <AgentFileCodeEditor path={openedItem.path} readOnly value={activeTextContent} />
                )
              ) : session.previewObjectUrl ? (
                imageActive ? (
                  <div className="flex h-full min-h-[190px] items-center justify-center overflow-auto rounded-[18px] border border-zinc-200 bg-white p-3 md:min-h-[220px] lg:min-h-[240px]">
                    <img
                      alt={openedItem.name}
                      className="max-h-full max-w-full rounded-[16px] object-contain"
                      src={session.previewObjectUrl}
                    />
                  </div>
                ) : browserPreviewActive ? (
                  <div className="h-full min-h-[190px] overflow-hidden rounded-[18px] border border-zinc-200 bg-white md:min-h-[220px] lg:min-h-[240px]">
                    <iframe
                      className="h-full w-full"
                      sandbox=""
                      src={session.previewObjectUrl}
                      title={openedItem.name}
                    />
                  </div>
                ) : (
                  <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                    {t('files.inlinePreviewUnsupported')}
                  </div>
                )
              ) : (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                  {t('files.inlinePreviewUnsupported')}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-white px-3.5 py-2.5">
              <div className="min-w-0 text-[11px]/5 text-zinc-500">
                {session.activity || t('files.defaultActivity')}
              </div>
              <div className="flex items-center gap-2 text-[10px]/4 text-zinc-400">
                {session.uploading ? <span>{t('console.uploading')}</span> : null}
                {session.downloading ? <span>{t('files.downloadingStatus')}</span> : null}
                {session.saving ? <span>{t('files.savingStatus')}</span> : null}
              </div>
            </div>
          </section>
        </div>
      </div>

      <input className="hidden" multiple onChange={handleUploadChange} ref={uploadInputRef} type="file" />
    </div>
  )
}
