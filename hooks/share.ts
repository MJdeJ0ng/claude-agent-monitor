import type { EngineInterface } from 'claude-code'

import type { SessionSnapshot } from '../types'

// How sessions see into each other: each session writes what it is doing to
// one file in a folder they all share, named by its app session id; the
// session that started it reads that file to draw it under its session row.

const GET_SESSION_TOOL = 'mcp__ccd_session_mgmt__get_session'
const LIVE_FOLDER = 'agent-monitor-live'
const CLAUDE_DIR = '/.claude/'

// The shared folder sits in the user's Claude configuration directory, found
// from where the plugin is installed (…/.claude/plugins/cache/…).
export function liveDirOf(pluginRoot: string): string {
  const root = pluginRoot.replace(/\\/g, '/')
  const at = root.toLowerCase().lastIndexOf(CLAUDE_DIR)
  const base = at >= 0 ? root.slice(0, at + CLAUDE_DIR.length - 1) : root
  return `${base}/${LIVE_FOLDER}`
}

// This session as the app knows it: its id (`local_…`), which is how the
// session that started it names it, and that starter's id, if any. Only asked
// where the permission check allows it without a dialog.
export type SelfInfo = { id: string; parentId?: string }

export async function resolveSelf($: EngineInterface): Promise<SelfInfo | undefined> {
  try {
    const input = { session_id: 'self' }
    const { decision } = await $.tool.check({ tool: GET_SESSION_TOOL, input })
    if (decision !== 'allow') return undefined
    const res = await $.tool.call({ tool: GET_SESSION_TOOL, ...input })
    const text = 'text' in res && typeof res.text === 'string' ? res.text : ''
    const parsed = JSON.parse(text) as { sessionId?: unknown; parentSessionId?: unknown; detached?: unknown }
    if (typeof parsed.sessionId !== 'string') return undefined
    const parentId =
      typeof parsed.parentSessionId === 'string' && parsed.detached !== true ? parsed.parentSessionId : undefined
    return { id: parsed.sessionId, parentId }
  } catch {
    return undefined
  }
}

export async function writeSnapshot($: EngineInterface, snapshot: SessionSnapshot): Promise<void> {
  try {
    await $.fs.write(`${liveDirOf($.plugin.root)}/${snapshot.id}.json`, JSON.stringify(snapshot))
  } catch {
    // Sharing is best effort: the pane of this session works without it.
  }
}

const isSnapshot = (value: unknown): value is SessionSnapshot => {
  const v = value as Partial<SessionSnapshot> | null
  return typeof v?.id === 'string' && typeof v.updatedAt === 'number' && Array.isArray(v.agents) && Array.isArray(v.skills)
}

// Reads the snapshots of the given sessions; a session with no file yet (no
// mod there, or nothing shared) is left out.
export async function readSnapshots($: EngineInterface, ids: string[]): Promise<Record<string, SessionSnapshot>> {
  const dir = liveDirOf($.plugin.root)
  const found = await Promise.all(
    ids.map(async id => {
      try {
        const parsed: unknown = JSON.parse(String(await $.fs.read(`${dir}/${id}.json`)))
        return isSnapshot(parsed) ? ([id, parsed] as const) : undefined
      } catch {
        return undefined
      }
    }),
  )
  return Object.fromEntries(found.filter(entry => entry !== undefined))
}
