import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface } from 'claude-code'

import type { Board, SessionInfo, Stage, Ticket } from '../types'
import { toTickets } from './pipeline'
import { NEEDS_YOU_ROWS, ROWS_PER_STAGE, SHAPES } from './state'
import { refreshBoard } from './fetch'

// The pane: what waits on the person first, then each stage from nearly done
// back to the backlog.

const EMPTY: Board = { repo: '', root: '', fetchedAt: 0, issues: [], prs: [] }
const board = atom({ plugin: 'sdlc-monitor', key: 'board' } as const, EMPTY, { shape: SHAPES.board })
const sessions = atom({ plugin: 'sdlc-monitor', key: 'sessions' } as const, [] as SessionInfo[], {
  shape: SHAPES.sessions,
})
// One stage unfolded at a time, so the pane stays short beside the agent tree.
const openStage = atom({ plugin: 'sdlc-monitor', key: 'open' } as const, '', {
  shape: SHAPES.open,
})

export type UiKit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

type StageLook = { label: string; short: string; glyph: string; color: string }

export const STAGE_LOOK: Record<Stage, StageLook> = {
  'coming-up': { label: 'Coming up', short: 'coming', glyph: '·', color: 'gray' },
  'to-refine': { label: 'To refine', short: 'refine', glyph: '○', color: 'gray' },
  refined: { label: 'Refined, ready to build', short: 'refined', glyph: '◔', color: 'blue' },
  building: { label: 'Building', short: 'build', glyph: '◑', color: 'yellow' },
  pr: { label: 'In review (PR)', short: 'PR', glyph: '◕', color: 'magenta' },
  ready: { label: 'Ready to merge', short: 'ready', glyph: '●', color: 'green' },
  merged: { label: 'Merged, last 7 days', short: 'merged', glyph: '✔', color: 'green' },
}

// Top to bottom: done first, then each step back towards what is coming up.
// The flow line reads in the same order.
export const FLOW: readonly Stage[] = ['merged', 'ready', 'pr', 'building', 'refined', 'to-refine', 'coming-up']
const SECTIONS = FLOW

const CHECK_LOOK = {
  pass: { glyph: '✓', color: 'green', text: 'CI green' },
  fail: { glyph: '✗', color: 'red', text: 'CI red' },
  pending: { glyph: '…', color: 'yellow', text: 'CI running' },
  none: { glyph: '·', color: 'gray', text: 'no checks' },
} as const

const ago = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}

const quiet = ['All quiet on the western front.', 'No orders from HQ.', 'Keep calm and carry on.']

