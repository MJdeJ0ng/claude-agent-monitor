# Claude Code mods: agent-monitor and sdlc-monitor

Two companion mods for Claude Code, each a live pane beside the chat. Install one or both from this repository's marketplace.

| Mod | What it shows | Command |
| --- | --- | --- |
| [agent-monitor](agent-monitor/README.md) | The agents, sub-agents and child sessions at work: their tasks, skills, files, handovers and what waits on you. | `/agent-monitor` |
| [sdlc-monitor](sdlc-monitor/README.md) | Where each ticket of the current repository stands in the AI-SDLC: merged, ready to merge, in review, building, refined, to refine, plus what waits on you and the next five tickets in plan order. | `/sdlc-monitor` |

## Install

At the prompt of a terminal session, one line per mod:

```
/plugin install agent-monitor --marketplace MJdeJ0ng/claude-agent-monitor
/plugin install sdlc-monitor --marketplace MJdeJ0ng/claude-agent-monitor
```

Answer `y` to add the marketplace (once), then pick a scope (user is first).

From a shell:

```
claude plugin install agent-monitor --marketplace MJdeJ0ng/claude-agent-monitor
claude plugin install sdlc-monitor --marketplace MJdeJ0ng/claude-agent-monitor
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MJdeJ0ng/claude-agent-monitor`, then Add plugin for each mod.

sdlc-monitor needs the GitHub CLI (`gh`) signed in.
