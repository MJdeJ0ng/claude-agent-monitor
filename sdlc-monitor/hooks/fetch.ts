import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Board, SessionInfo } from '../types'
import { demoBoard, demoSessions } from './demo'
import { issueOfBranch, parseIssues, parseOrder, parsePrs, parseSessions } from './pipeline'
import { GH_TIMEOUT_MS, LIST_SESSIONS_TOOL, SHAPES, live } from './state'

// Reads the pipeline from outside: git for the repository, gh for tickets and
// pull requests, the app for the sessions working on them.

const EMPTY: Board = { repo: '', root: '', fetchedAt: 0, issues: [], prs: [] }

const board = atom({ plugin: 'sdlc-monitor', key: 'board' } as const, EMPTY, { shape: SHAPES.board })
const sessions = atom({ plugin: 'sdlc-monitor', key: 'sessions' } as const, [] as SessionInfo[], {
  shape: SHAPES.sessions,
})

const ISSUE_FIELDS = 'number,title,labels,updatedAt,closedAt'
// Each open issue's epic, its place among the epic's sub-issues and its open
// blockers: the plan's order, which gh issue list does not give.
const ORDER_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN) {
      nodes {
        number
        parent { number subIssues(first: 100) { nodes { number } } }
        subIssues(first: 1) { totalCount }
        blockedBy(first: 20) { nodes { number state } }
      }
    }
  }
}`

const PR_FIELDS = 'number,title,headRefName,state,isDraft,mergeable,statusCheckRollup,closingIssuesReferences,mergedAt,updatedAt,url'

async function run($: EngineInterface, argv: string[], cwd: string): Promise<string> {
  const res = await $.process.run(argv, { cwd, timeoutMs: GH_TIMEOUT_MS })
  if (res.exitCode !== 0) throw new Error(res.stderr.trim().split('\n')[0] || `${argv[0]} exited ${res.exitCode}`)
  return res.stdout.trim()
}

// The main checkout's folder (a worktree's common .git sits in it) and the
// branch this session is on.
export async function findRepo($: EngineInterface): Promise<boolean> {
  if (live.root) return true
  try {
    const common = await run($, ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], live.cwd)
    live.root = common.replace(/[\\/]\.git$/, '')
    live.branch = await run($, ['git', 'branch', '--show-current'], live.cwd).catch(() => '')
    return true
  } catch {
    return false
  }
}

async function fail($: EngineInterface, error: string): Promise<void> {
  await update($, board, b => ({ ...b, root: live.root, fetchedAt: Date.now(), error }))
}

// Fills the pane with made-up tickets, or goes back to the tracker.
export async function setDemo($: EngineInterface, isOn: boolean): Promise<void> {
  live.isDemo = isOn
  if (isOn) {
    await update($, board, () => demoBoard(Date.now()))
    await update($, sessions, () => demoSessions())
    return
  }
  await update($, board, () => EMPTY)
  await update($, sessions, () => [])
  await refreshBoard($)
  await refreshSessions($)
}

export async function refreshBoard($: EngineInterface): Promise<void> {
  if (live.isDemo) {
    await update($, board, () => demoBoard(Date.now()))
    return
  }
  if (live.isFetchingBoard) return
  live.isFetchingBoard = true
  try {
    if (!(await findRepo($))) return await fail($, 'This session is not inside a git repository.')
    const at = live.root
    if (!live.repo) live.repo = await run($, ['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], at)
    const [owner = '', name = ''] = live.repo.split('/')
    const [open, closed, prs, order] = await Promise.all([
      run($, ['gh', 'issue', 'list', '--state', 'open', '--limit', '200', '--json', ISSUE_FIELDS], at),
      run($, ['gh', 'issue', 'list', '--state', 'closed', '--limit', '20', '--json', ISSUE_FIELDS], at),
      run($, ['gh', 'pr', 'list', '--state', 'all', '--limit', '40', '--json', PR_FIELDS], at),
      // Without the order the queue falls back to issue numbers.
      run($, ['gh', 'api', 'graphql', '-f', `query=${ORDER_QUERY}`, '-F', `owner=${owner}`, '-F', `name=${name}`], at).catch(() => ''),
    ])
    const next: Board = {
      repo: live.repo,
      root: at,
      fetchedAt: Date.now(),
      issues: [...parseIssues(open, false), ...parseIssues(closed, true)],
      prs: parsePrs(prs),
      order: order ? parseOrder(order) : undefined,
    }
    await update($, board, () => next)
  } catch (err) {
    await fail($, `gh could not read the tracker: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    live.isFetchingBoard = false
  }
}

// The app's sessions in this repository, its worktrees included. Polled only
// where the permission check allows it without asking, so it never opens a
// dialog. This session itself is not in the app's list: its branch stands in.
export async function refreshSessions($: EngineInterface): Promise<void> {
  if (live.isDemo || live.isFetchingSessions || !live.root) return
  live.isFetchingSessions = true
  try {
    const self: SessionInfo[] =
      issueOfBranch(live.branch) !== undefined
        ? [{ id: 'self', title: 'this session', branch: live.branch, isRunning: true, isSelf: true }]
        : []
    const input = { limit: 50 }
    const { decision } = await $.tool.check({ tool: LIST_SESSIONS_TOOL, input })
    if (decision !== 'allow') {
      await update($, sessions, () => self)
      return
    }
    const res = await $.tool.call({ tool: LIST_SESSIONS_TOOL, ...input })
    const text = 'text' in res && typeof res.text === 'string' ? res.text : ''
    const found = parseSessions(text, live.root)
    await update($, sessions, () => [...self, ...found])
  } catch {
    // The app's session tools are missing here: tickets only.
  } finally {
    live.isFetchingSessions = false
  }
}
