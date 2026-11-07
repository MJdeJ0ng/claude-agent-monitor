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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var pipeline_1 = require("../hooks/pipeline");
var demo_1 = require("../hooks/demo");
var NOW = Date.parse('2026-11-07T12:00:00Z');
var iso = function (hoursAgo) { return new Date(NOW - hoursAgo * 3600000).toISOString(); };
var OPEN = JSON.stringify([
    { number: 16, title: 'Dashboard with benchmark', labels: [{ name: 'refined' }, { name: 'size:5' }], updatedAt: iso(1) },
    { number: 15, title: 'Four poll steps', labels: [{ name: 'to-refine' }], updatedAt: iso(5) },
    { number: 12, title: 'Login trim', labels: [{ name: 'refined' }, { name: 'size:2' }], updatedAt: iso(3) },
    { number: 11, title: 'Practice check', labels: [{ name: 'refined' }, { name: 'size:3' }], updatedAt: iso(2) },
    { number: 9, title: 'Export BOM', labels: [{ name: 'refined' }], updatedAt: iso(9) },
    { number: 8, title: 'Spike on maps', labels: [{ name: 'spike' }], updatedAt: iso(9) },
]);
var CLOSED = JSON.stringify([
    { number: 5, title: 'Old one', labels: [], closedAt: iso(24) },
    { number: 4, title: 'Ancient', labels: [], closedAt: iso(24 * 30) },
]);
var PRS = JSON.stringify([
    {
        number: 40, title: 'feat: login trim', headRefName: 'claude/12-login-ab12', state: 'OPEN', isDraft: false,
        mergeable: 'MERGEABLE', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
        closingIssuesReferences: [{ number: 12 }], updatedAt: iso(1), url: 'u40',
    },
    {
        number: 41, title: 'feat: practice check', headRefName: 'claude/11-check-cd34', state: 'OPEN', isDraft: false,
        mergeable: 'MERGEABLE', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
        closingIssuesReferences: [], updatedAt: iso(1), url: 'u41',
    },
    {
        number: 39, title: 'feat: export', headRefName: 'claude/9-export', state: 'MERGED', isDraft: false,
        mergeable: 'UNKNOWN', statusCheckRollup: [], closingIssuesReferences: [{ number: 9 }], mergedAt: iso(4), url: 'u39',
    },
]);
var SESSIONS = JSON.stringify([
    { sessionId: 'local_a', title: 'Build #16 dashboard', cwd: 'C:\\Repo\\.claude\\worktrees\\16-x', branch: 'claude/16-dashboard-8da375', isRunning: true, isArchived: false },
    { sessionId: 'local_b', title: 'Refine stuff', cwd: 'C:\\Elsewhere', branch: 'claude/15-x', isRunning: false, isArchived: false },
    { sessionId: 'local_c', title: 'Old', cwd: 'C:\\Repo', branch: 'claude/11-y', isRunning: false, isArchived: true },
]);
var board = function () { return ({
    repo: 'me/repo',
    root: 'C:/Repo',
    fetchedAt: NOW,
    issues: __spreadArray(__spreadArray([], (0, pipeline_1.parseIssues)(OPEN, false), true), (0, pipeline_1.parseIssues)(CLOSED, true), true),
    prs: (0, pipeline_1.parsePrs)(PRS),
}); };
(0, testing_1.test)('reads ticket numbers from branches and titles', function () {
    (0, testing_1.expect)((0, pipeline_1.issueOfBranch)('claude/16-dashboard-8da375')).toBe(16);
    (0, testing_1.expect)((0, pipeline_1.issueOfBranch)('main')).toBeUndefined();
    (0, testing_1.expect)((0, pipeline_1.issueOfTitle)('Build #16 dashboard')).toBe(16);
    (0, testing_1.expect)((0, pipeline_1.issueOfTitle)('20261106-ORCH-x')).toBeUndefined();
});
(0, testing_1.test)('rolls checks up into one verdict', function () {
    (0, testing_1.expect)((0, pipeline_1.checksOf)([])).toBe('none');
    (0, testing_1.expect)((0, pipeline_1.checksOf)([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('pass');
    (0, testing_1.expect)((0, pipeline_1.checksOf)([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'SUCCESS' }])).toBe('pending');
    (0, testing_1.expect)((0, pipeline_1.checksOf)([{ status: 'IN_PROGRESS' }, { state: 'FAILURE' }])).toBe('fail');
});
(0, testing_1.test)('keeps only unarchived sessions in this repository and its worktrees', function () {
    var s = (0, pipeline_1.parseSessions)(SESSIONS, 'C:/Repo');
    (0, testing_1.expect)(s.map(function (x) { return x.id; })).toEqual(['local_a']);
});
(0, testing_1.test)('puts each ticket at its stage and flags what needs the person', function () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    var tickets = (0, pipeline_1.toTickets)(board(), (0, pipeline_1.parseSessions)(SESSIONS, 'C:/Repo'), NOW);
    var at = function (n) { return tickets.find(function (t) { return t.number === n; }); };
    (0, testing_1.expect)((_a = at(16)) === null || _a === void 0 ? void 0 : _a.stage).toBe('building');
    (0, testing_1.expect)((_b = at(16)) === null || _b === void 0 ? void 0 : _b.size).toBe(5);
    (0, testing_1.expect)((_c = at(15)) === null || _c === void 0 ? void 0 : _c.stage).toBe('to-refine');
    (0, testing_1.expect)((_d = at(12)) === null || _d === void 0 ? void 0 : _d.stage).toBe('ready');
    (0, testing_1.expect)((_e = at(12)) === null || _e === void 0 ? void 0 : _e.needsYou).toBe('merge PR #40');
    (0, testing_1.expect)((_f = at(11)) === null || _f === void 0 ? void 0 : _f.stage).toBe('pr');
    (0, testing_1.expect)((_g = at(11)) === null || _g === void 0 ? void 0 : _g.needsYou).toBe('CI red on PR #41, nobody on it');
    (0, testing_1.expect)((_h = at(9)) === null || _h === void 0 ? void 0 : _h.stage).toBe('merged');
    (0, testing_1.expect)((_j = at(9)) === null || _j === void 0 ? void 0 : _j.needsYou).toBe('PR #39 merged: close the issue?');
    (0, testing_1.expect)((_k = at(8)) === null || _k === void 0 ? void 0 : _k.isSpike).toBe(true);
    (0, testing_1.expect)((_l = at(5)) === null || _l === void 0 ? void 0 : _l.stage).toBe('merged');
    (0, testing_1.expect)(at(4)).toBeUndefined();
});
(0, testing_1.test)('an idle session on a refined ticket asks for the person', function () {
    var idle = [{ id: 's', title: 'Build #16', branch: 'claude/16-x', isRunning: false }];
    var t = (0, pipeline_1.toTickets)(board(), idle, NOW).find(function (x) { return x.number === 16; });
    (0, testing_1.expect)(t === null || t === void 0 ? void 0 : t.stage).toBe('building');
    (0, testing_1.expect)(t === null || t === void 0 ? void 0 : t.needsYou).toBe('session idle: waiting on you?');
});
var PANE = {
    plugin: 'sdlc-monitor',
    component: 'Pane',
    requestId: 'sdlc-monitor',
    props: { title: 'Pipeline', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
};
(0, testing_1.test)('the pane shows the flow, what needs you and the stages', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var ui, _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                on('clock.every', function () { return ({ value: undefined }); });
                on('command.register', function () { return ({ value: { command: 'sdlc-monitor' } }); });
                on('ui.open', function () { return ({ value: { isPlaced: true } }); });
                on('session.start', function (_, e) { return ({ cwd: e.cwd }); });
                on('tool.check', function () { return ({ decision: 'allow' }); });
                on('tool.call', function () { return ({ result: {}, text: SESSIONS }); });
                on('process.run', function (_, e) {
                    var cmd = e.argv.join(' ');
                    var out = cmd.includes('git-common-dir')
                        ? 'C:/Repo/.git'
                        : cmd.includes('show-current')
                            ? 'main'
                            : cmd.includes('repo view')
                                ? 'me/repo'
                                : cmd.includes('pr list')
                                    ? PRS
                                    : cmd.includes('--state closed')
                                        ? CLOSED
                                        : OPEN;
                    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } };
                });
                return [4 /*yield*/, $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
                    // Let the background fetch settle.
                ];
            case 1:
                _e.sent();
                // Let the background fetch settle.
                return [4 /*yield*/, new Promise(function (done) { return setTimeout(done, 200); })];
            case 2:
                // Let the background fetch settle.
                _e.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, PANE), { surface: 'desktop' }))];
            case 3:
                ui = _e.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /me\/repo/ })];
            case 4:
                _a.apply(void 0, [_e.sent()]).toBeDefined();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /NEEDS YOU/ })];
            case 5:
                _b.apply(void 0, [_e.sent()]).toBeDefined();
                _c = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /merge PR #40/ })];
            case 6:
                _c.apply(void 0, [_e.sent()]).toBeDefined();
                _d = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /Ready to merge/ })];
            case 7:
                _d.apply(void 0, [_e.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 8:
                _e.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('the demo board puts tickets at every stage and in needs-you', function () {
    var now = Date.now();
    var tickets = (0, pipeline_1.toTickets)((0, demo_1.demoBoard)(now), (0, demo_1.demoSessions)(), now);
    var stages = new Set(tickets.map(function (t) { return t.stage; }));
    (0, testing_1.expect)(__spreadArray([], stages, true).sort()).toEqual(['building', 'merged', 'pr', 'ready', 'refined', 'to-refine']);
    (0, testing_1.expect)(tickets.filter(function (t) { return t.needsYou; }).length).toBeGreaterThan(3);
});
(0, testing_1.test)('stages start folded to one line with their ticket numbers', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var ui, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                on('clock.every', function () { return ({ value: undefined }); });
                on('command.register', function () { return ({ value: { command: 'sdlc-monitor' } }); });
                on('ui.open', function () { return ({ value: { isPlaced: true } }); });
                on('session.start', function (_, e) { return ({ cwd: e.cwd }); });
                on('process.run', function () { return ({ value: { exitCode: 1, stdout: '', stderr: 'no repo', isStdoutTruncated: false, isStderrTruncated: false } }); });
                return [4 /*yield*/, $.session.start({ cwd: 'C:/Nowhere', surface: 'desktop', isInteractive: true })];
            case 1:
                _c.sent();
                return [4 /*yield*/, $.command.run({ command: 'sdlc-monitor', args: 'demo' })];
            case 2:
                _c.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, PANE), { surface: 'desktop' }))];
            case 3:
                ui = _c.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /▸ In review \(PR\) 4 · #\d+ #\d+/ })];
            case 4:
                _a.apply(void 0, [_c.sent()]).toBeDefined();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /▾ / })];
            case 5:
                _b.apply(void 0, [_c.sent()]).toBeUndefined();
                return [4 /*yield*/, ui.unmount()];
            case 6:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
