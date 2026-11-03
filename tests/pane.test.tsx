import { expect, test } from 'claude-code/testing'

import { collapseRepeats, compactCount, isLooping, phaseOf, subtreeTotals } from '../hooks/signals'

// The test runtime has timers; the mod's type set leaves them out.
declare const setTimeout: (run: () => void, ms: number) => unknown

const PANE = {
  plugin: 'agent-monitor',
  component: 'Pane',
  requestId: 'agent-monitor',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// Each hook here stands for the engine beneath the plugin.
type TestBody = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<TestBody>[1]

const engine = (on: On, decision: 'allow' | 'deny' | 'ask' = 'deny') => {
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: e.parentAgentId ? 'a2' : 'a1' }))
}

test('the main session working shows in the header', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'do it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Storming the beaches|Invading Poland|Island-hopping across the Pacific/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /now: Bash/ }))?.text).toContain('now: Bash')
    await ui.unmount()
  }
})

test('an agent and its sub-agent show live, then move to Done', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Find auth handlers', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'auth', agentId: 'a1' })
  await $.agent.spawn({ prompt: 'Dig deeper', description: 'Dig deeper', subagentType: 'Explore', parentAgentId: 'a1' } as never)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^ AGENT $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ SUB-AGENT $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Find auth/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Cracking Enigma|Decoding JN-25 at Station Hypo|Scouting from a PBY Catalina/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ answer: 'found it', durationMs: 5, isAborted: false, turnId: 'x1', agentId: 'a2', reason: 'answer' })
  await $.turn.complete({ answer: 'all done', durationMs: 9, isAborted: false, turnId: 'x2', agentId: 'a1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /All quiet|busy itself/ })).toBeDefined()
  await ui.press({ key: 'tab-done' })
  expect(await ui.find({ type: 'Text', text: /all done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Find auth/ })).toBeDefined()
  await ui.unmount()
})

test('an agent opens a detail view with its timeline', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Find auth handlers in src', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'login', agentId: 'a1' })
  await $.tool.call({ tool: 'Skill', skill: 'dataviz', agentId: 'a1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'agent-a1' })
  expect(await ui.find({ type: 'Text', text: /Find auth handlers in src/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /skill dataviz/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /login/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'tab-live' })).toBeDefined()
  await ui.unmount()
})

test('sessions started from this one are listed', async ($, on) => {
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', (_, e) =>
    e.tool === 'mcp__ccd_session_mgmt__list_sessions'
      ? {
          result: {},
          text: JSON.stringify([
            { sessionId: 'local_1', title: 'Build ST-013', isRunning: false, isArchived: false, prNumber: 46, prState: 'MERGED', lastActivityAt: '2026-10-29T09:55:58.720Z', startedBy: 'local_me' },
          ]),
        }
      : { result: {} },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-done' })
  expect(await ui.find({ type: 'Text', text: /Build ST-013/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PR #46/ })).toBeDefined()
  await ui.unmount()
})

test("a child session's agents and skills show under its row", async ($, on) => {
  const snapshot = {
    id: 'local_1',
    updatedAt: Date.now(),
    isMainBusy: true,
    mainTool: 'Bash',
    agents: [
      { id: 'c1', parentId: 'main', seq: 1, label: '#1', type: 'Explore', task: 'Scan the login flow', status: 'running', startedAt: Date.now() - 4000, skills: ['tdd-workflow'], tool: 'Grep', toolCount: 3, toolTimes: [] },
      { id: 'c2', parentId: 'c1', seq: 2, label: '#2', type: 'Plan', task: 'Plan the fix', status: 'done', startedAt: Date.now() - 3000, endedAt: Date.now() - 1000, skills: [], toolCount: 1, toolTimes: [] },
    ],
    skills: [{ at: Date.now() - 2000, agentId: 'main', name: 'dataviz' }],
  }
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('fs.read', () => ({ value: JSON.stringify(snapshot) }))
  on('tool.call', (_, e) =>
    e.tool === 'mcp__ccd_session_mgmt__list_sessions'
      ? {
          result: {},
          text: JSON.stringify([
            { sessionId: 'local_1', title: 'Refine login', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
          ]),
        }
      : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Refine login/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Scan the login flow/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cracking Enigma|Decoding JN-25 at Station Hypo|Scouting from a PBY Catalina/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tdd-workflow/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /dataviz/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ SUB-AGENT $/ })).toBeDefined()
  expect((await ui.find({ key: 'tab-live' }))?.text).toContain('(1)')
  await ui.unmount()
})

test("a child that could not learn its id is found by its folder", async ($, on) => {
  const snapshot = {
    id: 'cwd_x',
    updatedAt: Date.now(),
    isMainBusy: true,
    mainTool: 'Edit',
    agents: [
      { id: 'c1', parentId: 'main', seq: 1, label: '#1', type: 'Explore', task: 'Wire up autosave', status: 'running', startedAt: Date.now() - 4000, skills: [], toolCount: 1, toolTimes: [] },
    ],
    skills: [],
  }
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  // Only the folder file exists: the child never wrote one under its id.
  on('fs.read', (_, e) => ({ value: e.path.includes('cwd_') ? JSON.stringify(snapshot) : '' }))
  on('tool.call', (_, e) =>
    e.tool === 'mcp__ccd_session_mgmt__list_sessions'
      ? {
          result: {},
          text: JSON.stringify([
            { sessionId: 'local_1', title: 'Implement autosave', cwd: 'C:\\repo\\.claude\\worktrees\\autosave', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
          ]),
        }
      : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: 'C:\\repo', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Implement autosave/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Wire up autosave/ })).toBeDefined()
  await ui.unmount()
})

test('a session started from here shows even when the first look found none', async ($, on) => {
  let list: unknown[] = []
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', (_, e) =>
    e.tool === 'mcp__ccd_session_mgmt__list_sessions' ? { result: {}, text: JSON.stringify(list) } : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  list = [{ sessionId: 'local_2', title: 'Build login', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' }]
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', title: 'Build login' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Build login/ })).toBeDefined()
  await ui.unmount()
})

test('a session another one started opens no pane of its own', async ($, on) => {
  let opened = 0
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => {
    opened += 1
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', (_, e) =>
    e.tool === 'mcp__ccd_session_mgmt__get_session'
      ? { result: {}, text: JSON.stringify({ sessionId: 'local_child', parentSessionId: 'local_parent' }) }
      : { result: {}, text: '[]' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: 'x' })
  expect(opened).toBe(0)
})

test('an agent waiting for permission shows under Needs you until the call goes on', async ($, on) => {
  engine(on, 'ask')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Run the tests', description: 'Run tests', subagentType: 'tdd-guide' } as never)
  await $.tool.check({ tool: 'Bash', input: { command: 'npm test' }, tool_use_id: 'u1', agentId: 'a1' } as never)
  // A question settled within a moment is not shown: wait past the grace.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 3_200))

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Needs you \(1\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /may it use Bash/ })).toBeDefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'a1' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Needs you \(/ })).toBeUndefined()
  await ui.unmount()
})

