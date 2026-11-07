import type { Register } from 'claude-code'

import { findRepo, refreshBoard, refreshSessions, setDemo } from './fetch'
import { BOARD_POLL_MS, SESSION_POLL_MS, live } from './state'
import { renderPane } from './view'

// The pane's id, written here as well as in ./state: the scan reads a hook's
// matcher only from a literal or a const of this file.
const PANE = 'sdlc-monitor'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sdlc-monitor',
      description: 'Open the live SDLC pipeline of this repository (add "demo" for made-up tickets, "live" to go back)',
    })
    live.cwd = e.cwd
    // Poll the tracker slowly and the sessions often; open the pane by
    // itself only inside a repository, where there is a pipeline to show.
    void findRepo($).then(isRepo => {
      if (isRepo && !live.isPaneOpened) {
        live.isPaneOpened = true
        void $.ui.open({ id: PANE, title: 'Pipeline' })
      }
      void refreshBoard($).then(() => refreshSessions($))
    })
    $.clock.every(BOARD_POLL_MS, () => void refreshBoard($))
    $.clock.every(SESSION_POLL_MS, () => void refreshSessions($))
    return next(e)
  })

  on('command.run', { command: 'sdlc-monitor' }, async ($, e) => {
    live.isPaneOpened = true
    await $.ui.open({ id: PANE, title: 'Pipeline' })
    const arg = e.args.trim().toLowerCase()
    if (arg === 'demo' || arg === 'live') {
      await setDemo($, arg === 'demo')
      return { text: arg === 'demo' ? 'Pipeline pane opened with made-up tickets. /sdlc-monitor live goes back.' : 'Pipeline pane back on the tracker.' }
    }
    void refreshBoard($)
    return { text: 'Pipeline pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) =>
    renderPane($, $.ui.resolve(e), e.viewport?.rows ?? 30),
  )
}
