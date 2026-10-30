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
  toolCount: number
  toolTimes: number[]
}

export type Handover = {
  at: number
  from: string
  to: string
  kind: 'task' | 'message' | 'report'
  text: string
}

export type ViewFilter = 'live' | 'done'

export type SessionRow = {
  id: string
  title: string
  name?: string
  startedBy?: string
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
    }
  }
}
