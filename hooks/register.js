"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
var fetch_1 = require("./fetch");
var state_1 = require("./state");
var view_1 = require("./view");
// The pane's id, written here as well as in ./state: the scan reads a hook's
// matcher only from a literal or a const of this file.
var PANE = 'sdlc-monitor';
var register = function (on) {
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.command.register({
                        name: 'sdlc-monitor',
                        description: 'Open the live SDLC pipeline of this repository (add "demo" for made-up tickets, "live" to go back)',
                    })];
                case 1:
                    _a.sent();
                    state_1.live.cwd = e.cwd;
                    // Poll the tracker slowly and the sessions often; open the pane by
                    // itself only inside a repository, where there is a pipeline to show.
                    void (0, fetch_1.findRepo)($).then(function (isRepo) {
                        if (isRepo && !state_1.live.isPaneOpened) {
                            state_1.live.isPaneOpened = true;
                            void $.ui.open({ id: PANE, title: 'Pipeline' });
                        }
                        void (0, fetch_1.refreshBoard)($).then(function () { return (0, fetch_1.refreshSessions)($); });
                    });
                    $.clock.every(state_1.BOARD_POLL_MS, function () { return void (0, fetch_1.refreshBoard)($); });
                    $.clock.every(state_1.SESSION_POLL_MS, function () { return void (0, fetch_1.refreshSessions)($); });
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('command.run', { command: 'sdlc-monitor' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var arg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    state_1.live.isPaneOpened = true;
                    return [4 /*yield*/, $.ui.open({ id: PANE, title: 'Pipeline' })];
                case 1:
                    _a.sent();
                    arg = e.args.trim().toLowerCase();
                    if (!(arg === 'demo' || arg === 'live')) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, fetch_1.setDemo)($, arg === 'demo')];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { text: arg === 'demo' ? 'Pipeline pane opened with made-up tickets. /sdlc-monitor live goes back.' : 'Pipeline pane back on the tracker.' }];
                case 3:
                    void (0, fetch_1.refreshBoard)($);
                    return [2 /*return*/, { text: 'Pipeline pane opened.' }];
            }
        });
    }); });
    on('ui.render', { component: 'Pane', requestId: PANE }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
        return [2 /*return*/, (0, view_1.renderPane)($, $.ui.resolve(e), (_b = (_a = e.viewport) === null || _a === void 0 ? void 0 : _a.rows) !== null && _b !== void 0 ? _b : 30)];
    }); }); });
};
exports.register = register;
