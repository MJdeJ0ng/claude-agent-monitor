import type { AgentRow, SessionRow } from '../../types'
import { avatarOf, flattenTree, mainRow, nowText } from '../format'
import { flowchart } from '../flowchart'
import type { FlowLaneRow, FlowNode, FlowState } from '../flowchart'
import { isSessionBusy, liveWithContext, phaseOf } from '../signals'
import { MAIN, SESSION_FOCUS } from '../state'
import { verbOf } from '../wording'
import type { Ctx } from './context'

// ── UI view: the Live tree as a flowchart ───────────────────────────────
// The pane's width comes in characters; this many pixels make one.
const CHAR_PX = 7.5

// The agents at work (with the agents above them) and the open child
// sessions as lanes; a row of buttons under the drawing opens any of them,
// since a press inside the drawing reaches no one.
//
// The drawing holds only what changes seldom (who, their orders, their
// state): each new source reloads it and restarts its motion, so the step
// each agent is on goes in plain text under it, which redraws without a blink.
const TICKER_ROWS = 8
const MAIN_COLOR = '#7F77DD'
const WORKING_COLOR = '#1D9E75'
const WAITING_COLOR = '#BA7517'

const stateOf = (row: AgentRow, now: number): FlowState => {
  if (row.status === 'error' || row.status === 'denied') return 'failed'
  if (row.status !== 'running') return 'done'
  const phase = phaseOf(row, now)
  return phase === 'waiting' ? 'waiting' : phase === 'quiet' ? 'quiet' : 'working'
}

