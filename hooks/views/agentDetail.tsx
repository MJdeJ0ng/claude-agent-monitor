import type { AgentRow } from '../../types'
import { avatarOf, colorOf, duration, sparkline } from '../format'
import { baseName, collapseRepeats, compactCount, sharedFiles, shortModel } from '../signals'
import { MAIN } from '../state'
import type { Ctx } from './context'
import type { Parts } from './parts'

// ── Detail view of one agent ────────────────────────────────────────────
export const agentDetail = (c: Ctx, p: Parts, focused: AgentRow) => {
  const { Box, Text, Button } = c.ui
  const { rows, moves, log, now, w, lines, totals, stamp, nameOf, badgeOf, select } = c
  const { indented, titleRow, statusText, header } = p
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
  const diary = collapseRepeats(timeline)
  const timelineRoom = Math.max(4, lines - 20)
  const sums = totals.get(focused.id)
  const focusedReport = [...moves].reverse().find(h => h.kind === 'report' && h.from === focused.id)
  const model = shortModel(focused.model)

  return (
    <Box flexDirection="column" width="100%">
      {header}
      <Box gap={2} marginTop={1} flexWrap="wrap">
        <Button key="back" hotkey="b" onPress={select('')}>
          {w.back}
        </Button>
        {focused.id !== MAIN && (
          <Button key="transcript" hotkey="t" onPress={c.openTranscript(focused.id)}>
            📺 Open transcript
          </Button>
        )}
      </Box>
      <Box marginTop={1}>
        {titleRow(
          <Text>
            {focused.id === MAIN ? '◆' : avatarOf(focused.type)}{' '}
            <Text bold color={accent}>
              {focused.id === MAIN ? w.hq : focused.name ?? focused.type}
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
      {(focused.tokens ?? 0) > 0 &&
        indented(
          `${w.rations.padEnd(13)}`,
          <Text>
            {compactCount(focused.tokens ?? 0)} tokens
            {sums && sums.agents > 0 && (
              <Text dimColor>
                {' '}
                · Σ {compactCount(sums.tokens)} with {sums.agents} under it
              </Text>
            )}
            {model && <Text dimColor> · {model}</Text>}
          </Text>,
        )}
      {focused.skills.length > 0 &&
        indented('Skills       ', <Text color="magenta">🎒 {focused.skills.join(' · ')}</Text>)}
      {(focused.files ?? []).length > 0 &&
        indented(
          'Files        ',
          <Text>
            {(focused.files ?? []).map(baseName).join(' · ')}
            {[...sharedFiles(focused, rows)].map(([file, who]) => (
              <Text color="yellow">
                {'  '}⚠️ {baseName(file)} also: {who.map(o => o.name ?? o.type).join(', ')}
              </Text>
            ))}
          </Text>,
        )}
      {focusedReport && indented('Report       ', <Text>{focusedReport.text}</Text>)}
      <Box marginTop={1}>
        <Text bold>{w.diary}</Text>
      </Box>
      {diary.length === 0 && <Text dimColor>{w.noDiary}</Text>}
      {diary.length > timelineRoom && <Text dimColor>⋮ {diary.length - timelineRoom} earlier entries</Text>}
      {diary.slice(-timelineRoom).map(item =>
        indented(
          `${stamp(item.at)} `,
          <Text>
            {item.icon} <Text color={item.color}>{item.what}</Text>
            {item.count > 1 && <Text bold> ×{item.count}</Text>}
            {item.detail && <Text dimColor> {item.detail}</Text>}
          </Text>,
          'truncate-end',
        ),
      )}
    </Box>
  )
}
