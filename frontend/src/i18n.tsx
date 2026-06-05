/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { addSealosAppEventListener, getSealosLanguage } from './sealosSdk'

export type AppLocale = 'zh-CN' | 'en-US'

type TranslationValues = Record<string, string | number>
export type TranslationKey = keyof typeof zhCN
export type TranslateFn = (key: TranslationKey, values?: TranslationValues) => string

interface I18nContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: TranslationKey, values?: TranslationValues) => string
}

const DEFAULT_LOCALE: AppLocale = 'zh-CN'
let currentLocale: AppLocale = DEFAULT_LOCALE

const zhCN = {
  'language.label': '语言',
  'language.zh': '中文',
  'language.en': 'EN',
  'common.back': '返回',
  'common.close': '关闭',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.saveConfig': '保存配置',
  'common.saving': '保存中...',
  'common.deploying': '部署中...',
  'common.confirmDeploy': '确认部署',
  'common.more': '更多',
  'common.moreActions': '更多操作',
  'common.delete': '删除',
  'common.download': '下载',
  'common.rename': '重命名',
  'common.refresh': '刷新',
  'common.config': '配置',
  'common.applySettings': '应用设置',
  'common.select': '请选择',
  'common.none': '暂无描述',
  'common.total': '总计：{total}',
  'common.pageSize': '30 /页',
  'common.copy': '复制{label}',
  'nav.myAgents': '我的 Agent',
  'nav.overview': '总览',
  'nav.market': 'Agent 市场',
  'nav.selectTemplate': '选择模板',
  'nav.createAgent': '创建 Agent',
  'nav.agentList': 'Agent 列表',
  'nav.agentDetail': 'Agent 详情',
  'nav.backAgentList': '返回 Agent 列表',
  'search.agents': '搜索别名或实例名',
  'search.templates': '搜索模板、能力或标签',
  'agent.instance': '实例',
  'agent.status': '状态',
  'agent.allStatus': '全部状态',
  'agent.selectedCount': '已选 {count} 项',
  'agent.resourceSpec': '资源规格',
  'agent.updatedAt': '更新时间',
  'agent.actions': '操作',
  'agent.sortName': '按名称',
  'agent.sortNameAsc': '名称 A-Z',
  'agent.sortNameDesc': '名称 Z-A',
  'agent.sortUpdated': '按更新',
  'agent.sortEarliest': '最早更新',
  'agent.sortLatest': '最新更新',
  'agent.latest': '最新',
  'agent.earliest': '最早',
  'agent.emptyCreateTitle': '创建你的第一个 Agent',
  'agent.emptyCreateDesc': '点击下方按钮，从模板市场开始配置实例。配置后您可在当前列表页中查看。',
  'agent.emptyCreateAction': '从模板市场开始',
  'agent.emptySearchTitle': '没有相关 Agent',
  'agent.emptySearchDesc': '没有找到匹配结果，试试更换关键词，或者直接清空当前搜索条件。',
  'agent.emptySearchAction': '清空搜索条件',
  'agent.cpu': 'CPU',
  'agent.memory': '内存',
  'agent.storage': '存储',
  'agent.update': '更新',
  'agent.console': '控制台',
  'agent.detail': '详情',
  'agent.chat': '对话',
  'agent.files': '文件',
  'agent.webUI': 'Web UI',
  'agent.pause': '暂停',
  'agent.start': '启动',
  'agent.pauseInstance': '暂停实例',
  'agent.startInstance': '启动实例',
  'agent.enterConsole': '进入控制台',
  'agent.openConsole': '打开控制台',
  'agent.consoleUnavailable': '控制台不可用',
  'agent.creatingCannotToggle': '实例创建中，暂时不可切换状态',
  'agent.currentStatusCannotToggle': '当前状态不可切换',
  'agent.chatUnavailable': '当前模板或状态不支持对话',
  'agent.terminalUnavailable': '当前状态不可进入控制台',
  'agent.filesUnavailable': '当前状态不可进入文件管理',
  'agent.webUIUnavailable': '当前模板不提供 Web UI',
  'agent.change': '变更',
  'agent.editConfig': '修改配置',
  'agent.deleteInstance': '删除实例',
  'agent.id': '实例 ID',
  'agent.namespace': '命名空间',
  'agent.model': '模型',
  'agent.alias': '别名',
  'agent.runtimeEnv': '运行环境',
  'agent.workDir': '工作目录',
  'agent.createdAt': '创建时间',
  'agent.health': '健康状态',
  'agent.uptime': '运行时长',
  'agent.restartCount': '重启次数',
  'agent.normal': '正常',
  'agent.error': '异常',
  'agent.modelProvider': '模型渠道',
  'agent.modelAndApi': '模型与接口',
  'agent.basicInfo': '基本信息',
  'agent.instanceInfo': '实例信息',
  'agent.runningStatus': '运行状态',
  'agent.instanceOverview': '实例概况',
  'agent.instanceOverviewDesc': '实例状态、环境和基础标识',
  'agent.runningResource': '运行资源',
  'agent.runningResourceDesc': '调整 CPU、内存和存储资源，以满足应用运行需求',
  'agent.config': 'Agent 配置',
  'agent.configDesc': '调整别名、模型和模板等参数，配置当前 Agent',
  'agent.currentStatus': '当前状态',
  'agent.keySource': '密钥来源',
  'agent.keyNotReady': '未准备',
  'agent.keyFromWorkspace': '由工作区提供',
  'agent.noExtraConfig': '当前模板没有额外 Agent 配置项。',
  'agent.resourcePreset': '资源预设',
  'agent.selectPreset': '选择预设',
  'agent.customResource': '自定义资源',
  'agent.storageCapacity': '存储容量',
  'agent.usedCpu': '已使用 {used} 核 / 总计 {total} 核',
  'agent.usedMemory': '已使用 {used} GiB / 总计 {total} GiB',
  'agent.usedStorage': '已使用 {used} GiB / 总计 {total} GiB',
  'agent.presetMinimum': '最小',
  'agent.presetRecommended': '推荐',
  'agent.presetLuxury': '豪华',
  'agent.presetCustom': '自定义',
  'agent.presetMinimumDesc': '1c2g · 轻量运行',
  'agent.presetRecommendedDesc': '2c4g · 默认配置',
  'agent.presetLuxuryDesc': '4c8g · 更高性能',
  'agent.presetCustomDesc': '手动输入 CPU / 内存',
  'agent.statusRunning': '运行中',
  'agent.statusCreating': '创建中',
  'agent.statusStopped': '已暂停',
  'agent.statusError': '异常',
  'agent.configModalTitle': '修改配置',
  'agent.configModalDesc': '集中调整资源规格与 Agent 基础配置，保存后应用到当前实例。',
  'agent.presetConfig': '预设配置',
  'agent.presetConfigOption': '{name} · CPU：{cpu} / 内存：{memory}',
  'agent.aliasPlaceholder': '例如：客服助手',
  'agent.deleteModalTitle': '删除 Agent',
  'agent.deleteModalHeading': '确认删除这个 Agent 吗？',
  'agent.deleteModalDesc': '将删除该 Agent 及相关资源，操作不可撤销。',
  'agent.deleteNameLabel': '输入 Agent 名称',
  'agent.deleteNameMismatch': '输入的 Agent 名称不一致',
  'agent.deleteNameHint': '请输入 {name} 以确认删除。',
  'agent.deleting': '删除中...',
  'agent.confirmDelete': '确认删除',
  'agent.detailLoading': '正在加载 Agent 详情...',
  'agent.notFoundTitle': '实例不存在',
  'agent.notFoundMessage': '当前没有找到名为 {name} 的 Agent。',
  'agent.changeTemplate': '更换模板',
  'agent.preparing': '正在准备',
  'agent.preparingConfig': '正在准备创建配置',
  'agent.preparingConfigDesc': '正在读取模板与默认配置，请稍候。',
  'agent.unavailable': '暂时不可用',
  'agent.workspaceNotReady': '当前工作区还没准备好',
  'agent.workspaceNotReadyDesc': '请先返回列表页再重新进入，然后继续创建。',
  'agent.runtimeSection': '运行时环境',
  'agent.runtimeSectionDesc': '当前创建流程会沿用模板预设的运行目录和文档说明。',
  'agent.settingsSection': 'Agent 设置',
  'agent.settingsSectionDesc': '这里放真正需要手动调整的 Agent 配置项，避免把展示态字段混进表单里。',
  'agent.moreSettings': '更多配置',
  'agent.resourceSectionDesc': '可以沿用模板推荐配置，也可以切换到自定义资源规格。',
  'agent.clickEdit': '点击修改',
  'agent.current': '当前',
  'agent.modelPresetEmpty': '当前模板没有预设模型。',
  'agent.modelPresetCn': '当前为 CN 模型预设，模型列表完全由后端模板目录提供。',
  'agent.modelPresetUs': '当前为 US 模型预设，模型列表完全由后端模板目录提供。',
  'agent.selectModel': '请选择模型',
  'agent.customResourceTitle': '自定义资源',
  'agent.customResourceSpecTitle': '自定义资源规格',
  'agent.customResourceDesc': '自定义资源仅支持固定档位选择，调整后会同步更新页面摘要。',
  'agent.customResourceSpecDesc': '自定义时仅调整 CPU 与内存，存储可在页面中独立设置。',
  'agent.unitCore': '核',
  'agent.unitTimes': '次',
  'agent.day': '天',
  'agent.hour': '小时',
  'agent.minute': '分',
  'console.agentConsole': 'Agent 控制台',
  'console.home': '控制台首页',
  'console.resourceExplorer': '资源管理器',
  'console.backParent': '返回上一级',
  'console.backWorkspace': '返回编辑区域',
  'console.backExplorer': '返回资源管理器',
  'console.addTerminal': '添加终端',
  'console.uploadFiles': '上传文件',
  'console.uploadDialogTitle': '上传文件',
  'console.uploadDialogDesc': '将文件上传到 {path}',
  'console.uploadDialogSubmit': '上传 {count} 项',
  'console.uploadDropTitle': '拖拽文件或文件夹到这里',
  'console.uploadDropDesc': '支持拖入整个文件夹并保留目录结构；也可以点击下方按钮选择一个或多个文件。',
  'console.uploadPickFiles': '选择文件',
  'console.uploadQueue': '待上传',
  'console.uploadQueueCount': '{count} 项',
  'console.uploadQueueEmpty': '还没有选择文件。',
  'console.uploading': '上传中',
  'console.uploadDone': '已完成',
  'console.uploadAllDone': '上传完成',
  'console.openFile': '打开',
  'console.enterDirectory': '进入文件夹',
  'console.uploadHere': '上传到此处',
  'console.createFile': '新建文件',
  'console.createDirectory': '新建文件夹',
  'console.copyPath': '复制路径',
  'console.copyCurrentPath': '复制当前路径',
  'console.renamePrompt': '输入新名称',
  'console.createFilePrompt': '输入文件名',
  'console.createDirectoryPrompt': '输入文件夹名',
  'console.deleteConfirm': '确认删除 {name}？',
  'console.terminalTab': '终端',
  'console.searchFiles': '搜索文件',
  'console.fileTree': '文件层级',
  'console.searchResults': '搜索结果：{keyword}',
  'console.searchingFiles': '搜索文件中',
  'console.loadingFiles': '文件列表加载中',
  'console.noMatchingFiles': '未找到匹配文件',
  'console.noFileTree': '暂无文件层级',
  'console.noOpenPage': '暂无打开的页面',
  'console.noOpenPageDesc': '您可以从左侧文件列表选取文件，或启动一个终端。',
  'console.ready': '准备中',
  'console.reading': '读取中',
  'console.cacheRefreshing': '来自缓存，正在刷新',
  'console.filePreview': '文件预览',
  'console.closeNotice': '关闭提示',
  'console.unsavedChanges': '有未保存修改',
  'console.closeDirtySaveConfirm': '{name} 有未保存的修改，是否保存后关闭？',
  'console.closeDirtyDiscardConfirm': '不保存并关闭 {name}？',
  'console.searchFilesFailed': '搜索文件失败',
  'console.openPreviewTab': '预览 {port}',
  'console.openPreviewFailed': '打开预览失败',
  'console.loadFailed': '读取 Agent 控制台失败。',
  'console.clusterContextMissing': '未获取到真实集群上下文，无法加载 Agent 控制台。',
  'console.agentNameMissing': '缺少 Agent 实例名称，无法加载控制台。',
  'terminal.workspace': '终端工作台',
  'terminal.workspaceDesc': '打开终端后会直接进入 Agent 容器环境，用于检查进程、日志、Hermes CLI 和安装状态。',
  'terminal.connect': '连接终端',
  'terminal.reconnect': '重新连接',
  'terminal.connecting': '正在连接终端...',
  'terminal.reconnecting': '正在恢复终端连接...',
  'terminal.disconnected': '终端连接已关闭。',
  'terminal.waitingTarget': '等待终端目标',
  'terminal.loading': '加载中',
  'terminal.loadWorkspaceFailed': '工作区信息加载失败',
  'terminal.agentNotFound': '未找到名为 {name} 的 Agent 实例。',
  'terminal.loadAgentFailed': '读取 Agent 信息失败',
  'terminal.reconnectFailed': '终端连接多次重试失败，请手动重新连接。',
  'terminal.workspaceNotReady': '当前工作区还没准备好，暂时无法连接终端。',
  'terminal.connectionFailed': '终端连接失败',
  'terminal.connectionRestored': '终端连接已恢复。',
  'terminal.droppedOutputNotice': '[服务端高压保护：已跳过部分历史输出以保持交互]',
  'terminal.connectionLostReconnecting': '连接已断开{code}，将在 {seconds} 秒后重连...',
  'terminal.connectionCode': '（代码：{code}）',
  'template.defaultSort': '默认排序',
  'template.nameSort': '按名称排序',
  'template.count': '当前展示 {count} 个模板',
  'template.emptyTitle': '没有相关模板',
  'template.emptyDesc': '没有找到匹配的模板，试试更换关键词。',
  'template.creatable': '可创建',
  'template.previewOnly': '仅展示',
  'template.hermes.description': 'Hermes Agent 服务，支持 API 接入、终端、文件、SSH 与 IDE 连接。',
  'template.hermes.docsLabel': '对话 + 终端',
  'template.openclaw.description': '面向浏览器自动化场景的 Agent，提供 Web UI、终端、文件与设置入口。',
  'template.openclaw.docsLabel': 'Web UI + 终端',
  'template.action.chat': '对话',
  'template.action.terminal': '终端',
  'template.action.files': '文件',
  'template.action.webUI': 'Web UI',
  'template.access.api': 'API',
  'template.access.terminal': '终端',
  'template.access.files': '文件',
  'template.access.ssh': 'SSH',
  'template.access.ide': 'IDE',
  'template.access.webUI': 'Web UI',
  'summary.card': '摘要卡片',
  'summary.cardDesc': '这里汇总当前创建单里的核心信息，提交前在这一张卡里快速确认就可以。',
  'summary.emptyAlias': '未填写',
  'summary.instanceGenerated': '实例名称会在提交后自动生成并用于资源关联。',
  'summary.notSelected': '未选择',
  'summary.instanceName': '实例名称',
  'summary.generatedAfterSubmit': '提交后自动生成',
} as const

