import type { AgentRow } from '../types'

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

// Whether an agent's latest tool calls are one call made over and over.
export const isLooping = (calls: { name: string; detail?: string }[]): boolean => {
  const tail = calls.slice(-LOOP_REPEATS)
  if (tail.length < LOOP_REPEATS) return false
  const first = tail[0]
  return tail.every(c => c.name === first?.name && c.detail === first?.detail)
}
