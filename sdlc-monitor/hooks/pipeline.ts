import type { Board, Checks, Issue, OrderInfo, Pr, SessionInfo, Stage, Ticket } from '../types'

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

// The tickets a PR is for: the ones it closes; for an open PR that closes
// none, the one its branch or title names. A merged PR that closed nothing
// (it only related to a ticket, such as an epic) says nothing about that
// ticket's state, so it is not linked.
const prIssues = (pr: Pr): number[] => {
  if (pr.closes.length > 0) return pr.closes
  if (pr.state !== 'OPEN') return []
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

const priorityOf = (labels: string[]): number =>
  labels.includes('priority-critical') ? 0 : labels.includes('priority-high') ? 1 : 2

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const nodesOf = (v: unknown): Json[] => {
  const n = obj(v).nodes
  return Array.isArray(n) ? n.map(obj) : []
}

// The plan's order from GitHub's GraphQL: each open issue's epic and place
// among the epic's sub-issues, whether it is an epic, and its open blockers.
export const parseOrder = (text: string): OrderInfo[] => {
  try {
    const repo = obj(obj(obj(JSON.parse(text)).data).repository)
    return nodesOf(repo.issues).flatMap(n => {
      if (typeof n.number !== 'number') return []
      const parent = obj(n.parent)
      const siblings = nodesOf(parent.subIssues).map(x => x.number)
      const position = siblings.indexOf(n.number)
      const blockers = nodesOf(n.blockedBy)
        .filter(b => typeof b.number === 'number' && str(b.state).toUpperCase() === 'OPEN')
        .map(b => b.number as number)
      const total = obj(n.subIssues).totalCount
      return [
        {
          number: n.number,
          parent: typeof parent.number === 'number' ? parent.number : undefined,
          position: position >= 0 ? position : undefined,
          blockers,
          isEpic: typeof total === 'number' && total > 0,
        },
      ]
    })
  } catch {
    return []
  }
}

// The next tickets to pick up, in the plan's order: priority first, then
// what is not blocked, then the epic's sub-issue order, then the number.
export const upNext = (tickets: Ticket[], count: number): Ticket[] =>
  tickets
    .filter(t => (t.stage === 'refined' || t.stage === 'to-refine') && !t.isEpic)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        Number(a.blockers.length > 0) - Number(b.blockers.length > 0) ||
        (a.parent ?? a.number) - (b.parent ?? b.number) ||
        (a.position ?? 0) - (b.position ?? 0) ||
        a.number - b.number,
    )
    .slice(0, count)

const stageOf = (issue: Issue, pr: Pr | undefined, session: SessionInfo | undefined): Stage => {
  if (issue.isClosed || (pr?.state === 'MERGED' && !session?.isRunning)) return 'merged'
  if (pr?.state === 'OPEN') return isReady(pr) ? 'ready' : 'pr'
  if (session && issue.labels.includes('refined')) return 'building'
  if (issue.labels.includes('refined')) return 'refined'
  return 'to-refine'
}

const needsYouOf = (issue: Issue, pr: Pr | undefined, session: SessionInfo | undefined, isEpic: boolean): string | undefined => {
  if (issue.isClosed) return undefined
  const isWorked = session?.isRunning === true
  if (pr?.state === 'OPEN') {
    if (isReady(pr)) return `merge PR #${pr.number}`
    if (isWorked) return undefined
    if (pr.mergeable === 'CONFLICTING') return `PR #${pr.number} has conflicts, nobody on it`
    if (pr.checks === 'fail') return `CI red on PR #${pr.number}, nobody on it`
    return undefined
  }
  if (pr?.state === 'MERGED') return isEpic ? undefined : `PR #${pr.number} merged: close the issue?`
  if (session && !session.isRunning && !session.isSelf) return 'session idle: waiting on you?'
  return undefined
}

// What a session on the ticket is doing: refining a ticket still to refine,
// building one that is refined.
const activityOf = (stage: Stage, session: SessionInfo | undefined): Ticket['activity'] => {
  if (!session?.isRunning) return undefined
  if (stage === 'to-refine') return 'refining'
  if (stage === 'building') return 'building'
  return undefined
}

export const toTickets = (board: Board, sessions: SessionInfo[], now: number): Ticket[] => {
  const prMap = prsByIssue(board.prs)
  const orderMap = new Map((board.order ?? []).map(o => [o.number, o]))
  const sessionMap = sessionsByIssue(sessions, board.prs)
  return board.issues
    .filter(i => !i.isClosed || now - i.at < MERGED_WINDOW_MS)
    .map(issue => {
      const pr = prMap.get(issue.number)
      const session = sessionMap.get(issue.number)
      const isEpic = orderMap.get(issue.number)?.isEpic ?? false
      const stage = stageOf(issue, pr, session)
      return {
        number: issue.number,
        title: issue.title,
        stage,
        activity: activityOf(stage, session),
        size: sizeOf(issue.labels),
        isSpike: issue.labels.includes('spike'),
        pr,
        session,
        needsYou: needsYouOf(issue, pr, session, isEpic),
        blockers: orderMap.get(issue.number)?.blockers ?? [],
        isEpic,
        priority: priorityOf(issue.labels),
        parent: orderMap.get(issue.number)?.parent,
        position: orderMap.get(issue.number)?.position,
        at: Math.max(issue.at, pr?.at ?? 0),
      }
    })
    .sort((a, b) => b.at - a.at)
}
