import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import { addHandover, clip, mainRow } from './format'
import { loadArchive, loadLayout, loadPlain } from './history'
import { learnSelf, shareSnapshot, syncSessions } from './sessions'
import {
  GET_SESSION_TOOL,
  LIST_SESSIONS_TOOL,
  MAIN,
  PANE_WAIT_MS,
  ROSTER_MS,
  SESSION_FOCUS,
  SESSION_POLL_MS,
  SESSION_START_TOOLS,
  SHAPES,
  SHARE_MS,
  TICK_MS,
  live,
} from './state'
import {
  quietly,
  recordSkillPrompt,
  recordSpawn,
  recordStep,
  recordToolEnd,
  recordToolStart,
  recordTurnEnd,
  recordWaiting,
  syncRoster,
} from './tracking'
import { pulse } from './waits'
import { agentDetail } from './views/agentDetail'
import { renderContext } from './views/context'
import { partsOf } from './views/parts'
import { sessionDetail } from './views/sessionDetail'
import { treeView } from './views/tree'

// The pane's id, written here as well as in ./state: the scan reads a hook's
// matcher only from a literal or a const of this file.
const PANE = 'agent-monitor'

const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, [], {
  shape: SHAPES.agents,
})
const handovers = atom({ plugin: 'agent-monitor', key: 'handovers' } as const, [], {
  shape: SHAPES.handovers,
})
const mainBusy = atom({ plugin: 'agent-monitor', key: 'mainBusy' } as const, false, {
  shape: SHAPES.mainBusy,
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-monitor',
      description: 'Open the live agent tree',
    })
    await update($, agents, list => (list.some(r => r.id === MAIN) ? list : [mainRow(), ...list]))
    // Animate spinners while agents work, and a little after they finish.
    $.clock.every(TICK_MS, () => pulse($))
    // Sessions started from this one live in their own windows; the app's
    // linked-session list is the only place that knows them, so poll it.
    void syncSessions($)
    $.clock.every(SESSION_POLL_MS, () => void syncSessions($))
    $.clock.every(ROSTER_MS, () => void quietly(() => syncRoster($)))
    // Let the session that started this one see inside it.
    live.selfCwd = e.cwd
    void loadPlain($)
    void loadLayout($)
    void loadArchive($)
    // The app could not say who this session is, or takes too long to: show
    // the pane anyway, unless it is known to be another session's child.
    const openUnlessChild = () => {
      if (live.isPaneOpened || live.isChild) return
      live.isPaneOpened = true
      void $.ui.open({ id: PANE, title: 'Agents' })
    }
    void learnSelf($).then(() => {
      if (!live.selfId) openUnlessChild()
    })
    try {
      $.clock.after(PANE_WAIT_MS, openUnlessChild)
    } catch {
      // No timer here: learning who this session is opens the pane instead.
    }
    $.clock.every(SHARE_MS, () => void shareSnapshot($))
    return next(e)
  })

  on('command.run', { command: 'agent-monitor' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agent tree opened.' }
  })

  // An agent is started: record it and the task handed to it.
  on('agent.spawn', async ($, e, next) => {
    const parentId = e.parentAgentId ?? MAIN
    const started = Date.now()
    const res = await next(e)
    const id = res.agentId ?? `${e.tool_use_id}:${started}`
    await quietly(() =>
      recordSpawn($, {
        id,
        parentId,
        started,
        type: e.subagentType,
        name: e.name,
        description: e.description,
        prompt: e.prompt,
        isDenied: Boolean(res.deny),
      }),
    )
    return res
  })

  // Tool and skill activity, attributed to the loop that ran it.
  on('tool.call', async ($, e, next) => {
    // Our own polling of the session list is not the agent's work.
    if (e.tool === LIST_SESSIONS_TOOL || e.tool === GET_SESSION_TOOL) return next(e)
    if (SESSION_START_TOOLS.includes(e.tool)) {
      live.isSessionFamilyKnown = true
      const res = await next(e)
      live.pollCount = 0
      void syncSessions($)
      return res
    }
    const who = e.agentId ?? MAIN
    const now = Date.now()
    const input = e as unknown as Record<string, unknown>
    await quietly(() => recordToolStart($, who, e.tool, input, now))
    // The permission question, if any, is settled once the call returns.
    try {
      return await next(e)
    } finally {
      await quietly(() => recordToolEnd($, who, e.tool, now))
    }
  })

  // A tool call the engine would ask the person about: the agent may now be
  // waiting on them. Only the model's own calls count (they carry an id); a
  // plugin's probe asks no one.
  on('tool.check', async ($, e, next) => {
    const res = await next(e)
    if (res.decision === 'ask' && e.tool_use_id && e.tool !== LIST_SESSIONS_TOOL && e.tool !== GET_SESSION_TOOL) {
      await quietly(() => recordWaiting($, e.agentId ?? MAIN, e.tool))
    }
    return res
  })

  // Each model step: what it cost and which model answered.
  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    const usage = res?.usage
    const who = e.agentId ?? MAIN
    if (usage) {
      const used =
        usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      await quietly(() => recordStep($, who, used, usage.model))
    }
    return res
  })

  // A skill typed as /name by the person: the Skill tool above covers the
  // model's own calls, so only record one it did not just log.
  on('skill.prompt', async ($, e, next) => {
    await quietly(() => recordSkillPrompt($, e.skill))
    return next(e)
  })

  // A message between agents.
  on('session.send', async ($, e, next) => {
    const from = e.agentId ?? MAIN
    await quietly(() =>
      update($, handovers, list =>
        addHandover(list, { at: Date.now(), from, to: e.to, kind: 'message', text: clip(e.text, 300) }),
      ),
    )
    return next(e)
  })

  // The main session's own turn: busy from its start to its end.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await quietly(() => update($, mainBusy, () => true))
    return next(e)
  })

  // An agent finishes and hands its report back.
  on('turn.complete', async ($, e, next) => {
    await quietly(() => recordTurnEnd($, e.agentId, e.reason, e.answer))
    return next(e)
  })

  // The pane: one agent, one child session, or the whole tree.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The pane's own width (its body's cells), not the whole surface's.
    const c = await renderContext($, $.ui.resolve(e), e.viewport?.rows ?? 30, e.surface, e.props.bodyColumns)
    const p = partsOf(c)
    const focused = c.focusId ? c.rows.find(r => r.id === c.focusId) : undefined
    if (focused) return agentDetail(c, p, focused)
    const focusedSession = c.focusId.startsWith(SESSION_FOCUS)
      ? c.childSessions.find(s => s.id === c.focusId.slice(SESSION_FOCUS.length))
      : undefined
    if (focusedSession) return sessionDetail(c, p, focusedSession)
    return treeView(c, p)
  })
}
