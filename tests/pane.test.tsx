import { expect, test } from 'claude-code/testing'

import { flowchartSvg, layoutFlow } from '../hooks/flowchart'
import { normalizeRow, reconcile } from '../hooks/roster'
import { collapseRepeats, compactCount, firstSentence, isLooping, phaseOf, subtreeTotals } from '../hooks/signals'

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
    expect((await ui.find({ type: 'Text', text: /now: Bash/ }))?.text).toContain('now: Bash · ls')
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
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^ AGENT $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ SUB-AGENT $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Find auth/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Cracking Enigma|Decoding JN-25 at Station Hypo|Scouting from a PBY Catalina/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ answer: 'found it', durationMs: 5, isAborted: false, turnId: 'x1', agentId: 'a2', reason: 'answer' })
  await $.turn.complete({ answer: 'all done', durationMs: 9, isAborted: false, turnId: 'x2', agentId: 'a1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
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
            { sessionId: 'local_1', title: 'Build ST-013', isRunning: false, isArchived: true, prNumber: 46, prState: 'MERGED', lastActivityAt: '2026-10-29T09:55:58.720Z', startedBy: 'local_me' },
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

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Refine login/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Scan the login flow/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cracking Enigma|Decoding JN-25 at Station Hypo|Scouting from a PBY Catalina/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tdd-workflow/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /dataviz/ })).toBeDefined()
  // Its finished sub-agent is counted, not drawn: Live is for work in progress.
  expect(await ui.find({ type: 'Text', text: /Plan the fix/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /1 agent done/ })).toBeDefined()
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

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
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

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
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

test('the words switch trades the WW2 wording for plain words', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'do it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /War Room/ })).toBeDefined()
  await ui.press({ key: 'words' })
  expect(await ui.find({ type: 'Text', text: /Main session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Running a command/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /War Room/ })).toBeUndefined()
  await ui.unmount()
})

test('files an agent edits show, with a warning when another busy agent edits one too', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Fix login', description: 'Fix login', subagentType: 'build-error-resolver' } as never)
  await $.agent.spawn({ prompt: 'Tidy auth', description: 'Tidy auth', subagentType: 'refactor-cleaner', parentAgentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/src/auth.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/src/auth.ts', agentId: 'a2' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1 file: auth\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /auth\.ts is also being edited by/ })).toBeDefined()
  await ui.unmount()

  // A second file joins the first rather than replacing it.
  await $.tool.call({ tool: 'Write', file_path: 'C:/repo/src/session.ts', agentId: 'a1' } as never)
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await again.find({ type: 'Text', text: /2 files: session\.ts, auth\.ts/ })).toBeDefined()
  await again.unmount()
})

test('a long report shows one sentence and opens in full', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Find auth', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.turn.complete({ answer: 'Found three handlers. The second one skips the token check entirely.', durationMs: 5, isAborted: false, turnId: 'x1', agentId: 'a1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-done' })
  expect(await ui.find({ type: 'Text', text: /Found three handlers\.$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /skips the token check/ })).toBeUndefined()
  await ui.press({ key: 'more-done-a1' })
  expect(await ui.find({ type: 'Text', text: /skips the token check/ })).toBeDefined()
  await ui.unmount()
})

