import type { AgentStatus } from '../types'

// Every word the pane shows that carries the WW2 theme, with a plain twin for
// teams that would rather read "Searching" than "Cracking Enigma". The pane
// picks one set; nothing else in it names the theme.

type Ended = Record<Exclude<AgentStatus, 'running'>, { icon: string; label: string; color: string }>

export type Words = {
  hq: string
  verbs: [RegExp, string[]][]
  idleVerbs: string[]
  warmup: string
  ended: Ended
  home: (who: string) => string
  awaitingNews: string
  teaTime: string
  busyItself: string
  allQuiet: string
  nobodyHome: string
  sessionsLive: string
  sessionsDone: string
  sessionWorking: string
  sessionDone: string
  sessionIdle: string
  kitLive: string
  kitAll: string
  noKit: string
  diary: string
  noDiary: string
  back: string
  rations: string
  silence: string
  loop: string
  missing: string
  earlier: string
  switchLabel: string
  stop: string
  stopAsk: (title: string) => string
  stopYes: string
  cancel: string
  messageHint: string
}

export const WAR: Words = {
  hq: 'War Room',
  // What an agent is "doing", by the tool it last reached for: a few lines per
  // tool, from Europe and the Pacific.
  verbs: [
    [/^(Grep|Glob)$/, ['Cracking Enigma', 'Decoding JN-25 at Station Hypo', 'Scouting from a PBY Catalina']],
    [/^Read$/, ['Reading the dispatches', 'Listening to the Navajo code talkers']],
    [/^(Edit|Write|NotebookEdit)$/, ['Typing away at Bletchley Park', 'Building airstrips with the Seabees']],
    [/^(Bash|PowerShell)$/, ['Storming the beaches', 'Invading Poland', 'Island-hopping across the Pacific']],
    [/^Web/, ['Tuning in to Radio London', 'Tuning in to Tokyo Rose']],
    [/^Agent$/, ['Calling in the Yanks', 'Assembling the fleet']],
    [/^Skill$/, ['Consulting the War Cabinet', 'Annexing Czechoslovakia']],
    [/^SendMessage$/, ['Wiring a telegram', 'Signalling by Aldis lamp']],
    [/^Workflow$/, ['Coordinating the D-Day landings', 'Running the convoy system']],
    [/^Team|^SendMessage$/, ['Briefing the Combined Chiefs']],
    [/^Task(Create|Update|List|Get|Stop|Output)$/, ['Moving pins on the map table']],
    [/^(ScheduleWakeup|Cron)/, ['Synchronising watches']],
    [/^Monitor$/, ['Manning the radar at Bawdsey']],
    [/plan|Todo/i, ['Drawing up Operation Overlord', 'Planning the Doolittle Raid']],
    [/^mcp__/, ['Ringing Washington', 'Radioing Pearl Harbor']],
  ],
  idleVerbs: ['Keeping calm and carrying on', 'Holding Guadalcanal'],
  warmup: 'Mustering at Dover',
  ended: {
    done: { icon: '✓', label: 'mission accomplished', color: 'green' },
    aborted: { icon: '✋', label: 'evacuated at Dunkirk', color: 'yellow' },
    error: { icon: '💥', label: 'sunk in the Channel', color: 'red' },
    denied: { icon: '⛔', label: 'vetoed by Churchill', color: 'red' },
  },
  home: who => `🎉 ${who} is home: V-Day!`,
  awaitingNews: 'Awaiting news from the front',
  teaTime: '☕ Tea time in the War Room',
  busyItself: '🌱 The War Room is busy itself; no agents or sessions in the field.',
  allQuiet: '🌱 All quiet on every front. Finished agents are under ✓ Done.',
  nobodyHome: 'Nobody has come home yet.',
  sessionsLive: '🪟 Sessions in the field',
  sessionsDone: '🪟 Sessions back home',
  sessionWorking: 'On manoeuvres',
  sessionDone: '✓ demobbed',
  sessionIdle: 'Standing by for orders',
  kitLive: '🎒 Kit in use',
  kitAll: '🎒 Kit issued · who, what, when',
  noKit: 'No kit issued yet.',
  diary: '⏱ War diary',
  noDiary: 'No dispatches yet.',
  back: '← Back to HQ',
  rations: 'Rations',
  silence: 'Radio silence',
  loop: 'circling the airfield',
  missing: 'missing in action',
  earlier: '📜 Earlier campaigns here',
  switchLabel: '🗣 Plain words',
  stop: '✋ Order a halt',
  stopAsk: title => `Halt ${title}'s current advance?`,
  stopYes: 'Yes, halt',
  cancel: 'Stand fast',
  messageHint: 'Send a telegram…',
}

