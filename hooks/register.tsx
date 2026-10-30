import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ActivityEvent, AgentRow, AgentStatus, Handover, SessionRow, SessionSnapshot, ViewFilter } from '../types'
import { readSnapshots, resolveSelf, writeSnapshot } from './share'

const PANE = 'agent-monitor'
const MAIN = 'main'
const MAX_AGENTS = 100
const MAX_HANDOVERS = 60
const MAX_EVENTS = 400
const MAX_TOOL_TIMES = 60
const LINES_PER_AGENT = 6
const SKILL_ROWS = 6
const TICK_MS = 500
const SESSION_POLL_MS = 5_000
const LIST_EVERY_POLLS = 4
const SHARE_MS = 3_000
const SHARED_AGENTS = 30
const SHARED_SKILLS = 20
const REMOTE_ROWS = 6
const LIST_SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions'
const GET_SESSION_TOOL = 'mcp__ccd_session_mgmt__get_session'
const SESSION_START_TOOLS = ['mcp__ccd_session__start_session', 'mcp__ccd_session__hand_off_to_session']
const PARTY_MS = 15_000
const SKILL_DEDUPE_MS = 3_000
const SPARK_BUCKETS = 12
const SPARK_BUCKET_MS = 2_500

// Change a shape tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload.
const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: 'agents-4',
})
const handovers = atom({ plugin: 'agent-monitor', key: 'handovers' } as const, [], {
  shape: 'handovers-1',
})
const events = atom({ plugin: 'agent-monitor', key: 'events' } as const, [], {
  shape: 'events-1',
})
const selected = atom({ plugin: 'agent-monitor', key: 'selected' } as const, '', {
  shape: 'selected-1',
})
const filter = atom({ plugin: 'agent-monitor', key: 'filter' } as const, 'live' as ViewFilter, {
  shape: 'filter-1',
})
const sessions = atom({ plugin: 'agent-monitor', key: 'sessions' } as const, [], {
  shape: 'sessions-1',
})
const mainBusy = atom({ plugin: 'agent-monitor', key: 'mainBusy' } as const, false, {
  shape: 'mainBusy-1',
})
const remote = atom({ plugin: 'agent-monitor', key: 'remote' } as const, {} as Record<string, SessionSnapshot>, {
  shape: 'remote-1',
})
const tick = atom({ plugin: 'agent-monitor', key: 'tick' } as const, 0, {
  shape: 'tick-1',
})

// Claude-style spinner glyphs, one frame per tick.
const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
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

// What an agent is "doing", by the tool it last reached for: a few lines per
// tool, from Europe and the Pacific. Each agent keeps one per tool (picked by
// its id), so a line does not flicker between redraws.
const VERBS: [RegExp, string[]][] = [
  [/^(Grep|Glob)$/, ['Cracking Enigma', 'Decoding JN-25 at Station Hypo', 'Scouting from a PBY Catalina']],
  [/^Read$/, ['Reading the dispatches', 'Listening to the Navajo code talkers']],
  [/^(Edit|Write|NotebookEdit)$/, ['Typing away at Bletchley Park', 'Building airstrips with the Seabees']],
  [/^(Bash|PowerShell)$/, ['Storming the beaches', 'Invading Poland', 'Island-hopping across the Pacific']],
  [/^Web/, ['Tuning in to Radio London', 'Tuning in to Tokyo Rose']],
  [/^Agent$/, ['Calling in the Yanks', 'Assembling the fleet']],
  [/^Skill$/, ['Consulting the War Cabinet', 'Annexing Czechoslovakia']],
  [/^SendMessage$/, ['Wiring a telegram', 'Signalling by Aldis lamp']],
  [/plan|Todo/i, ['Drawing up Operation Overlord', 'Planning the Doolittle Raid']],
  [/^mcp__/, ['Ringing Washington', 'Radioing Pearl Harbor']],
]
const IDLE_VERBS = ['Keeping calm and carrying on', 'Holding Guadalcanal']
const WARMUP_VERB = 'Mustering at Dover'

