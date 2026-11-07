// Constants, shape tags and what this session learns while it runs.

export const PANE = 'sdlc-monitor'
export const BOARD_POLL_MS = 60_000
export const SESSION_POLL_MS = 10_000
export const GH_TIMEOUT_MS = 30_000
export const ROWS_PER_STAGE = 8
// Needs-you rows shown before "+n more", so the pane stays short.
export const NEEDS_YOU_ROWS = 4
export const LIST_SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions'

// Change a tag when a value's fields change: it declines what an earlier
// version stored, which outlives a reload. Each module that reads or writes a
// value declares its own atom under the tag named here.
export const SHAPES = {
  board: 'board-2',
  sessions: 'sessions-1',
  open: 'open-1',
} as const

export const live = {
  cwd: '',
  // The main checkout's folder, also when this session runs in a worktree.
  root: '',
  repo: '',
  // The branch this session itself is on, standing in for it in the list.
  branch: '',
  isFetchingBoard: false,
  isFetchingSessions: false,
  isPaneOpened: false,
  // While true, polling leaves the demo board alone.
  isDemo: false,
}
