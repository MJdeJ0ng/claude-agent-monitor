import type { SessionRow } from '../../types'
import { ago, avatarOf, clip } from '../format'
import { compactCount } from '../signals'
import { MAIN, SKILL_ROWS } from '../state'
import type { Ctx } from './context'
import { insideOf } from './inside'
import type { Parts } from './parts'

// ── Detail view of one child session ────────────────────────────────────
export const sessionDetail = (c: Ctx, p: Parts, s: SessionRow) => {
  const { Box, Text, Button, Input } = c.ui
  const { family, now, w, select } = c
  const { indented, titleRow, sessionState, header } = p
  const snap = c.inside[s.id]
  const tokens = (snap?.mainTokens ?? 0) + (snap?.agents ?? []).reduce((n, a) => n + (a.tokens ?? 0), 0)
  const pr = s.prNumber !== undefined ? `PR #${s.prNumber}${s.prState ? ` · ${s.prState.toLowerCase()}` : ''}` : ''
  const kit = (snap?.skills ?? []).slice(-SKILL_ROWS)
  const agentName = (id: string) => {
    if (id === MAIN) return s.title
    const a = snap?.agents.find(x => x.id === id)
    return a ? `${avatarOf(a.type)} ${a.name ?? a.type}` : clip(id, 16)
  }
  return (
    <Box flexDirection="column" width="100%">
      {header}
      <Box gap={2} marginTop={1} flexWrap="wrap">
        <Button key="back" hotkey="b" onPress={select('')}>
          {w.back}
        </Button>
      </Box>
      <Box marginTop={1}>
        {titleRow(
          <Text>
            🪟 <Text bold>{s.title}</Text> {sessionState(s)}
          </Text>,
          ago(now - s.lastActivityAt),
        )}
      </Box>
      {indented(
        'Sent by      ',
        <Text>
          {s.startedBy && family.some(x => x.id === s.startedBy) ? family.find(x => x.id === s.startedBy)?.title : w.hq}
          {pr ? <Text dimColor> · {pr}</Text> : ''}
        </Text>,
      )}
      {tokens > 0 && indented(`${w.rations.padEnd(13)}`, <Text>Σ {compactCount(tokens)} tokens</Text>)}
      {s.isRunning && c.stopping !== s.id && (
        <Box marginTop={1}>
          <Button key={`stop-${s.id}`} variant="secondary" onPress={c.askStop(s.id)}>
            {w.stop}
          </Button>
        </Box>
      )}
      {s.isRunning && c.stopping === s.id && (
        <Box marginTop={1} gap={2} flexWrap="wrap">
          <Text color="yellow">{w.stopAsk(s.title)}</Text>
          <Button key="stop-yes" variant="primary" onPress={c.stopIt(s)}>
            {w.stopYes}
          </Button>
          <Button key="stop-no" variant="secondary" onPress={c.cancelStop}>
            {w.cancel}
          </Button>
        </Box>
      )}
      {!s.isArchived && Input && (
        <Box marginTop={1}>
          <Input key={`message-${s.id}-${c.sentCount}`} label="💬 " placeholder={w.messageHint} submitLabel="send" onSubmit={c.sendTo(s)} />
        </Box>
      )}
      {!snap && (
        <Box marginTop={1}>
          <Text dimColor>This session shares nothing yet: it runs no agent-monitor, or has not started work.</Text>
        </Box>
      )}
      {snap && (
        <Box flexDirection="column" marginTop={1}>
          {snap.agents.length === 0 && <Text dimColor>No agents sent out yet.</Text>}
          {insideOf(c, p, s, '', true)}
        </Box>
      )}
      {kit.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{w.kitAll}</Text>
          {kit.map(k =>
            indented(
              `${ago(now - k.at)} `,
              <Text>
                <Text color="magenta">{k.name}</Text>
                <Text dimColor> to </Text>
                {agentName(k.agentId)}
              </Text>,
              'truncate-end',
            ),
          )}
        </Box>
      )}
    </Box>
  )
}
