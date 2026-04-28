export const initialConsoleTabId = 'home'

export const createInitialConsoleTabs = () => [
  { id: initialConsoleTabId, type: 'home' as const, title: '控制台首页' },
]