const enUS: Record<TranslationKey, string> = {
  'language.label': 'Language',
  'language.zh': '中文',
  'language.en': 'EN',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saveConfig': 'Save',
  'common.saving': 'Saving...',
  'common.deploying': 'Deploying...',
  'common.confirmDeploy': 'Deploy',
  'common.more': 'More',
  'common.moreActions': 'More actions',
  'common.delete': 'Delete',
  'common.download': 'Download',
  'common.rename': 'Rename',
  'common.refresh': 'Refresh',
  'common.config': 'Settings',
  'common.applySettings': 'Apply',
  'common.select': 'Select',
  'common.none': 'No description',
  'common.total': 'Total: {total}',
  'common.pageSize': '30 / page',
  'common.copy': 'Copy {label}',
  'nav.myAgents': 'My Agents',
  'nav.overview': 'Overview',
  'nav.market': 'Agent Market',
  'nav.selectTemplate': 'Select Template',
  'nav.createAgent': 'Create Agent',
  'nav.agentList': 'Agent List',
  'nav.agentDetail': 'Agent Detail',
  'nav.backAgentList': 'Back to Agent List',
  'search.agents': 'Search alias or instance',
  'search.templates': 'Search templates, capabilities, or tags',
  'agent.instance': 'Instance',
  'agent.status': 'Status',
  'agent.allStatus': 'All statuses',
  'agent.selectedCount': '{count} selected',
  'agent.resourceSpec': 'Resources',
  'agent.updatedAt': 'Updated',
  'agent.actions': 'Actions',
  'agent.sortName': 'Sort by name',
  'agent.sortNameAsc': 'Name A-Z',
  'agent.sortNameDesc': 'Name Z-A',
  'agent.sortUpdated': 'Sort by update',
  'agent.sortEarliest': 'Oldest updated',
  'agent.sortLatest': 'Latest updated',
  'agent.latest': 'Latest',
  'agent.earliest': 'Oldest',
  'agent.emptyCreateTitle': 'Create Your First Agent',
  'agent.emptyCreateDesc': 'Click the button below to configure an instance from the template market. After setup, you can view it in the current list.',
  'agent.emptyCreateAction': 'Start from Templates',
  'agent.emptySearchTitle': 'No Matching Agents',
  'agent.emptySearchDesc': 'No matching results. Try another keyword or clear the current search.',
  'agent.emptySearchAction': 'Clear Search',
  'agent.cpu': 'CPU',
  'agent.memory': 'Memory',
  'agent.storage': 'Storage',
  'agent.update': 'Updated',
  'agent.console': 'Console',
  'agent.detail': 'Detail',
  'agent.chat': 'Chat',
  'agent.files': 'Files',
  'agent.webUI': 'Web UI',
  'agent.pause': 'Pause',
  'agent.start': 'Start',
  'agent.pauseInstance': 'Pause',
  'agent.startInstance': 'Start',
  'agent.enterConsole': 'Console',
  'agent.openConsole': 'Open console',
  'agent.consoleUnavailable': 'Console unavailable',
  'agent.creatingCannotToggle': 'Instance is being created and cannot be toggled yet',
  'agent.currentStatusCannotToggle': 'Current status cannot be toggled',
  'agent.chatUnavailable': 'Chat is unavailable for this template or status',
  'agent.terminalUnavailable': 'Console is unavailable in the current status',
  'agent.filesUnavailable': 'File manager is unavailable in the current status',
  'agent.webUIUnavailable': 'This template does not provide Web UI',
  'agent.change': 'Change',
  'agent.editConfig': 'Edit Config',
  'agent.deleteInstance': 'Delete Instance',
  'agent.id': 'Instance ID',
  'agent.namespace': 'Namespace',
  'agent.model': 'Model',
  'agent.alias': 'Alias',
  'agent.runtimeEnv': 'Runtime',
  'agent.workDir': 'Workdir',
  'agent.createdAt': 'Created',
  'agent.health': 'Health',
  'agent.uptime': 'Uptime',
  'agent.restartCount': 'Restarts',
  'agent.normal': 'Healthy',
  'agent.error': 'Error',
  'agent.modelProvider': 'Model Provider',
  'agent.modelAndApi': 'Model & API',
  'agent.basicInfo': 'Basic Info',
  'agent.instanceInfo': 'Instance Info',
  'agent.runningStatus': 'Runtime Status',
  'agent.instanceOverview': 'Instance Overview',
  'agent.instanceOverviewDesc': 'Status, environment, and identifiers',
  'agent.runningResource': 'Runtime Resources',
  'agent.runningResourceDesc': 'Adjust CPU, memory, and storage resources',
  'agent.config': 'Agent Config',
  'agent.configDesc': 'Adjust alias, model, and template parameters',
  'agent.currentStatus': 'Current Status',
  'agent.keySource': 'Key Source',
  'agent.keyNotReady': 'Not ready',
  'agent.keyFromWorkspace': 'Provided by workspace',
  'agent.noExtraConfig': 'No additional Agent settings for this template.',
  'agent.resourcePreset': 'Preset',
  'agent.selectPreset': 'Select preset',
  'agent.customResource': 'Custom',
  'agent.storageCapacity': 'Storage Capacity',
  'agent.usedCpu': 'Used {used} cores / total {total} cores',
  'agent.usedMemory': 'Used {used} GiB / total {total} GiB',
  'agent.usedStorage': 'Used {used} GiB / total {total} GiB',
  'agent.presetMinimum': 'Minimum',
  'agent.presetRecommended': 'Recommended',
  'agent.presetLuxury': 'High Performance',
  'agent.presetCustom': 'Custom',
  'agent.presetMinimumDesc': '1c2g · Lightweight',
  'agent.presetRecommendedDesc': '2c4g · Default',
  'agent.presetLuxuryDesc': '4c8g · More performance',
  'agent.presetCustomDesc': 'Manual CPU / memory',
  'agent.statusRunning': 'Running',
  'agent.statusCreating': 'Creating',
  'agent.statusStopped': 'Paused',
  'agent.statusError': 'Error',
  'agent.configModalTitle': 'Edit Config',
  'agent.configModalDesc': 'Adjust resources and basic Agent settings, then apply them to this instance.',
  'agent.presetConfig': 'Preset',
  'agent.presetConfigOption': '{name} · CPU: {cpu} / Memory: {memory}',
  'agent.aliasPlaceholder': 'e.g. Support Assistant',
  'agent.deleteModalTitle': 'Delete Agent',
  'agent.deleteModalHeading': 'Delete this Agent?',
  'agent.deleteModalDesc': 'This Agent and related resources will be deleted. This action cannot be undone.',
  'agent.deleteNameLabel': 'Enter Agent name',
  'agent.deleteNameMismatch': 'Agent name does not match',
  'agent.deleteNameHint': 'Enter {name} to confirm deletion.',
  'agent.deleting': 'Deleting...',
  'agent.confirmDelete': 'Confirm Delete',
  'agent.detailLoading': 'Loading Agent detail...',
  'agent.notFoundTitle': 'Instance Not Found',
  'agent.notFoundMessage': 'No Agent named {name} was found.',
  'agent.changeTemplate': 'Change Template',
  'agent.preparing': 'Preparing',
  'agent.preparingConfig': 'Preparing creation config',
  'agent.preparingConfigDesc': 'Reading template and default config. Please wait.',
  'agent.unavailable': 'Unavailable',
  'agent.workspaceNotReady': 'Workspace is not ready',
  'agent.workspaceNotReadyDesc': 'Return to the list page and try creating again.',
  'agent.runtimeSection': 'Runtime Environment',
  'agent.runtimeSectionDesc': 'This creation flow uses the template runtime directory and docs.',
  'agent.settingsSection': 'Agent Settings',
  'agent.settingsSectionDesc': 'Only editable Agent settings are shown here.',
  'agent.moreSettings': 'More Settings',
  'agent.resourceSectionDesc': 'Use the recommended template resources or switch to custom resources.',
  'agent.clickEdit': 'Edit',
  'agent.current': 'Current',
  'agent.modelPresetEmpty': 'This template has no preset models.',
  'agent.modelPresetCn': 'CN model presets are provided by the backend template catalog.',
  'agent.modelPresetUs': 'US model presets are provided by the backend template catalog.',
  'agent.selectModel': 'Select model',
  'agent.customResourceTitle': 'Custom Resources',
  'agent.customResourceSpecTitle': 'Custom Resource Spec',
  'agent.customResourceDesc': 'Custom resources use fixed steps and update the summary after applying.',
  'agent.customResourceSpecDesc': 'Custom mode adjusts CPU and memory only. Storage is configured separately.',
  'agent.unitCore': 'core',
  'agent.unitTimes': 'times',
  'agent.day': 'd',
  'agent.hour': 'h',
  'agent.minute': 'm',
  'console.agentConsole': 'Agent Console',
  'console.home': 'Console Home',
  'console.resourceExplorer': 'Resource Explorer',
  'console.backParent': 'Back to parent',
  'console.backWorkspace': 'Back to workspace',
  'console.backExplorer': 'Back to resource explorer',
  'console.addTerminal': 'Add Terminal',
  'console.uploadFiles': 'Upload files',
  'console.uploadDialogTitle': 'Upload files',
  'console.uploadDialogDesc': 'Upload files to {path}',
  'console.uploadDialogSubmit': 'Upload {count}',
  'console.uploadDropTitle': 'Drop files or folders here',
  'console.uploadDropDesc': 'Drop a folder to keep its directory structure, or choose one or more files.',
  'console.uploadPickFiles': 'Choose files',
  'console.uploadQueue': 'Upload queue',
  'console.uploadQueueCount': '{count} items',
  'console.uploadQueueEmpty': 'No files selected.',
  'console.uploading': 'Uploading',
  'console.uploadDone': 'Done',
  'console.uploadAllDone': 'Upload complete',
  'console.openFile': 'Open',
  'console.enterDirectory': 'Open folder',
  'console.uploadHere': 'Upload here',
  'console.createFile': 'New file',
  'console.createDirectory': 'New folder',
  'console.copyPath': 'Copy path',
  'console.copyCurrentPath': 'Copy current path',
  'console.renamePrompt': 'Enter a new name',
  'console.createFilePrompt': 'Enter a file name',
  'console.createDirectoryPrompt': 'Enter a folder name',
  'console.deleteConfirm': 'Delete {name}?',
  'console.terminalTab': 'Terminal',
  'console.searchFiles': 'Search files',
  'console.fileTree': 'File Tree',
  'console.searchResults': 'Search results: {keyword}',
  'console.searchingFiles': 'Searching files',
  'console.loadingFiles': 'Loading files',
  'console.noMatchingFiles': 'No matching files',
  'console.noFileTree': 'No file tree',
  'console.noOpenPage': 'No Open Page',
  'console.noOpenPageDesc': 'Select a file from the list on the left, or start a terminal.',
  'console.ready': 'Preparing',
  'console.reading': 'Reading',
  'console.cacheRefreshing': 'Refreshing cached content',
  'console.filePreview': 'File Preview',
  'console.closeNotice': 'Close notice',
  'console.unsavedChanges': 'Unsaved changes',
  'console.closeDirtySaveConfirm': '{name} has unsaved changes. Save before closing?',
  'console.closeDirtyDiscardConfirm': 'Close {name} without saving?',
  'console.searchFilesFailed': 'Search files failed',
  'console.openPreviewTab': 'Preview {port}',
  'console.openPreviewFailed': 'Failed to open preview',
  'console.loadFailed': 'Failed to load Agent console.',
  'console.clusterContextMissing': 'No real cluster context was found, so the Agent console cannot be loaded.',
  'console.agentNameMissing': 'Missing Agent instance name, so the console cannot be loaded.',
  'terminal.workspace': 'Terminal Workspace',
  'terminal.workspaceDesc': 'Open a terminal to enter the Agent container environment and inspect processes, logs, Hermes CLI, and installation status.',
  'terminal.connect': 'Connect Terminal',
  'terminal.reconnect': 'Reconnect',
  'terminal.connecting': 'Connecting terminal...',
  'terminal.reconnecting': 'Restoring terminal connection...',
  'terminal.disconnected': 'Terminal connection closed.',
  'terminal.waitingTarget': 'Waiting for terminal target',
  'terminal.loading': 'Loading',
  'terminal.loadWorkspaceFailed': 'Failed to load workspace information',
  'terminal.agentNotFound': 'Agent instance named {name} was not found.',
  'terminal.loadAgentFailed': 'Failed to load Agent information',
  'terminal.reconnectFailed': 'Terminal connection retried several times. Please reconnect manually.',
  'terminal.workspaceNotReady': 'The current workspace is not ready, so the terminal cannot connect yet.',
  'terminal.connectionFailed': 'Terminal connection failed',
  'terminal.connectionRestored': 'Terminal connection restored.',
  'terminal.droppedOutputNotice': '[Server backpressure protection: some historical output was skipped to keep interaction responsive]',
  'terminal.connectionLostReconnecting': 'Connection lost{code}, reconnecting in {seconds}s...',
  'terminal.connectionCode': ' (code={code})',
  'template.defaultSort': 'Default',
  'template.nameSort': 'Name',
  'template.count': 'Showing {count} templates',
  'template.emptyTitle': 'No Templates Found',
  'template.emptyDesc': 'No matching templates. Try another keyword.',
  'template.creatable': 'Available',
  'template.previewOnly': 'Preview only',
  'template.hermes.description': 'Hermes Agent service with API access, terminal, files, SSH, and IDE connections.',
  'template.hermes.docsLabel': 'Chat + Terminal',
  'template.openclaw.description': 'An Agent for browser automation scenarios with Web UI, terminal, files, and settings entry points.',
  'template.openclaw.docsLabel': 'Web UI + Terminal',
  'template.action.chat': 'Chat',
  'template.action.terminal': 'Terminal',
  'template.action.files': 'Files',
  'template.action.webUI': 'Web UI',
  'template.access.api': 'API',
  'template.access.terminal': 'Terminal',
  'template.access.files': 'Files',
  'template.access.ssh': 'SSH',
  'template.access.ide': 'IDE',
  'template.access.webUI': 'Web UI',
  'summary.card': 'Summary',
  'summary.cardDesc': 'Review the core creation details in this card before submitting.',
  'summary.emptyAlias': 'Not filled',
  'summary.instanceGenerated': 'Instance name will be generated after submission and used for resources.',
  'summary.notSelected': 'Not selected',
  'summary.instanceName': 'Instance Name',
  'summary.generatedAfterSubmit': 'Generated after submission',
}

