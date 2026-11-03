// The UI view's drawing: a left-to-right flowchart of the work in progress,
// as one SVG document. The main session sits on the left; each agent stands
// one column right of the one that sent it; a child session is a dashed lane
// holding its own agents. Lines into live work move, nodes at work pulse.
// Plain functions over a list of nodes, no engine calls.

export type FlowState = 'main' | 'working' | 'waiting' | 'quiet' | 'failed' | 'done' | 'session'

// One row inside a child session's lane: one of its agents.
export type FlowLaneRow = { depth: number; title: string; line: string; state: FlowState; tip: string }

export type FlowNode = {
  id: string
  parentId?: string
  title: string
  line: string
  state: FlowState
  // What a hover shows: the task, the current step.
  tip: string
  // A child session's lane: its agents at work.
  lane?: FlowLaneRow[]
}

const NODE_H = 58
const GAP_X = 44
const GAP_Y = 16
const PAD = 16
const LANE_HEAD = 46
const LANE_ROW = 30
// How far a node stacked under its parent steps in, and for how many levels.
const STEP_X = 16
const MAX_STEPS = 3
const MAX_COLUMNS = 4
// Boxes no narrower than this keep a readable title; no wider than this
// keep the drawing from sprawling in a wide pane.
const MIN_NODE_W = 150
const MAX_NODE_W = 240
const DEFAULT_NODE_W = 184
// Below this a box cannot hold a name: the drawing grows past the pane instead.
const SMALLEST_NODE_W = 120
// Rough widths of a character in the title, the line under it and a lane row.
const TITLE_CHAR_PX = 8
const LINE_CHAR_PX = 6.6

// How the drawing is cut to the room it has: how many columns and how wide
// each box, and how many characters a box then holds.
export type Geometry = { nodeW: number; maxColumns: number; titleChars: number; lineChars: number }

const geometryOf = (nodeW: number, maxColumns: number): Geometry => ({
  nodeW,
  maxColumns,
  titleChars: Math.floor((nodeW - 24) / TITLE_CHAR_PX),
  lineChars: Math.floor((nodeW - 24) / LINE_CHAR_PX),
})

// The widest boxes that fit the columns the tree needs in `room` pixels; with
// fewer columns than levels, deeper agents share the last one. A child never
// shares its parent's column, so there are always two once there is a child.
export const geometryFor = (depth: number, room: number | undefined): Geometry => {
  const needed = Math.max(1, Math.min(depth, MAX_COLUMNS))
  if (!room) return geometryOf(DEFAULT_NODE_W, MAX_COLUMNS)
  const usable = room - PAD * 2
  const fewest = Math.min(2, needed)
  for (let columns = needed; columns >= fewest; columns -= 1) {
    const nodeW = Math.floor((usable - (columns - 1) * GAP_X) / columns)
    if (nodeW >= MIN_NODE_W || columns === fewest) {
      return geometryOf(Math.max(Math.min(nodeW, MAX_NODE_W), SMALLEST_NODE_W), columns)
    }
  }
  return geometryOf(MIN_NODE_W, fewest)
}

// One colour per state, mid-tone so it reads on a light and a dark pane; the
// pane's theme does not reach the drawing, so titles take the state's colour.
const COLORS: Record<FlowState, string> = {
  main: '#7F77DD',
  working: '#1D9E75',
  waiting: '#BA7517',
  quiet: '#888780',
  failed: '#E24B4A',
  done: '#888780',
  session: '#7F77DD',
}

const LIVE: FlowState[] = ['working', 'waiting', 'session']

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cut = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const heightOf = (node: FlowNode): number =>
  node.lane ? LANE_HEAD + Math.max(1, node.lane.length) * LANE_ROW + 10 : NODE_H

// A node's place; `w` is its width, narrower for one stacked under its parent.
type Placed = { node: FlowNode; x: number; y: number; w: number; h: number; column: number }

// How many levels the tree has: the columns it would like.
const depthOf = (nodes: FlowNode[]): number => {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const levels = (n: FlowNode, seen: Set<string>): number => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    if (!parent || seen.has(parent.id)) return 1
    seen.add(parent.id)
    return 1 + levels(parent, seen)
  }
  return nodes.reduce((m, n) => Math.max(m, levels(n, new Set([n.id]))), 1)
}

// A tidy tree: each node's children stacked down the column to its right, the
// node centred beside them. Past the last column there is no column to the
// right: the children stack under their parent instead, a step indented.
// Returns every node with its place.
export const layoutFlow = (
  nodes: FlowNode[],
  room?: number,
): { placed: Placed[]; width: number; height: number; geo: Geometry } => {
  const geo = geometryFor(depthOf(nodes), room)
  const NODE_W = geo.nodeW
  const ids = new Set(nodes.map(n => n.id))
  const kidsOf = (id: string | undefined) =>
    nodes.filter(n => (id === undefined ? !n.parentId || !ids.has(n.parentId) : n.parentId === id))
  const placed: Placed[] = []
  const seen = new Set<string>()
  const lastColumn = geo.maxColumns - 1
  const place = (node: FlowNode, depth: number, top: number): number => {
    seen.add(node.id)
    const column = Math.min(depth, lastColumn)
    const step = Math.min(depth - column, MAX_STEPS) * STEP_X
    const x = PAD + column * (NODE_W + GAP_X) + step
    const w = NODE_W - step
    const h = heightOf(node)
    const kids = kidsOf(node.id).filter(k => !seen.has(k.id))
    if (column === lastColumn && kids.length > 0) {
      placed.push({ node, x, y: top, w, h, column })
      let below = top + h + GAP_Y
      for (const kid of kids) below += place(kid, depth + 1, below) + GAP_Y
      return below - GAP_Y - top
    }
    let cursor = top
    for (const kid of kids) cursor += place(kid, depth + 1, cursor) + GAP_Y
    const span = kids.length > 0 ? cursor - GAP_Y - top : 0
    placed.push({ node, x, y: top + Math.max(0, (span - h) / 2), w, h, column })
    return Math.max(span, h)
  }
  let cursor = PAD
  for (const root of kidsOf(undefined)) cursor += place(root, 0, cursor) + GAP_Y
  const columns = placed.reduce((m, p) => Math.max(m, p.column + 1), 1)
  return {
    placed,
    geo,
    width: PAD * 2 + columns * NODE_W + (columns - 1) * GAP_X,
    height: Math.max(cursor - GAP_Y + PAD, NODE_H + PAD * 2),
  }
}