export async function renderPane($: EngineInterface, ui: UiKit, rows: number): Promise<JSX.Element> {
  const { Box, Text, Button } = ui
  const b = await read($, board)
  const list = await read($, sessions)
  const unfolded = await read($, openStage)
  const now = Date.now()
  const tickets = toTickets(b, list, now)
  const byStage = (s: Stage) => tickets.filter(t => t.stage === s)
  const waiting = tickets.filter(t => t.needsYou)

  const toggle = (stage: Stage) => () =>
    void update($, openStage, now => (now === stage ? '' : stage))
  const refresh = () => void refreshBoard($)

  const titleRow = (left: JSX.Children, right: JSX.Children) => (
    <Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">{left}</Text>
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        {right}
      </Box>
    </Box>
  )

  const sizeTag = (t: Ticket) => (t.isSpike ? ' spike' : t.size !== undefined ? ` ${t.size}pt` : '')

  // What is happening to a ticket now, in a few words.
  const detail = (t: Ticket): JSX.Element | null => {
    const parts: JSX.Element[] = []
    if (t.pr && t.pr.state === 'OPEN') {
      const c = CHECK_LOOK[t.pr.checks]
      parts.push(
        <Text color={c.color}>
          {c.glyph} PR #{t.pr.number} {c.text}
          {t.pr.isDraft ? ' · draft' : ''}
          {t.pr.mergeable === 'CONFLICTING' ? ' · conflicts' : ''}
        </Text>,
      )
    }
    if (t.pr && t.pr.state === 'MERGED') parts.push(<Text color="green">⇢ PR #{t.pr.number} merged</Text>)
    if (t.session) {
      parts.push(
        t.session.isRunning ? (
          <Text color="yellow">⚙ {t.session.isSelf ? 'this session' : 'session'} working</Text>
        ) : (
          <Text dimColor>⏸ session idle</Text>
        ),
      )
    }
    if (parts.length === 0) return null
    return (
      <Box paddingLeft={4}>
        <Text wrap="truncate-end">
          {parts.map((p, i) => (
            <Text key={`d${i}`}>
              {i > 0 ? <Text dimColor> · </Text> : null}
              {p}
            </Text>
          ))}
        </Text>
      </Box>
    )
  }

  const ticketRow = (t: Ticket, look: StageLook) => (
    <Box key={`t${t.number}`} flexDirection="column">
      {titleRow(
        <Text>
          <Text color={look.color}>{look.glyph} </Text>
          <Text bold>#{t.number}</Text> {t.title}
        </Text>,
        <Text dimColor>
          {sizeTag(t).trim()} {ago(now - t.at)}
        </Text>,
      )}
      {detail(t)}
    </Box>
  )

  const section = (stage: Stage) => {
    const look = STAGE_LOOK[stage]
    const items = byStage(stage)
    const isShut = unfolded !== stage
    return (
      <Box key={`s-${stage}`} flexDirection="column">
        <Button key={`b-${stage}`} plain onPress={toggle(stage)}>
          <Text wrap="truncate-end">
            <Text dimColor>{isShut ? '▸ ' : '▾ '}</Text>
            <Text bold={items.length > 0} color={items.length > 0 ? look.color : 'gray'}>
              {look.label}
            </Text>
            <Text dimColor> {items.length}</Text>
            {isShut && items.length > 0 ? <Text dimColor> · {items.map(t => `#${t.number}`).join(' ')}</Text> : null}
          </Text>
        </Button>
        {!isShut && items.length === 0 && (
          <Box paddingLeft={2}>
            <Text dimColor>none</Text>
          </Box>
        )}
        {!isShut && items.slice(0, ROWS_PER_STAGE).map(t => ticketRow(t, look))}
        {!isShut && items.length > ROWS_PER_STAGE && (
          <Box paddingLeft={2}>
            <Text dimColor>+{items.length - ROWS_PER_STAGE} more</Text>
          </Box>
        )}
      </Box>
    )
  }

  const flowLine = (
    <Text wrap="wrap">
      {FLOW.map((s, i) => (
        <Text key={`f-${s}`}>
          {i > 0 ? <Text dimColor> · </Text> : null}
          <Text color={STAGE_LOOK[s].color} bold={byStage(s).length > 0}>
            {byStage(s).length} {STAGE_LOOK[s].short}
          </Text>
        </Text>
      ))}
    </Text>
  )

  const header = (
    <Box flexDirection="column">
      {titleRow(
        <Text>
          <Text bold color="cyan">
            ◆ Operations Room{' '}
          </Text>
          <Text dimColor>{b.repo || 'no repository'}</Text>
          {b.isDemo ? (
            <Text backgroundColor="magenta" color="black" bold>
              {' DEMO '}
            </Text>
          ) : null}
        </Text>,
        <Button key="refresh" plain onPress={refresh}>
          <Text dimColor underline>
            {b.fetchedAt ? `${ago(now - b.fetchedAt)} ago ⟳` : 'loading ⟳'}
          </Text>
        </Button>,
      )}
      {b.repo ? flowLine : null}
    </Box>
  )

  if (b.error) {
    return (
      <Box flexDirection="column">
        {header}
        <Box marginTop={1}>
          <Text color="yellow" wrap="wrap">
            ⚠ {b.error}
          </Text>
        </Box>
      </Box>
    )
  }
  if (!b.fetchedAt) {
    return (
      <Box flexDirection="column">
        {header}
        <Text dimColor>Decoding the tracker at Bletchley Park…</Text>
      </Box>
    )
  }

  const needsYou = (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text backgroundColor={waiting.length > 0 ? 'yellow' : 'gray'} color="black" bold>
          {' NEEDS YOU '}
        </Text>
        <Text dimColor> {waiting.length}</Text>
      </Text>
      {waiting.length === 0 && <Text dimColor>{quiet[Math.floor(now / 60_000) % quiet.length]}</Text>}
      {waiting.slice(0, NEEDS_YOU_ROWS).map(t => (
        <Box key={`n${t.number}`}>
          <Box flexShrink={0}>
            <Text color="yellow">➜ </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end">
              <Text bold>#{t.number}</Text> <Text color="yellow">{t.needsYou}</Text>
              <Text dimColor> · {t.title}</Text>
            </Text>
          </Box>
        </Box>
      ))}
      {waiting.length > NEEDS_YOU_ROWS && <Text dimColor>  +{waiting.length - NEEDS_YOU_ROWS} more</Text>}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {header}
      {needsYou}
      <Box flexDirection="column" marginTop={1}>
        {SECTIONS.map(section)}
      </Box>
    </Box>
  )
}