const dictionaries = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

function normalizeLocale(locale: unknown): AppLocale {
  const value = String(locale || '').trim().toLowerCase()
  if (value === 'en' || value === 'en-us') return 'en-US'
  return 'zh-CN'
}

export function getAgentHubLocale() {
  return currentLocale
}

export function setAgentHubLocale(locale: AppLocale) {
  currentLocale = normalizeLocale(locale)
  if (typeof window !== 'undefined') {
    window.document.documentElement.lang = currentLocale
  }
}

function extractDesktopLocale(payload: unknown): AppLocale {
  if (typeof payload === 'string') return normalizeLocale(payload)
  if (!payload || typeof payload !== 'object') return DEFAULT_LOCALE
  const record = payload as { currentLanguage?: unknown; lng?: unknown }
  return normalizeLocale(record.currentLanguage || record.lng)
}

export function translate(locale: AppLocale, key: TranslationKey, values?: TranslationValues) {
  const template = dictionaries[locale][key] || zhCN[key] || key
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''))
}

export function translateStatus(status: 'running' | 'creating' | 'stopped' | 'error', t: I18nContextValue['t']) {
  switch (status) {
    case 'running':
      return t('agent.statusRunning')
    case 'creating':
      return t('agent.statusCreating')
    case 'stopped':
      return t('agent.statusStopped')
    case 'error':
      return t('agent.statusError')
  }
}

