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
exports.findRepo = findRepo;
exports.setDemo = setDemo;
exports.refreshBoard = refreshBoard;
exports.refreshSessions = refreshSessions;
var claude_code_1 = require("claude-code");
var demo_1 = require("./demo");
var pipeline_1 = require("./pipeline");
var state_1 = require("./state");
// Reads the pipeline from outside: git for the repository, gh for tickets and
// pull requests, the app for the sessions working on them.
var EMPTY = { repo: '', root: '', fetchedAt: 0, issues: [], prs: [] };
var board = (0, claude_code_1.atom)({ plugin: 'sdlc-monitor', key: 'board' }, EMPTY, { shape: state_1.SHAPES.board });
var sessions = (0, claude_code_1.atom)({ plugin: 'sdlc-monitor', key: 'sessions' }, [], {
    shape: state_1.SHAPES.sessions,
});
var ISSUE_FIELDS = 'number,title,labels,updatedAt,closedAt';
var PR_FIELDS = 'number,title,headRefName,state,isDraft,mergeable,statusCheckRollup,closingIssuesReferences,mergedAt,updatedAt,url';
function run($, argv, cwd) {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.process.run(argv, { cwd: cwd, timeoutMs: state_1.GH_TIMEOUT_MS })];
                case 1:
                    res = _a.sent();
                    if (res.exitCode !== 0)
                        throw new Error(res.stderr.trim().split('\n')[0] || "".concat(argv[0], " exited ").concat(res.exitCode));
                    return [2 /*return*/, res.stdout.trim()];
            }
        });
    });
}
// The main checkout's folder (a worktree's common .git sits in it) and the
// branch this session is on.
function findRepo($) {
    return __awaiter(this, void 0, void 0, function () {
        var common, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (state_1.live.root)
                        return [2 /*return*/, true];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, run($, ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], state_1.live.cwd)];
                case 2:
                    common = _c.sent();
                    state_1.live.root = common.replace(/[\\/]\.git$/, '');
                    _a = state_1.live;
                    return [4 /*yield*/, run($, ['git', 'branch', '--show-current'], state_1.live.cwd).catch(function () { return ''; })];
                case 3:
                    _a.branch = _c.sent();
                    return [2 /*return*/, true];
                case 4:
                    _b = _c.sent();
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function fail($, error) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.update)($, board, function (b) { return (__assign(__assign({}, b), { root: state_1.live.root, fetchedAt: Date.now(), error: error })); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Fills the pane with made-up tickets, or goes back to the tracker.
function setDemo($, isOn) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    state_1.live.isDemo = isOn;
                    if (!isOn) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, claude_code_1.update)($, board, function () { return (0, demo_1.demoBoard)(Date.now()); })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, sessions, function () { return (0, demo_1.demoSessions)(); })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
                case 3: return [4 /*yield*/, (0, claude_code_1.update)($, board, function () { return EMPTY; })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, sessions, function () { return []; })];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, refreshBoard($)];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, refreshSessions($)];
                case 7:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function refreshBoard($) {
    return __awaiter(this, void 0, void 0, function () {
        var at, _a, _b, open_1, closed_1, prs, next_1, err_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!state_1.live.isDemo) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, claude_code_1.update)($, board, function () { return (0, demo_1.demoBoard)(Date.now()); })];
                case 1:
                    _c.sent();
                    return [2 /*return*/];
                case 2:
                    if (state_1.live.isFetchingBoard)
                        return [2 /*return*/];
                    state_1.live.isFetchingBoard = true;
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 11, 13, 14]);
                    return [4 /*yield*/, findRepo($)];
                case 4:
                    if (!!(_c.sent())) return [3 /*break*/, 6];
                    return [4 /*yield*/, fail($, 'This session is not inside a git repository.')];
                case 5: return [2 /*return*/, _c.sent()];
                case 6:
                    at = state_1.live.root;
                    if (!!state_1.live.repo) return [3 /*break*/, 8];
                    _a = state_1.live;
                    return [4 /*yield*/, run($, ['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], at)];
                case 7:
                    _a.repo = _c.sent();
                    _c.label = 8;
                case 8: return [4 /*yield*/, Promise.all([
                        run($, ['gh', 'issue', 'list', '--state', 'open', '--limit', '200', '--json', ISSUE_FIELDS], at),
                        run($, ['gh', 'issue', 'list', '--state', 'closed', '--limit', '20', '--json', ISSUE_FIELDS], at),
                        run($, ['gh', 'pr', 'list', '--state', 'all', '--limit', '40', '--json', PR_FIELDS], at),
                    ])];
                case 9:
                    _b = _c.sent(), open_1 = _b[0], closed_1 = _b[1], prs = _b[2];
                    next_1 = {
                        repo: state_1.live.repo,
                        root: at,
                        fetchedAt: Date.now(),
                        issues: __spreadArray(__spreadArray([], (0, pipeline_1.parseIssues)(open_1, false), true), (0, pipeline_1.parseIssues)(closed_1, true), true),
                        prs: (0, pipeline_1.parsePrs)(prs),
                    };
                    return [4 /*yield*/, (0, claude_code_1.update)($, board, function () { return next_1; })];
                case 10:
                    _c.sent();
                    return [3 /*break*/, 14];
                case 11:
                    err_1 = _c.sent();
                    return [4 /*yield*/, fail($, "gh could not read the tracker: ".concat(err_1 instanceof Error ? err_1.message : String(err_1)))];
                case 12:
                    _c.sent();
                    return [3 /*break*/, 14];
                case 13:
                    state_1.live.isFetchingBoard = false;
                    return [7 /*endfinally*/];
                case 14: return [2 /*return*/];
            }
        });
    });
}
// The app's sessions in this repository, its worktrees included. Polled only
// where the permission check allows it without asking, so it never opens a
// dialog. This session itself is not in the app's list: its branch stands in.
function refreshSessions($) {
    return __awaiter(this, void 0, void 0, function () {
        var self_1, input, decision, res, text, found_1, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (state_1.live.isDemo || state_1.live.isFetchingSessions || !state_1.live.root)
                        return [2 /*return*/];
                    state_1.live.isFetchingSessions = true;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 7, 8, 9]);
                    self_1 = (0, pipeline_1.issueOfBranch)(state_1.live.branch) !== undefined
                        ? [{ id: 'self', title: 'this session', branch: state_1.live.branch, isRunning: true, isSelf: true }]
                        : [];
                    input = { limit: 50 };
                    return [4 /*yield*/, $.tool.check({ tool: state_1.LIST_SESSIONS_TOOL, input: input })];
                case 2:
                    decision = (_b.sent()).decision;
                    if (!(decision !== 'allow')) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, claude_code_1.update)($, sessions, function () { return self_1; })];
                case 3:
                    _b.sent();
                    return [2 /*return*/];
                case 4: return [4 /*yield*/, $.tool.call(__assign({ tool: state_1.LIST_SESSIONS_TOOL }, input))];
                case 5:
                    res = _b.sent();
                    text = 'text' in res && typeof res.text === 'string' ? res.text : '';
                    found_1 = (0, pipeline_1.parseSessions)(text, state_1.live.root);
                    return [4 /*yield*/, (0, claude_code_1.update)($, sessions, function () { return __spreadArray(__spreadArray([], self_1, true), found_1, true); })];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 9];
                case 7:
                    _a = _b.sent();
                    return [3 /*break*/, 9];
                case 8:
                    state_1.live.isFetchingSessions = false;
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