const STYLE = `
<style>
  .t { font: 600 13px system-ui, sans-serif; }
  .s { font: 400 11.5px system-ui, sans-serif; fill: #888780; }
  .r { font: 400 11.5px system-ui, sans-serif; fill: #888780; }
  @keyframes flow { to { stroke-dashoffset: -16; } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  @media (prefers-reduced-motion: no-preference) {
    .live { stroke-dasharray: 4 4; animation: flow 1s linear infinite; }
    .beat { animation: pulse 1.6s ease-in-out infinite; }
    .urgent { animation: pulse .8s ease-in-out infinite; }
  }
  .node:hover rect { stroke-width: 2; }
</style>`

const nodeSvg = (geo: Geometry, { node, x, y, w, h }: Placed): string => {
  const NODE_W = w
  const color = COLORS[node.state]
  const tip = `<title>${escape(node.tip)}</title>`
  if (node.lane) {
    const rows = node.lane
      .map((row, i) => {
        const ry = y + LANE_HEAD + i * LANE_ROW
        const rx = x + 12 + Math.min(row.depth, 3) * 12
        const pulse = row.state === 'waiting' ? ' urgent' : row.state === 'working' ? ' beat' : ''
        return (
          `<g class="node"><title>${escape(row.tip)}</title>` +
          `<circle class="dot${pulse}" cx="${rx + 5}" cy="${ry + 9}" r="4.5" fill="${COLORS[row.state]}"/>` +
          `<text class="r" x="${rx + 16}" y="${ry + 13}">${escape(cut(`${row.title} · ${row.line}`, geo.lineChars - 3 - row.depth * 2))}</text></g>`
        )
      })
      .join('')
    const empty = node.lane.length === 0 ? `<text class="s" x="${x + 12}" y="${y + LANE_HEAD + 13}">no agents at work</text>` : ''
    return (
      `<g class="node">${tip}<rect x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="12" fill="${color}" fill-opacity=".06" stroke="${color}" stroke-width="1" stroke-dasharray="5 3"/>` +
      `<text class="t" fill="${color}" x="${x + 12}" y="${y + 20}">${escape(cut(node.title, geo.titleChars))}</text>` +
      `<text class="s" x="${x + 12}" y="${y + 36}">${escape(cut(node.line, geo.lineChars))}</text></g>` +
      rows +
      empty
    )
  }
  const pulse = node.state === 'waiting' ? ' urgent' : node.state === 'working' ? ' beat' : ''
  const dash = node.state === 'quiet' ? ' stroke-dasharray="3 3"' : ''
  return (
    `<g class="node">${tip}<rect class="${pulse.trim()}" x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="8" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="1.2"${dash}/>` +
    `<text class="t" fill="${color}" x="${x + 12}" y="${y + 23}">${escape(cut(node.title, geo.titleChars))}</text>` +
    `<text class="s" x="${x + 12}" y="${y + 42}">${escape(cut(node.line, geo.lineChars))}</text></g>`
  )
}

// Right edge of the parent to the left edge of the child, with one bend.
const edgeSvg = (from: Placed, to: Placed): string => {
  const color = COLORS[to.node.state]
  const live = LIVE.includes(to.node.state) ? ' class="live"' : ''
  // Stacked under its parent: down from the parent's left, into the child.
  if (to.column === from.column) {
    const sx = from.x + STEP_X / 2
    const ty = to.y + Math.min(to.h, NODE_H) / 2
    return `<path${live} d="M${sx} ${from.y + from.h} V${ty} H${to.x - 2}" fill="none" stroke="${color}" stroke-width="1.4" marker-end="url(#arrow)"/>`
  }
  const x1 = from.x + from.w
  const y1 = from.y + Math.min(from.h, NODE_H) / 2
  const x2 = to.x - 4
  const y2 = to.y + Math.min(to.h, NODE_H) / 2
  const mid = x1 + GAP_X / 2
  return `<path${live} d="M${x1} ${y1} H${mid} V${y2} H${x2}" fill="none" stroke="${color}" stroke-width="1.4" marker-end="url(#arrow)"/>`
}

// The whole drawing at its own size in pixels, cut to `room` pixels wide
// when given; the pane draws it one to one, so its text stays readable.
export const flowchart = (nodes: FlowNode[], room?: number): { svg: string; width: number; height: number } => {
  const { placed, width, height, geo } = layoutFlow(nodes, room)
  const byId = new Map(placed.map(p => [p.node.id, p]))
  const edges = placed
    .map(p => {
      const parent = p.node.parentId ? byId.get(p.node.parentId) : undefined
      return parent ? edgeSvg(parent, p) : ''
    })
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">` +
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>` +
    STYLE +
    edges +
    placed.map(p => nodeSvg(geo, p)).join('') +
    `</svg>`
  return { svg, width, height }
}

export const flowchartSvg = (nodes: FlowNode[], room?: number): string => flowchart(nodes, room).svg
