import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentRow, AgentStatus } from '../types'
import { addEvent, addHandover, avatarOf, clip, detailOf, patch, withSkill } from './format'
import { keepInHistory } from './history'
import { adoptedRow, reconcile } from './roster'
import type { RosterEntry } from './roster'
import {
  FILE_TOOLS,
  MAIN,
  MAX_AGENTS,
  MAX_FILES,
  MAX_TOOL_TIMES,
  REPORT_CHARS,
  SHAPES,
  SKILL_DEDUPE_MS,
  WORKFLOW_TOOL,
  live,
} from './state'
import { wordsFor } from './wording'

// What the hooks write down as the work goes on: agents started and ended,
// their tool calls, steps, skills and messages.

const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: SHAPES.agents,
})
const handovers = atom({ plugin: 'agent-monitor', key: 'handovers' } as const, [], {
  shape: SHAPES.handovers,
})
const events = atom({ plugin: 'agent-monitor', key: 'events' } as const, [], {
  shape: SHAPES.events,
})
const mainBusy = atom({ plugin: 'agent-monitor', key: 'mainBusy' } as const, false, {
  shape: SHAPES.mainBusy,
})
const plain = atom({ plugin: 'agent-monitor', key: 'plain' } as const, false, {
  shape: SHAPES.plain,
})

// Bookkeeping never stands in the way of the work it watches: a failure in
// it is dropped, and the tool call or turn goes on.
export const quietly = async (work: () => Promise<unknown>): Promise<void> => {
  try {
    await work()
  } catch {
    // The pane misses one update; the session is unaffected.
  }
}

// A row for an agent whose steps arrive with no spawn the pane saw (a
// workflow's agents, or one started before a reload).
export async function adopt($: EngineInterface, id: string): Promise<void> {
  if (id === MAIN) return
  await update($, agents, list => {
    if (list.some(r => r.id === id)) return list
    const seq = list.reduce((m, r) => Math.max(m, r.seq), 0) + 1
    return [...list, adoptedRow(id, seq, MAIN, Date.now())].slice(-MAX_AGENTS)
  })
}

// Brings the rows in line with the engine's own list of agents: ends the pane
// missed, idle teammates, agents it never saw start.
export async function syncRoster($: EngineInterface): Promise<void> {
  const roster: RosterEntry[] = (await $.agent.list()).map(a => ({
    id: a.id,
    description: a.description,
    type: a.type,
    status: a.status,
    parentId: a.parentId,
    name: a.name,
  }))
  await update($, agents, list => reconcile(list, roster, Date.now()).slice(-MAX_AGENTS))
}

export type Spawn = {
  id: string
  parentId: string
  started: number
  type: string
  name?: string
  description: string
  prompt: string
  isDenied: boolean
}

// An agent is started: its row, and the task handed to it.
export async function recordSpawn($: EngineInterface, s: Spawn): Promise<void> {
  const { id, parentId, started } = s
  await update($, agents, list => {
    const seq = list.reduce((m, r) => Math.max(m, r.seq), 0) + 1
    const before = list.find(r => r.id === id)
    const row: AgentRow = {
      ...before,
      id,
      parentId,
      seq: before?.seq ?? seq,
      label: before?.label ?? `#${seq}`,
      type: s.type,
      name: s.name,
      task: s.description || clip(s.prompt, 80),
      status: s.isDenied ? 'denied' : 'running',
      startedAt: before?.startedAt ?? started,
      skills: before?.skills ?? [],
      toolCount: before?.toolCount ?? 0,
      toolTimes: before?.toolTimes ?? [],
      isAdopted: false,
    }
    return [...list.filter(r => r.id !== id), row].slice(-MAX_AGENTS)
  })
  if (!s.isDenied) {
    await update($, handovers, list =>
      addHandover(list, { at: started, from: parentId, to: id, kind: 'task', text: s.prompt }),
    )
  }
}

// A tool call starts: the loop that ran it, its files, and any skill.
export async function recordToolStart(
  $: EngineInterface,
  who: string,
  tool: string,
  input: Record<string, unknown>,
  now: number,
): Promise<void> {
  const skill = tool === 'Skill' ? String(input.skill ?? '') : ''
  const pathArg = input.file_path ?? input.notebook_path
  const file = FILE_TOOLS.includes(tool) && typeof pathArg === 'string' ? pathArg : ''
  await adopt($, who)
  await update($, agents, list =>
    patch(list, who, r => {
      const touched = {
        ...r,
        files: file ? [...(r.files ?? []).filter(f => f !== file), file].slice(-MAX_FILES) : r.files,
        tool,
        toolDetail: detailOf(input),
        toolCount: r.toolCount + 1,
        toolTimes: [...(r.toolTimes ?? []), now].slice(-MAX_TOOL_TIMES),
        inFlight: (r.inFlight ?? 0) + 1,
        lastActivityAt: now,
      }
      return skill ? withSkill(touched, skill) : touched
    }),
  )
  await update($, events, list => {
    const withTool = addEvent(list, { at: now, agentId: who, kind: 'tool', name: tool, detail: detailOf(input) })
    return skill ? addEvent(withTool, { at: now, agentId: who, kind: 'skill', name: skill }) : withTool
  })
}

