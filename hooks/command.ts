import type { EngineInterface } from 'claude-code'

import { clip } from './format'

// Acting on a child session from the pane: stopping its turn, sending it a
// message. Both go through the app's own session tools, so the app's
// permission rules apply as when the model calls them; the pane says what
// came of it in a toast.

const RESULT_CHARS = 120
const REFUSED = 'not allowed here: a permission rule refuses it'

const resultText = (res: unknown): string => {
  const r = res as { text?: unknown; deny?: unknown } | null
  if (typeof r?.deny === 'string') return r.deny
  return typeof r?.text === 'string' ? r.text : ''
}

// Interrupts the session's turn, as its own Stop button would; the session
// stays open, and a message waiting in it runs next.
export async function stopSession($: EngineInterface, sessionId: string, title: string): Promise<void> {
  try {
    const input = { session_id: sessionId }
    const { decision } = await $.tool.check({ tool: 'mcp__ccd_session_mgmt__stop_session', input })
    const said =
      decision === 'deny'
        ? REFUSED
        : resultText(await $.tool.call({ tool: 'mcp__ccd_session_mgmt__stop_session', ...input }))
    void $.ui.toast(`✋ ${title}: ${clip(said || 'stop sent', RESULT_CHARS)}`)
  } catch (err) {
    void $.ui.toast(`✋ ${title}: could not stop (${clip(String(err), RESULT_CHARS)})`)
  }
}

// Delivers a message to the session as a turn from this one.
export async function messageSession($: EngineInterface, sessionId: string, title: string, text: string): Promise<void> {
  const message = text.trim()
  if (!message) return
  try {
    const input = { session_id: sessionId, message }
    const { decision } = await $.tool.check({ tool: 'mcp__ccd_session_mgmt__send_message', input })
    const said =
      decision === 'deny'
        ? REFUSED
        : resultText(await $.tool.call({ tool: 'mcp__ccd_session_mgmt__send_message', ...input }))
    const delivery = /delivery:\s*([a-z-]+)/i.exec(said)?.[1]
    void $.ui.toast(delivery ? `💬 ${title}: ${delivery}` : `💬 ${title}: ${clip(said || 'sent', RESULT_CHARS)}`)
  } catch (err) {
    void $.ui.toast(`💬 ${title}: not sent (${clip(String(err), RESULT_CHARS)})`)
  }
}