test('agents finished in earlier sessions in this folder show under Done, and new ones are kept', async ($, on) => {
  const kept: unknown[] = []
  const old = {
    id: 'old1', parentId: 'main', seq: 1, label: '#1', type: 'Plan', task: 'Plan the booking flow', status: 'done',
    startedAt: Date.now() - 90_000_000, endedAt: Date.now() - 86_400_000, skills: [], toolCount: 4, toolTimes: [],
    report: 'Plan ready.', folder: 'C:/Repo',
  }
  engine(on)
  on('store.get', (_, e) => ({ value: e.key === 'history' ? [old, { ...old, id: 'elsewhere', folder: 'C:/other' }] : undefined }))
  on('store.set', (_, e) => {
    if (e.key === 'history') kept.push(e.value)
    return { value: undefined }
  })
  // The same folder, written the other way round: case and slashes differ.
  await $.session.start({ cwd: 'c:\\repo\\', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Find auth', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 'x1', agentId: 'a1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-done' })
  expect(await ui.find({ type: 'Text', text: /Earlier campaigns here/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Plan the booking flow/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 d ago/ })).toBeDefined()
  await ui.unmount()
  expect(JSON.stringify(kept)).toContain('"id":"a1"')
})

test('signals: first sentence of a report', () => {
  expect(firstSentence('## Found it. Then more.')).toBe('Found it.')
  expect(firstSentence('no stop here\nsecond line')).toBe('no stop here')
})

test('an open child session that is not working waits under Live, not Done', async ($, on) => {
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
            { sessionId: 'local_1', title: 'Build #100', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
            { sessionId: 'local_2', title: 'Build #86', isRunning: false, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
            { sessionId: 'local_3', title: 'Refine #68', isRunning: false, isArchived: true, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
          ]),
        }
      : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'tab-live' }))?.text).toContain('(2)')
  expect(await ui.find({ type: 'Text', text: /Build #86/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Standing by for orders/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Refine #68/ })).toBeUndefined()
  await ui.press({ key: 'tab-done' })
  expect(await ui.find({ type: 'Text', text: /Refine #68/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Build #86/ })).toBeUndefined()
  await ui.unmount()
})

test("a child session whose turn ended but whose agent still works counts as busy", async ($, on) => {
  const snapshot = {
    id: 'local_1',
    updatedAt: Date.now(),
    isMainBusy: false,
    agents: [
      { id: 'c1', parentId: 'main', seq: 1, label: '#1', type: 'architect', task: 'Design suppliers', status: 'running', startedAt: Date.now() - 4000, lastActivityAt: Date.now(), skills: [], tool: 'Read', toolDetail: 'src/suppliers.ts', toolCount: 3, toolTimes: [] },
    ],
    skills: [],
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
            { sessionId: 'local_1', title: 'Build #86', isRunning: false, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
          ]),
        }
      : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /On manoeuvres/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Standing by/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Reading the dispatches|Listening to the Navajo code talkers/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /missing in action/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /now: Read · src\/suppliers\.ts/ })).toBeDefined()
  await ui.unmount()
})

test('roster: ends the pane missed, idle teammates and unseen agents', () => {
  const now = 1_000
  const row = (id: string, status: 'running' | 'done' = 'running') => ({
    id, parentId: 'main', seq: 1, label: '#1', type: 'Explore', task: 't', status, startedAt: 0, skills: [], toolCount: 0, toolTimes: [],
  })
  const out = reconcile(
    [row('a1'), row('a2'), row('a3', 'done')],
    [
      { id: 'a1', description: 'x', type: 'Explore', status: 'killed' },
      { id: 'a2', description: 'x', type: 'teammate', status: 'idle' },
      { id: 'f1', description: 'Forked skill', type: 'fork', status: 'running', parentId: 'a2' },
    ],
    now,
  )
  expect(out.find(r => r.id === 'a1')?.status).toBe('aborted')
  expect(out.find(r => r.id === 'a2')?.engineStatus).toBe('idle')
  expect(phaseOf(out.find(r => r.id === 'a2') ?? row('x'), now)).toBe('quiet')
  expect(out.find(r => r.id === 'a3')?.status).toBe('done')
  expect(out.find(r => r.id === 'f1')?.parentId).toBe('a2')
  expect(out.find(r => r.id === 'f1')?.task).toBe('Forked skill')
})

test('roster: a row from another version is made whole', () => {
  expect(normalizeRow({ id: 'x', status: 'weird' })?.status).toBe('done')
  expect(normalizeRow({ id: 'x' })?.skills).toEqual([])
  expect(normalizeRow({ nope: true })).toBeUndefined()
})

test('an agent whose steps arrive without a spawn still shows', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Grep', pattern: 'paint', agentId: 'wf1' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /workflow agent/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /now: Grep · paint/ })).toBeDefined()
  await ui.unmount()
})

test("a child session's snapshot from another version does not break the pane", async ($, on) => {
  const snapshot = {
    id: 'local_1',
    updatedAt: Date.now(),
    isMainBusy: true,
    agents: [{ id: 'c1', status: 'running', task: 'Old-style row' }],
    skills: [{ name: 'tdd' }],
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
            { sessionId: 'local_1', title: 'Old child', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
          ]),
        }
      : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Old child/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Old-style row/ })).toBeDefined()
  await ui.unmount()
})

