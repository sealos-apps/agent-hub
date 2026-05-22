import { useCallback, useState } from 'react'
import { streamAgentChatCompletions } from '../../../../api'
import type { ChatStreamEvent } from '../../../../api/backend'
import type { AgentListItem, ChatMessage, ChatSessionState, ClusterContext } from '../../../../domains/agents/types'

const createChatSession = (resource: AgentListItem): ChatSessionState => ({
  resource,
  draft: '',
  status: 'idle',
  transport: 'sse',
  error: '',
  triedApiUrls: [],
  messages: [],
})

interface UseAgentChatOptions {
  clusterContext: ClusterContext | null
  onErrorMessage: (message: string) => void
}

export function useAgentChat({
  clusterContext,
  onErrorMessage,
}: UseAgentChatOptions) {
  const [chatSession, setChatSession] = useState<ChatSessionState | null>(null)

  const updateChatSession = useCallback(
    (updater: ChatSessionState | ((current: ChatSessionState) => ChatSessionState)) => {
      setChatSession((current) => {
        if (!current) return current
        return typeof updater === 'function' ? updater(current) : updater
      })
    },
    [],
  )

  const openChat = useCallback(
    (item: AgentListItem) => {
      if (!clusterContext) {
        onErrorMessage('当前工作区还没准备好，暂时无法发起对话。')
        return
      }

      if (!item.chatAvailable) {
        onErrorMessage(item.chatDisabledReason || '当前实例暂不可对话。')
        return
      }

      setChatSession(createChatSession(item))
    },
    [clusterContext, onErrorMessage],
  )

  const closeChat = useCallback(() => {
    setChatSession(null)
  }, [])

  const setChatDraft = useCallback(
    (value: string) => {
      updateChatSession((current) => ({
        ...current,
        draft: value,
      }))
    },
    [updateChatSession],
  )

  const sendChatMessage = useCallback(async () => {
    if (!chatSession || !clusterContext) return

    const draft = chatSession.draft.trim()
    if (!draft) return
    if (!chatSession.resource.model) {
      updateChatSession((current) => ({
        ...current,
        status: 'error',
        error: '当前 Agent 没有显式模型配置，无法发起对话。',
      }))
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: draft,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }

    const baseMessages = [...chatSession.messages, userMessage]

    updateChatSession((current) => ({
      ...current,
      status: 'connecting',
      error: '',
      draft: '',
      messages: baseMessages,
    }))

    try {
      await streamAgentChatCompletions(
        {
          agentName: chatSession.resource.name,
          payload: {
            model: chatSession.resource.model,
            stream: true,
            messages: baseMessages.map(({ role, content }) => ({ role, content })),
          },
          onEvent: (event: ChatStreamEvent) => {
            if (event.type === 'open') {
              updateChatSession((current) => ({
                ...current,
                status: 'connected',
                transport: event.transport,
                error: '',
              }))
              return
            }

            if (event.type === 'message') {
              const payload = (event.payload || {}) as {
                choices?: Array<{
                  delta?: { content?: string }
                  message?: { content?: string }
                }>
                content?: string
                message?: string
              }
              const chunk =
                payload.choices?.[0]?.delta?.content ||
                payload.choices?.[0]?.message?.content ||
                payload.content ||
                payload.message ||
                ''

              if (!chunk) return

              updateChatSession((current) => {
                const messages = [...current.messages]
                const lastMessage = messages[messages.length - 1]

                if (lastMessage?.role === 'assistant' && lastMessage.streaming) {
                  messages[messages.length - 1] = {
                    ...lastMessage,
                    content: `${lastMessage.content}${chunk}`,
                  }
                } else {
                  messages.push({
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: chunk,
                    createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                    streaming: true,
                  })
                }

                return {
                  ...current,
                  status: 'connected',
                  transport: event.transport,
                  error: '',
                  messages,
                }
              })
              return
            }

            if (event.type === 'done') {
              updateChatSession((current) => ({
                ...current,
                status: 'connected',
                messages: current.messages.map((message) => ({ ...message, streaming: false })),
              }))
            }
          },
        },
        clusterContext,
      )
    } catch (error) {
      updateChatSession((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : '发送失败，请稍后重试。',
        messages: current.messages.map((message) => ({ ...message, streaming: false })),
      }))
    }
  }, [chatSession, clusterContext, updateChatSession])

  return {
    chatSession,
    closeChat,
    openChat,
    sendChatMessage,
    setChatDraft,
  }
}
