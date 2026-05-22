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

const getEntryKindLabel = (item: AgentFileItem) => {
  if (item.type === 'dir') return '目录'
  if (isMarkdownLikeFile(item.name)) return 'Markdown'
  if (isImagePreviewableFile(item.name)) return '图像'
  if (isBrowserPreviewableFile(item.name)) return '文档'
  if (isTextPreviewableFile(item.name)) return '文本'
  return '文件'
}

const getEntryHelperText = (item: AgentFileItem) => {
  if (item.type === 'dir') return '目录，支持进入与预取'
  if (isMarkdownLikeFile(item.name)) return '支持文档预览与分栏编辑'
  if (isTextPreviewableFile(item.name)) return '支持预览、编辑与保存'
  if (isImagePreviewableFile(item.name) || isBrowserPreviewableFile(item.name)) return '支持内嵌预览'
  return '支持下载，不支持内嵌编辑'
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
    const name = window.prompt('输入新文件名，例如 `README.md`')
    if (!name?.trim()) return
    onCreateFile(name)
  }

  const handleCreateDirectory = () => {
    const name = window.prompt('输入新目录名')
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
      { key: 'directories', label: `目录 · ${directories.length}`, items: directories, emptyText: '当前没有子目录。' },
      { key: 'files', label: `文件 · ${files.length}`, items: files, emptyText: '当前没有文件。' },
      { key: 'others', label: `其他 · ${others.length}`, items: others, emptyText: '当前没有其他类型对象。' },
    ]
  }, [visibleItems])

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
        <div className="mt-4 text-[15px] font-semibold text-zinc-950">文件工作台</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">
          连接后可直接浏览、编辑、上传和下载文件。
        </p>
        {onOpen ? (
          <div className="mt-4">
            <Button onClick={onOpen} variant="secondary">
              <Folder size={16} />
              打开文件工作台
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
              文件工作台
            </div>
            <div className="mt-2 text-sm leading-6 text-zinc-500">
              浏览、编辑并管理当前目录文件。
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <Button disabled={!canGoUp} onClick={onOpenParent} size="sm" type="button" variant="ghost">
              <ChevronUp size={16} />
              上级
            </Button>
            <Button onClick={onRefresh} size="sm" type="button" variant="ghost">
              <RefreshCw size={16} />
              刷新
            </Button>
            <Button onClick={() => uploadInputRef.current?.click()} size="sm" type="button" variant="ghost">
              <Upload size={16} />
              上传
            </Button>
            <Button onClick={handleCreateFile} size="sm" type="button" variant="ghost">
              <FilePlus2 size={16} />
              文件
            </Button>
            <Button onClick={handleCreateDirectory} size="sm" type="button" variant="ghost">
              <FolderPlus size={16} />
              目录
            </Button>
            <div className="ml-1 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[10px]/4 text-zinc-500">
              <Info size={12} />
              <span>支持拖拽上传</span>
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
              placeholder="输入目录，例如 /workspace/docs"
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
              打开
            </Button>
          </div>

          <div className="min-w-0 lg:w-[320px] lg:flex-none">
            <SearchField
              className="[&_input]:h-10 [&_input]:rounded-[10px] [&_input]:border-zinc-200 [&_input]:bg-white [&_input]:px-3.5 [&_input]:pl-9 [&_input]:text-[14px] [&_input]:leading-5 [&_input]:shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索当前目录中的文件名或路径"
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
                  <div className="text-[12px]/5 font-semibold text-zinc-950">文件列表</div>
                  <div className="mt-1 text-[11px]/4 text-zinc-500">单击选中，目录双击进入，文件双击预览。</div>
                </div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px]/4 font-medium text-zinc-500">
                  {visibleItems.length} 项
                </span>
              </div>
            </div>

            <div className="p-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {session.browsing ? (
                <div className="flex h-full min-h-[180px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50 text-[12px] text-zinc-500 md:min-h-[200px]">
                  正在读取目录内容...
                </div>
              ) : !visibleItems.length ? (
                <div className="flex h-full min-h-[180px] items-center justify-center rounded-[14px] border border-dashed border-zinc-200 bg-zinc-50 px-5 text-center text-[12px] text-zinc-400 md:min-h-[200px]">
                  当前目录没有匹配内容。
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
                            const itemLabel = getEntryKindLabel(item)

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
                                              已打开
                                            </span>
                                          ) : null}
                                          <span className="inline-flex h-7 items-center rounded-[6px] bg-zinc-100 px-2.5 text-[10px]/4 font-medium text-zinc-500">
                                            {itemLabel}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-1 truncate text-[11px]/4 text-zinc-400">
                                        {getEntryHelperText(item)}
                                      </div>
                                      <div className="mt-1.5 flex items-center gap-2 text-[10px]/4 text-zinc-400">
                                        <span>{item.type === 'dir' ? '目录' : formatFileSize(item.size)}</span>
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
                                          进入
                                        </>
                                      ) : (
                                        <>
                                          <Eye size={14} />
                                          预览
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
                                        编辑
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
                  {selectedFileName || '预览与编辑'}
                </div>
                <div className="mt-1 truncate font-mono text-[11px]/4 text-zinc-400">
                  {focusedItem?.path || '从左侧列表选择一个对象开始工作'}
                </div>
                {selectionDetached ? (
                  <div className="mt-1 text-[11px]/4 text-zinc-500">
                    已选中 {selectedItem?.name}，主工作区仍保持 {openedItem?.name}。
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
                    {selectedItem?.type === 'dir' ? '进入' : '预览'}
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
                    编辑
                  </Button>
                ) : null}
                {session.dirty ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px]/4 font-medium text-amber-700">
                    未保存
                  </span>
                ) : null}
                <Button disabled={!canSave} onClick={onSave} size="sm" type="button" variant="secondary">
                  <Save size={16} />
                  保存
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-zinc-50 p-3">
              {!selectedItem ? (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                  从左侧文件列表选择一个对象开始工作。目录双击进入，文件双击预览。
                </div>
              ) : selectedItem.type === 'dir' && !openedItem ? (
                <div className="flex h-full min-h-[190px] flex-col items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center md:min-h-[220px] lg:min-h-[240px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                    <Folder size={22} />
                  </div>
                  <div className="mt-3 text-[14px] font-medium text-zinc-950">{selectedItem.name}</div>
                  <p className="mt-2 max-w-md text-[12px]/5 text-zinc-500">
                    当前选择的是目录。你可以继续进入目录，或者在左侧继续选中文件。
                  </p>
                  <div className="mt-3">
                    <Button onClick={() => onOpenEntry(selectedItem)} size="sm" type="button" variant="secondary">
                      <ChevronRight size={16} />
                      进入目录
                    </Button>
                  </div>
                </div>
              ) : session.previewing || session.reading ? (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-zinc-200 bg-white text-[12px] text-zinc-500 md:min-h-[220px] lg:min-h-[240px]">
                  {session.detailMode === 'edit' ? '正在加载可编辑内容...' : '正在加载预览内容...'}
                </div>
              ) : !openedItem ? (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                  当前对象还没有打开。请使用上方或中栏动作进入目录、打开预览或进入编辑。
                </div>
              ) : openedItem.type === 'dir' ? (
                <div className="flex h-full min-h-[190px] flex-col items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center md:min-h-[220px] lg:min-h-[240px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                    <Folder size={22} />
                  </div>
                  <div className="mt-3 text-[14px] font-medium text-zinc-950">{openedItem.name}</div>
                  <p className="mt-2 max-w-md text-[12px]/5 text-zinc-500">
                    当前打开的是目录。目录会切换左侧列表，你可以继续选择其中的文件。
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
                    <iframe className="h-full w-full" src={session.previewObjectUrl} title={openedItem.name} />
                  </div>
                ) : (
                  <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                    当前文件暂不支持内嵌预览，请直接下载查看。
                  </div>
                )
              ) : (
                <div className="flex h-full min-h-[190px] items-center justify-center rounded-[18px] border border-dashed border-zinc-300 bg-white px-6 text-center text-[12px] text-zinc-400 md:min-h-[220px] lg:min-h-[240px]">
                  当前文件暂不支持内嵌预览，请直接下载查看。
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-white px-3.5 py-2.5">
              <div className="min-w-0 text-[11px]/5 text-zinc-500">
                {session.activity || '支持目录切换、拖拽上传、通用文本编辑与 Markdown 实时预览。'}
              </div>
              <div className="flex items-center gap-2 text-[10px]/4 text-zinc-400">
                {session.uploading ? <span>上传中</span> : null}
                {session.downloading ? <span>下载中</span> : null}
                {session.saving ? <span>保存中</span> : null}
              </div>
            </div>
          </section>
        </div>
      </div>

      <input className="hidden" multiple onChange={handleUploadChange} ref={uploadInputRef} type="file" />
    </div>
  )
}