// The argument that best says what a tool call was about.
const DETAIL_KEYS = ['command', 'file_path', 'pattern', 'query', 'url', 'skill', 'description', 'to']

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const duration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const ago = (ms: number): string => {
  const min = Math.floor(Math.max(0, ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`
}

const hash = (text: string): number => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

const avatarOf = (type: string): string => AVATARS.find(([re]) => re.test(type))?.[1] ?? '🤖'
const colorOf = (type: string): string => PALETTE[hash(type) % PALETTE.length] ?? 'cyan'
const pick = (options: string[], seed: string): string => options[hash(seed) % options.length] ?? options[0] ?? ''
const verbOf = (tool: string | undefined, seed: string): string => {
  if (!tool) return WARMUP_VERB
  const options = VERBS.find(([re]) => re.test(tool))?.[1] ?? IDLE_VERBS
  return pick(options, `${seed}:${tool}`)
}

const detailOf = (input: Record<string, unknown>): string | undefined => {
  const key = DETAIL_KEYS.find(k => typeof input[k] === 'string' && input[k] !== '')
  return key ? clip(String(input[key]), 80) : undefined
}

// Tool calls per bucket over the last half minute, as a braille sparkline.
const sparkline = (times: number[], now: number): string => {
  const counts = Array.from({ length: SPARK_BUCKETS }, () => 0)
  for (const t of times) {
    const bucket = SPARK_BUCKETS - 1 - Math.floor((now - t) / SPARK_BUCKET_MS)
    if (bucket >= 0 && bucket < SPARK_BUCKETS) counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  return counts.map(n => SPARK[Math.min(SPARK.length - 1, n)]).join('')
}

const mainRow = (): AgentRow => ({
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

const patch = (list: AgentRow[], id: string, fn: (r: AgentRow) => AgentRow): AgentRow[] =>
  list.map(r => (r.id === id ? fn(r) : r))

const addHandover = (list: Handover[], h: Handover): Handover[] =>
  [...list, h].slice(-MAX_HANDOVERS)

const addEvent = (list: ActivityEvent[], ev: ActivityEvent): ActivityEvent[] =>
  [...list, ev].slice(-MAX_EVENTS)

const withSkill = (r: AgentRow, skill: string): AgentRow =>
  r.skills.includes(skill) ? r : { ...r, skills: [...r.skills, skill] }

const ENDED: Record<Exclude<AgentStatus, 'running'>, { icon: string; label: string; color: string }> = {
  done: { icon: '✓', label: 'mission accomplished', color: 'green' },
  aborted: { icon: '✋', label: 'evacuated at Dunkirk', color: 'yellow' },
  error: { icon: '💥', label: 'sunk in the Channel', color: 'red' },
  denied: { icon: '⛔', label: 'vetoed by Churchill', color: 'red' },
}

type Node = { row: AgentRow; depth: number; branch: string; stem: string }

// Depth-first walk from the main session, with tree connectors for each agent.
const flattenTree = (rows: AgentRow[]): Node[] => {
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

// Whether polling the session list is worth it: true once it found a linked
// session or this session started one. Starts over with each reload.
let isSessionFamilyKnown = false
let isSyncing = false
let hasPolled = false
let pollCount = 0
// This session's app id, once known, and the last snapshot it shared.
let selfId: string | undefined
let lastShared = ''

const toSessionRows = (text: string): Omit<SessionRow, 'firstSeenAt' | 'endedAt'>[] => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item: Record<string, unknown>) => {
      if (typeof item.sessionId !== 'string' || item.isArchived === true) return []
      return [
        {
          id: item.sessionId,
          title: typeof item.title === 'string' ? item.title : item.sessionId,
          name: typeof item.name === 'string' ? item.name : undefined,
          startedBy: typeof item.startedBy === 'string' ? item.startedBy : undefined,
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
const syncSessions = async ($: EngineInterface): Promise<void> => {
  // After the first look, keep polling only for a session that has a family.
  if (isSyncing || (hasPolled && !isSessionFamilyKnown)) return
  isSyncing = true
  hasPolled = true
  try {
    const isListDue = pollCount % LIST_EVERY_POLLS === 0
    pollCount += 1
    if (isListDue) {
      const input = { linked: true }
      const { decision } = await $.tool.check({ tool: LIST_SESSIONS_TOOL, input })
      if (decision !== 'allow') return
      const res = await $.tool.call({ tool: LIST_SESSIONS_TOOL, ...input })
      const text = 'text' in res && typeof res.text === 'string' ? res.text : ''
      const fresh = toSessionRows(text)
      if (fresh.length > 0) isSessionFamilyKnown = true
      const now = Date.now()
      await update($, sessions, list =>
        fresh.map(s => {
          const before = list.find(x => x.id === s.id)
          const firstSeenAt = before?.firstSeenAt ?? now
          const endedAt = s.isRunning ? undefined : before?.endedAt ?? (before?.isRunning ? now : s.lastActivityAt || now)
          return { ...s, firstSeenAt, endedAt }
        }),
      )
    }
    const children = (await read($, sessions)).filter(s => s.startedBy !== undefined).map(s => s.id)
    if (children.length > 0) {
      const found = await readSnapshots($, children)
      await update($, remote, () => found)
    }
  } catch {
    // The tool is missing or refused here: no sessions to show.
  } finally {
    isSyncing = false
  }
}

// Shares what this session does with the session that started it, when it
// changed; nothing is written before this session knows its own app id.
const shareSnapshot = async ($: EngineInterface): Promise<void> => {
  if (!selfId) return
  const rows = await read($, agents)
  const log = await read($, events)
  const main = rows.find(r => r.id === MAIN)
  const body = {
    isMainBusy: await read($, mainBusy),
    mainTool: main?.tool,
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
  if (text === lastShared) return
  lastShared = text
  await writeSnapshot($, { id: selfId, updatedAt: Date.now(), ...body })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-monitor',
      description: 'Open the live agent tree',
    })
    await update($, agents, list => (list.some(r => r.id === MAIN) ? list : [mainRow(), ...list]))
    // Animate spinners while agents work, and a little after they finish.
    $.clock.every(TICK_MS, async () => {
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
      if (isLively) await update($, tick, n => n + 1)
    })
    // Sessions started from this one live in their own windows; the app's
    // linked-session list is the only place that knows them, so poll it.
    void syncSessions($)
    $.clock.every(SESSION_POLL_MS, () => void syncSessions($))
    // Let the session that started this one see inside it. A session another
    // one started is shown in its starter's pane, so it opens no pane of its
    // own unless asked (/agent-monitor).
    void resolveSelf($).then(self => {
      selfId = self?.id
      if (!self?.parentId) void $.ui.open({ id: PANE, title: 'Agents' })
    })
    $.clock.every(SHARE_MS, () => void shareSnapshot($))
    return next(e)
  })

  on('command.run', { command: 'agent-monitor' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agent tree opened.' }
  })

  // An agent is started: record it and the task handed to it.
  on('agent.spawn', async ($, e, next) => {
    const parentId = e.parentAgentId ?? MAIN
    const started = Date.now()
    const res = await next(e)
    const id = res.agentId ?? `${e.tool_use_id}:${started}`
    await update($, agents, list => {
      const seq = list.reduce((m, r) => Math.max(m, r.seq), 0) + 1
      const row: AgentRow = {
        id,
        parentId,
        seq,
        label: `#${seq}`,
        type: e.subagentType,
        name: e.name,
        task: e.description || clip(e.prompt, 80),
        status: res.deny ? 'denied' : 'running',
        startedAt: started,
        skills: [],
        toolCount: 0,
        toolTimes: [],
      }
      return [...list.filter(r => r.id !== id), row].slice(-MAX_AGENTS)
    })
    if (!res.deny) {
      await update($, handovers, list =>
        addHandover(list, { at: started, from: parentId, to: id, kind: 'task', text: e.prompt }),
      )
    }
    return res
  })

  // Tool and skill activity, attributed to the loop that ran it.
  on('tool.call', async ($, e, next) => {
    // Our own polling of the session list is not the agent's work.
    if (e.tool === LIST_SESSIONS_TOOL || e.tool === GET_SESSION_TOOL) return next(e)
    if (SESSION_START_TOOLS.includes(e.tool)) {
      isSessionFamilyKnown = true
      const res = await next(e)
      void syncSessions($)
      return res
    }
    const who = e.agentId ?? MAIN
    const now = Date.now()
    const input = e as unknown as Record<string, unknown>
    const skill = e.tool === 'Skill' ? String(input.skill ?? '') : ''
    await update($, agents, list =>
      patch(list, who, r => {
        const touched = {
          ...r,
          tool: e.tool,
          toolCount: r.toolCount + 1,
          toolTimes: [...(r.toolTimes ?? []), now].slice(-MAX_TOOL_TIMES),
        }
        return skill ? withSkill(touched, skill) : touched
      }),
    )
    await update($, events, list => {
      const withTool = addEvent(list, { at: now, agentId: who, kind: 'tool', name: e.tool, detail: detailOf(input) })
      return skill ? addEvent(withTool, { at: now, agentId: who, kind: 'skill', name: skill }) : withTool
    })
    return next(e)
  })

  // A skill typed as /name by the person: the Skill tool above covers the
  // model's own calls, so only record one it did not just log.
  on('skill.prompt', async ($, e, next) => {
    const now = Date.now()
    const recent = await read($, events)
    const isLogged = recent.some(ev => ev.kind === 'skill' && ev.name === e.skill && now - ev.at < SKILL_DEDUPE_MS)
    if (!isLogged) {
      await update($, events, list => addEvent(list, { at: now, agentId: MAIN, kind: 'skill', name: e.skill }))
      await update($, agents, list => patch(list, MAIN, r => withSkill(r, e.skill)))
    }
    return next(e)
  })

  // A message between agents.
  on('session.send', async ($, e, next) => {
    const from = e.agentId ?? MAIN
    await update($, handovers, list =>
      addHandover(list, { at: Date.now(), from, to: e.to, kind: 'message', text: clip(e.text, 300) }),
    )
    return next(e)
  })

  // The main session's own turn: busy from its start to its end.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await update($, mainBusy, () => true)
    return next(e)
  })

  // An agent finishes and hands its report back.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      await update($, mainBusy, () => false)
      await update($, agents, list => patch(list, MAIN, r => ({ ...r, tool: undefined })))
    }
    if (e.agentId) {
      const id = e.agentId
      const status: AgentStatus =
        e.reason === 'aborted' ? 'aborted' : e.reason === 'answer' ? 'done' : 'error'
      const now = Date.now()
      const rows = await read($, agents)
      const row = rows.find(r => r.id === id)
      const parentId = row?.parentId || MAIN
      await update($, agents, list =>
        patch(list, id, r => ({ ...r, status, endedAt: now, tool: undefined })),
      )
      if (e.answer) {
        await update($, handovers, list =>
          addHandover(list, { at: now, from: id, to: parentId, kind: 'report', text: clip(e.answer, 600) }),
        )
      }
      if (row) {
        const who = `${avatarOf(row.type)} ${row.name ?? row.type}`
        void $.ui.toast(status === 'done' ? `🎉 ${who} is home: V-Day!` : `${ENDED[status].icon} ${who}: ${ENDED[status].label}`)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = await read($, agents)
    const moves = await read($, handovers)
    const log = await read($, events)
    const focusId = await read($, selected)
    const beat = await read($, tick)
    const view = await read($, filter)
    const family = await read($, sessions)
    const inside = await read($, remote)
    const now = Date.now()
    const lines = e.viewport?.rows ?? 30
    const spin = SPINNER[beat % SPINNER.length]
    const opStart = rows.find(r => r.id === MAIN)?.startedAt ?? now
    const stamp = (at: number): string => `T+${duration(at - opStart)}`

    // A fixed lead (tree lines, a label) and a body that reflows beside it:
    // the body wraps or truncates within the pane's width, never under the lead.
    const indented = (lead: string, body: JSX.Children, mode: 'wrap' | 'truncate-end' = 'wrap') => (
      <Box>
        <Box flexShrink={0}>
          <Text dimColor>{lead}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap={mode}>{body}</Text>
        </Box>
      </Box>
    )
    // A title row: the left part gives way (truncates) before the right part does.
    const titleRow = (left: JSX.Children, right: JSX.Children) => (
      <Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">{left}</Text>
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          <Text dimColor>{right}</Text>
        </Box>
      </Box>
    )

    const rowOf = (id: string) => rows.find(x => x.id === id || x.name === id)
    const nameOf = (id: string): string => {
      if (id === MAIN) return 'War Room'
      const r = rowOf(id)
      return r ? r.name ?? r.type : clip(id, 16)
    }
    const badgeOf = (id: string): string => {
      if (id === MAIN) return '◆ War Room'
      const r = rowOf(id)
      return r ? `${avatarOf(r.type)} ${r.name ?? r.type}` : clip(id, 16)
    }
    const select = (id: string) => () => void update($, selected, () => id)
    const levelBadge = (isSub: boolean) => (
      <Text backgroundColor={isSub ? 'magenta' : 'cyan'} color="black" bold>
        {isSub ? ' SUB-AGENT ' : ' AGENT '}
      </Text>
    )

    const statusText = (row: AgentRow) => {
      if (row.status === 'running') {
        return (
          <Text color={colorOf(row.type)}>
            {spin} {verbOf(row.tool, row.id)}…
          </Text>
        )
      }
      const ended = ENDED[row.status]
      const isParty = row.status === 'done' && row.endedAt !== undefined && now - row.endedAt < PARTY_MS
      return (
        <Text color={ended.color}>
          {ended.icon} {ended.label}
          {isParty ? ' 🎉' : ''}
        </Text>
      )
    }

    const units = rows.filter(r => r.id !== MAIN)
    const running = units.filter(r => r.status === 'running').length
    const topLevel = units.filter(r => r.parentId === MAIN || !rows.some(p => p.id === r.parentId)).length
    const subLevel = units.length - topLevel
    // Sessions this one started, and theirs; one with no starter is our own parent.
    const familyIds = new Set(family.map(s => s.id))
    const childSessions = family.filter(s => s.startedBy !== undefined)
    const runningSessions = childSessions.filter(s => s.isRunning).length
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

    const isMainBusy = await read($, mainBusy)

    // What a child session is doing, from the snapshot it shares: its own
    // activity, then its agents and sub-agents as a small tree.
    const insideOf = (s: SessionRow, lead: string) => {
      const snap = inside[s.id]
      if (!snap) return null
      const mainSkills = [...new Set(snap.skills.filter(k => k.agentId === MAIN).map(k => k.name))]
      const inner = flattenTree([mainRow(), ...snap.agents]).slice(-REMOTE_ROWS)
      return (
        <Box flexDirection="column">
          {s.isRunning &&
            snap.isMainBusy &&
            indented(
              lead,
              <Text color="yellow">
                {spin} {verbOf(snap.mainTool, s.id)}…{snap.mainTool ? ` · now: ${snap.mainTool}` : ''}
              </Text>,
              'truncate-end',
            )}
          {mainSkills.length > 0 && indented(lead, <Text color="magenta">🎒 {mainSkills.join(' · ')}</Text>, 'truncate-end')}
          {inner.map(({ row, depth, branch, stem }) => {
            const isLive = s.isRunning && row.status === 'running'
            return (
              <Box flexDirection="column">
                <Box>
                  <Box flexShrink={0}>
                    <Text dimColor>
                      {lead}
                      {branch}
                    </Text>
                    {levelBadge(depth > 0)}
                    <Text> </Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text wrap="truncate-end">
                      {avatarOf(row.type)}{' '}
                      <Text color={colorOf(row.type)} bold dimColor={!isLive}>
                        {row.name ?? row.type}
                      </Text>{' '}
                      {isLive ? (
                        <Text color={colorOf(row.type)}>
                          {spin} {verbOf(row.tool, row.id)}…
                        </Text>
                      ) : row.status === 'running' ? (
                        <Text dimColor>? missing in action</Text>
                      ) : (
                        <Text color={ENDED[row.status].color}>
                          {ENDED[row.status].icon} {ENDED[row.status].label}
                        </Text>
                      )}
                    </Text>
                  </Box>
                  <Box flexShrink={0} marginLeft={1}>
                    <Text dimColor>{duration((row.endedAt ?? (isLive ? now : snap.updatedAt)) - row.startedAt)}</Text>
                  </Box>
                </Box>
                {indented(`${lead}${stem}   `, row.task, 'truncate-end')}
                {row.skills.length > 0 &&
                  indented(`${lead}${stem}   `, <Text color="magenta">🎒 {row.skills.join(' · ')}</Text>, 'truncate-end')}
              </Box>
            )
          })}
        </Box>
      )
    }
    const mainNow = rows.find(r => r.id === MAIN)
    const header = (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold color="cyan">
            ◆ War Room{' '}
          </Text>
          {isMainBusy ? (
            <Text color="cyan">
              {spin} {mainNow?.tool ? verbOf(mainNow.tool, MAIN) : pick(IDLE_VERBS, MAIN)}…
            </Text>
          ) : running > 0 ? (
            <Text color="cyan">{spin} Awaiting news from the front…</Text>
          ) : (
            <Text dimColor>☕ Tea time in the War Room</Text>
          )}
        </Text>
        {isMainBusy && mainNow && (
          <Text wrap="truncate-end">
            <Text color="cyan">{sparkline(mainNow.toolTimes ?? [], now)}</Text>
            <Text dimColor>
              {'  '}
              {mainNow.toolCount} tools{mainNow.tool ? ` · now: ${mainNow.tool}` : ''}
            </Text>
          </Text>
        )}
        <Text dimColor wrap="wrap">
          {topLevel} agents · {subLevel} sub-agents · {childSessions.length} sessions · {running + runningSessions} busy ·{' '}
          {duration(now - opStart)}
        </Text>
      </Box>
    )

    // ── Detail view of one agent ────────────────────────────────────────────
    const focused = focusId ? rows.find(r => r.id === focusId) : undefined
    if (focused) {
      const accent = colorOf(focused.type)
      const brief = moves.find(h => h.kind === 'task' && h.to === focused.id)
      const kids = rows.filter(r => r.parentId === focused.id)
      const timeline = [
        ...log
          .filter(ev => ev.agentId === focused.id)
          .map(ev => ({
            at: ev.at,
            icon: ev.kind === 'skill' ? '🎒' : '🔧',
            what: ev.kind === 'skill' ? `skill ${ev.name}` : ev.name,
            detail: ev.detail,
            color: ev.kind === 'skill' ? 'magenta' : accent,
          })),
        ...moves
          .filter(h => h.kind !== 'task' && (h.from === focused.id || h.to === focused.id))
          .map(h => ({
            at: h.at,
            icon: h.kind === 'report' ? '📦' : '💬',
            what:
              h.kind === 'report'
                ? `dispatch → ${nameOf(h.to)}`
                : h.from === focused.id
                  ? `telegram → ${nameOf(h.to)}`
                  : `telegram ← ${nameOf(h.from)}`,
            detail: h.text,
            color: 'white',
          })),
        ...kids.map(k => ({
          at: k.startedAt,
          icon: '🌱',
          what: `deploys ${avatarOf(k.type)} ${k.name ?? k.type}`,
          detail: k.task,
          color: colorOf(k.type),
        })),
      ].sort((a, b) => a.at - b.at)
      const timelineRoom = Math.max(4, lines - 18)

      return (
        <Box flexDirection="column" width="100%">
          {header}
          <Box gap={2} marginTop={1} flexWrap="wrap">
            <Button key="back" hotkey="b" onPress={select('')}>
              ← Back to HQ
            </Button>
            {focused.id !== MAIN && (
              <Button key="transcript" hotkey="t" onPress={() => void $.ui.view({ agentId: focused.id })}>
                📺 Open transcript
              </Button>
            )}
          </Box>
          <Box marginTop={1}>
            {titleRow(
              <Text>
                {focused.id === MAIN ? '◆' : avatarOf(focused.type)}{' '}
                <Text bold color={accent}>
                  {focused.id === MAIN ? 'War Room' : focused.name ?? focused.type}
                </Text>
                <Text dimColor> {focused.type} </Text>
                {statusText(focused)}
              </Text>,
              duration((focused.endedAt ?? now) - focused.startedAt),
            )}
          </Box>
          {indented(
            'Sent by      ',
            <Text>
              {focused.id === MAIN ? 'you' : badgeOf(focused.parentId)}
              <Text dimColor> at {stamp(focused.startedAt)}</Text>
            </Text>,
          )}
          {indented('Orders       ', brief?.text ?? focused.task)}
          {indented(
            'Activity     ',
            <Text>
              <Text color={accent}>{sparkline(focused.toolTimes ?? [], now)}</Text>
              <Text dimColor> {focused.toolCount} tools</Text>
            </Text>,
          )}
          {focused.skills.length > 0 &&
            indented('Skills       ', <Text color="magenta">🎒 {focused.skills.join(' · ')}</Text>)}
          <Box marginTop={1}>
            <Text bold>⏱ War diary</Text>
          </Box>
          {timeline.length === 0 && <Text dimColor>No dispatches yet.</Text>}
          {timeline.length > timelineRoom && <Text dimColor>⋮ {timeline.length - timelineRoom} earlier entries</Text>}
          {timeline.slice(-timelineRoom).map(item =>
            indented(
              `${stamp(item.at)} `,
              <Text>
                {item.icon} <Text color={item.color}>{item.what}</Text>
                {item.detail && <Text dimColor> {item.detail}</Text>}
              </Text>,
              'truncate-end',
            ),
          )}
        </Box>
      )
    }

    // ── Tree view ───────────────────────────────────────────────────────────
    // Live shows working agents, with the agents above them for context.
    const liveIds = new Set<string>()
    for (const r of units.filter(u => u.status === 'running')) {
      let cur: AgentRow | undefined = r
      while (cur && cur.id !== MAIN && !liveIds.has(cur.id)) {
        liveIds.add(cur.id)
        const parentId: string = cur.parentId
        cur = rows.find(x => x.id === parentId)
      }
    }
    const nodes = flattenTree(rows.filter(r => r.id === MAIN || liveIds.has(r.id)))
    const shownSessions = childSessions
      .filter(s => (view === 'live' ? s.isRunning : !s.isRunning))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    const finished = units
      .filter(r => r.status !== 'running')
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    const isSubAgent = (r: AgentRow) => r.parentId !== MAIN && rows.some(p => p.id === r.parentId)
    // Live lists the skills of agents still at work; Done keeps the whole history.
    const skillLog = log.filter(ev => ev.kind === 'skill' && (view === 'done' || liveIds.has(ev.agentId)))
    const showSkills = view === 'done' || skillLog.length > 0
    const skillRoom = !showSkills ? 0 : skillLog.length === 0 ? 1 : Math.min(SKILL_ROWS, skillLog.length)
    const room = Math.max(1, Math.floor((lines - 10 - skillRoom) / LINES_PER_AGENT))
    const visible = nodes.slice(-room)
    const lastReport = (id: string) => [...moves].reverse().find(h => h.kind === 'report' && h.from === id)
    const lastMessage = (id: string) => [...moves].reverse().find(h => h.kind === 'message' && h.from === id)
    const historyRoom = Math.max(1, Math.floor((lines - 11 - skillRoom) / 4))
    const setView = (next: ViewFilter) => () => void update($, filter, () => next)
    const tabs = (
      <Box gap={2} marginTop={1} flexWrap="wrap">
        <Button key="tab-live" variant={view === 'live' ? 'primary' : 'secondary'} onPress={setView('live')}>
          ● Live ({running + runningSessions})
        </Button>
        <Button key="tab-done" variant={view === 'done' ? 'primary' : 'secondary'} onPress={setView('done')}>
          ✓ Done ({finished.length + childSessions.length - runningSessions})
        </Button>
      </Box>
    )

    return (
      <Box flexDirection="column" width="100%">
        {header}
        {tabs}

        {view === 'done' && (
          <Box flexDirection="column">
            {finished.length === 0 && <Text dimColor>Nobody has come home yet.</Text>}
            {finished.length > historyRoom && (
              <Text dimColor>⋮ {finished.length - historyRoom} older agents not shown</Text>
            )}
            {finished.slice(0, historyRoom).map(row => {
              const ended = ENDED[row.status as Exclude<AgentStatus, 'running'>]
              const report = lastReport(row.id)
              const isSub = isSubAgent(row)
              return (
                <Box flexDirection="column" marginTop={1}>
                  <Box>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text color={ended.color}>{ended.icon} </Text>
                      {levelBadge(isSub)}
                      <Text> </Text>
                      <Button key={`done-${row.id}`} plain onPress={select(row.id)}>
                        {avatarOf(row.type)}{' '}
                        <Text color={colorOf(row.type)} bold>
                          {row.name ?? row.type}
                        </Text>
                      </Button>
                    </Box>
                    <Box flexShrink={0} marginLeft={1}>
                      <Text dimColor>
                        {stamp(row.endedAt ?? row.startedAt)} · {duration((row.endedAt ?? now) - row.startedAt)}
                      </Text>
                    </Box>
                  </Box>
                  {isSub && indented('   ', <Text color="magenta">↳ sent by {badgeOf(row.parentId)}</Text>)}
                  {indented('   ', row.task)}
                  {report && indented('   ', <Text dimColor>📦↑ "{report.text}"</Text>, 'truncate-end')}
                </Box>
              )
            })}
          </Box>
        )}

        {view === 'live' && nodes.length === 0 && runningSessions === 0 && (
          <Box flexDirection="column">
            <Text dimColor>│</Text>
            {indented(
              '└─ ',
              <Text dimColor>
                {isMainBusy
                  ? '🌱 The War Room is busy itself; no agents or sessions in the field.'
                  : '🌱 All quiet on every front. Finished agents are under ✓ Done.'}
              </Text>,
            )}
          </Box>
        )}
        {view === 'live' && (
          <Box flexDirection="column">
            {nodes.length > room && <Text dimColor>│  ⋮ {nodes.length - room} earlier agents folded</Text>}

            {visible.map(({ row, depth, branch, stem }) => {
              const isRunning = row.status === 'running'
              const isParty = row.status === 'done' && row.endedAt !== undefined && now - row.endedAt < PARTY_MS
              const report = lastReport(row.id)
              const message = lastMessage(row.id)
              const accent = colorOf(row.type)
              const isSub = depth > 0
              const lead = `${stem}   `
              return (
                <Box flexDirection="column">
                  <Text dimColor>{stem.replace(/ +$/, '') || '│'}</Text>
                  <Box>
                    <Box flexShrink={0}>
                      <Text dimColor>{branch}</Text>
                      {levelBadge(isSub)}
                      <Text> </Text>
                    </Box>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Button key={`agent-${row.id}`} plain onPress={select(row.id)}>
                        {avatarOf(row.type)}{' '}
                        <Text color={accent} bold dimColor={!isRunning && !isParty}>
                          {row.name ?? row.type}
                        </Text>
                      </Button>
                      <Text wrap="truncate-end"> {statusText(row)}</Text>
                    </Box>
                    <Box flexShrink={0} marginLeft={1}>
                      <Text dimColor>{duration((row.endedAt ?? now) - row.startedAt)}</Text>
                    </Box>
                  </Box>
                  {isSub && indented(lead, <Text color="magenta">↳ sent by {badgeOf(row.parentId)}</Text>)}
                  {indented(lead, row.task)}
                  {indented(
                    lead,
                    <Text>
                      <Text color={accent} dimColor={!isRunning}>
                        {sparkline(row.toolTimes ?? [], now)}
                      </Text>
                      <Text dimColor>
                        {'  '}
                        {row.toolCount} tools{isRunning && row.tool ? ` · now: ${row.tool}` : ''}
                      </Text>
                    </Text>,
                  )}
                  {row.skills.length > 0 && indented(lead, <Text color="magenta">🎒 {row.skills.join(' · ')}</Text>)}
                  {message &&
                    indented(
                      lead,
                      <Text>
                        💬 → {nameOf(message.to)}: <Text dimColor>"{message.text}"</Text>
                      </Text>,
                      'truncate-end',
                    )}
                  {report && indented(lead, <Text dimColor>📦↑ "{report.text}"</Text>, 'truncate-end')}
                </Box>
              )
            })}
          </Box>
        )}

        {shownSessions.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>🪟 Sessions {view === 'live' ? 'in the field' : 'back home'}</Text>
            {shownSessions.map(s => {
              const depth = sessionDepth(s)
              const lead = '   '.repeat(depth)
              const pr = s.prNumber !== undefined ? `PR #${s.prNumber}${s.prState ? ` · ${s.prState.toLowerCase()}` : ''}` : ''
              return (
                <Box flexDirection="column">
                  <Box>
                    <Box flexShrink={0}>
                      <Text dimColor>{lead}{depth > 0 ? '└─ ' : ''}</Text>
                      <Text backgroundColor="yellow" color="black" bold>
                        {' SESSION '}
                      </Text>
                      <Text> </Text>
                    </Box>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text wrap="truncate-end">
                        🪟 <Text bold>{s.title}</Text>{' '}
                        {s.isRunning ? (
                          <Text color="yellow">{spin} On manoeuvres…</Text>
                        ) : (
                          <Text color="green">✓ demobbed</Text>
                        )}
                      </Text>
                    </Box>
                    <Box flexShrink={0} marginLeft={1}>
                      <Text dimColor>{ago(now - s.lastActivityAt)}</Text>
                    </Box>
                  </Box>
                  {indented(
                    `${lead}   `,
                    <Text dimColor>
                      ↳ sent by {s.startedBy && familyIds.has(s.startedBy) ? family.find(x => x.id === s.startedBy)?.title : 'the War Room'}
                      {pr ? ` · ${pr}` : ''}
                    </Text>,
                    'truncate-end',
                  )}
                  {insideOf(s, `${lead}   `)}
                </Box>
              )
            })}
          </Box>
        )}

        {showSkills && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{view === 'live' ? '🎒 Kit in use' : '🎒 Kit issued · who, what, when'}</Text>
            {skillLog.length === 0 && <Text dimColor>No kit issued yet.</Text>}
            {skillLog.slice(-skillRoom).map(ev =>
              indented(
                `${stamp(ev.at)} `,
                <Text>
                  <Text color="magenta">{ev.name}</Text>
                  <Text dimColor> to </Text>
                  {badgeOf(ev.agentId)}
                </Text>,
              ),
            )}
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor wrap="wrap">
            AGENT = sent by the War Room · SUB-AGENT = sent by another agent · 🎒 = skills · click a name for details
          </Text>
        </Box>
      </Box>
    )
  })
}
