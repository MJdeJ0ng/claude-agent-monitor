import type { AgentRow } from '../../types'
import { ago, avatarOf, colorOf, duration, flattenTree, sparkline } from '../format'
import { PHASES, SILENCE_MS } from '../signals'
import { DONE_SESSION_ROWS, LINES_PER_AGENT, MAIN, NEEDS_YOU_ROWS, PARTY_MS, SESSION_FOCUS, SKILL_ROWS } from '../state'
import { waitsOf } from '../waits'
import type { Ctx } from './context'
import { doneList } from './done'
import { insideOf } from './inside'
import type { Parts } from './parts'

// ── Tree view ───────────────────────────────────────────────────────────
export const treeView = (c: Ctx, p: Parts) => {
  const { Box, Text, Button } = c.ui
  const { rows, log, view, family, inside, now, w, lines, units, running, childSessions, openSessions } = c
  const { stamp, nameOf, badgeOf, select, setView, lastReport, lastMessage } = c
  const { indented, levelBadge, usageOf, filesLine, reportLines, statusText, sessionState, header } = p
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
    .filter(s => (view === 'live' ? !s.isArchived : s.isArchived))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .slice(0, view === 'live' ? undefined : DONE_SESSION_ROWS)
  const finished = units
    .filter(r => r.status !== 'running')
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
  // Live lists the skills of agents still at work; Done keeps the whole history.
  const skillLog = log.filter(ev => ev.kind === 'skill' && (view === 'done' || liveIds.has(ev.agentId)))
  const showSkills = view === 'done' || skillLog.length > 0
  const skillRoom = !showSkills ? 0 : skillLog.length === 0 ? 1 : Math.min(SKILL_ROWS, skillLog.length)
  const room = Math.max(1, Math.floor((lines - 10 - skillRoom) / LINES_PER_AGENT))
  const visible = nodes.slice(-room)
  const historyRoom = Math.max(1, Math.floor((lines - 11 - skillRoom) / 4))
  const tabs = (
    <Box gap={2} marginTop={1} flexWrap="wrap">
      <Button key="tab-live" variant={view === 'live' ? 'primary' : 'secondary'} onPress={setView('live')}>
        ● Live ({running + openSessions})
      </Button>
      <Button key="tab-done" variant={view === 'done' ? 'primary' : 'secondary'} onPress={setView('done')}>
        ✓ Done ({finished.length + childSessions.length - openSessions})
      </Button>
    </Box>
  )

  // Who waits on the person, longest wait first; a local agent opens on click.
  const waits = waitsOf(rows, family, inside, now)
  const needsYou = waits.length > 0 && (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={PHASES.waiting.color}>
        📯 Needs you ({waits.length})
      </Text>
      {waits.slice(0, NEEDS_YOU_ROWS).map(w => (
        <Box>
          <Box flexShrink={0}>
            <Text color={PHASES.waiting.color}>{PHASES.waiting.glyph} </Text>
          </Box>
          {/* Who gives way; the short question and the time keep theirs. */}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            {w.agentId ? (
              <Button key={`wait-${w.key}`} plain onPress={select(w.agentId)}>
                {w.who}
              </Button>
            ) : (
              <Text wrap="truncate-end">{w.who}</Text>
            )}
          </Box>
          {w.tool && (
            <Box flexShrink={0}>
              <Text dimColor> · may it use {w.tool}?</Text>
            </Box>
          )}
          <Box flexShrink={0} marginLeft={1}>
            <Text color={PHASES.waiting.color}>{duration(now - w.since)}</Text>
          </Box>
        </Box>
      ))}
      {waits.length > NEEDS_YOU_ROWS && <Text dimColor>⋮ {waits.length - NEEDS_YOU_ROWS} more waiting</Text>}
    </Box>
  )

  return (
    <Box flexDirection="column" width="100%">
      {header}
      {needsYou}
      {tabs}

      {view === 'done' && doneList(c, p, finished, historyRoom)}

      {view === 'live' && nodes.length === 0 && openSessions === 0 && (
        <Box flexDirection="column">
          <Text dimColor>│</Text>
          {indented(
            '└─ ',
            <Text dimColor>
              {c.isMainBusy
                ? w.busyItself
                : w.allQuiet}
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
                  {/* The name keeps its width; the status beside it gives way. */}
                  <Box flexShrink={0}>
                    <Button key={`agent-${row.id}`} plain onPress={select(row.id)}>
                      {avatarOf(row.type)}{' '}
                      <Text color={accent} bold dimColor={!isRunning && !isParty}>
                        {row.name ?? row.type}
                      </Text>
                    </Button>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text wrap="truncate-end"> {statusText(row)}</Text>
                  </Box>
                  <Box flexShrink={0} marginLeft={1}>
                    <Text dimColor>
                      {duration((row.endedAt ?? now) - row.startedAt)}
                      {usageOf(row)}
                    </Text>
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
                      {row.toolCount} tools{isRunning && row.tool ? ` · now: ${c.stepOf(row.tool, row.toolDetail)}` : ''}
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
                {filesLine(row, lead)}
                {report && reportLines(`live-${row.id}`, report.text, lead)}
              </Box>
            )
          })}
        </Box>
      )}

      {shownSessions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{view === 'live' ? w.sessionsLive : w.sessionsDone}</Text>
          {shownSessions.map(s => {
            const depth = c.sessionDepth(s)
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
                  {/* A long title gives way; nothing shares its line, since a
                      text beside a button that took the width breaks letter by
                      letter in the desktop pane. */}
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Button key={`session-${s.id}`} plain onPress={select(`${SESSION_FOCUS}${s.id}`)}>
                      🪟 <Text bold>{s.title}</Text>
                    </Button>
                  </Box>
                  <Box flexShrink={0} marginLeft={1}>
                    <Text dimColor>{ago(now - s.lastActivityAt)}</Text>
                  </Box>
                </Box>
                {indented(`${lead}   `, sessionState(s), 'truncate-end')}
                {indented(
                  `${lead}   `,
                  <Text dimColor>
                    ↳ sent by {s.startedBy && c.familyIds.has(s.startedBy) ? family.find(x => x.id === s.startedBy)?.title : w.hq}
                    {pr ? ` · ${pr}` : ''}
                  </Text>,
                  'truncate-end',
                )}
                {insideOf(c, p, s, `${lead}   `)}
              </Box>
            )
          })}
        </Box>
      )}

      {showSkills && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{view === 'live' ? w.kitLive : w.kitAll}</Text>
          {skillLog.length === 0 && <Text dimColor>{w.noKit}</Text>}
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
        <Button key="words" variant="secondary" onPress={c.switchWords}>
          {w.switchLabel}
        </Button>
      </Box>
      <Box marginTop={1}>
        <Text dimColor wrap="wrap">
          AGENT = sent by the {w.hq} · SUB-AGENT = sent by another agent · 🎒 = skills · {PHASES.working.glyph} on the
          move · {PHASES.waiting.glyph} needs you · {PHASES.quiet.glyph} radio silence ({SILENCE_MS / 60_000}+ min quiet) · Σ =
          with the agents under it · click an agent or session for details
        </Text>
      </Box>
    </Box>
  )
}
