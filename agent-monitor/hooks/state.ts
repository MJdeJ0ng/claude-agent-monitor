// The pane's constants, its atoms' shape tags, and what this session learns
// about itself while it runs. Other modules read and write the session's
// state through `live`, since an imported `let` cannot be assigned.

export const PANE = 'agent-monitor'
export const MAIN = 'main'
export const MAX_AGENTS = 100
export const MAX_HANDOVERS = 60
export const MAX_EVENTS = 400
export const MAX_TOOL_TIMES = 60
export const LINES_PER_AGENT = 6
export const SKILL_ROWS = 6
export const TICK_MS = 500
export const SESSION_POLL_MS = 5_000
export const LIST_EVERY_POLLS = 4
export const SHARE_MS = 3_000
export const SHARED_AGENTS = 30
export const SHARED_HANDOVERS = 30
export const SHARED_HANDOVER_CHARS = 600
// How often to ask the app who this session is before giving up (one try
// per share tick, so about a minute).
export const SELF_TRIES = 20
// How long a session waits to learn whether it is another's child before it
// shows its pane anyway.
export const PANE_WAIT_MS = 8_000
export const SHARED_SKILLS = 20
export const REMOTE_ROWS = 6
export const LIST_SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions'
export const GET_SESSION_TOOL = 'mcp__ccd_session_mgmt__get_session'
export const SESSION_START_TOOLS = ['mcp__ccd_session__start_session', 'mcp__ccd_session__hand_off_to_session']
export const PARTY_MS = 15_000
export const SKILL_DEDUPE_MS = 3_000
export const SPARK_BUCKETS = 12
export const SPARK_BUCKET_MS = 2_500
export const NEEDS_YOU_SOUND = 'sounds/needs-you.wav'
export const NEEDS_YOU_ROWS = 5
export const FILE_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']
export const MAX_FILES = 30
export const REPORT_CHARS = 2_000
export const HISTORY_KEY = 'history'
export const PLAIN_KEY = 'plain'
export const MAX_HISTORY = 80
export const ARCHIVE_ROWS = 8
export const DONE_SESSION_ROWS = 10
export const ROSTER_MS = 10_000
// A selection naming a child session rather than an agent.
export const SESSION_FOCUS = 'session:'
export const WORKFLOW_TOOL = 'Workflow'

// Change a shape tag when a row's fields change: it declines what an earlier
// version stored, which outlives a reload. The state scan reads one file at a
// time, so each module that reads or writes a value declares its own atom for
// it, always under the tag named here.
export const SHAPES = {
  agents: 'agents-5',
  handovers: 'handovers-1',
  events: 'events-1',
  selected: 'selected-1',
  filter: 'filter-1',
  sessions: 'sessions-3',
  mainBusy: 'mainBusy-1',
  remote: 'remote-1',
  plain: 'plain-1',
  expanded: 'expanded-1',
  archive: 'archive-1',
  tick: 'tick-1',
  confirmStop: 'confirmStop-1',
  sent: 'sent-1',
} as const

export const live = {
  // Whether this session has linked sessions: true once the list showed one or
  // this session started one. Starts over with each reload.
  isSessionFamilyKnown: false,
  isSyncing: false,
  pollCount: 0,
  // This session's app id, once known, and the last snapshot it shared.
  selfId: undefined as string | undefined,
  selfCwd: '',
  selfTries: 0,
  isLearningSelf: false,
  isPaneOpened: false,
  // Whether the app said another session started this one.
  isChild: false,
  lastShared: '',
}

// Waits the person has been told about, by agent or session key.
export const announced = new Set<string>()
