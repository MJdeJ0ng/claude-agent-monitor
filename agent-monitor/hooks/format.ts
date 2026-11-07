import type { ActivityEvent, AgentRow, Handover } from '../types'
import { MAIN, MAX_EVENTS, MAX_HANDOVERS, SPARK_BUCKETS, SPARK_BUCKET_MS } from './state'

// Plain helpers over text and rows: how times, names and activity read in the
// pane, and the small list edits every hook makes. No engine calls.

// Claude-style spinner glyphs, one frame per tick.
export const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const SPARK = ['⠀', '⣀', '⣤', '⣶', '⣿']
const PALETTE = ['cyan', 'magenta', 'yellow', 'blue', 'green', 'redBright']

const AVATARS: [RegExp, string][] = [
  [/explore|search|scout/i, '🔍'],
  [/plan|architect/i, '🧭'],
  [/secur/i, '🛡️'],
  [/review/i, '🧐'],
  [/tdd|test|e2e/i, '🧪'],
  [/doc|writer/i, '📝'],
  [/build|fix|resolver/i, '🔧'],
  [/refactor|clean/i, '🧹'],
  [/fork/i, '🧬'],
  [/guide|help/i, '📚'],
]


// The argument that best says what a tool call was about.
const DETAIL_KEYS = ['command', 'file_path', 'pattern', 'query', 'url', 'skill', 'description', 'to']

export const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export const duration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const ago = (ms: number): string => {
  const min = Math.floor(Math.max(0, ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`
}

const hash = (text: string): number => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const avatarOf = (type: string): string => AVATARS.find(([re]) => re.test(type))?.[1] ?? '🤖'
export const colorOf = (type: string): string => PALETTE[hash(type) % PALETTE.length] ?? 'cyan'

// The current step in a few words: the tool, and what it is about.
export const nowText = (tool: string, detail: string | undefined): string => (detail ? `${tool} · ${detail}` : tool)

export const detailOf = (input: Record<string, unknown>): string | undefined => {
  const key = DETAIL_KEYS.find(k => typeof input[k] === 'string' && input[k] !== '')
  return key ? clip(String(input[key]), 80) : undefined
}

// Tool calls per bucket over the last half minute, as a braille sparkline.
export const sparkline = (times: number[], now: number): string => {
  const counts = Array.from({ length: SPARK_BUCKETS }, () => 0)
  for (const t of times) {
    const bucket = SPARK_BUCKETS - 1 - Math.floor((now - t) / SPARK_BUCKET_MS)
    if (bucket >= 0 && bucket < SPARK_BUCKETS) counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  return counts.map(n => SPARK[Math.min(SPARK.length - 1, n)]).join('')
}

export const mainRow = (): AgentRow => ({
  id: MAIN,
  parentId: '',
  seq: 0,
  label: 'War Room',
  type: 'main session',
  task: 'War Room',
  status: 'running',
  startedAt: Date.now(),
  skills: [],
  toolCount: 0,
  toolTimes: [],
})

export const patch = (list: AgentRow[], id: string, fn: (r: AgentRow) => AgentRow): AgentRow[] =>
  list.map(r => (r.id === id ? fn(r) : r))

export const addHandover = (list: Handover[], h: Handover): Handover[] =>
  [...list, h].slice(-MAX_HANDOVERS)

export const addEvent = (list: ActivityEvent[], ev: ActivityEvent): ActivityEvent[] =>
  [...list, ev].slice(-MAX_EVENTS)

export const withSkill = (r: AgentRow, skill: string): AgentRow =>
  r.skills.includes(skill) ? r : { ...r, skills: [...r.skills, skill] }

export type Node = { row: AgentRow; depth: number; branch: string; stem: string }

// Depth-first walk from the main session, with tree connectors for each agent.
export const flattenTree = (rows: AgentRow[]): Node[] => {
  const nodes: Node[] = []
  const seen = new Set<string>([MAIN])
  const walk = (parentId: string, lead: string, depth: number) => {
    const kids = rows.filter(x => x.parentId === parentId && !seen.has(x.id))
    kids.forEach((row, i) => {
      seen.add(row.id)
      const isLast = i === kids.length - 1
      nodes.push({ row, depth, branch: `${lead}${isLast ? '└─ ' : '├─ '}`, stem: `${lead}${isLast ? '   ' : '│  '}` })
      walk(row.id, `${lead}${isLast ? '   ' : '│  '}`, depth + 1)
    })
  }
  walk(MAIN, '', 0)
  // Agents whose parent is unknown hang directly under the main session.
  for (const row of rows.filter(r => !seen.has(r.id))) {
    nodes.push({ row, depth: 0, branch: '└─ ', stem: '   ' })
  }
  return nodes
}
