import type { Board, Checks, Issue, Pr, SessionInfo, Stage, Ticket } from '../types'

// Pure logic: turn gh's JSON and the app's session list into tickets, each
// at one stage of the pipeline, with what waits on the person.

// Closed tickets stay on the board this long (ms): one day.
export const MERGED_WINDOW_MS = 24 * 60 * 60 * 1000

const FAILED = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
const PENDING = ['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED']

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const time = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) || 0 : 0)

const parseList = (text: string): Record<string, unknown>[] => {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
  } catch {
    return []
  }
}

export const parseIssues = (text: string, isClosed: boolean): Issue[] =>
  parseList(text).flatMap(item => {
    if (typeof item.number !== 'number') return []
    const labels = Array.isArray(item.labels) ? item.labels.map(l => str((l as Record<string, unknown>)?.name)).filter(Boolean) : []
    return [{ number: item.number, title: str(item.title), labels, isClosed, at: time(isClosed ? item.closedAt : item.updatedAt) }]
  })

// One verdict over a PR's checks: any failure wins, then anything still running.
export const checksOf = (rollup: unknown): Checks => {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none'
  const states = rollup.map(c => {
    const r = (c ?? {}) as Record<string, unknown>
    // A check run has status + conclusion; a commit status has state.
    if (r.state) return str(r.state).toUpperCase()
    if (str(r.status).toUpperCase() !== 'COMPLETED') return 'PENDING'
    return str(r.conclusion).toUpperCase()
  })
  if (states.some(s => FAILED.includes(s))) return 'fail'
  if (states.some(s => PENDING.includes(s))) return 'pending'
  return 'pass'
}

export const parsePrs = (text: string): Pr[] =>
  parseList(text).flatMap(item => {
    if (typeof item.number !== 'number') return []
    const state = str(item.state).toUpperCase()
    const closes = Array.isArray(item.closingIssuesReferences)
      ? item.closingIssuesReferences.flatMap(r => {
          const n = (r as Record<string, unknown>)?.number
          return typeof n === 'number' ? [n] : []
        })
      : []
    return [
      {
        number: item.number,
        title: str(item.title),
        branch: str(item.headRefName),
        state: state === 'MERGED' || state === 'CLOSED' ? state : 'OPEN',
        isDraft: item.isDraft === true,
        mergeable: str(item.mergeable).toUpperCase() || 'UNKNOWN',
        checks: checksOf(item.statusCheckRollup),
        closes,
        url: str(item.url),
        at: time(item.mergedAt) || time(item.updatedAt),
      } satisfies Pr,
    ]
  })

// The ticket a branch works on: `claude/16-dashboard-8da375` → 16.
export const issueOfBranch = (branch: string | undefined): number | undefined => {
  const m = /(?:^|\/)(\d+)(?=[-_]|$)/.exec(branch ?? '')
  return m ? Number(m[1]) : undefined
}

// The ticket a title names: `Build #16 dashboard` → 16.
export const issueOfTitle = (title: string | undefined): number | undefined => {
  const m = /#(\d+)\b/.exec(title ?? '')
  return m ? Number(m[1]) : undefined
}

// Folders compared the way Windows and the app spell them.
export const samePath = (a: string): string => a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const parseSessions = (text: string, root: string): SessionInfo[] => {
  const base = samePath(root)
  return parseList(text).flatMap(item => {
    const cwd = samePath(str(item.cwd))
    if (typeof item.sessionId !== 'string' || item.isArchived === true) return []
    if (!base || !(cwd === base || cwd.startsWith(`${base}/`))) return []
    return [
      {
        id: item.sessionId,
        title: str(item.title) || item.sessionId,
        branch: str(item.branch) || undefined,
        isRunning: item.isRunning === true,
        prNumber: typeof item.prNumber === 'number' ? item.prNumber : undefined,
      },
    ]
  })
}