export const PLAIN: Words = {
  hq: 'Main session',
  verbs: [
    [/^(Grep|Glob)$/, ['Searching']],
    [/^Read$/, ['Reading']],
    [/^(Edit|Write|NotebookEdit)$/, ['Editing']],
    [/^(Bash|PowerShell)$/, ['Running a command']],
    [/^Web/, ['Browsing the web']],
    [/^Agent$/, ['Starting an agent']],
    [/^Skill$/, ['Loading a skill']],
    [/^SendMessage$/, ['Sending a message']],
    [/^Workflow$/, ['Running a workflow']],
    [/^Team/, ['Coordinating the team']],
    [/^Task(Create|Update|List|Get|Stop|Output)$/, ['Updating tasks']],
    [/^(ScheduleWakeup|Cron)/, ['Scheduling']],
    [/^Monitor$/, ['Watching']],
    [/plan|Todo/i, ['Planning']],
    [/^mcp__/, ['Calling a connector']],
  ],
  idleVerbs: ['Thinking'],
  warmup: 'Starting up',
  ended: {
    done: { icon: '✓', label: 'done', color: 'green' },
    aborted: { icon: '✋', label: 'stopped', color: 'yellow' },
    error: { icon: '💥', label: 'failed', color: 'red' },
    denied: { icon: '⛔', label: 'denied', color: 'red' },
  },
  home: who => `✓ ${who} is done`,
  awaitingNews: 'Waiting for agents',
  teaTime: '○ Idle',
  busyItself: 'The main session is working itself; no agents or sessions running.',
  allQuiet: 'Nothing running. Finished agents are under ✓ Done.',
  nobodyHome: 'No agent has finished yet.',
  sessionsLive: '🪟 Sessions running',
  sessionsDone: '🪟 Sessions finished',
  sessionWorking: 'Working',
  sessionDone: '✓ finished',
  sessionIdle: 'Idle, your turn',
  kitLive: '🎒 Skills in use',
  kitAll: '🎒 Skills used · who, what, when',
  noKit: 'No skills used yet.',
  diary: '⏱ Timeline',
  noDiary: 'Nothing yet.',
  back: '← Back',
  rations: 'Tokens',
  silence: 'No activity',
  loop: 'repeating the same call',
  missing: 'no longer reporting',
  earlier: '📜 Earlier sessions here',
  switchLabel: '🎖 War words',
  stop: '✋ Stop its turn',
  stopAsk: title => `Stop the turn ${title} is running?`,
  stopYes: 'Yes, stop',
  cancel: 'Cancel',
  messageHint: 'Send a message…',
}

export const wordsFor = (isPlain: boolean): Words => (isPlain ? PLAIN : WAR)

const hash = (text: string): number => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const pick = (options: string[], seed: string): string => options[hash(seed) % options.length] ?? options[0] ?? ''

// Each agent keeps one line per tool (picked by its id), so a line does not
// flicker between redraws.
export const verbOf = (words: Words, tool: string | undefined, seed: string): string => {
  if (!tool) return words.warmup
  const options = words.verbs.find(([re]) => re.test(tool))?.[1] ?? words.idleVerbs
  return pick(options, `${seed}:${tool}`)
}