test("a child session lists only the sessions it started, not its siblings", async ($, on) => {
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', (_, e) =>
    e.tool === 'mcp__ccd_session_mgmt__get_session'
      ? { result: {}, text: JSON.stringify({ sessionId: 'local_me', parentSessionId: 'local_boss' }) }
      : e.tool === 'mcp__ccd_session_mgmt__list_sessions'
        ? {
            result: {},
            text: JSON.stringify([
              { sessionId: 'local_boss', title: 'Orchestrator', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString() },
              { sessionId: 'local_sib', title: 'Sibling build', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_boss' },
              { sessionId: 'local_kid', title: 'My own helper', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
            ]),
          }
        : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Learning its own id runs beside the start; the next share tick asks again.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 50))
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', title: 'x' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /My own helper/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sibling build/ })).toBeUndefined()
  await ui.unmount()
})

test('a child session opens in full: every agent, its messages and its report', async ($, on) => {
  const snapshot = {
    id: 'local_1',
    updatedAt: Date.now(),
    isMainBusy: true,
    mainTool: 'Bash',
    mainTokens: 2_000,
    agents: [
      { id: 'c1', parentId: 'main', seq: 1, label: '#1', type: 'builder', task: 'Build the paint rule', status: 'done', startedAt: Date.now() - 9000, endedAt: Date.now() - 5000, skills: [], toolCount: 9, toolTimes: [], tokens: 1_000, files: ['C:/r/src/paint.ts'] },
      { id: 'c2', parentId: 'main', seq: 2, label: '#2', type: 'reviewer', task: 'Review the diff', status: 'running', startedAt: Date.now() - 4000, lastActivityAt: Date.now(), skills: [], tool: 'Read', toolCount: 2, toolTimes: [] },
    ],
    handovers: [
      { at: Date.now() - 6000, from: 'c1', to: 'main', kind: 'report', text: 'Paint rule built and tested. All 12 tests pass.' },
      { at: Date.now() - 2000, from: 'c2', to: 'c1', kind: 'message', text: 'Why is the guard inverted?' },
    ],
    skills: [{ at: Date.now() - 3000, agentId: 'c2', name: 'code-review' }],
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
            { sessionId: 'local_1', title: 'Build #100', isRunning: true, isArchived: false, prNumber: 7, prState: 'OPEN', lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
          ]),
        }
      : { result: {}, text: '{}' },
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Under its row only the work in progress shows.
  expect(await ui.find({ type: 'Text', text: /Build the paint rule/ })).toBeUndefined()
  await ui.press({ key: 'session-local_1' })
  expect(await ui.find({ type: 'Text', text: /Build the paint rule/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Paint rule built and tested\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Why is the guard inverted/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 file: paint\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Σ 3\.0k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PR #7/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /code-review/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'tab-live' })).toBeDefined()
  await ui.unmount()
})

test("a child session's turn can be stopped (after a confirm) and sent a message", async ($, on) => {
  const calls: { tool: string; input: string }[] = []
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'agent-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', (_, e) => {
    if (e.tool === 'mcp__ccd_session_mgmt__list_sessions') {
      return {
        result: {},
        text: JSON.stringify([
          { sessionId: 'local_1', title: 'Build #100', isRunning: true, isArchived: false, lastActivityAt: new Date().toISOString(), startedBy: 'local_me' },
        ]),
      }
    }
    calls.push({ tool: e.tool, input: JSON.stringify(e) })
    return { result: {}, text: 'ok (delivery: queued; message_id: m1)' }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'session-local_1' })
  await ui.press({ key: 'stop-local_1' })
  expect(await ui.find({ type: 'Text', text: /Halt Build #100's current advance\?/ })).toBeDefined()
  expect(calls.some(c => c.tool.endsWith('stop_session'))).toBe(false)
  await ui.press({ key: 'stop-yes' })
  expect(calls.find(c => c.tool.endsWith('stop_session'))?.input).toContain('"session_id":"local_1"')

  await ui.input({ key: 'message-local_1-0', text: 'Please rebase on main first.' })
  const sent = calls.find(c => c.tool.endsWith('send_message'))
  expect(sent?.input).toContain('Please rebase on main first.')
  expect(sent?.input).toContain('"session_id":"local_1"')
  await ui.unmount()
})

test('on desktop Live is a flowchart of the work in progress, and the switch brings back the text view', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Find auth handlers', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'auth', agentId: 'a1' })
  await $.agent.spawn({ prompt: 'Dig deeper', description: 'Dig <deeper>', subagentType: 'Plan', parentAgentId: 'a1' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const chart = await ui.find({ type: 'Svg' })
  const source = String(chart?.props.source ?? '')
  expect(source).toContain('War Room')
  expect(source).toContain('Explore')
  expect(source).toContain('Plan')
  // A live line into each agent at work, and the task in a hover, escaped.
  expect(source.match(/class="live"/g)?.length).toBe(2)
  expect(source).toContain('Dig &lt;deeper&gt;')
  expect(await ui.find({ key: 'agent-a2' })).toBeDefined()

  await ui.press({ key: 'layout' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^ SUB-AGENT $/ })).toBeDefined()
  await ui.unmount()
})

test('a terminal pane has no flowchart and no switch', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Find auth', description: 'Find auth', subagentType: 'Explore' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ key: 'layout' })).toBeUndefined()
  await ui.unmount()
})

test('flowchart: children sit right of their parent, a session is a lane', () => {
  const { placed, width } = layoutFlow([
    { id: 'main', title: 'War Room', line: '', state: 'main', tip: '' },
    { id: 'a1', parentId: 'main', title: 'Explore', line: '', state: 'working', tip: '' },
    { id: 'a2', parentId: 'a1', title: 'Plan', line: '', state: 'waiting', tip: '' },
    { id: 's1', parentId: 'main', title: 'Build #100', line: '', state: 'session', tip: '', lane: [{ depth: 0, title: 'Architect', line: 'x', state: 'working', tip: '' }] },
  ])
  const at = (id: string) => placed.find(p => p.node.id === id)
  expect((at('a1')?.x ?? 0) > (at('main')?.x ?? 0)).toBe(true)
  expect((at('a2')?.x ?? 0) > (at('a1')?.x ?? 0)).toBe(true)
  expect(at('s1')?.x).toBe(at('a1')?.x)
  expect((at('s1')?.h ?? 0) > (at('a1')?.h ?? 0)).toBe(true)
  // Two siblings never overlap.
  const a1 = at('a1')
  const s1 = at('s1')
  expect(a1 && s1 && (a1.y + a1.h <= s1.y || s1.y + s1.h <= a1.y)).toBe(true)
  expect(width > 0).toBe(true)
  expect(flowchartSvg([]).startsWith('<svg')).toBe(true)
})

test('the flowchart keeps the same source while nothing changes, and is sized to the pane', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Find auth', description: 'Find auth', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'auth', agentId: 'a1' })

  const first = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = await first.find({ type: 'Svg' })
  await first.unmount()
  await new Promise<void>(resolve => setTimeout(() => resolve(), 1_100))
  const second = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const after = await second.find({ type: 'Svg' })
  await second.unmount()

  expect(after?.props.source).toBe(before?.props.source)

  // A new step changes the text under the drawing, not the drawing.
  await $.tool.call({ tool: 'Read', file_path: 'src/auth.ts', agentId: 'a1' } as never)
  const third = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await third.find({ type: 'Svg' }))?.props.source).toBe(before?.props.source)
  expect(await third.find({ type: 'Text', text: /now: Read · src\/auth\.ts/ })).toBeDefined()
  await third.unmount()
  // One to one in pixels, no wider than the pane (60 cells here).
  expect(typeof before?.props.width).toBe('number')
  expect(Number(before?.props.width) <= 60 * 7.5).toBe(true)
  expect(Number(before?.props.height) > 0).toBe(true)
})

test('flowchart: in a narrow pane deeper agents stack under their parent instead of on it', () => {
  const nodes = [
    { id: 'main', title: 'War Room', line: '', state: 'main' as const, tip: '' },
    { id: 'a1', parentId: 'main', title: 'Explore', line: '', state: 'working' as const, tip: '' },
    { id: 'a2', parentId: 'a1', title: 'Reviewer', line: '', state: 'waiting' as const, tip: '' },
  ]
  const { placed, width } = layoutFlow(nodes, 420)
  const at = (id: string) => placed.find(p => p.node.id === id)
  const a1 = at('a1')
  const a2 = at('a2')
  expect(a2?.column).toBe(a1?.column)
  expect((a2?.x ?? 0) > (a1?.x ?? 0)).toBe(true)
  expect((a2?.y ?? 0) >= (a1?.y ?? 0) + (a1?.h ?? 0)).toBe(true)
  expect(width <= 420).toBe(true)
  // Wide enough, each level gets its own column.
  const wide = layoutFlow(nodes, 900)
  expect(wide.placed.find(p => p.node.id === 'a2')?.column).toBe(2)
})
