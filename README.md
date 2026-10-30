# agent-monitor

A live pane inside Claude Code that shows which agents and sub-agents are running, the task each was given, the skills each has used, and the handovers between them: task briefs going down, messages sideways, reports coming back.

- **● Live / ✓ Done tabs**: the live tree shows only agents at work (with the agents above them for context); Done is the history of finished agents, newest first.
- **AGENT / SUB-AGENT labels**: AGENT = started by the main session, SUB-AGENT = started by another agent.
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
