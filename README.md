# sdlc-monitor

A live pane, "Operations Room", that shows where each ticket of the current repository stands in the AI-SDLC. It sits next to the agent-monitor pane.

- **Flow line**: how many tickets sit at each stage: to refine → refined → building → PR → ready → merged.
- **Needs you**: what only you can do. A green PR waits to be merged, a PR is merged but its issue is still open, a session sits idle on a ticket, or a red or conflicting PR has no session working on it.
- **Stages**: each ticket with its size, PR and CI status, and whether a session is working on it. Press a stage title to fold it. Press the time in the header to refresh.

Where the data comes from: `git` finds the repository (worktrees included), `gh` reads the issues (labels `to-refine`, `refined`, `size:n`, `spike`) and the pull requests every 60 s, and the desktop app's `list_sessions` tool is read every 10 s to link sessions to tickets by branch (`claude/16-…`) or title (`#16`). Session polling only runs when that tool is allowed without a prompt.

Command: `/sdlc-monitor`. Needs `gh` signed in.
