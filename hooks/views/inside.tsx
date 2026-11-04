import type { Handover, SessionRow } from '../../types'
import { avatarOf, clip, colorOf, duration, flattenTree, mainRow } from '../format'
import { PHASES, compactCount, isSessionBusy, liveWithContext, phaseOf } from '../signals'
import { MAIN, REMOTE_ROWS } from '../state'
import { verbOf } from '../wording'
import type { Ctx } from './context'
import type { Parts } from './parts'

// What a child session is doing, from the snapshot it shares: its own
// activity, then its agents and sub-agents as a small tree.
// In full (the session's own view) every agent shows, with its files,
// messages and report; in brief (under its row) only what is at work.
export const insideOf = (c: Ctx, p: Parts, s: SessionRow, lead: string, isFull = false) => {
  const { Box, Text } = c.ui
  const { now, w, spin, view } = c
  const { indented, levelBadge, filesLine, reportLines } = p
  const snap = c.inside[s.id]
  if (!snap) return null
  const mainSkills = [...new Set(snap.skills.filter(k => k.agentId === MAIN).map(k => k.name))]
  // Live shows its agents at work (with the ones above them); Done all of them.
  const shownAgents =
    isFull || view !== 'live' ? snap.agents : liveWithContext(isSessionBusy(s, snap) ? snap.agents : [])
  const tree = flattenTree([mainRow(), ...shownAgents])
  const inner = isFull ? tree : tree.slice(-REMOTE_ROWS)
  const moved = snap.handovers ?? []
  const lastOf = (id: string, kind: Handover['kind']) => [...moved].reverse().find(h => h.kind === kind && h.from === id)
  const theirName = (id: string) => {
    if (id === MAIN) return s.title
    const a = snap.agents.find(x => x.id === id || x.name === id)
    return a ? a.name ?? a.type : clip(id, 16)
  }
  const doneCount = snap.agents.filter(a => a.status !== 'running' && !shownAgents.includes(a)).length
  return (
    <Box flexDirection="column">
      {isSessionBusy(s, snap) &&
        snap.isMainBusy &&
        indented(
          lead,
          <Text color="yellow">
            {spin} {verbOf(w, snap.mainTool, s.id)}…{snap.mainTool ? ` · now: ${c.stepOf(snap.mainTool, snap.mainToolDetail)}` : ''}
          </Text>,
          'truncate-end',
        )}
      {mainSkills.length > 0 && indented(lead, <Text color="magenta">🎒 {mainSkills.join(' · ')}</Text>, 'truncate-end')}
      {!isFull &&
        view === 'live' &&
        doneCount > 0 &&
        indented(lead, <Text dimColor>✓ {doneCount} {doneCount === 1 ? 'agent' : 'agents'} done</Text>, 'truncate-end')}
      {inner.map(({ row, depth, branch, stem }) => {
        const isLive = isSessionBusy(s, snap) && row.status === 'running'
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
                  {isLive && phaseOf(row, now) === 'waiting' ? (
                    <Text color={PHASES.waiting.color} bold>
                      {PHASES.waiting.glyph} Needs you{row.waitingTool ? `: ${row.waitingTool}?` : ''}
                    </Text>
                  ) : isLive && phaseOf(row, now) === 'quiet' ? (
                    <Text color={PHASES.quiet.color}>{PHASES.quiet.glyph} {w.silence}</Text>
                  ) : isLive ? (
                    <Text color={colorOf(row.type)}>
                      {spin} {verbOf(w, row.tool, row.id)}…
                    </Text>
                  ) : row.status === 'running' ? (
                    <Text dimColor>? {w.missing}</Text>
                  ) : (
                    <Text color={w.ended[row.status].color}>
                      {w.ended[row.status].icon} {w.ended[row.status].label}
                    </Text>
                  )}
                </Text>
              </Box>
              <Box flexShrink={0} marginLeft={1}>
                <Text dimColor>
                  {duration((row.endedAt ?? (isLive ? now : snap.updatedAt)) - row.startedAt)}
                  {row.tokens ? ` · ${compactCount(row.tokens)} tok` : ''}
                </Text>
              </Box>
            </Box>
            {indented(`${lead}${stem}   `, row.task, 'truncate-end')}
            {isLive &&
              row.tool &&
              indented(`${lead}${stem}   `, <Text dimColor>now: {c.stepOf(row.tool, row.toolDetail)}</Text>, 'truncate-end')}
            {row.skills.length > 0 &&
              indented(`${lead}${stem}   `, <Text color="magenta">🎒 {row.skills.join(' · ')}</Text>, 'truncate-end')}
            {isFull && filesLine(row, `${lead}${stem}   `, snap.agents)}
            {isFull &&
              (() => {
                const message = lastOf(row.id, 'message')
                return message
                  ? indented(
                      `${lead}${stem}   `,
                      <Text>
                        💬 → {theirName(message.to)}: <Text dimColor>"{message.text}"</Text>
                      </Text>,
                      'truncate-end',
                    )
                  : null
              })()}
            {isFull &&
              (() => {
                const report = lastOf(row.id, 'report')
                return report ? reportLines(`s-${s.id}-${row.id}`, report.text, `${lead}${stem}   `) : null
              })()}
          </Box>
        )
      })}
    </Box>
  )
}
