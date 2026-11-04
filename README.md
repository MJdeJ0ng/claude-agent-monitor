# agent-monitor

A live pane inside Claude Code that shows which agents and sub-agents are running, the task each was given, the skills each has used, and the handovers between them: task briefs going down, messages sideways, reports coming back.

- **● Live / ✓ Done tabs**: the live tree shows only agents at work (with the agents above them for context); Done is the history of finished agents, newest first.
- **AGENT / SUB-AGENT labels**: AGENT = started by the main session, SUB-AGENT = started by another agent.
- **📯 Needs you**: agents and child sessions waiting for your permission answer sit at the top, longest wait first, with one short bugle call and a toast when a wait starts (the main session's own question is already in front of you, so it is left out).
- **Four states**: ● on the move, ◐ needs you, ○ radio silence (no step or tool for 1.5 minutes while nothing runs), ✕ in trouble; 🔁 marks an agent repeating the same call.
- **Tokens**: per agent, from each model step, with Σ adding up everything under an agent; the detail view also shows the model.
- **Reports**: a finished agent shows the first sentence of its report; ▾ full report opens the rest, and the detail view shows it whole.
- **✏️ Files**: the files each agent wrote or edited, with ⚠️ when another agent at work is editing the same file.
- **📜 History**: finished agents are kept across restarts; the Done tab lists those from earlier sessions in the same folder.
- **🗣 Plain words**: one button swaps the WW2 wording for plain words ("Running a command" instead of "Storming the beaches"); the choice is remembered.
- **Session view**: click a child session for all of it: every agent (at work and done), their files, the messages between them, their reports, its tokens, PR and skills. Under its row in the list only the work in progress shows. A child session lists only the sessions it started itself, not its siblings.
- **✋ Stop and 💬 message**: in a child session's view, stop the turn it is running (after a confirm) or send it a message; both go through the app's own session tools and their permission rules.
- **Robust**: every 10 seconds the pane checks its rows against the engine's own list of agents, so an end it missed (after a reload or a crash) still shows; agents that start without a spawn it saw (a workflow's, a forked skill) get a row of their own; its bookkeeping never blocks a tool call; and snapshots from sessions on another version of the mod are read safely.
- **Detail view**: click an agent's name for its full task, a timeline of tools, skills, sub-agents and reports, and a button that opens its transcript.
- **Skills**: which skill was used, by whom, and when.
- **Sessions**: sessions started from this one (an orchestrator's workers) are listed with their status and PR; where they run the mod too, their own agents, sub-agents, skills and current activity show under their row. Each session shares this through a small file in `~/.claude/agent-monitor-live/`.

The wording has a light WW2 flavour, from Europe and the Pacific: the main session is the War Room, a search is "Cracking Enigma" or "Decoding JN-25 at Station Hypo", a shell command is "Storming the beaches" or "Invading Poland", loading a skill is "Annexing Czechoslovakia", starting an agent is "Assembling the fleet", and a finished agent is "mission accomplished".

Open it with the `/agent-monitor` command; it also opens at session start and updates as work happens.

## Install

At the prompt of a terminal session:

```
/plugin install agent-monitor --marketplace MJdeJ0ng/claude-agent-monitor
```

Answer `y` to add the marketplace, then pick a scope (user is first).

From a shell:

```
claude plugin install agent-monitor --marketplace MJdeJ0ng/claude-agent-monitor
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MJdeJ0ng/claude-agent-monitor`, then Add plugin.
