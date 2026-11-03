export type AgentStatus = 'running' | 'done' | 'aborted' | 'error' | 'denied'

export type AgentRow = {
  id: string
  parentId: string
  seq: number
  label: string
  type: string
  name?: string
  task: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  skills: string[]
  tool?: string
  // What the current tool call is about: a command, file or query.
  toolDetail?: string
  toolCount: number
  toolTimes: number[]
  // Tokens its model steps used (input, cache and output), and its model.
  tokens?: number
  model?: string
  // Since when a permission question waits; how many tools run right now;
  // its last step or tool.
  waitingSince?: number
  waitingTool?: string
  inFlight?: number
  lastActivityAt?: number
  // Files it wrote or edited, newest last.
  files?: string[]
  // The engine's own word for its loop while it runs (idle, waiting, ...),
  // and whether the pane met it through its steps rather than its spawn.
  engineStatus?: string
  isAdopted?: boolean
}

// A finished agent kept across restarts: its row, its report, and the folder
// its session worked in (the pane shows the ones from its own folder).
export type ArchivedAgent = AgentRow & { report?: string; folder: string }

export type Handover = {
  at: number
  from: string
  to: string
  kind: 'task' | 'message' | 'report'
  text: string
}

// How the Live view is drawn: as text (cli) or as a flowchart (ui); unset,
// each surface takes its own default.
export type LayoutMode = '' | 'cli' | 'ui'

export type ViewFilter = 'live' | 'done'

export type SessionRow = {
  id: string
  title: string
  name?: string
  startedBy?: string
  cwd?: string
  isArchived?: boolean
  isRunning: boolean
  prNumber?: number
  prState?: string
  firstSeenAt: number
  lastActivityAt: number
  endedAt?: number
}

// What one session shares with the session that started it: written by the
// child to a shared folder, read by the parent to draw under its session row.
export type SessionSnapshot = {
  id: string
  updatedAt: number
  isMainBusy: boolean
  mainTool?: string
  mainToolDetail?: string
  // Since when the session's own loop waits for a permission answer.
  mainWaitingSince?: number
  mainWaitingTool?: string
  // Tokens the session's own loop used, and the latest handovers between
  // its agents (briefs, messages, reports).
  mainTokens?: number
  handovers?: Handover[]
  agents: AgentRow[]
  skills: { at: number; agentId: string; name: string }[]
}

export type ActivityEvent = {
  at: number
  agentId: string
  kind: 'tool' | 'skill'
  name: string
  detail?: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': {
      agents: Shaped<AgentRow[]>
      handovers: Shaped<Handover[]>
      events: Shaped<ActivityEvent[]>
      sessions: Shaped<SessionRow[]>
      remote: Shaped<Record<string, SessionSnapshot>>
      selected: Shaped<string>
      filter: Shaped<ViewFilter>
      mainBusy: Shaped<boolean>
      tick: Shaped<number>
      plain: Shaped<boolean>
      expanded: Shaped<string[]>
      archive: Shaped<ArchivedAgent[]>
      confirmStop: Shaped<string>
      sent: Shaped<number>
      layout: Shaped<LayoutMode>
    }
  }
}
