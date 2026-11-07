import { expect, test } from 'claude-code/testing'

import { checksOf, issueOfBranch, issueOfTitle, parseIssues, parseOrder, parsePrs, parseSessions, toTickets, upNext } from '../hooks/pipeline'
import { demoBoard, demoSessions } from '../hooks/demo'
import type { Board } from '../types'

// The test runtime has timers; the mod's type set leaves them out.
declare const setTimeout: (run: () => void, ms: number) => unknown

const NOW = Date.parse('2026-11-07T12:00:00Z')
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString()

const OPEN = JSON.stringify([
  { number: 16, title: 'Dashboard with benchmark', labels: [{ name: 'refined' }, { name: 'size:5' }], updatedAt: iso(1) },
  { number: 15, title: 'Four poll steps', labels: [{ name: 'to-refine' }], updatedAt: iso(5) },
  { number: 12, title: 'Login trim', labels: [{ name: 'refined' }, { name: 'size:2' }], updatedAt: iso(3) },
  { number: 11, title: 'Practice check', labels: [{ name: 'refined' }, { name: 'size:3' }], updatedAt: iso(2) },
  { number: 9, title: 'Export BOM', labels: [{ name: 'refined' }], updatedAt: iso(9) },
  { number: 8, title: 'Spike on maps', labels: [{ name: 'spike' }], updatedAt: iso(9) },
])
const CLOSED = JSON.stringify([
  { number: 5, title: 'Old one', labels: [], closedAt: iso(20) },
  { number: 3, title: 'Yesterday', labels: [], closedAt: iso(30) },
  { number: 4, title: 'Ancient', labels: [], closedAt: iso(24 * 30) },
])
const PRS = JSON.stringify([
  {
    number: 40, title: 'feat: login trim', headRefName: 'claude/12-login-ab12', state: 'OPEN', isDraft: false,
    mergeable: 'MERGEABLE', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
    closingIssuesReferences: [{ number: 12 }], updatedAt: iso(1), url: 'u40',
  },
  {
    number: 41, title: 'feat: practice check', headRefName: 'claude/11-check-cd34', state: 'OPEN', isDraft: false,
    mergeable: 'MERGEABLE', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
    closingIssuesReferences: [], updatedAt: iso(1), url: 'u41',
  },
  {
    number: 39, title: 'feat: export', headRefName: 'claude/9-export', state: 'MERGED', isDraft: false,
    mergeable: 'UNKNOWN', statusCheckRollup: [], closingIssuesReferences: [{ number: 9 }], mergedAt: iso(4), url: 'u39',
  },
])
const SESSIONS = JSON.stringify([
  { sessionId: 'local_a', title: 'Build #16 dashboard', cwd: 'C:\\Repo\\.claude\\worktrees\\16-x', branch: 'claude/16-dashboard-8da375', isRunning: true, isArchived: false },
  { sessionId: 'local_b', title: 'Refine stuff', cwd: 'C:\\Elsewhere', branch: 'claude/15-x', isRunning: false, isArchived: false },
  { sessionId: 'local_c', title: 'Old', cwd: 'C:\\Repo', branch: 'claude/11-y', isRunning: false, isArchived: true },
])

const board = (): Board => ({
  repo: 'me/repo',
  root: 'C:/Repo',
  fetchedAt: NOW,
  issues: [...parseIssues(OPEN, false), ...parseIssues(CLOSED, true)],
  prs: parsePrs(PRS),
})

test('reads ticket numbers from branches and titles', () => {
  expect(issueOfBranch('claude/16-dashboard-8da375')).toBe(16)
  expect(issueOfBranch('main')).toBeUndefined()
  expect(issueOfTitle('Build #16 dashboard')).toBe(16)
  expect(issueOfTitle('20261106-ORCH-x')).toBeUndefined()
})

test('rolls checks up into one verdict', () => {
  expect(checksOf([])).toBe('none')
  expect(checksOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('pass')
  expect(checksOf([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'SUCCESS' }])).toBe('pending')
  expect(checksOf([{ status: 'IN_PROGRESS' }, { state: 'FAILURE' }])).toBe('fail')
})

test('keeps only unarchived sessions in this repository and its worktrees', () => {
  const s = parseSessions(SESSIONS, 'C:/Repo')
  expect(s.map(x => x.id)).toEqual(['local_a'])
})

