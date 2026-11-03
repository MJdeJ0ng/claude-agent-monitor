import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentRow, SessionRow, SessionSnapshot } from '../types'
import { avatarOf } from './format'
import { NEEDS_YOU_GRACE_MS, isSessionBusy, phaseOf } from './signals'
import { MAIN, NEEDS_YOU_SOUND, PARTY_MS, SHAPES, announced } from './state'

// Who waits on the person, and the pane's heartbeat that tells them so.

const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: SHAPES.agents,
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
const tick = atom({ plugin: 'agent-monitor', key: 'tick' } as const, 0, {
  shape: SHAPES.tick,
})

export type Wait = { key: string; since: number; who: string; tool?: string; agentId?: string }

// Everything waiting on the person: this session's agents and, from their
// snapshots, the sessions it started and their agents. This session's own
// question is on screen already, so it is not listed.
export const waitsOf = (rows: AgentRow[], family: SessionRow[], inside: Record<string, SessionSnapshot>, now: number): Wait[] => {
  const local = rows
    .filter(r => r.id !== MAIN && phaseOf(r, now) === 'waiting')
    .map(r => ({ key: r.id, since: r.waitingSince ?? now, who: `${avatarOf(r.type)} ${r.name ?? r.type}`, tool: r.waitingTool, agentId: r.id }))
  const remoteWaits = family
    .filter(s => isSessionBusy(s, inside[s.id]))
    .flatMap(s => {
      const snap = inside[s.id]
      if (!snap) return []
      const own =
        snap.mainWaitingSince !== undefined && now - snap.mainWaitingSince >= NEEDS_YOU_GRACE_MS
          ? [{ key: `${s.id}:main`, since: snap.mainWaitingSince, who: `🪟 ${s.title}`, tool: snap.mainWaitingTool }]
          : []
      const theirs = snap.agents
        .filter(a => phaseOf(a, now) === 'waiting')
        .map(a => ({ key: `${s.id}:${a.id}`, since: a.waitingSince ?? now, who: `🪟 ${s.title} › ${a.name ?? a.type}`, tool: a.waitingTool }))
      return [...own, ...theirs]
    })
  return [...local, ...remoteWaits].sort((a, b) => a.since - b.since)
}

// One bugle call and toast per new wait; nothing while it keeps waiting.
export async function announceWaits($: EngineInterface): Promise<void> {
  const waits = waitsOf(await read($, agents), await read($, sessions), await read($, remote), Date.now())
  const keys = new Set(waits.map(w => w.key))
  for (const key of [...announced]) if (!keys.has(key)) announced.delete(key)
  const fresh = waits.filter(w => !announced.has(w.key))
  if (fresh.length === 0) return
  for (const w of fresh) announced.add(w.key)
  const first = fresh[0]
  if (!first) return
  void $.ui.toast(`📯 ${first.who} needs you${first.tool ? `: may it use ${first.tool}?` : ''}`)
  try {
    await $.audio.play({ asset: NEEDS_YOU_SOUND }, { shouldLoop: false, gain: 0.6 })
  } catch {
    // No player here (a Windows or Linux terminal): the toast says it.
  }
}

// Animate spinners while agents work, and a little after they finish.
export async function pulse($: EngineInterface): Promise<void> {
  const rows = await read($, agents)
  const now = Date.now()
  const isRemoteBusy = Object.values(await read($, remote)).some(
    snap => snap.isMainBusy || snap.agents.some(a => a.status === 'running'),
  )
  const isLively =
    isRemoteBusy ||
    (await read($, mainBusy)) ||
    rows.some(
      r => r.id !== MAIN && (r.status === 'running' || (r.endedAt !== undefined && now - r.endedAt < PARTY_MS)),
    )
  if (isLively) {
    await update($, tick, n => n + 1)
    await announceWaits($)
  }
}
