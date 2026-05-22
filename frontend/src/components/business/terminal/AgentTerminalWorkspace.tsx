import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import type { ILink } from '@xterm/xterm'
import { LoaderCircle, Terminal as TerminalIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { TerminalSessionState } from '../../../domains/agents/types'
import { extractTerminalPreviewLinks } from '../../../app/pages/agent-hub/lib/terminalPreviewDetector'
import {
  applyTerminalOutputBackpressure,
  resolveTerminalFlushMode,
  terminalOutputBurstCharsPerFlush,
  terminalOutputCharsPerFlush,
} from './terminalOutputScheduler'
import { Button } from '../../ui/Button'
import { useI18n } from '../../../i18n'

interface AgentTerminalWorkspaceProps {
  isVisible?: boolean
  session: TerminalSessionState | null
  onOpen?: () => void
  onReady?: () => void
  onError?: (message: string) => void
  onInput?: (input: string) => void
  onResize?: (cols: number, rows: number) => void
  onAttachOutput?: (listener: (chunk: string) => void) => () => void
  onOpenPreviewPort?: (port: number) => void
}

const terminalTheme = {
  background: '#05070a',
  foreground: '#e5e7eb',
  cursor: '#f8fafc',
  cursorAccent: '#05070a',
  selectionBackground: 'rgba(148, 163, 184, 0.25)',
  black: '#0f172a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc',
}

type DisposableLike = { dispose: () => void }

const xtermColorReportPattern = /^(?:\x1b\](?:10|11|12);rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}(?:\x07|\x1b\\)|\x9d(?:10|11|12);rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\x9c)$/

const isXtermColorReportResponse = (data: string) => xtermColorReportPattern.test(data)

