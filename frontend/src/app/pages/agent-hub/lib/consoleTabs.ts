export const initialConsoleTabId = 'home'

export const createInitialConsoleTabs = (homeTitle = 'Console Home') => [
  { id: initialConsoleTabId, type: 'home' as const, title: homeTitle },
]
