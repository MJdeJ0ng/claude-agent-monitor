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
exports.FLOW = exports.STAGE_LOOK = void 0;
exports.renderPane = renderPane;
var claude_code_1 = require("claude-code");
var pipeline_1 = require("./pipeline");
var state_1 = require("./state");
var fetch_1 = require("./fetch");
// The pane: what waits on the person first, then each stage from nearly done
// back to the backlog.
var EMPTY = { repo: '', root: '', fetchedAt: 0, issues: [], prs: [] };
var board = (0, claude_code_1.atom)({ plugin: 'sdlc-monitor', key: 'board' }, EMPTY, { shape: state_1.SHAPES.board });
var sessions = (0, claude_code_1.atom)({ plugin: 'sdlc-monitor', key: 'sessions' }, [], {
    shape: state_1.SHAPES.sessions,
});
// One stage unfolded at a time, so the pane stays short beside the agent tree.
var openStage = (0, claude_code_1.atom)({ plugin: 'sdlc-monitor', key: 'open' }, '', {
    shape: state_1.SHAPES.open,
});
exports.STAGE_LOOK = {
    'to-refine': { label: 'To refine', short: 'refine', glyph: '○', color: 'gray' },
    refined: { label: 'Refined, ready to build', short: 'refined', glyph: '◔', color: 'blue' },
    building: { label: 'Building', short: 'build', glyph: '◑', color: 'yellow' },
    pr: { label: 'In review (PR)', short: 'PR', glyph: '◕', color: 'magenta' },
    ready: { label: 'Ready to merge', short: 'ready', glyph: '●', color: 'green' },
    merged: { label: 'Merged, last 7 days', short: 'merged', glyph: '✔', color: 'green' },
};
// The order the flow line reads in, and the order the sections stack in.
exports.FLOW = ['to-refine', 'refined', 'building', 'pr', 'ready', 'merged'];
var SECTIONS = ['ready', 'pr', 'building', 'refined', 'to-refine', 'merged'];
var CHECK_LOOK = {
    pass: { glyph: '✓', color: 'green', text: 'CI green' },
    fail: { glyph: '✗', color: 'red', text: 'CI red' },
    pending: { glyph: '…', color: 'yellow', text: 'CI running' },
    none: { glyph: '·', color: 'gray', text: 'no checks' },
};
var ago = function (ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60)
        return "".concat(s, "s");
    var m = Math.round(s / 60);
    if (m < 60)
        return "".concat(m, "m");
    var h = Math.round(m / 60);
    return h < 48 ? "".concat(h, "h") : "".concat(Math.round(h / 24), "d");
};
var quiet = ['All quiet on the western front.', 'No orders from HQ.', 'Keep calm and carry on.'];
function renderPane($, ui, rows) {
    return __awaiter(this, void 0, void 0, function () {
        var Box, Text, Button, b, list, unfolded, now, tickets, byStage, waiting, toggle, refresh, titleRow, sizeTag, detail, ticketRow, section, flowLine, header, needsYou;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    Box = ui.Box, Text = ui.Text, Button = ui.Button;
                    return [4 /*yield*/, (0, claude_code_1.read)($, board)];
                case 1:
                    b = _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, sessions)];
                case 2:
                    list = _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, openStage)];
                case 3:
                    unfolded = _a.sent();
                    now = Date.now();
                    tickets = (0, pipeline_1.toTickets)(b, list, now);
                    byStage = function (s) { return tickets.filter(function (t) { return t.stage === s; }); };
                    waiting = tickets.filter(function (t) { return t.needsYou; });
                    toggle = function (stage) { return function () {
                        return void (0, claude_code_1.update)($, openStage, function (now) { return (now === stage ? '' : stage); });
                    }; };
                    refresh = function () { return void (0, fetch_1.refreshBoard)($); };
                    titleRow = function (left, right) { return (<Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">{left}</Text>
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        {right}
      </Box>
    </Box>); };
                    sizeTag = function (t) { return (t.isSpike ? ' spike' : t.size !== undefined ? " ".concat(t.size, "pt") : ''); };
                    detail = function (t) {
                        var parts = [];
                        if (t.pr && t.pr.state === 'OPEN') {
                            var c = CHECK_LOOK[t.pr.checks];
                            parts.push(<Text color={c.color}>
          {c.glyph} PR #{t.pr.number} {c.text}
          {t.pr.isDraft ? ' · draft' : ''}
          {t.pr.mergeable === 'CONFLICTING' ? ' · conflicts' : ''}
        </Text>);
                        }
                        if (t.pr && t.pr.state === 'MERGED')
                            parts.push(<Text color="green">⇢ PR #{t.pr.number} merged</Text>);
                        if (t.session) {
                            parts.push(t.session.isRunning ? (<Text color="yellow">⚙ {t.session.isSelf ? 'this session' : 'session'} working</Text>) : (<Text dimColor>⏸ session idle</Text>));
                        }
                        if (parts.length === 0)
                            return null;
                        return (<Box paddingLeft={4}>
        <Text wrap="truncate-end">
          {parts.map(function (p, i) { return (<Text key={"d".concat(i)}>
              {i > 0 ? <Text dimColor> · </Text> : null}
              {p}
            </Text>); })}
        </Text>
      </Box>);
                    };
                    ticketRow = function (t, look) { return (<Box key={"t".concat(t.number)} flexDirection="column">
      {titleRow(<Text>
          <Text color={look.color}>{look.glyph} </Text>
          <Text bold>#{t.number}</Text> {t.title}
        </Text>, <Text dimColor>
          {sizeTag(t).trim()} {ago(now - t.at)}
        </Text>)}
      {detail(t)}
    </Box>); };
                    section = function (stage) {
                        var look = exports.STAGE_LOOK[stage];
                        var items = byStage(stage);
                        var isShut = unfolded !== stage;
                        return (<Box key={"s-".concat(stage)} flexDirection="column">
        <Button key={"b-".concat(stage)} plain onPress={toggle(stage)}>
          <Text wrap="truncate-end">
            <Text dimColor>{isShut ? '▸ ' : '▾ '}</Text>
            <Text bold={items.length > 0} color={items.length > 0 ? look.color : 'gray'}>
              {look.label}
            </Text>
            <Text dimColor> {items.length}</Text>
            {isShut && items.length > 0 ? <Text dimColor> · {items.map(function (t) { return "#".concat(t.number); }).join(' ')}</Text> : null}
          </Text>
        </Button>
        {!isShut && items.length === 0 && (<Box paddingLeft={2}>
            <Text dimColor>none</Text>
          </Box>)}
        {!isShut && items.slice(0, state_1.ROWS_PER_STAGE).map(function (t) { return ticketRow(t, look); })}
        {!isShut && items.length > state_1.ROWS_PER_STAGE && (<Box paddingLeft={2}>
            <Text dimColor>+{items.length - state_1.ROWS_PER_STAGE} more</Text>
          </Box>)}
      </Box>);
                    };
                    flowLine = (<Text wrap="wrap">
      {exports.FLOW.map(function (s, i) { return (<Text key={"f-".concat(s)}>
          {i > 0 ? <Text dimColor> → </Text> : null}
          <Text color={exports.STAGE_LOOK[s].color} bold={byStage(s).length > 0}>
            {byStage(s).length} {exports.STAGE_LOOK[s].short}
          </Text>
        </Text>); })}
    </Text>);
                    header = (<Box flexDirection="column">
      {titleRow(<Text>
          <Text bold color="cyan">
            ◆ Operations Room{' '}
          </Text>
          <Text dimColor>{b.repo || 'no repository'}</Text>
          {b.isDemo ? (<Text backgroundColor="magenta" color="black" bold>
              {' DEMO '}
            </Text>) : null}
        </Text>, <Button key="refresh" plain onPress={refresh}>
          <Text dimColor underline>
            {b.fetchedAt ? "".concat(ago(now - b.fetchedAt), " ago \u27F3") : 'loading ⟳'}
          </Text>
        </Button>)}
      {b.repo ? flowLine : null}
    </Box>);
                    if (b.error) {
                        return [2 /*return*/, (<Box flexDirection="column">
        {header}
        <Box marginTop={1}>
          <Text color="yellow" wrap="wrap">
            ⚠ {b.error}
          </Text>
        </Box>
      </Box>)];
                    }
                    if (!b.fetchedAt) {
                        return [2 /*return*/, (<Box flexDirection="column">
        {header}
        <Text dimColor>Decoding the tracker at Bletchley Park…</Text>
      </Box>)];
                    }
                    needsYou = (<Box flexDirection="column" marginTop={1}>
      <Text>
        <Text backgroundColor={waiting.length > 0 ? 'yellow' : 'gray'} color="black" bold>
          {' NEEDS YOU '}
        </Text>
        <Text dimColor> {waiting.length}</Text>
      </Text>
      {waiting.length === 0 && <Text dimColor>{quiet[Math.floor(now / 60000) % quiet.length]}</Text>}
      {waiting.slice(0, state_1.NEEDS_YOU_ROWS).map(function (t) { return (<Box key={"n".concat(t.number)}>
          <Box flexShrink={0}>
            <Text color="yellow">➜ </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end">
              <Text bold>#{t.number}</Text> <Text color="yellow">{t.needsYou}</Text>
              <Text dimColor> · {t.title}</Text>
            </Text>
          </Box>
        </Box>); })}
      {waiting.length > state_1.NEEDS_YOU_ROWS && <Text dimColor>  +{waiting.length - state_1.NEEDS_YOU_ROWS} more</Text>}
    </Box>);
                    return [2 /*return*/, (<Box flexDirection="column">
      {header}
      {needsYou}
      <Box flexDirection="column" marginTop={1}>
        {SECTIONS.map(section)}
      </Box>
    </Box>)];
            }
        });
    });
}