export function AgentTerminalWorkspace({
  isVisible = true,
  session,
  onOpen,
  onReady,
  onError,
  onInput,
  onResize,
  onAttachOutput,
  onOpenPreviewPort,
}: AgentTerminalWorkspaceProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeNowRef = useRef<() => void>(() => {})
  const inputHandlerRef = useRef(onInput)
  const resizeHandlerRef = useRef(onResize)
  const readyHandlerRef = useRef(onReady)
  const errorHandlerRef = useRef(onError)
  const openPreviewPortRef = useRef(onOpenPreviewPort)
  const detachOutputRef = useRef<(() => void) | null>(null)
  const connectedTerminalIdRef = useRef('')
  const readyNotifiedTerminalIdRef = useRef('')
  const announcedStateRef = useRef('')
  const lastResizeRef = useRef({ cols: 0, rows: 0 })
  const previousStatusRef = useRef<TerminalSessionState['status'] | ''>('')
  const outputQueueRef = useRef<string[]>([])
  const outputQueueHeadRef = useRef(0)
  const outputQueuedCharsRef = useRef(0)
  const outputDroppedRef = useRef(false)
  const outputFlushFrameRef = useRef<number | null>(null)
  const outputFlushTimerRef = useRef<number | null>(null)
  const outputWriteInFlightRef = useRef(false)
  const webglActiveRef = useRef(false)
  const visibleRef = useRef(isVisible)
  const terminalTextRef = useRef({
    connecting: t('terminal.connecting'),
    disconnected: t('terminal.disconnected'),
  })
  const activeTerminalId = session?.terminalId || ''

  useEffect(() => {
    terminalTextRef.current = {
      connecting: t('terminal.connecting'),
      disconnected: t('terminal.disconnected'),
    }
  }, [t])

  useEffect(() => {
    inputHandlerRef.current = onInput
  }, [onInput])

  useEffect(() => {
    resizeHandlerRef.current = onResize
  }, [onResize])

  useEffect(() => {
    readyHandlerRef.current = onReady
  }, [onReady])

  useEffect(() => {
    errorHandlerRef.current = onError
  }, [onError])

  useEffect(() => {
    openPreviewPortRef.current = onOpenPreviewPort
  }, [onOpenPreviewPort])

  useEffect(() => {
    connectedTerminalIdRef.current = ''
    readyNotifiedTerminalIdRef.current = ''
    announcedStateRef.current = ''
    previousStatusRef.current = ''
  }, [session?.terminalId])

  const notifyTerminalReady = (terminalId: string) => {
    if (readyNotifiedTerminalIdRef.current === terminalId) return
    readyNotifiedTerminalIdRef.current = terminalId
    readyHandlerRef.current?.()
  }

  const activateVisibleTerminal = () => {
    if (!visibleRef.current || !terminalRef.current) return

    // Visibility changes can happen while the pty is still opening; force a fresh
    // fit when the terminal becomes active so xterm never keeps a stale size.
    lastResizeRef.current = { cols: 0, rows: 0 }
    terminalRef.current.focus()
    window.requestAnimationFrame(() => {
      if (!visibleRef.current) return
      resizeNowRef.current()
    })
  }

  useEffect(() => {
    visibleRef.current = isVisible
    if (!isVisible || session?.status !== 'connected' || !session.terminalId) return
    activateVisibleTerminal()
  }, [isVisible, session?.status, session?.terminalId])

  useEffect(() => {
    if (!activeTerminalId || !containerRef.current) return

    const terminal = new XTerm({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: false,
      fontFamily: '"SF Mono", "SFMono-Regular", ui-monospace, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      macOptionIsMeta: true,
      scrollback: 2000,
      theme: terminalTheme,
    })
    const fitAddon = new FitAddon()

    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    webglActiveRef.current = false

    terminal.writeln(`\x1b[90m${terminalTextRef.current.connecting}\x1b[0m`)

    const resizeNow = () => {
      if (!terminalRef.current || !fitAddonRef.current) return
      fitAddonRef.current.fit()
      const { cols, rows } = terminalRef.current
      if (cols > 0 && rows > 0) {
        if (cols !== lastResizeRef.current.cols || rows !== lastResizeRef.current.rows) {
          lastResizeRef.current = { cols, rows }
          resizeHandlerRef.current?.(cols, rows)
        }
      }
    }

    resizeNowRef.current = resizeNow

    let webglAddon: DisposableLike | null = null
    let webglLossDisposable: DisposableLike | null = null
    let webglDisposed = false
    const enableWebglRenderer = async () => {
      try {
        const module = await import('@xterm/addon-webgl')
        if (webglDisposed || terminalRef.current !== terminal) return

        const addon = new module.WebglAddon()
        webglLossDisposable = addon.onContextLoss(() => {
          webglActiveRef.current = false
          webglLossDisposable?.dispose()
          webglLossDisposable = null
        })
        terminal.loadAddon(addon)
        webglAddon = addon
        webglActiveRef.current = true
        window.requestAnimationFrame(() => {
          resizeNowRef.current()
        })
      } catch {
        webglActiveRef.current = false
      }
    }
    void enableWebglRenderer()

    const dataDisposable = terminal.onData((data) => {
      if (!data) return
      if (isXtermColorReportResponse(data)) return
      inputHandlerRef.current?.(data)
    })

    const linkDisposable = terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        if (!openPreviewPortRef.current) {
          callback(undefined)
          return
        }

        const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
        const text = line?.translateToString(true)
        if (!text) {
          callback(undefined)
          return
        }

        const links = extractTerminalPreviewLinks(text).map<ILink>((link) => ({
          text: link.text,
          range: {
            start: {
              x: link.startColumn + 1,
              y: bufferLineNumber,
            },
            end: {
              x: link.endColumn,
              y: bufferLineNumber,
            },
          },
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate: () => {
            openPreviewPortRef.current?.(link.port)
          },
        }))

        callback(links.length ? links : undefined)
      },
    })

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        resizeNowRef.current()
      })
    })
    resizeObserver.observe(containerRef.current)
    window.requestAnimationFrame(() => {
      resizeNowRef.current()
    })

    if (onAttachOutput) {
      const compactOutputQueue = () => {
        const head = outputQueueHeadRef.current
        if (head <= 0) return

        const queue = outputQueueRef.current
        if (head < 1024 && head*2 < queue.length) return

        outputQueueRef.current = queue.slice(head)
        outputQueueHeadRef.current = 0
      }

      const clearScheduledFlush = () => {
        if (outputFlushFrameRef.current !== null) {
          window.cancelAnimationFrame(outputFlushFrameRef.current)
          outputFlushFrameRef.current = null
        }
        if (outputFlushTimerRef.current !== null) {
          window.clearTimeout(outputFlushTimerRef.current)
          outputFlushTimerRef.current = null
        }
      }

      const scheduleFlush = (mode: 'frame' | 'immediate') => {
        if (outputWriteInFlightRef.current) return
        if (outputFlushFrameRef.current !== null || outputFlushTimerRef.current !== null) return

        const scheduleMode = visibleRef.current ? mode : 'frame'

        if (scheduleMode === 'immediate') {
          outputFlushTimerRef.current = window.setTimeout(() => {
            outputFlushTimerRef.current = null
            flushOutputQueue()
          }, 4)
          return
        }

        outputFlushFrameRef.current = window.requestAnimationFrame(() => {
          outputFlushFrameRef.current = null
          flushOutputQueue()
        })
      }

      const flushOutputQueue = () => {
        clearScheduledFlush()
        const terminal = terminalRef.current
        if (!terminal || outputWriteInFlightRef.current) return

        const queue = outputQueueRef.current
        let head = outputQueueHeadRef.current
        if (head >= queue.length) return

        const flushMode = resolveTerminalFlushMode(outputQueuedCharsRef.current)
        let remaining = flushMode === 'burst' ? terminalOutputBurstCharsPerFlush : terminalOutputCharsPerFlush
        if (!visibleRef.current) {
          remaining = Math.min(remaining, 8 * 1024)
        }
        const parts: string[] = []
        while (remaining > 0 && head < queue.length) {
          const chunk = queue[head]
          if (!chunk) {
            head += 1
            continue
          }

          if (chunk.length <= remaining) {
            parts.push(chunk)
            remaining -= chunk.length
            outputQueuedCharsRef.current -= chunk.length
            head += 1
            continue
          }

          parts.push(chunk.slice(0, remaining))
          queue[head] = chunk.slice(remaining)
          outputQueuedCharsRef.current -= remaining
          remaining = 0
        }

        outputQueueHeadRef.current = head
        compactOutputQueue()

        const merged = parts.join('')
        if (merged) {
          outputWriteInFlightRef.current = true
          terminal.write(merged, () => {
            outputWriteInFlightRef.current = false
            if (outputQueueHeadRef.current < outputQueueRef.current.length) {
              const nextMode =
                resolveTerminalFlushMode(outputQueuedCharsRef.current) === 'burst' ? 'immediate' : 'frame'
              scheduleFlush(nextMode)
            } else if (outputDroppedRef.current) {
              outputDroppedRef.current = false
            }
          })
        } else if (outputDroppedRef.current) {
          outputDroppedRef.current = false
        }
      }

      detachOutputRef.current = onAttachOutput((chunk) => {
        if (!chunk) return

        const nextQueueState = applyTerminalOutputBackpressure(
          {
            queue: outputQueueRef.current,
            head: outputQueueHeadRef.current,
            queuedChars: outputQueuedCharsRef.current,
            droppedNoticeQueued: outputDroppedRef.current,
          },
          chunk,
        )
        outputQueueRef.current = nextQueueState.queue
        outputQueueHeadRef.current = nextQueueState.head
        outputQueuedCharsRef.current = nextQueueState.queuedChars
        outputDroppedRef.current = nextQueueState.droppedNoticeQueued

        const nextMode =
          resolveTerminalFlushMode(outputQueuedCharsRef.current) === 'burst' ? 'immediate' : 'frame'
        scheduleFlush(nextMode)
      })
    }

    return () => {
      if (outputFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(outputFlushFrameRef.current)
        outputFlushFrameRef.current = null
      }
      if (outputFlushTimerRef.current !== null) {
        window.clearTimeout(outputFlushTimerRef.current)
        outputFlushTimerRef.current = null
      }
      outputQueueRef.current = []
      outputQueueHeadRef.current = 0
      outputQueuedCharsRef.current = 0
      outputDroppedRef.current = false
      outputWriteInFlightRef.current = false
      webglDisposed = true
      webglLossDisposable?.dispose()
      webglLossDisposable = null
      webglAddon?.dispose()
      webglAddon = null
      webglActiveRef.current = false
      detachOutputRef.current?.()
      detachOutputRef.current = null
      resizeObserver.disconnect()
      linkDisposable.dispose()
      dataDisposable.dispose()
      fitAddon.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      resizeNowRef.current = () => {}
      lastResizeRef.current = { cols: 0, rows: 0 }
    }
  }, [activeTerminalId, onAttachOutput])

  useEffect(() => {
    if (!session || !terminalRef.current) return

    const becameConnected = session.status === 'connected' && previousStatusRef.current !== 'connected'
    const switchedTerminal = connectedTerminalIdRef.current !== session.terminalId

    if (session.status === 'connected' && becameConnected) {
      if (switchedTerminal) {
        connectedTerminalIdRef.current = session.terminalId
        terminalRef.current.clear()
      }
      notifyTerminalReady(session.terminalId)
      activateVisibleTerminal()
      previousStatusRef.current = session.status
      return
    }

    if (session.status === 'error' && session.error && announcedStateRef.current !== `error:${session.error}`) {
      announcedStateRef.current = `error:${session.error}`
      terminalRef.current.writeln(`\r\n\x1b[31m${session.error}\x1b[0m`)
      errorHandlerRef.current?.(session.error)
      return
    }

    if (session.status === 'disconnected' && announcedStateRef.current !== 'disconnected') {
      announcedStateRef.current = 'disconnected'
      terminalRef.current.writeln(`\r\n\x1b[33m${terminalTextRef.current.disconnected}\x1b[0m`)
    }
    previousStatusRef.current = session.status
  }, [session])

  if (!session) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <TerminalIcon size={22} />
        </div>
        <div className="mt-4 text-base font-medium text-slate-950">{t('terminal.workspace')}</div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
          {t('terminal.workspaceDesc')}
        </p>
        {onOpen ? (
          <div className="mt-4">
            <Button onClick={onOpen} variant="secondary">
              <TerminalIcon size={16} />
              {t('terminal.connect')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="agent-terminal-surface relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05070a]">
      {session.error ? (
        <div className="absolute left-3 right-3 top-3 z-[1]">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {session.error}
          </div>
          {onOpen ? (
            <div className="mt-3">
              <Button onClick={onOpen} variant="secondary">
                <TerminalIcon size={16} />
                {t('terminal.reconnect')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="h-full min-h-0 w-full bg-[#05070a] [scrollbar-gutter:stable] [&_.xterm-helper-textarea]:bg-[#05070a] [&_.xterm-screen]:h-full [&_.xterm-screen]:bg-[#05070a] [&_.xterm-scroll-area]:bg-[#05070a] [&_.xterm-viewport]:bg-[#05070a] [&_.xterm-viewport]:overflow-y-auto [&_.xterm-viewport::-webkit-scrollbar-corner]:bg-[#05070a] [&_.xterm]:h-full [&_.xterm]:bg-[#05070a]"
        ref={containerRef}
      />

      {(session.status === 'initializing' || session.status === 'connecting' || session.status === 'reconnecting') && !session.error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/28">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
            <LoaderCircle className="animate-spin" size={16} />
            {session.status === 'reconnecting' ? t('terminal.reconnecting') : t('terminal.connecting')}
          </div>
        </div>
      ) : null}
    </div>
  )
}
