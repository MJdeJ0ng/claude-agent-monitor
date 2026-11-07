// The pipeline as the pane sees it: the repository's tickets, its pull
// requests, the app's sessions working on them, and where each ticket stands.

export type Stage = 'to-refine' | 'refined' | 'building' | 'pr' | 'ready' | 'merged'

export type Checks = 'pass' | 'fail' | 'pending' | 'none'

export type Issue = {
  number: number
  title: string
  labels: string[]
  isClosed: boolean
  // Last update, or closing time for a closed issue (ms).
  at: number
}

export type Pr = {
  number: number
  title: string
  branch: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  // MERGEABLE, CONFLICTING or UNKNOWN, as GitHub reports it.
  mergeable: string
  checks: Checks
  // Issues the PR closes, from its "Closes #n" references.
  closes: number[]
  url: string
  at: number
}

export type SessionInfo = {
  id: string
  title: string
  branch?: string
  isRunning: boolean
  prNumber?: number
  // True for the session this pane runs in.
  isSelf?: boolean
}

export type Board = {
  repo: string
  root: string
  fetchedAt: number
  issues: Issue[]
  prs: Pr[]
  // Made-up tickets from `/sdlc-monitor demo`, not the tracker.
  isDemo?: boolean
  // Why the board is empty: not a repository, gh missing or signed out.
  error?: string
}

export type Ticket = {
  number: number
  title: string
  stage: Stage
  size?: number
  isSpike: boolean
  pr?: Pr
  session?: SessionInfo
  // What the person has to do for this ticket, if anything.
  needsYou?: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'sdlc-monitor': {
      board: Shaped<Board>
      sessions: Shaped<SessionInfo[]>
      collapsed: Shaped<string[]>
    }
  }
}
