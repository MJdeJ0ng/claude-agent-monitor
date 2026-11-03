import type { AgentRow, AgentStatus } from '../types'

// Keeping the pane's rows true to the engine when its events fall short: an
// end the pane missed (a reload, a crash), agents that started without an
// `agent.spawn` (a forked skill, a workflow's agents), and rows another
// version of the mod wrote. Plain functions over rows, no engine calls.

const MAIN = 'main'

// The engine's word for where an agent's loop stands (`$.agent.list()`).
export type RosterEntry = {
  id: string
  description: string
  type: string
  status: string
  parentId?: string
  name?: string
}

const ENDED_BY_ENGINE: Record<string, Exclude<AgentStatus, 'running'>> = {
  completed: 'done',
  failed: 'error',
  killed: 'aborted',
}

// Rows brought in line with the engine's roster: ends it knows of applied,
// its waiting and idle states noted, and agents the pane never saw added.
export const reconcile = (rows: AgentRow[], roster: RosterEntry[], now: number): AgentRow[] => {
  const known = new Set(rows.map(r => r.id))
  const updated = rows.map(row => {
    const entry = roster.find(a => a.id === row.id)
    if (!entry || row.status !== 'running') return row
    const ended = ENDED_BY_ENGINE[entry.status]
    if (ended) return { ...row, status: ended, endedAt: now, tool: undefined, toolDetail: undefined, inFlight: 0, engineStatus: undefined }
    return row.engineStatus === entry.status ? row : { ...row, engineStatus: entry.status }
  })
  const seq = rows.reduce((m, r) => Math.max(m, r.seq), 0)
  const added = roster
    .filter(a => !known.has(a.id))
    .map((a, i): AgentRow => {
      const status = ENDED_BY_ENGINE[a.status] ?? 'running'
      return {
        id: a.id,
        parentId: a.parentId ?? MAIN,
        seq: seq + i + 1,
        label: `#${seq + i + 1}`,
        type: a.type || 'agent',
        name: a.name,
        task: a.description || '(no task given)',
        status,
        startedAt: now,
        endedAt: status === 'running' ? undefined : now,
        skills: [],
        toolCount: 0,
        toolTimes: [],
        engineStatus: status === 'running' ? a.status : undefined,
      }
    })
  return [...updated, ...added]
}

// A row for an agent whose steps arrive before (or without) its spawn: a
// workflow's agents carry ids no roster lists.
export const adoptedRow = (id: string, seq: number, parentId: string, now: number): AgentRow => ({
  id,
  parentId,
  seq,
  label: `#${seq}`,
  type: 'workflow agent',
  task: '(started without a brief the pane saw)',
  status: 'running',
  startedAt: now,
  skills: [],
  toolCount: 0,
  toolTimes: [],
  isAdopted: true,
})

const STATUSES: AgentStatus[] = ['running', 'done', 'aborted', 'error', 'denied']

// A row as another version of the mod may have shared it, made whole: every
// field the pane draws has a value of the right kind.
export const normalizeRow = (value: unknown): AgentRow | undefined => {
  const v = (value ?? {}) as Record<string, unknown>
  if (typeof v.id !== 'string') return undefined
  const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)
  const str = (x: unknown) => (typeof x === 'string' ? x : undefined)
  const status = STATUSES.includes(v.status as AgentStatus) ? (v.status as AgentStatus) : 'done'
  return {
    ...(v as Partial<AgentRow>),
    id: v.id,
    parentId: str(v.parentId) ?? MAIN,
    seq: num(v.seq, 0),
    label: str(v.label) ?? '',
    type: str(v.type) ?? 'agent',
    name: str(v.name),
    task: str(v.task) ?? '',
    status,
    startedAt: num(v.startedAt, 0),
    endedAt: typeof v.endedAt === 'number' ? v.endedAt : undefined,
    skills: Array.isArray(v.skills) ? v.skills.filter((s): s is string => typeof s === 'string') : [],
    toolCount: num(v.toolCount, 0),
    toolTimes: [],
    files: Array.isArray(v.files) ? v.files.filter((f): f is string => typeof f === 'string') : undefined,
  }
}
