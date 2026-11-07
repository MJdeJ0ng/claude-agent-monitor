"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoSessions = exports.demoBoard = void 0;
// Made-up tickets for `/sdlc-monitor demo`: one or more at every stage and
// every kind of "needs you", so the pane can be seen without a real tracker.
var H = 3600000;
var issue = function (number, title, labels, hoursAgo, now, isClosed) {
    if (isClosed === void 0) { isClosed = false; }
    return ({
        number: number,
        title: title,
        labels: labels,
        isClosed: isClosed,
        at: now - hoursAgo * H,
    });
};
var pr = function (number, issueNo, slug, over, hoursAgo, now) { return (__assign({ number: number, title: "feat: ".concat(slug), branch: "claude/".concat(issueNo, "-").concat(slug, "-a1b2c3"), state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', checks: 'pass', closes: [issueNo], url: '', at: now - hoursAgo * H }, over)); };
var demoBoard = function (now) { return ({
    repo: 'demo/operation-overlord',
    root: 'demo',
    fetchedAt: now,
    isDemo: true,
    issues: [
        issue(101, 'Export the BOM to Excel', ['to-refine'], 30, now),
        issue(102, 'Preferred supplier and offering', ['to-refine'], 52, now),
        issue(103, 'Dark mode for the drawing canvas', ['to-refine'], 70, now),
        issue(104, 'Spike: offline sync with CRDTs', ['spike', 'to-refine'], 8, now),
        issue(110, 'Show the four poll steps per segment', ['refined', 'size:3'], 20, now),
        issue(111, 'Default offering in the catalogue API', ['refined', 'size:2'], 26, now),
        issue(112, 'Let a visitor take the practice check', ['refined', 'size:8'], 40, now),
        issue(120, 'Dashboard with a benchmark and its source', ['refined', 'size:5'], 0.2, now),
        issue(121, 'Trim the username on login', ['refined', 'size:2'], 3, now),
        issue(130, 'Terrain surfaces stand out on the 2D drawing', ['refined', 'size:3'], 1, now),
        issue(131, 'Expired session and offline actions', ['refined', 'size:5'], 2, now),
        issue(132, 'Select, resize and cut tiles', ['refined', 'size:8'], 5, now),
        issue(133, 'BOM view', ['refined', 'size:5'], 0.5, now),
        issue(140, 'Placed items take the default offering', ['refined', 'size:3'], 1.5, now),
        issue(141, 'Landing page layout', ['refined', 'size:3'], 4, now),
        issue(150, 'Account and login', ['refined', 'size:5'], 18, now, true),
        issue(151, 'Design base', ['refined', 'size:2'], 40, now, true),
    ],
    prs: [
        pr(201, 130, 'terrain-surfaces', { checks: 'pending' }, 0.3, now),
        pr(202, 131, 'expired-session', { checks: 'fail' }, 1.2, now),
        pr(203, 132, 'tiles', { mergeable: 'CONFLICTING' }, 3, now),
        pr(204, 133, 'bom-view', { isDraft: true, checks: 'pending' }, 0.1, now),
        pr(205, 140, 'default-offering', {}, 0.8, now),
        pr(206, 141, 'landing-layout', { state: 'MERGED', mergeable: 'UNKNOWN' }, 2, now),
        pr(207, 150, 'account-and-login', { state: 'MERGED', mergeable: 'UNKNOWN' }, 18, now),
        pr(208, 151, 'design-base', { state: 'MERGED', mergeable: 'UNKNOWN' }, 40, now),
    ],
}); };
exports.demoBoard = demoBoard;
var demoSessions = function () { return [
    { id: 'demo-1', title: 'Build #120 dashboard', branch: 'claude/120-dashboard-a1b2c3', isRunning: true },
    { id: 'demo-2', title: 'Build #121 login trim', branch: 'claude/121-login-a1b2c3', isRunning: false },
    { id: 'demo-3', title: 'Build #130 terrain', branch: 'claude/130-terrain-surfaces-a1b2c3', isRunning: true },
    { id: 'demo-4', title: 'Build #133 BOM view', branch: 'claude/133-bom-view-a1b2c3', isRunning: true },
    { id: 'demo-5', title: 'Refine #104 offline sync', isRunning: true },
]; };
exports.demoSessions = demoSessions;
