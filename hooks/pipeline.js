"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toTickets = exports.parseSessions = exports.samePath = exports.issueOfTitle = exports.issueOfBranch = exports.parsePrs = exports.checksOf = exports.parseIssues = exports.MERGED_WINDOW_MS = void 0;
// Pure logic: turn gh's JSON and the app's session list into tickets, each
// at one stage of the pipeline, with what waits on the person.
// Closed tickets stay on the board this long (ms).
exports.MERGED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
var FAILED = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'];
var PENDING = ['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED'];
var str = function (v) { return (typeof v === 'string' ? v : ''); };
var time = function (v) { return (typeof v === 'string' ? Date.parse(v) || 0 : 0); };
var parseList = function (text) {
    try {
        var parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.filter(function (x) { return !!x && typeof x === 'object'; }) : [];
    }
    catch (_a) {
        return [];
    }
};
var parseIssues = function (text, isClosed) {
    return parseList(text).flatMap(function (item) {
        if (typeof item.number !== 'number')
            return [];
        var labels = Array.isArray(item.labels) ? item.labels.map(function (l) { return str(l === null || l === void 0 ? void 0 : l.name); }).filter(Boolean) : [];
        return [{ number: item.number, title: str(item.title), labels: labels, isClosed: isClosed, at: time(isClosed ? item.closedAt : item.updatedAt) }];
    });
};
exports.parseIssues = parseIssues;
// One verdict over a PR's checks: any failure wins, then anything still running.
var checksOf = function (rollup) {
    if (!Array.isArray(rollup) || rollup.length === 0)
        return 'none';
    var states = rollup.map(function (c) {
        var r = (c !== null && c !== void 0 ? c : {});
        // A check run has status + conclusion; a commit status has state.
        if (r.state)
            return str(r.state).toUpperCase();
        if (str(r.status).toUpperCase() !== 'COMPLETED')
            return 'PENDING';
        return str(r.conclusion).toUpperCase();
    });
    if (states.some(function (s) { return FAILED.includes(s); }))
        return 'fail';
    if (states.some(function (s) { return PENDING.includes(s); }))
        return 'pending';
    return 'pass';
};
exports.checksOf = checksOf;
var parsePrs = function (text) {
    return parseList(text).flatMap(function (item) {
        if (typeof item.number !== 'number')
            return [];
        var state = str(item.state).toUpperCase();
        var closes = Array.isArray(item.closingIssuesReferences)
            ? item.closingIssuesReferences.flatMap(function (r) {
                var n = r === null || r === void 0 ? void 0 : r.number;
                return typeof n === 'number' ? [n] : [];
            })
            : [];
        return [
            {
                number: item.number,
                title: str(item.title),
                branch: str(item.headRefName),
                state: state === 'MERGED' || state === 'CLOSED' ? state : 'OPEN',
                isDraft: item.isDraft === true,
                mergeable: str(item.mergeable).toUpperCase() || 'UNKNOWN',
                checks: (0, exports.checksOf)(item.statusCheckRollup),
                closes: closes,
                url: str(item.url),
                at: time(item.mergedAt) || time(item.updatedAt),
            },
        ];
    });
};
exports.parsePrs = parsePrs;
// The ticket a branch works on: `claude/16-dashboard-8da375` → 16.
var issueOfBranch = function (branch) {
    var m = /(?:^|\/)(\d+)(?=[-_]|$)/.exec(branch !== null && branch !== void 0 ? branch : '');
    return m ? Number(m[1]) : undefined;
};
exports.issueOfBranch = issueOfBranch;
// The ticket a title names: `Build #16 dashboard` → 16.
var issueOfTitle = function (title) {
    var m = /#(\d+)\b/.exec(title !== null && title !== void 0 ? title : '');
    return m ? Number(m[1]) : undefined;
};
exports.issueOfTitle = issueOfTitle;
// Folders compared the way Windows and the app spell them.
var samePath = function (a) { return a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); };
exports.samePath = samePath;
var parseSessions = function (text, root) {
    var base = (0, exports.samePath)(root);
    return parseList(text).flatMap(function (item) {
        var cwd = (0, exports.samePath)(str(item.cwd));
        if (typeof item.sessionId !== 'string' || item.isArchived === true)
            return [];
        if (!base || !(cwd === base || cwd.startsWith("".concat(base, "/"))))
            return [];
        return [
            {
                id: item.sessionId,
                title: str(item.title) || item.sessionId,
                branch: str(item.branch) || undefined,
                isRunning: item.isRunning === true,
                prNumber: typeof item.prNumber === 'number' ? item.prNumber : undefined,
            },
        ];
    });
};
exports.parseSessions = parseSessions;
var sizeOf = function (labels) {
    var label = labels.find(function (l) { return /^size:\d+$/.test(l); });
    return label ? Number(label.slice(5)) : undefined;
};
var prIssues = function (pr) {
    var _a;
    if (pr.closes.length > 0)
        return pr.closes;
    var n = (_a = (0, exports.issueOfBranch)(pr.branch)) !== null && _a !== void 0 ? _a : (0, exports.issueOfTitle)(pr.title);
    return n === undefined ? [] : [n];
};
// Per ticket, the PR that tells most: an open one first, then the latest merged.
var prsByIssue = function (prs) {
    var rank = function (p) { return (p.state === 'OPEN' ? 2 : p.state === 'MERGED' ? 1 : 0); };
    var map = new Map();
    for (var _i = 0, prs_1 = prs; _i < prs_1.length; _i++) {
        var pr = prs_1[_i];
        for (var _a = 0, _b = prIssues(pr); _a < _b.length; _a++) {
            var n = _b[_a];
            var had = map.get(n);
            if (!had || rank(pr) > rank(had) || (rank(pr) === rank(had) && pr.at > had.at))
                map.set(n, pr);
        }
    }
    return map;
};
// Per ticket, the session on it: a running one first.
var sessionsByIssue = function (sessions, prs) {
    var _a, _b;
    var map = new Map();
    var _loop_1 = function (s) {
        var viaPr = prs.find(function (p) { return p.number === s.prNumber; });
        var n = (_b = (_a = (0, exports.issueOfBranch)(s.branch)) !== null && _a !== void 0 ? _a : (0, exports.issueOfTitle)(s.title)) !== null && _b !== void 0 ? _b : (viaPr ? prIssues(viaPr)[0] : undefined);
        if (n === undefined)
            return "continue";
        var had = map.get(n);
        if (!had || (s.isRunning && !had.isRunning))
            map.set(n, s);
    };
    for (var _i = 0, sessions_1 = sessions; _i < sessions_1.length; _i++) {
        var s = sessions_1[_i];
        _loop_1(s);
    }
    return map;
};
var isReady = function (pr) {
    return pr.state === 'OPEN' && !pr.isDraft && pr.mergeable === 'MERGEABLE' && (pr.checks === 'pass' || pr.checks === 'none');
};
var stageOf = function (issue, pr, session) {
    if (issue.isClosed || ((pr === null || pr === void 0 ? void 0 : pr.state) === 'MERGED' && !(session === null || session === void 0 ? void 0 : session.isRunning)))
        return 'merged';
    if ((pr === null || pr === void 0 ? void 0 : pr.state) === 'OPEN')
        return isReady(pr) ? 'ready' : 'pr';
    if (session && issue.labels.includes('refined'))
        return 'building';
    return issue.labels.includes('refined') ? 'refined' : 'to-refine';
};
var needsYouOf = function (issue, pr, session) {
    if (issue.isClosed)
        return undefined;
    var isWorked = (session === null || session === void 0 ? void 0 : session.isRunning) === true;
    if ((pr === null || pr === void 0 ? void 0 : pr.state) === 'OPEN') {
        if (isReady(pr))
            return "merge PR #".concat(pr.number);
        if (isWorked)
            return undefined;
        if (pr.mergeable === 'CONFLICTING')
            return "PR #".concat(pr.number, " has conflicts, nobody on it");
        if (pr.checks === 'fail')
            return "CI red on PR #".concat(pr.number, ", nobody on it");
        return undefined;
    }
    if ((pr === null || pr === void 0 ? void 0 : pr.state) === 'MERGED')
        return "PR #".concat(pr.number, " merged: close the issue?");
    if (session && !session.isRunning && !session.isSelf)
        return 'session idle: waiting on you?';
    return undefined;
};
var toTickets = function (board, sessions, now) {
    var prMap = prsByIssue(board.prs);
    var sessionMap = sessionsByIssue(sessions, board.prs);
    return board.issues
        .filter(function (i) { return !i.isClosed || now - i.at < exports.MERGED_WINDOW_MS; })
        .map(function (issue) {
        var _a;
        var pr = prMap.get(issue.number);
        var session = sessionMap.get(issue.number);
        return {
            number: issue.number,
            title: issue.title,
            stage: stageOf(issue, pr, session),
            size: sizeOf(issue.labels),
            isSpike: issue.labels.includes('spike'),
            pr: pr,
            session: session,
            needsYou: needsYouOf(issue, pr, session),
            at: Math.max(issue.at, (_a = pr === null || pr === void 0 ? void 0 : pr.at) !== null && _a !== void 0 ? _a : 0),
        };
    })
        .sort(function (a, b) { return b.at - a.at; });
};
exports.toTickets = toTickets;
