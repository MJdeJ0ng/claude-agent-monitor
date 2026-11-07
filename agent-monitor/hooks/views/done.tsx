import type { AgentRow, AgentStatus } from '../../types'
import { ago, avatarOf, colorOf, duration } from '../format'
import { compactCount, modelTag } from '../signals'
import { ARCHIVE_ROWS, MAIN } from '../state'
import type { Ctx } from './context'
import type { Parts } from './parts'

// The Done tab's agents: those this session finished, newest first, then the
// ones earlier sessions in this folder finished.
export const doneList = (c: Ctx, p: Parts, finished: AgentRow[], historyRoom: number) => {
  const { Box, Text, Button } = c.ui
  const { rows, now, w, stamp, badgeOf, select, lastReport } = c
  const { indented, titleRow, levelBadge, usageOf, filesLine, reportLines } = p
  const isSubAgent = (r: AgentRow) => r.parentId !== MAIN && rows.some(x => x.id === r.parentId)
  const earlierHere = c.earlier
    .filter(a => !rows.some(r => r.id === a.id))
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
  return (
    <Box flexDirection="column">
      {finished.length === 0 && <Text dimColor>{w.nobodyHome}</Text>}
      {finished.length > historyRoom && (
        <Text dimColor>⋮ {finished.length - historyRoom} older agents not shown</Text>
      )}
      {finished.slice(0, historyRoom).map(row => {
        const ended = w.ended[row.status as Exclude<AgentStatus, 'running'>]
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
                  {usageOf(row)}
                </Text>
              </Box>
            </Box>
            {isSub && indented('   ', <Text color="magenta">↳ sent by {badgeOf(row.parentId)}</Text>)}
            {indented('   ', row.task)}
            {filesLine(row, '   ')}
            {report && reportLines(`done-${row.id}`, report.text, '   ')}
          </Box>
        )
      })}
      {earlierHere.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{w.earlier}</Text>
          {earlierHere.slice(0, ARCHIVE_ROWS).map(a => {
            const ended = w.ended[a.status === 'running' ? 'done' : a.status]
            return (
              <Box flexDirection="column">
                {titleRow(
                  <Text>
                    <Text color={ended.color}>{ended.icon} </Text>
                    {avatarOf(a.type)} <Text bold>{a.name ?? a.type}</Text> <Text dimColor>{a.task}</Text>
                  </Text>,
                  <Text>
                    {ago(now - (a.endedAt ?? a.startedAt))}
                    {a.tokens ? ` · ${compactCount(a.tokens)} tok` : ''}
                    {modelTag(a.model)}
                  </Text>,
                )}
                {a.report && reportLines(`old-${a.id}`, a.report, '   ')}
              </Box>
            )
          })}
          {earlierHere.length > ARCHIVE_ROWS && (
            <Text dimColor>⋮ {earlierHere.length - ARCHIVE_ROWS} older agents kept</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
