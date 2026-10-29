import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ActivityEvent, AgentRow, AgentStatus, Handover, ViewFilter } from '../types'

const PANE = 'agent-monitor'
const MAIN = 'main'
const MAX_AGENTS = 100
const MAX_HANDOVERS = 60
const MAX_EVENTS = 400
const MAX_TOOL_TIMES = 60
const LINES_PER_AGENT = 6
const SKILL_ROWS = 6
const TICK_MS = 500
const PARTY_MS = 15_000
const SKILL_DEDUPE_MS = 3_000
const SPARK_BUCKETS = 12
const SPARK_BUCKET_MS = 2_500

// Change a shape tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload.
const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: 'agents-3',
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

// What an agent is "doing", by the tool it last reached for.
const VERBS: [RegExp, string][] = [
  [/^(Grep|Glob)$/, 'Snuffelt rond'],
  [/^Read$/, 'Leest mee'],
  [/^(Edit|Write|NotebookEdit)$/, 'Zit te tikken'],
  [/^(Bash|PowerShell)$/, "Ramt commando's"],
  [/^Web/, 'Surft het web'],
  [/^Agent$/, 'Roept versterking in'],
  [/^Skill$/, 'Pakt gereedschap'],
  [/^SendMessage$/, 'Kletst even'],
  [/plan|Todo/i, 'Maakt lijstjes'],
  [/^mcp__/, 'Belt een externe dienst'],
]

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

const hash = (text: string): number => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

const avatarOf = (type: string): string => AVATARS.find(([re]) => re.test(type))?.[1] ?? '🤖'
const colorOf = (type: string): string => PALETTE[hash(type) % PALETTE.length] ?? 'cyan'
const verbOf = (tool?: string): string =>
  tool ? VERBS.find(([re]) => re.test(tool))?.[1] ?? 'Denkt na' : 'Warmt op'

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
  callsign: 'COMMAND',
  type: 'main session',
  task: 'Hoofdsessie',
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
  done: { icon: '✓', label: 'klaar', color: 'green' },
  aborted: { icon: '✋', label: 'afgebroken', color: 'yellow' },
  error: { icon: '💥', label: 'mislukt', color: 'red' },
  denied: { icon: '⛔', label: 'geweigerd', color: 'red' },
}

type Node = { row: AgentRow; depth: number; branch: string; stem: string }