// A tool call returns: the permission question, if any, is settled.
export async function recordToolEnd($: EngineInterface, who: string, tool: string, now: number): Promise<void> {
  await update($, agents, list =>
    patch(list, who, r => ({
      ...r,
      inFlight: Math.max(0, (r.inFlight ?? 1) - 1),
      waitingSince: undefined,
      waitingTool: undefined,
      lastActivityAt: Date.now(),
    })),
  )
  // A workflow's agents end with it; the pane saw no spawn and may see no end.
  if (tool === WORKFLOW_TOOL) {
    await update($, agents, list =>
      list.map(r =>
        r.isAdopted && r.status === 'running' && r.startedAt >= now
          ? { ...r, status: 'done' as const, endedAt: Date.now(), tool: undefined, toolDetail: undefined, inFlight: 0 }
          : r,
      ),
    )
  }
}

// The loop may now be waiting on the person to allow a tool.
export async function recordWaiting($: EngineInterface, who: string, tool: string): Promise<void> {
  await update($, agents, list =>
    patch(list, who, r => ({ ...r, waitingSince: r.waitingSince ?? Date.now(), waitingTool: tool })),
  )
}

// One model step: what it cost and which model answered.
export async function recordStep($: EngineInterface, who: string, used: number, model: AgentRow['model']): Promise<void> {
  await adopt($, who)
  await update($, agents, list =>
    patch(list, who, r => ({ ...r, tokens: (r.tokens ?? 0) + used, model, lastActivityAt: Date.now() })),
  )
}

// A skill typed as /name, unless the Skill tool just logged it.
export async function recordSkillPrompt($: EngineInterface, skill: string): Promise<void> {
  const now = Date.now()
  const recent = await read($, events)
  const isLogged = recent.some(ev => ev.kind === 'skill' && ev.name === skill && now - ev.at < SKILL_DEDUPE_MS)
  if (!isLogged) {
    await update($, events, list => addEvent(list, { at: now, agentId: MAIN, kind: 'skill', name: skill }))
    await update($, agents, list => patch(list, MAIN, r => withSkill(r, skill)))
  }
}

// The end of a turn: the main session's, or an agent's with its report.
export async function recordTurnEnd(
  $: EngineInterface,
  agentId: string | undefined,
  reason: string,
  answer: string | undefined,
): Promise<void> {
  if (!agentId) {
    await update($, mainBusy, () => false)
    await update($, agents, list =>
      patch(list, MAIN, r => ({ ...r, tool: undefined, toolDetail: undefined, waitingSince: undefined, waitingTool: undefined, inFlight: 0 })),
    )
    return
  }
  const id = agentId
  // A reason a later engine adds counts as an ending, not as a failure.
  const status: AgentStatus =
    reason === 'aborted' ? 'aborted' : reason === 'error' || reason === 'refusal' ? 'error' : 'done'
  const now = Date.now()
  const row = (await read($, agents)).find(r => r.id === id)
  const parentId = row?.parentId || MAIN
  await update($, agents, list =>
    patch(list, id, r => ({
      ...r,
      status,
      endedAt: now,
      tool: undefined,
      toolDetail: undefined,
      waitingSince: undefined,
      waitingTool: undefined,
      inFlight: 0,
    })),
  )
  if (answer) {
    await update($, handovers, list =>
      addHandover(list, { at: now, from: id, to: parentId, kind: 'report', text: clip(answer, REPORT_CHARS) }),
    )
  }
  if (!row) return
  const who = `${avatarOf(row.type)} ${row.name ?? row.type}`
  const w = wordsFor(await read($, plain))
  void $.ui.toast(status === 'done' ? w.home(who) : `${w.ended[status].icon} ${who}: ${w.ended[status].label}`)
  const ended = (await read($, agents)).find(r => r.id === id) ?? row
  void keepInHistory($, { ...ended, toolTimes: [], report: answer ? clip(answer, REPORT_CHARS) : undefined, folder: live.selfCwd })
}