export function translateTemplateDescription(templateId: string, fallback: string, t: TranslateFn) {
  if (templateId === 'hermes-agent') return t('template.hermes.description')
  if (templateId === 'openclaw') return t('template.openclaw.description')
  return fallback
}

export function translateTemplateDocsLabel(templateId: string, fallback: string, t: TranslateFn) {
  if (templateId === 'hermes-agent') return t('template.hermes.docsLabel')
  if (templateId === 'openclaw') return t('template.openclaw.docsLabel')
  return fallback
}

export function translateTemplateActionLabel(key: string, fallback: string, t: TranslateFn) {
  if (key === 'chat' || key === 'open-chat') return t('template.action.chat')
  if (key === 'terminal' || key === 'open-terminal') return t('template.action.terminal')
  if (key === 'files' || key === 'open-files') return t('template.action.files')
  if (key === 'web-ui') return t('template.action.webUI')
  return fallback
}

export function translateTemplateAccessLabel(key: string, fallback: string, t: TranslateFn) {
  if (key === 'api') return t('template.access.api')
  if (key === 'terminal') return t('template.access.terminal')
  if (key === 'files') return t('template.access.files')
  if (key === 'ssh') return t('template.access.ssh')
  if (key === 'ide') return t('template.access.ide')
  if (key === 'web-ui') return t('template.access.webUI')
  return fallback
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE)

  const setLocale = useCallback((nextLocale: AppLocale) => {
    const normalizedLocale = normalizeLocale(nextLocale)
    currentLocale = normalizedLocale
    if (typeof window !== 'undefined') {
      window.document.documentElement.lang = normalizedLocale
    }
    setLocaleState((current) => (current === normalizedLocale ? current : normalizedLocale))
  }, [])

  useEffect(() => {
    let cancelled = false

    void getSealosLanguage()
      .then((result) => {
        if (cancelled) return
        setLocale(extractDesktopLocale(result))
      })
      .catch((error) => {
        console.warn('[i18n] get Sealos Desktop language failed, fallback to zh-CN:', error)
      })

    let unsubscribe: (() => void) | undefined
    try {
      const result = addSealosAppEventListener('change_i18n', (payload: unknown) => {
        setLocale(extractDesktopLocale(payload))
      })
      if (typeof result === 'function') {
        unsubscribe = () => result()
      }
    } catch (error) {
      console.warn('[i18n] listen Sealos Desktop language failed:', error)
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [setLocale])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key, values) => translate(locale, key, values),
  }), [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: setAgentHubLocale,
      t: (key: TranslationKey, values?: TranslationValues) => translate(DEFAULT_LOCALE, key, values),
    }
  }
  return context
}