const sizeOf = (labels: string[]): number | undefined => {
  const label = labels.find(l => /^size:\d+$/.test(l))
  return label ? Number(label.slice(5)) : undefined
}

const prIssues = (pr: Pr): number[] => {
  if (pr.closes.length > 0) return pr.closes
  const n = issueOfBranch(pr.branch) ?? issueOfTitle(pr.title)
  return n === undefined ? [] : [n]
}

// Per ticket, the PR that tells most: an open one first, then the latest merged.
const prsByIssue = (prs: Pr[]): Map<number, Pr> => {
  const rank = (p: Pr) => (p.state === 'OPEN' ? 2 : p.state === 'MERGED' ? 1 : 0)
  const map = new Map<number, Pr>()
  for (const pr of prs) {
    for (const n of prIssues(pr)) {
      const had = map.get(n)
      if (!had || rank(pr) > rank(had) || (rank(pr) === rank(had) && pr.at > had.at)) map.set(n, pr)
    }
  }
  return map
}

// Per ticket, the session on it: a running one first.
const sessionsByIssue = (sessions: SessionInfo[], prs: Pr[]): Map<number, SessionInfo> => {
  const map = new Map<number, SessionInfo>()
  for (const s of sessions) {
    const viaPr = prs.find(p => p.number === s.prNumber)
    const n = issueOfBranch(s.branch) ?? issueOfTitle(s.title) ?? (viaPr ? prIssues(viaPr)[0] : undefined)
    if (n === undefined) continue
    const had = map.get(n)
    if (!had || (s.isRunning && !had.isRunning)) map.set(n, s)
  }
  return map
}

const isReady = (pr: Pr): boolean =>
  pr.state === 'OPEN' && !pr.isDraft && pr.mergeable === 'MERGEABLE' && (pr.checks === 'pass' || pr.checks === 'none')

const stageOf = (issue: Issue, pr: Pr | undefined, session: SessionInfo | undefined): Stage => {
  if (issue.isClosed || (pr?.state === 'MERGED' && !session?.isRunning)) return 'merged'
  if (pr?.state === 'OPEN') return isReady(pr) ? 'ready' : 'pr'
  if (session && issue.labels.includes('refined')) return 'building'
  if (issue.labels.includes('refined')) return 'refined'
  return issue.labels.includes('to-refine') ? 'to-refine' : 'coming-up'
}

const needsYouOf = (issue: Issue, pr: Pr | undefined, session: SessionInfo | undefined): string | undefined => {
  if (issue.isClosed) return undefined
  const isWorked = session?.isRunning === true
  if (pr?.state === 'OPEN') {
    if (isReady(pr)) return `merge PR #${pr.number}`
    if (isWorked) return undefined
    if (pr.mergeable === 'CONFLICTING') return `PR #${pr.number} has conflicts, nobody on it`
    if (pr.checks === 'fail') return `CI red on PR #${pr.number}, nobody on it`
    return undefined
  }
  if (pr?.state === 'MERGED') return `PR #${pr.number} merged: close the issue?`
  if (session && !session.isRunning && !session.isSelf) return 'session idle: waiting on you?'
  return undefined
}

export const toTickets = (board: Board, sessions: SessionInfo[], now: number): Ticket[] => {
  const prMap = prsByIssue(board.prs)
  const sessionMap = sessionsByIssue(sessions, board.prs)
  return board.issues
    .filter(i => !i.isClosed || now - i.at < MERGED_WINDOW_MS)
    .map(issue => {
      const pr = prMap.get(issue.number)
      const session = sessionMap.get(issue.number)
      return {
        number: issue.number,
        title: issue.title,
        stage: stageOf(issue, pr, session),
        size: sizeOf(issue.labels),
        isSpike: issue.labels.includes('spike'),
        pr,
        session,
        needsYou: needsYouOf(issue, pr, session),
        at: Math.max(issue.at, pr?.at ?? 0),
      }
    })
    .sort((a, b) => b.at - a.at)
}
