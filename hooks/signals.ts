import type { AgentRow, SessionRow, SessionSnapshot } from '../types'

// What the pane reads off an agent beyond its raw events: which of four live
// states it is in, how much it and the agents under it used, and whether it
// keeps doing the same thing. Plain functions over rows, no engine calls.

// A permission question settles itself (an allow rule, auto mode) within a
// moment; one still open after this waits for the person.
export const NEEDS_YOU_GRACE_MS = 3_000
// No step and no tool for this long, with nothing running: radio silence.
export const SILENCE_MS = 90_000
// The same tool on the same target this many times in a row: a loop.
export const LOOP_REPEATS = 4

export type Phase = 'working' | 'waiting' | 'quiet' | 'failed' | 'ended'

export const PHASES: Record<Exclude<Phase, 'ended'>, { glyph: string; label: string; color: string }> = {
  working: { glyph: '●', label: 'on the move', color: 'green' },
  waiting: { glyph: '◐', label: 'needs you', color: 'yellow' },
  quiet: { glyph: '○', label: 'radio silence', color: 'gray' },
  failed: { glyph: '✕', label: 'in trouble', color: 'red' },
}

export const phaseOf = (row: AgentRow, now: number): Phase => {
  if (row.status === 'error' || row.status === 'denied') return 'failed'
  if (row.status !== 'running') return 'ended'
  if (row.waitingSince !== undefined && now - row.waitingSince >= NEEDS_YOU_GRACE_MS) return 'waiting'
  // A teammate waiting for a message: idle by the engine's own word.
  if (row.engineStatus === 'idle') return 'quiet'
  const isToolRunning = (row.inFlight ?? 0) > 0
  if (!isToolRunning && now - (row.lastActivityAt ?? row.startedAt) >= SILENCE_MS) return 'quiet'
  return 'working'
}

export type Totals = { tokens: number; tools: number; agents: number }

// Each agent's own figures plus those of every agent under it.
export const subtreeTotals = (rows: AgentRow[]): Map<string, Totals> => {
  const totals = new Map<string, Totals>()
  const kidsOf = (id: string) => rows.filter(r => r.parentId === id && r.id !== id)
  const sum = (row: AgentRow, seen: Set<string>): Totals => {
    const known = totals.get(row.id)
    if (known) return known
    seen.add(row.id)
    const own: Totals = { tokens: row.tokens ?? 0, tools: row.toolCount, agents: 0 }
    const total = kidsOf(row.id)
      .filter(k => !seen.has(k.id))
      .reduce((acc, k) => {
        const t = sum(k, seen)
        return { tokens: acc.tokens + t.tokens, tools: acc.tools + t.tools, agents: acc.agents + t.agents + 1 }
      }, own)
    totals.set(row.id, total)
    return total
  }
  for (const row of rows) sum(row, new Set())
  return totals
}

// 950, 12.3k, 1.2M.
export const compactCount = (n: number): string => {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// The model's family in a word: claude-sonnet-5-5 → sonnet.
export const shortModel = (model: string | undefined): string | undefined =>
  model ? /(opus|sonnet|haiku|fable)/i.exec(model)?.[1]?.toLowerCase() ?? model : undefined

// The model as a short tag after a row's figures: ' · haiku', or nothing.
export const modelTag = (model: unknown): string => {
  const short = typeof model === 'string' ? shortModel(model) : undefined
  return short ? ` · ${short}` : ''
}

// Runs of the same entry merged into one with a count (Read ×7), keeping the
// latest detail and time.
export const collapseRepeats = <T extends { what: string; detail?: string; at: number }>(
  items: T[],
): (T & { count: number })[] =>
  items.reduce<(T & { count: number })[]>((acc, item) => {
    const last = acc[acc.length - 1]
    if (last && last.what === item.what) {
      return [...acc.slice(0, -1), { ...item, count: last.count + 1 }]
    }
    return [...acc, { ...item, count: 1 }]
  }, [])

// Whether a child session is at work: the app says so only while its own
// turn runs, but agents it sent off in the background keep working after
// that, and its snapshot shows them.
export const isSessionBusy = (session: SessionRow, snap: SessionSnapshot | undefined): boolean =>
  session.isRunning || (!session.isArchived && !!snap && (snap.isMainBusy || snap.agents.some(a => a.status === 'running')))

// The agents still at work, and the agents above them for context: what a
// Live view shows. Finished agents with nothing working under them are left
// for the Done view.
export const liveWithContext = (rows: AgentRow[]): AgentRow[] => {
  const ids = new Set<string>()
  for (const r of rows.filter(x => x.status === 'running')) {
    let cur: AgentRow | undefined = r
    while (cur && !ids.has(cur.id)) {
      ids.add(cur.id)
      const parentId: string = cur.parentId
      cur = rows.find(x => x.id === parentId)
    }
  }
  return rows.filter(r => ids.has(r.id))
}

// The sessions this one started, and the ones they started in turn. The
// app's linked list is the whole family (the starter and the siblings too);
// without its own id a session takes everyone with a starter.
export const ownSessions = (family: SessionRow[], selfId: string | undefined): SessionRow[] => {
  if (!selfId) return family.filter(s => s.startedBy !== undefined)
  const mine = new Set<string>([selfId])
  let isGrowing = true
  while (isGrowing) {
    isGrowing = false
    for (const s of family) {
      if (s.startedBy && mine.has(s.startedBy) && !mine.has(s.id)) {
        mine.add(s.id)
        isGrowing = true
      }
    }
  }
  return family.filter(s => s.id !== selfId && mine.has(s.id))
}

// A report's first sentence (or line), for a row that has room for one.
export const firstSentence = (text: string): string => {
  const line = text.trim().split(/\n/)[0] ?? ''
  const end = /[.!?](\s|$)/.exec(line)
  return (end ? line.slice(0, end.index + 1) : line).replace(/^[#>*\-\s]+/, '').trim()
}

// The files an agent shares with another agent at work: name → the others.
export const sharedFiles = (row: AgentRow, rows: AgentRow[]): Map<string, AgentRow[]> => {
  const others = rows.filter(r => r.id !== row.id && r.parentId !== '' && r.status === 'running')
  return new Map(
    (row.files ?? [])
      .map(f => [f, others.filter(o => o.files?.includes(f))] as const)
      .filter(([, who]) => who.length > 0),
  )
}

export const baseName = (path: string): string => path.replace(/\\/g, '/').split('/').pop() ?? path

// Whether an agent's latest tool calls are one call made over and over.
export const isLooping = (calls: { name: string; detail?: string }[]): boolean => {
  const tail = calls.slice(-LOOP_REPEATS)
  if (tail.length < LOOP_REPEATS) return false
  const first = tail[0]
  return tail.every(c => c.name === first?.name && c.detail === first?.detail)
}
