import type { AgentRow, SessionRow } from '../../types'
import { colorOf, duration, sparkline } from '../format'
import { PHASES, baseName, compactCount, firstSentence, isLooping, isSessionBusy, phaseOf, sharedFiles } from '../signals'
import { MAIN, PARTY_MS } from '../state'
import { pick, verbOf } from '../wording'
import type { Ctx } from './context'

// The pieces every view of the pane is built from, over one render's context.

export type Parts = ReturnType<typeof partsOf>

export const partsOf = (c: Ctx) => {
  const { Box, Text, Button } = c.ui
  const { rows, now, w, spin, inside, opened, totals, mainNow, isMainBusy } = c

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

  const levelBadge = (isSub: boolean) => (
    <Text backgroundColor={isSub ? 'magenta' : 'cyan'} color="black" bold>
      {isSub ? ' SUB-AGENT ' : ' AGENT '}
    </Text>
  )

  // Tokens on a row: its own, or Σ with every agent under it when it has some.
  const usageOf = (row: AgentRow): string => {
    const t = totals.get(row.id)
    if (!t || t.tokens === 0) return ''
    return t.agents > 0 ? ` · Σ ${compactCount(t.tokens)} tok` : ` · ${compactCount(t.tokens)} tok`
  }

  // A report as one sentence, opened in full on request.
  const reportLines = (key: string, text: string, lead: string) => {
    const short = firstSentence(text)
    const isOpen = opened.includes(key)
    const hasMore = short.length < text.trim().length
    return (
      <Box flexDirection="column">
        {indented(lead, <Text dimColor>📦↑ {isOpen ? text : short}</Text>, isOpen ? 'wrap' : 'truncate-end')}
        {hasMore && (
          <Box>
            <Text dimColor>{lead}</Text>
            <Button key={`more-${key}`} plain onPress={c.toggleOpen(key)}>
              <Text dimColor underline>
                {isOpen ? '▴ less' : '▾ full report'}
              </Text>
            </Button>
          </Box>
        )}
      </Box>
    )
  }
  // Files an agent wrote, with a warning for any another busy agent also wrote.
  const filesLine = (row: AgentRow, lead: string, peers: AgentRow[] = rows) => {
    const files = row.files ?? []
    if (files.length === 0) return null
    const shared = sharedFiles(row, peers)
    return (
      <Box flexDirection="column">
        {indented(
          lead,
          <Text dimColor>
            ✏️ {files.length} {files.length === 1 ? 'file' : 'files'}: {files.slice(-3).map(baseName).reverse().join(', ')}
            {files.length > 3 ? ' …' : ''}
          </Text>,
          'truncate-end',
        )}
        {[...shared].slice(0, 2).map(([file, who]) =>
          indented(
            lead,
            <Text color="yellow">
              ⚠️ {baseName(file)} is also being edited by {who.map(o => o.name ?? o.type).join(', ')}
            </Text>,
          ),
        )}
      </Box>
    )
  }

  const statusText = (row: AgentRow) => {
    if (row.status === 'running') {
      const phase = phaseOf(row, now)
      const loop = isLooping(c.callsOf(row.id)) ? <Text color="yellow"> 🔁 {w.loop}</Text> : null
      if (phase === 'waiting') {
        return (
          <Text color={PHASES.waiting.color} bold>
            {PHASES.waiting.glyph} Needs you{row.waitingTool ? `: may it use ${row.waitingTool}?` : ''} ·{' '}
            {duration(now - (row.waitingSince ?? now))}
          </Text>
        )
      }
      if (phase === 'quiet') {
        return (
          <Text color={PHASES.quiet.color}>
            {PHASES.quiet.glyph} {w.silence} · {duration(now - (row.lastActivityAt ?? row.startedAt))}
            {loop}
          </Text>
        )
      }
      return (
        <Text color={colorOf(row.type)}>
          {spin} {verbOf(w, row.tool, row.id)}…{loop}
        </Text>
      )
    }
    const ended = w.ended[row.status]
    const isParty = row.status === 'done' && row.endedAt !== undefined && now - row.endedAt < PARTY_MS
    return (
      <Text color={ended.color}>
        {ended.icon} {ended.label}
        {isParty ? ' 🎉' : ''}
      </Text>
    )
  }

  // A child session's state in a few words: at work, waiting, or done.
  const sessionState = (s: SessionRow) =>
    isSessionBusy(s, inside[s.id]) ? (
      <Text color="yellow">
        {spin} {w.sessionWorking}…
      </Text>
    ) : s.isArchived ? (
      <Text color="green">{w.sessionDone}</Text>
    ) : (
      <Text color={PHASES.quiet.color}>
        {PHASES.quiet.glyph} {w.sessionIdle}
      </Text>
    )

  const header = (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text bold color="cyan">
          ◆ {w.hq}{' '}
        </Text>
        {isMainBusy ? (
          <Text color="cyan">
            {spin} {mainNow?.tool ? verbOf(w, mainNow.tool, MAIN) : pick(w.idleVerbs, MAIN)}…
          </Text>
        ) : c.running > 0 ? (
          <Text color="cyan">{spin} {w.awaitingNews}…</Text>
        ) : (
          <Text dimColor>{w.teaTime}</Text>
        )}
      </Text>
      {isMainBusy && mainNow && (
        <Text wrap="truncate-end">
          <Text color="cyan">{sparkline(mainNow.toolTimes ?? [], now)}</Text>
          <Text dimColor>
            {'  '}
            {mainNow.toolCount} tools{mainNow.tool ? ` · now: ${c.stepOf(mainNow.tool, mainNow.toolDetail)}` : ''}
          </Text>
        </Text>
      )}
      <Text dimColor wrap="wrap">
        {c.topLevel} agents · {c.subLevel} sub-agents · {c.childSessions.length} sessions · {c.running + c.runningSessions} busy ·{' '}
        {duration(now - c.opStart)}
        {mainNow && usageOf(mainNow)}
      </Text>
    </Box>
  )

  return { indented, titleRow, levelBadge, usageOf, reportLines, filesLine, statusText, sessionState, header }
}
