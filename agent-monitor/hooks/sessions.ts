import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SessionRow, SessionSnapshot } from '../types'
import { clip } from './format'
import { folderKey, readSnapshots, resolveSelf, writeSnapshot } from './share'
import { ownSessions } from './signals'
import {
  LIST_EVERY_POLLS,
  LIST_SESSIONS_TOOL,
  MAIN,
  PANE,
  SELF_TRIES,
  SHAPES,
  SHARED_AGENTS,
  SHARED_HANDOVERS,
  SHARED_HANDOVER_CHARS,
  SHARED_SKILLS,
  live,
} from './state'

// This session among its linked sessions: who it is, which sessions it
// started and what they share, and what it shares in turn.

const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: SHAPES.agents,
})
const handovers = atom({ plugin: 'agent-monitor', key: 'handovers' } as const, [], {
  shape: SHAPES.handovers,
})
const events = atom({ plugin: 'agent-monitor', key: 'events' } as const, [], {
  shape: SHAPES.events,
})
const sessions = atom({ plugin: 'agent-monitor', key: 'sessions' } as const, [], {
  shape: SHAPES.sessions,
})
const mainBusy = atom({ plugin: 'agent-monitor', key: 'mainBusy' } as const, false, {
  shape: SHAPES.mainBusy,
})
const remote = atom({ plugin: 'agent-monitor', key: 'remote' } as const, {} as Record<string, SessionSnapshot>, {
  shape: SHAPES.remote,
})

export const toSessionRows = (text: string): Omit<SessionRow, 'firstSeenAt' | 'endedAt'>[] => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item: Record<string, unknown>) => {
      if (typeof item.sessionId !== 'string') return []
      return [
        {
          id: item.sessionId,
          title: typeof item.title === 'string' ? item.title : item.sessionId,
          name: typeof item.name === 'string' ? item.name : undefined,
          startedBy: typeof item.startedBy === 'string' ? item.startedBy : undefined,
          isArchived: item.isArchived === true,
          cwd: typeof item.cwd === 'string' ? item.cwd : undefined,
          isRunning: item.isRunning === true,
          prNumber: typeof item.prNumber === 'number' ? item.prNumber : undefined,
          prState: typeof item.prState === 'string' ? item.prState : undefined,
          lastActivityAt: typeof item.lastActivityAt === 'string' ? Date.parse(item.lastActivityAt) || 0 : 0,
        },
      ]
    })
  } catch {
    return []
  }
}

// Reads this session's linked family from the app, only where the permission
// check allows it without asking, so polling never opens a dialog.
export async function syncSessions($: EngineInterface): Promise<void> {
  if (live.isSyncing) return
  const isListDue = live.pollCount % LIST_EVERY_POLLS === 0
  live.pollCount += 1
  // Without a family yet there are no snapshots to read, only the list to
  // look at now and then: the app's session tools may not be ready at start,
  // and a family can appear later (a session started from here, or a reload).
  if (!isListDue && !live.isSessionFamilyKnown) return
  live.isSyncing = true
  try {
    if (isListDue) {
      // Archived sessions too: they are the Done tab's finished ones.
      const input = { linked: true, include_archived: true }
      const { decision } = await $.tool.check({ tool: LIST_SESSIONS_TOOL, input })
      if (decision !== 'allow') return
      const res = await $.tool.call({ tool: LIST_SESSIONS_TOOL, ...input })
      const text = 'text' in res && typeof res.text === 'string' ? res.text : ''
      const fresh = toSessionRows(text)
      if (fresh.length > 0) live.isSessionFamilyKnown = true
      const now = Date.now()
      await update($, sessions, list =>
        fresh.map(s => {
          const before = list.find(x => x.id === s.id)
          const firstSeenAt = before?.firstSeenAt ?? now
          const endedAt = !s.isArchived ? undefined : before?.endedAt ?? (before && !before.isArchived ? now : s.lastActivityAt || now)
          return { ...s, firstSeenAt, endedAt }
        }),
      )
    }
    const rows = await read($, sessions)
    const children = ownSessions(rows, live.selfId)
    if (children.length > 0) {
      const found = await readSnapshots($, children.map(s => s.id))
      // A child that never learned its own id shares under its folder instead;
      // only a folder no other session here uses names one child for sure.
      const keyOf = (cwd: string | undefined) => (cwd ? folderKey(cwd) : '')
      const byFolder = children.filter(
        s =>
          !found[s.id] &&
          keyOf(s.cwd) !== '' &&
          keyOf(s.cwd) !== keyOf(live.selfCwd) &&
          rows.filter(r => keyOf(r.cwd) === keyOf(s.cwd)).length === 1,
      )
      const viaFolder = await readSnapshots($, byFolder.map(s => folderKey(s.cwd ?? '')))
      const matched = Object.fromEntries(
        byFolder.flatMap(s => {
          const snap = viaFolder[folderKey(s.cwd ?? '')]
          return snap ? [[s.id, snap] as const] : []
        }),
      )
      await update($, remote, () => ({ ...found, ...matched }))
    }
  } catch {
    // The tool is missing or refused here: no sessions to show.
  } finally {
    live.isSyncing = false
  }
}

// Asks the app who this session is; the app's session tools may not be ready
// at start, so this is tried again while sharing until it answers.
export async function learnSelf($: EngineInterface): Promise<void> {
  if (live.selfId || live.isLearningSelf || live.selfTries >= SELF_TRIES) return
  live.isLearningSelf = true
  live.selfTries += 1
  try {
    const self = await resolveSelf($)
    live.selfId = self?.id
    live.isChild = !!self?.parentId
    // A session another one started is shown in its starter's pane, so it
    // opens no pane of its own unless asked (/agent-monitor).
    if (live.selfId && !self?.parentId && !live.isPaneOpened) {
      live.isPaneOpened = true
      await $.ui.open({ id: PANE, title: 'Agents' })
    }
  } finally {
    live.isLearningSelf = false
  }
}

// Shares what this session does with the session that started it, when it
// changed: under its app id once known, and always under its folder, which
// the starter also knows from the app's session list.
export async function shareSnapshot($: EngineInterface): Promise<void> {
  await learnSelf($)
  if (!live.selfCwd) return
  const rows = await read($, agents)
  const log = await read($, events)
  const main = rows.find(r => r.id === MAIN)
  const body = {
    isMainBusy: await read($, mainBusy),
    mainTool: main?.tool,
    mainToolDetail: main?.toolDetail,
    mainWaitingSince: main?.waitingSince,
    mainWaitingTool: main?.waitingTool,
    mainTokens: main?.tokens,
    mainModel: main?.model,
    handovers: (await read($, handovers)).slice(-SHARED_HANDOVERS).map(h => ({ ...h, text: clip(h.text, SHARED_HANDOVER_CHARS) })),
    agents: rows
      .filter(r => r.id !== MAIN)
      .slice(-SHARED_AGENTS)
      .map(r => ({ ...r, toolTimes: [] })),
    skills: log
      .filter(ev => ev.kind === 'skill')
      .slice(-SHARED_SKILLS)
      .map(ev => ({ at: ev.at, agentId: ev.agentId, name: ev.name })),
  }
  const text = JSON.stringify(body)
  if (text === live.lastShared) return
  live.lastShared = text
  const updatedAt = Date.now()
  if (live.selfId) await writeSnapshot($, { id: live.selfId, updatedAt, ...body })
  await writeSnapshot($, { id: folderKey(live.selfCwd), updatedAt, ...body })
}
