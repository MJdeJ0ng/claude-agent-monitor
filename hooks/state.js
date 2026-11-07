"use strict";
// Constants, shape tags and what this session learns while it runs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.live = exports.SHAPES = exports.LIST_SESSIONS_TOOL = exports.NEEDS_YOU_ROWS = exports.ROWS_PER_STAGE = exports.GH_TIMEOUT_MS = exports.SESSION_POLL_MS = exports.BOARD_POLL_MS = exports.PANE = void 0;
exports.PANE = 'sdlc-monitor';
exports.BOARD_POLL_MS = 60000;
exports.SESSION_POLL_MS = 10000;
exports.GH_TIMEOUT_MS = 30000;
exports.ROWS_PER_STAGE = 8;
// Needs-you rows shown before "+n more", so the pane stays short.
exports.NEEDS_YOU_ROWS = 4;
exports.LIST_SESSIONS_TOOL = 'mcp__ccd_session_mgmt__list_sessions';
// Change a tag when a value's fields change: it declines what an earlier
// version stored, which outlives a reload. Each module that reads or writes a
// value declares its own atom under the tag named here.
exports.SHAPES = {
    board: 'board-2',
    sessions: 'sessions-1',
    open: 'open-1',
};
exports.live = {
    cwd: '',
    // The main checkout's folder, also when this session runs in a worktree.
    root: '',
    repo: '',
    // The branch this session itself is on, standing in for it in the list.
    branch: '',
    isFetchingBoard: false,
    isFetchingSessions: false,
    isPaneOpened: false,
    // While true, polling leaves the demo board alone.
    isDemo: false,
};