test("tokens show per agent and add up under its parent", async ($, on) => {
  engine(on)
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' },
    }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Find auth', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.agent.spawn({ prompt: 'Dig deeper', description: 'Dig deeper', subagentType: 'Explore', parentAgentId: 'a1' } as never)
  for (const agentId of ['a1', 'a2']) {
    for await (const _ of $.turn.step({ turnId: `s-${agentId}`, index: 0, model: 'haiku', messageCount: 1, agentId })) {
      // drain the stream
    }
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Σ 3\.0k tok/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\.5k tok/ })).toBeDefined()
  await ui.press({ key: 'agent-a1' })
  expect(await ui.find({ type: 'Text', text: /with 1 under it/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /haiku/ })).toBeDefined()
  await ui.unmount()
})

test('signals: phases, loops, repeats and totals', async () => {
  const now = 1_000_000
  const base = { id: 'a', parentId: 'main', seq: 1, label: '#1', type: 'Explore', task: 't', status: 'running' as const, startedAt: now - 200_000, skills: [], toolCount: 2, toolTimes: [] }
  expect(phaseOf({ ...base, lastActivityAt: now - 100_000 }, now)).toBe('quiet')
  expect(phaseOf({ ...base, lastActivityAt: now - 100_000, inFlight: 1 }, now)).toBe('working')
  expect(phaseOf({ ...base, lastActivityAt: now, waitingSince: now - 1_000 }, now)).toBe('working')
  expect(phaseOf({ ...base, lastActivityAt: now, waitingSince: now - 5_000 }, now)).toBe('waiting')
  expect(phaseOf({ ...base, status: 'error' }, now)).toBe('failed')

  const read = { name: 'Read', detail: 'a.ts' }
  expect(isLooping([read, read, read, read])).toBe(true)
  expect(isLooping([read, read, { name: 'Read', detail: 'b.ts' }, read])).toBe(false)

  const merged = collapseRepeats([
    { what: 'Read', at: 1 },
    { what: 'Read', at: 2 },
    { what: 'Edit', at: 3 },
  ])
  expect(merged.map(m => `${m.what}×${m.count}`).join(' ')).toBe('Read×2 Edit×1')

  const sums = subtreeTotals([
    { ...base, id: 'main', parentId: '', tokens: 10 },
    { ...base, id: 'a1', parentId: 'main', tokens: 100 },
    { ...base, id: 'a2', parentId: 'a1', tokens: 1_000 },
  ])
  expect(sums.get('main')?.tokens).toBe(1_110)
  expect(sums.get('a1')?.agents).toBe(1)
  expect(compactCount(12_345)).toBe('12k')
  expect(compactCount(1_500)).toBe('1.5k')
})
