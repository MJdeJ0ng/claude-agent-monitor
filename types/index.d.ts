export type AgentStatus = 'running' | 'done' | 'aborted' | 'error' | 'denied'

export type AgentRow = {
  id: string
  parentId: string
  seq: number
  callsign: string
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
      selected: Shaped<string>
      filter: Shaped<ViewFilter>
      tick: Shaped<number>
    }
  }
}