export const flowView = (c: Ctx, liveRows: AgentRow[], liveSessions: SessionRow[]) => {
  const { Box, Text, Button, Svg } = c.ui
  const { now, w, inside, mainNow, isMainBusy, select } = c
  if (!Svg) return null

  const lineOf = (row: AgentRow, state: FlowState): string => {
    if (state === 'waiting') return `◐ Needs you: ${row.waitingTool ?? 'permission'}?`
    if (state === 'quiet') return `○ ${w.silence}`
    if (row.status !== 'running') return `${w.ended[row.status].icon} ${w.ended[row.status].label}`
    return row.task
  }
  const tipOf = (row: AgentRow): string => `${row.name ?? row.type}\n${row.task}`

  const main: FlowNode = {
    id: MAIN,
    title: `◆ ${w.hq}`,
    line: isMainBusy ? w.flowBusy : w.teaTime,
    state: 'main',
    tip: w.hq,
  }
  const agentNodes: FlowNode[] = liveRows.map(row => {
    const state = stateOf(row, now)
    return {
      id: row.id,
      parentId: row.parentId || MAIN,
      title: `${avatarOf(row.type)} ${row.name ?? row.type}`,
      line: lineOf(row, state),
      state,
      tip: tipOf(row),
    }
  })
  const sessionNodes: FlowNode[] = liveSessions.map(s => {
    const snap = inside[s.id]
    const isBusy = isSessionBusy(s, snap)
    const at = liveWithContext(isBusy && snap ? snap.agents : [])
    const lane: FlowLaneRow[] = flattenTree([mainRow(), ...at]).map(({ row, depth }) => {
      const state = isBusy ? stateOf(row, now) : 'done'
      return { depth, title: `${avatarOf(row.type)} ${row.name ?? row.type}`, line: lineOf(row, state), state, tip: tipOf(row) }
    })
    const own =
      isBusy && snap?.isMainBusy
        ? [{ depth: 0, title: '◆ itself', line: w.flowBusy, state: 'working' as const, tip: s.title }]
        : []
    return {
      id: `${SESSION_FOCUS}${s.id}`,
      parentId: MAIN,
      title: `🪟 ${s.title}`,
      line: isBusy ? w.sessionWorking : w.sessionIdle,
      state: 'session',
      tip: `${s.title}\n${isBusy ? w.sessionWorking : w.sessionIdle}`,
      lane: [...own, ...lane],
    }
  })
  const nodes = [main, ...agentNodes, ...sessionNodes]
  // What each one at work is doing this moment, as text: changes every step.
  type Tick = { who: string; verb: string; step: string; color: string; isWaiting: boolean }
  const tickOf = (row: AgentRow, where = ''): Tick => {
    const isWaiting = phaseOf(row, now) === 'waiting'
    return {
      who: `${where}${avatarOf(row.type)} ${row.name ?? row.type}`,
      verb: isWaiting ? `needs you: ${row.waitingTool ?? 'permission'}?` : verbOf(w, row.tool, row.id),
      step: row.tool ? nowText(row.tool, row.toolDetail) : '',
      color: isWaiting ? WAITING_COLOR : WORKING_COLOR,
      isWaiting,
    }
  }
  const ownTick = (who: string, tool: string | undefined, detail: string | undefined, seed: string): Tick => ({
    who,
    verb: verbOf(w, tool, seed),
    step: tool ? nowText(tool, detail) : '',
    color: MAIN_COLOR,
    isWaiting: false,
  })
  const ticker: Tick[] = [
    ...(isMainBusy && mainNow ? [ownTick(`◆ ${w.hq}`, mainNow.tool, mainNow.toolDetail, MAIN)] : []),
    ...liveRows.filter(r => r.status === 'running').map(r => tickOf(r)),
    ...liveSessions.flatMap(s => {
      const snap = inside[s.id]
      if (!snap || !isSessionBusy(s, snap)) return []
      const own = snap.isMainBusy ? [ownTick(`🪟 ${s.title}`, snap.mainTool, snap.mainToolDetail, s.id)] : []
      return [...own, ...snap.agents.filter(a => a.status === 'running').map(a => tickOf(a, '🪟 › '))]
    }),
  ]
  // Drawn one to one at the pane's width (its columns in pixels), so the text
  // keeps its size; without a width it takes its own.
  const chart = flowchart(nodes, c.columns ? Math.floor(c.columns * CHAR_PX) : undefined)
  const opener = (key: string, label: string, target: string) => (
    <Button key={key} plain onPress={select(target)}>
      <Text dimColor underline>
        {label}
      </Text>
    </Button>
  )

  return (
    <Box flexDirection="column" marginTop={1}>
      <Svg
        key="flow"
        source={chart.svg}
        width={chart.width}
        height={chart.height}
        isInteractive
        alt={`Flowchart: ${w.hq}, ${agentNodes.length} agents at work, ${sessionNodes.length} sessions in the field.`}
      />
      {ticker.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {ticker.slice(0, TICKER_ROWS).map(t => (
            <Text wrap="truncate-end">
              <Text color={t.color}>{t.isWaiting ? '◐' : c.spin}</Text> <Text bold>{t.who}</Text>
              <Text dimColor>
                {' '}
                {t.verb}
                {t.step ? ` · now: ${t.step}` : ''}
              </Text>
            </Text>
          ))}
          {ticker.length > TICKER_ROWS && <Text dimColor>⋮ {ticker.length - TICKER_ROWS} more at work</Text>}
        </Box>
      )}
      {agentNodes.length + sessionNodes.length === 0 && (
        <Text dimColor>{isMainBusy ? w.busyItself : w.allQuiet}</Text>
      )}
      {agentNodes.length + sessionNodes.length > 0 && (
        <Box gap={2} flexWrap="wrap" marginTop={1}>
          <Text dimColor>Open:</Text>
          {liveRows.map(row => opener(`agent-${row.id}`, `${avatarOf(row.type)} ${row.name ?? row.type}`, row.id))}
          {liveSessions.map(s => opener(`session-${s.id}`, `🪟 ${s.title}`, `${SESSION_FOCUS}${s.id}`))}
        </Box>
      )}
      <Text dimColor wrap="wrap">
        {w.flowHint}
      </Text>
    </Box>
  )
}