// Depth-first walk from COMMAND, with tree connectors for each agent.
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
  // Agents whose parent is unknown hang directly under COMMAND.
  for (const row of rows.filter(r => !seen.has(r.id))) {
    nodes.push({ row, depth: 0, branch: '└─ ', stem: '   ' })
  }
  return nodes
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
      const isLively = rows.some(
        r => r.id !== MAIN && (r.status === 'running' || (r.endedAt !== undefined && now - r.endedAt < PARTY_MS)),
      )
      if (isLively) await update($, tick, n => n + 1)
    })
    void $.ui.open({ id: PANE, title: 'Agents' })
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
        callsign: `#${seq}`,
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

  // An agent finishes and hands its report back.
  on('turn.complete', async ($, e, next) => {
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
        void $.ui.toast(status === 'done' ? `🎉 ${who} is klaar` : `${ENDED[status].icon} ${who}: ${ENDED[status].label}`)
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
    const now = Date.now()
    const cols = e.viewport?.columns ?? 60
    const lines = e.viewport?.rows ?? 30
    const width = Math.max(34, Math.min(100, cols - 2))
    const spin = SPINNER[beat % SPINNER.length]
    const opStart = rows.find(r => r.id === MAIN)?.startedAt ?? now
    const stamp = (at: number): string => `T+${duration(at - opStart)}`

    const rowOf = (id: string) => rows.find(x => x.id === id || x.name === id)
    const nameOf = (id: string): string => {
      if (id === MAIN) return 'COMMAND'
      const r = rowOf(id)
      return r ? r.name ?? r.type : clip(id, 16)
    }
    const badgeOf = (id: string): string => {
      if (id === MAIN) return '◆ COMMAND'
      const r = rowOf(id)
      return r ? `${avatarOf(r.type)} ${r.name ?? r.type}` : clip(id, 16)
    }
    const select = (id: string) => () => void update($, selected, () => id)

    const statusText = (row: AgentRow) => {
      if (row.status === 'running') {
        return (
          <Text color={colorOf(row.type)}>
            {spin} {verbOf(row.tool)}…
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

    const header = (
      <Box justifyContent="space-between">
        <Text>
          <Text bold color="cyan">
            ◆ COMMAND{' '}
          </Text>
          {running > 0 ? <Text color="cyan">{spin} Dirigeert…</Text> : <Text dimColor>☕ Wacht op orders</Text>}
        </Text>
        <Text dimColor>
          {topLevel} agents · {subLevel} sub-agents · {running} bezig · {duration(now - opStart)}
        </Text>
      </Box>
    )

    // ── Detail view of one agent ────────────────────────────────────────────
    const focused = focusId ? rows.find(r => r.id === focusId) : undefined
    if (focused) {
      const accent = colorOf(focused.type)
      const tasking = moves.find(h => h.kind === 'task' && h.to === focused.id)
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
                ? `rapport → ${nameOf(h.to)}`
                : h.from === focused.id
                  ? `bericht → ${nameOf(h.to)}`
                  : `bericht ← ${nameOf(h.from)}`,
            detail: clip(h.text, 80),
            color: 'white',
          })),
        ...kids.map(k => ({
          at: k.startedAt,
          icon: '🌱',
          what: `zet ${avatarOf(k.type)} ${k.name ?? k.type} in`,
          detail: k.task,
          color: colorOf(k.type),
        })),
      ].sort((a, b) => a.at - b.at)
      const timelineRoom = Math.max(4, lines - 16)

      return (
        <Box flexDirection="column" width={width}>
          {header}
          <Text dimColor>│</Text>
          <Box gap={2}>
            <Button key="back" hotkey="b" onPress={select('')}>
              ← Terug
            </Button>
            {focused.id !== MAIN && (
              <Button key="transcript" hotkey="t" onPress={() => void $.ui.view({ agentId: focused.id })}>
                📺 Open transcript
              </Button>
            )}
          </Box>
          <Text> </Text>
          <Box justifyContent="space-between">
            <Text>
              <Text>{focused.id === MAIN ? '◆' : avatarOf(focused.type)} </Text>
              <Text bold color={accent}>
                {focused.id === MAIN ? 'COMMAND' : focused.name ?? focused.type}
              </Text>
              <Text dimColor> {focused.type} </Text>
              {statusText(focused)}
            </Text>
            <Text dimColor>{duration((focused.endedAt ?? now) - focused.startedAt)}</Text>
          </Box>
          <Text>
            <Text dimColor>Ingezet door </Text>
            {focused.id === MAIN ? 'jou' : badgeOf(focused.parentId)}
            <Text dimColor> om {stamp(focused.startedAt)}</Text>
          </Text>
          <Text>
            <Text dimColor>Opdracht    </Text>
            {clip(tasking?.text ?? focused.task, width * 3)}
          </Text>
          <Text>
            <Text dimColor>Activiteit  </Text>
            <Text color={accent}>{sparkline(focused.toolTimes ?? [], now)}</Text>
            <Text dimColor> {focused.toolCount} tools</Text>
          </Text>
          {focused.skills.length > 0 && (
            <Text>
              <Text dimColor>Skills      </Text>
              <Text color="magenta">🎒 {focused.skills.join(' · ')}</Text>
            </Text>
          )}
          <Text> </Text>
          <Text bold>⏱ Tijdlijn</Text>
          {timeline.length === 0 && <Text dimColor>Nog niets gebeurd.</Text>}
          {timeline.length > timelineRoom && <Text dimColor>⋮ {timeline.length - timelineRoom} eerdere stappen</Text>}
          {timeline.slice(-timelineRoom).map(item => (
            <Text>
              <Text dimColor>{stamp(item.at)} </Text>
              <Text>{item.icon} </Text>
              <Text color={item.color}>{item.what}</Text>
              {item.detail && <Text dimColor> {clip(item.detail, Math.max(12, width - 34))}</Text>}
            </Text>
          ))}
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
    const finished = units
      .filter(r => r.status !== 'running')
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    const isSubAgent = (r: AgentRow) => r.parentId !== MAIN && rows.some(p => p.id === r.parentId)
    // Live lists the skills of agents still at work; Done keeps the whole history.
    const skillLog = log.filter(ev => ev.kind === 'skill' && (view === 'done' || liveIds.has(ev.agentId)))
    const showSkills = view === 'done' || skillLog.length > 0
    const skillRoom = !showSkills ? 0 : skillLog.length === 0 ? 1 : Math.min(SKILL_ROWS, skillLog.length)
    const room = Math.max(1, Math.floor((lines - 9 - skillRoom) / LINES_PER_AGENT))
    const visible = nodes.slice(-room)
    const lastReport = (id: string) => [...moves].reverse().find(h => h.kind === 'report' && h.from === id)
    const lastMessage = (id: string) => [...moves].reverse().find(h => h.kind === 'message' && h.from === id)
    const historyRoom = Math.max(1, Math.floor((lines - 10 - skillRoom) / 4))
    const setView = (next: ViewFilter) => () => void update($, filter, () => next)
    const tabs = (
      <Box gap={2} marginTop={1}>
        <Button key="tab-live" variant={view === 'live' ? 'primary' : 'secondary'} onPress={setView('live')}>
          ● Live ({running})
        </Button>
        <Button key="tab-done" variant={view === 'done' ? 'primary' : 'secondary'} onPress={setView('done')}>
          ✓ Done ({finished.length})
        </Button>
      </Box>
    )

    return (
      <Box flexDirection="column" width={width}>
        {header}
        {tabs}

        {view === 'done' && (
          <Box flexDirection="column">
            {finished.length === 0 && <Text dimColor>Nog geen afgeronde agents.</Text>}
            {finished.length > historyRoom && (
              <Text dimColor>⋮ {finished.length - historyRoom} oudere agents niet getoond</Text>
            )}
            {finished.slice(0, historyRoom).map(row => {
              const ended = ENDED[row.status as Exclude<AgentStatus, 'running'>]
              const report = lastReport(row.id)
              const isSub = isSubAgent(row)
              return (
                <Box flexDirection="column" marginTop={1}>
                  <Box justifyContent="space-between">
                    <Box>
                      <Text color={ended.color}>{ended.icon} </Text>
                      <Text backgroundColor={isSub ? 'magenta' : 'cyan'} color="black" bold>
                        {isSub ? ' SUB-AGENT ' : ' AGENT '}
                      </Text>
                      <Text> </Text>
                      <Button key={`done-${row.id}`} plain onPress={select(row.id)}>
                        {avatarOf(row.type)}{' '}
                        <Text color={colorOf(row.type)} bold>
                          {row.name ?? row.type}
                        </Text>
                      </Button>
                    </Box>
                    <Text dimColor>
                      {stamp(row.endedAt ?? row.startedAt)} · {duration((row.endedAt ?? now) - row.startedAt)}
                    </Text>
                  </Box>
                  {isSub && <Text color="magenta">   ↳ ingezet door {badgeOf(row.parentId)}</Text>}
                  <Text>   {clip(row.task, width - 4)}</Text>
                  {report && <Text dimColor>   📦↑ "{clip(report.text, width - 10)}"</Text>}
                </Box>
              )
            })}
          </Box>
        )}

        {view === 'live' && nodes.length === 0 && (
          <Box flexDirection="column">
            <Text dimColor>│</Text>
            <Text dimColor>└─ 🌱 Niemand aan het werk. Afgeronde agents staan onder ✓ Done.</Text>
          </Box>
        )}
        {view === 'live' && (
        <Box flexDirection="column">
        {nodes.length > room && <Text dimColor>│  ⋮ {nodes.length - room} eerdere agents ingeklapt</Text>}

        {visible.map(({ row, depth, branch, stem }) => {
          const isRunning = row.status === 'running'
          const isParty = row.status === 'done' && row.endedAt !== undefined && now - row.endedAt < PARTY_MS
          const report = lastReport(row.id)
          const message = lastMessage(row.id)
          const textRoom = Math.max(20, width - stem.length - 8)
          const accent = colorOf(row.type)
          const isSub = depth > 0
          return (
            <Box flexDirection="column">
              <Text dimColor>{stem.replace(/ +$/, '') || '│'}</Text>
              <Box justifyContent="space-between">
                <Box>
                  <Text dimColor>{branch}</Text>
                  <Text backgroundColor={isSub ? 'magenta' : 'cyan'} color="black" bold>
                    {isSub ? ' SUB-AGENT ' : ' AGENT '}
                  </Text>
                  <Text> </Text>
                  <Button key={`agent-${row.id}`} plain onPress={select(row.id)}>
                    {avatarOf(row.type)}{' '}
                    <Text color={accent} bold dimColor={!isRunning && !isParty}>
                      {row.name ?? row.type}
                    </Text>
                  </Button>
                  <Text> </Text>
                  {statusText(row)}
                </Box>
                <Text dimColor>{duration((row.endedAt ?? now) - row.startedAt)}</Text>
              </Box>
              {isSub && (
                <Text>
                  <Text dimColor>{stem}   </Text>
                  <Text color="magenta">↳ ingezet door {badgeOf(row.parentId)}</Text>
                </Text>
              )}
              <Text>
                <Text dimColor>{stem}   </Text>
                {clip(row.task, textRoom)}
              </Text>
              <Text>
                <Text dimColor>{stem}   </Text>
                <Text color={accent} dimColor={!isRunning}>
                  {sparkline(row.toolTimes ?? [], now)}
                </Text>
                <Text dimColor>
                  {'  '}
                  {row.toolCount} tools{isRunning && row.tool ? ` · nu: ${row.tool}` : ''}
                </Text>
              </Text>
              {row.skills.length > 0 && (
                <Text>
                  <Text dimColor>{stem}   </Text>
                  <Text color="magenta">🎒 {row.skills.join(' · ')}</Text>
                </Text>
              )}
              {message && (
                <Text>
                  <Text dimColor>{stem}   </Text>
                  <Text>💬 → {nameOf(message.to)}: </Text>
                  <Text dimColor>"{clip(message.text, textRoom - 18)}"</Text>
                </Text>
              )}
              {report && (
                <Text>
                  <Text dimColor>{stem}   </Text>
                  <Text>📦↑ </Text>
                  <Text dimColor>"{clip(report.text, textRoom - 6)}"</Text>
                </Text>
              )}
            </Box>
          )
        })}

        </Box>
        )}

        {showSkills && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{view === 'live' ? '🎒 Skills in gebruik' : '🎒 Skills · wie, wat, wanneer'}</Text>
            {skillLog.length === 0 && <Text dimColor>Nog geen skills ingezet.</Text>}
            {skillLog.slice(-skillRoom).map(ev => (
              <Text>
                <Text dimColor>{stamp(ev.at)} </Text>
                <Text color="magenta">{ev.name}</Text>
                <Text dimColor> door </Text>
                <Text>{badgeOf(ev.agentId)}</Text>
              </Text>
            ))}
          </Box>
        )}

        <Text> </Text>
        <Text dimColor>
          AGENT = ingezet door COMMAND · SUB-AGENT = ingezet door een andere agent · klik een naam voor details
        </Text>
      </Box>
    )
  })
}