test('puts each ticket at its stage and flags what needs the person', () => {
  const tickets = toTickets(board(), parseSessions(SESSIONS, 'C:/Repo'), NOW)
  const at = (n: number) => tickets.find(t => t.number === n)
  expect(at(16)?.stage).toBe('building')
  expect(at(16)?.size).toBe(5)
  expect(at(15)?.stage).toBe('to-refine')
  expect(at(12)?.stage).toBe('ready')
  expect(at(12)?.needsYou).toBe('merge PR #40')
  expect(at(11)?.stage).toBe('pr')
  expect(at(11)?.needsYou).toBe('CI red on PR #41, nobody on it')
  expect(at(9)?.stage).toBe('merged')
  expect(at(9)?.needsYou).toBe('PR #39 merged: close the issue?')
  expect(at(8)?.isSpike).toBe(true)
  expect(at(8)?.stage).toBe('to-refine')
  expect(at(5)?.stage).toBe('merged')
  expect(at(4)).toBeUndefined()
  expect(at(3)).toBeUndefined()
})

test('an idle session on a refined ticket asks for the person', () => {
  const idle = [{ id: 's', title: 'Build #16', branch: 'claude/16-x', isRunning: false }]
  const t = toTickets(board(), idle, NOW).find(x => x.number === 16)
  expect(t?.stage).toBe('building')
  expect(t?.needsYou).toBe('session idle: waiting on you?')
})

const PANE = {
  plugin: 'sdlc-monitor',
  component: 'Pane',
  requestId: 'sdlc-monitor',
  props: { title: 'Pipeline', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the pane shows the flow, what needs you and the stages', async ($, on) => {
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'sdlc-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', () => ({ result: {}, text: SESSIONS }))
  on('process.run', (_, e) => {
    const cmd = e.argv.join(' ')
    const out = cmd.includes('git-common-dir')
      ? 'C:/Repo/.git'
      : cmd.includes('show-current')
        ? 'main'
        : cmd.includes('repo view')
          ? 'me/repo'
          : cmd.includes('pr list')
            ? PRS
            : cmd.includes('--state closed')
              ? CLOSED
              : OPEN
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
  // Let the background fetch settle.
  await new Promise<void>(done => setTimeout(done, 200))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /me\/repo/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /NEEDS YOU/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /merge PR #40/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Ready to merge/ })).toBeDefined()
  await ui.unmount()
})

test('the demo board puts tickets at every stage and in needs-you', () => {
  const now = Date.now()
  const tickets = toTickets(demoBoard(now), demoSessions(), now)
  const stages = new Set(tickets.map(t => t.stage))
  expect([...stages].sort()).toEqual(['building', 'merged', 'pr', 'ready', 'refined', 'to-refine'])
  expect(tickets.filter(t => t.needsYou).length).toBeGreaterThan(3)
})

test('stages start folded to one line with their ticket numbers', async ($, on) => {
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'sdlc-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'no repo', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.session.start({ cwd: 'C:/Nowhere', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'sdlc-monitor', args: 'demo' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /▸ In review \(PR\) 4 · #\d+ #\d+/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▾ / })).toBeUndefined()
  await ui.unmount()
})

test('coming up follows priority, blockers and the epic order', () => {
  const now = Date.now()
  const queue = upNext(toTickets(demoBoard(now), demoSessions(), now), 5)
  // #101 is priority-high; #112 waits on #110 so it drops behind the rest.
  expect(queue.map(t => t.number)).toEqual([101, 111, 110, 105, 102])
  expect(queue.some(t => t.isEpic)).toBe(false)
})

test('reads the plan order from GraphQL', () => {
  const text = JSON.stringify({
    data: { repository: { issues: { nodes: [
      { number: 11, parent: { number: 3, subIssues: { nodes: [{ number: 8 }, { number: 11 }] } }, subIssues: { totalCount: 0 }, blockedBy: { nodes: [{ number: 8, state: 'CLOSED' }, { number: 9, state: 'OPEN' }] } },
      { number: 3, parent: null, subIssues: { totalCount: 12 }, blockedBy: { nodes: [] } },
    ] } } },
  })
  expect(parseOrder(text)).toEqual([
    { number: 11, parent: 3, position: 1, blockers: [9], isEpic: false },
    { number: 3, parent: undefined, position: undefined, blockers: [], isEpic: true },
  ])
})
