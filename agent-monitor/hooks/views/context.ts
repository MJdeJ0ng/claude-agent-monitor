import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface } from 'claude-code'

import type { ArchivedAgent, SessionRow, SessionSnapshot, ViewFilter } from '../../types'
import { SPINNER, avatarOf, clip, duration, nowText } from '../format'
import { messageSession, stopSession } from '../command'
import { togglePlain } from '../history'
import { isSessionBusy, ownSessions, subtreeTotals } from '../signals'
import { MAIN, SHAPES, live } from '../state'
import { wordsFor } from '../wording'

// Everything one render of the pane draws from, read once: the atoms, the
// time, the words, what the rows add up to, and the presses that change them.

const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: SHAPES.agents,
})
const handovers = atom({ plugin: 'agent-monitor', key: 'handovers' } as const, [], {
  shape: SHAPES.handovers,
})
const events = atom({ plugin: 'agent-monitor', key: 'events' } as const, [], {
  shape: SHAPES.events,
})
const selected = atom({ plugin: 'agent-monitor', key: 'selected' } as const, '', {
  shape: SHAPES.selected,
})
const filter = atom({ plugin: 'agent-monitor', key: 'filter' } as const, 'live' as ViewFilter, {
  shape: SHAPES.filter,
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
const plain = atom({ plugin: 'agent-monitor', key: 'plain' } as const, false, {
  shape: SHAPES.plain,
})
const expanded = atom({ plugin: 'agent-monitor', key: 'expanded' } as const, [] as string[], {
  shape: SHAPES.expanded,
})
const archive = atom({ plugin: 'agent-monitor', key: 'archive' } as const, [] as ArchivedAgent[], {
  shape: SHAPES.archive,
})
const confirmStop = atom({ plugin: 'agent-monitor', key: 'confirmStop' } as const, '', {
  shape: SHAPES.confirmStop,
})
const sent = atom({ plugin: 'agent-monitor', key: 'sent' } as const, 0, {
  shape: SHAPES.sent,
})
const tick = atom({ plugin: 'agent-monitor', key: 'tick' } as const, 0, {
  shape: SHAPES.tick,
})

// The elements the views draw with, the same on every surface; a text field
// only where the surface has one.
export type UiKit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & Partial<Pick<Elements['terminal'], 'Input'>>

export type Ctx = Awaited<ReturnType<typeof renderContext>>

export async function renderContext($: EngineInterface, ui: UiKit, lines: number) {
  const rows = await read($, agents)
  const moves = await read($, handovers)
  const log = await read($, events)
  const focusId = await read($, selected)
  const beat = await read($, tick)
  const view = await read($, filter)
  const family = await read($, sessions)
  const inside = await read($, remote)
  const now = Date.now()
  const w = wordsFor(await read($, plain))
  const opened = await read($, expanded)
  const earlier = await read($, archive)
  const isMainBusy = await read($, mainBusy)
  const stopping = await read($, confirmStop)
  const sentCount = await read($, sent)
  const spin = SPINNER[beat % SPINNER.length]
  const opStart = rows.find(r => r.id === MAIN)?.startedAt ?? now
  const stamp = (at: number): string => `T+${duration(at - opStart)}`

  const rowOf = (id: string) => rows.find(x => x.id === id || x.name === id)
  const nameOf = (id: string): string => {
    if (id === MAIN) return w.hq
    const r = rowOf(id)
    return r ? r.name ?? r.type : clip(id, 16)
  }
  const badgeOf = (id: string): string => {
    if (id === MAIN) return `◆ ${w.hq}`
    const r = rowOf(id)
    return r ? `${avatarOf(r.type)} ${r.name ?? r.type}` : clip(id, 16)
  }

  // What a press changes.
  const select = (id: string) => () => void update($, selected, () => id)
  // A report as one sentence, opened in full on request.
  const toggleOpen = (key: string) => () =>
    void update($, expanded, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
  const setView = (next: ViewFilter) => () => void update($, filter, () => next)
  const switchWords = () => void togglePlain($)
  const openTranscript = (agentId: string) => () => void $.ui.view({ agentId })
  // Stopping a child session's turn takes two presses: ask, then confirm.
  const askStop = (sessionId: string) => () => void update($, confirmStop, () => sessionId)
  const cancelStop = () => void update($, confirmStop, () => '')
  const stopIt = (s: SessionRow) => () => {
    void update($, confirmStop, () => '')
    void stopSession($, s.id, s.title)
  }
  // A message sent clears the field: a new count draws a fresh one.
  const sendTo = (s: SessionRow) => (text: string) => {
    void update($, sent, n => n + 1)
    void messageSession($, s.id, s.title, text)
  }

  const totals = subtreeTotals(rows)
  const callsOf = (id: string) => log.filter(ev => ev.kind === 'tool' && ev.agentId === id)
  const lastReport = (id: string) => [...moves].reverse().find(h => h.kind === 'report' && h.from === id)
  const lastMessage = (id: string) => [...moves].reverse().find(h => h.kind === 'message' && h.from === id)

  const units = rows.filter(r => r.id !== MAIN)
  const running = units.filter(r => r.status === 'running').length
  const topLevel = units.filter(r => r.parentId === MAIN || !rows.some(p => p.id === r.parentId)).length
  const subLevel = units.length - topLevel
  // Sessions this one started, and theirs; one with no starter is our own parent.
  const familyIds = new Set(family.map(s => s.id))
  const childSessions = ownSessions(family, live.selfId)
  // An open child session is live, at work or waiting for you; an archived one is done.
  const runningSessions = childSessions.filter(s => isSessionBusy(s, inside[s.id])).length
  const openSessions = childSessions.filter(s => !s.isArchived).length
  const sessionDepth = (s: SessionRow): number => {
    let depth = 0
    let cur: SessionRow | undefined = s
    const seen = new Set<string>()
    while (cur?.startedBy && familyIds.has(cur.startedBy) && !seen.has(cur.id)) {
      seen.add(cur.id)
      const starter: string = cur.startedBy
      cur = family.find(x => x.id === starter)
      depth += 1
    }
    return depth
  }
  const mainNow = rows.find(r => r.id === MAIN)
  // The current step in a few words, with a session's id (a message's
  // address) named by its title.
  const stepOf = (tool: string, detail: string | undefined): string =>
    nowText(tool, detail?.replace(/local_[0-9a-f-]{8,}/gi, id => family.find(x => x.id === id)?.title ?? 'a session'))

  return {
    ui,
    lines,
    rows,
    moves,
    log,
    focusId,
    view,
    family,
    inside,
    now,
    w,
    opened,
    earlier,
    isMainBusy,
    spin,
    opStart,
    stamp,
    nameOf,
    badgeOf,
    select,
    toggleOpen,
    setView,
    switchWords,
    openTranscript,
    stopping,
    sentCount,
    askStop,
    cancelStop,
    stopIt,
    sendTo,
    totals,
    callsOf,
    lastReport,
    lastMessage,
    units,
    running,
    topLevel,
    subLevel,
    familyIds,
    childSessions,
    runningSessions,
    openSessions,
    sessionDepth,
    mainNow,
    stepOf,
  }
}
