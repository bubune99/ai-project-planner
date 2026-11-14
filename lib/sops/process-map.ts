/**
 * A process map: a document type for the Library. Who does what (lanes), in
 * which stage (columns), the lines forward and the loops back, and layers
 * inside layers: any stage or step can hold a map of its own.
 *
 * It lives in a document's text as one fenced ```process-map JSON block, the
 * same way a flow does, so any document can carry one. Everything here is a
 * pure function: read and write the block, check a layer, find where each box
 * goes and how each line is routed, and make every edit as a new copy.
 * No React, no database. Checked by process-map.assert.ts.
 */

/** The side a line leaves and comes back by when it does not simply go forward. */
export type Via = "top" | "top2" | "left" | "bottom"
export interface Link { from: string; to: string; label?: string; via?: Via }
export interface MapNode {
  id: string; title: string; sub?: string
  /** Who does it, when the layer has no lanes to say so. */
  who?: string
  /** The owner's own step. */
  you?: boolean
  /** Planned, not built yet. */
  todo?: boolean
  /** Its place in a layer with lanes: which stage (column) and which lane (row). */
  stage?: string; lane?: number
  inside?: Layer
}
export interface Stage { id: string; title: string; sub?: string; inside?: Layer }
export interface Layer {
  /** One line about what this layer shows. */
  say?: string
  /** Present together on a swim lane layer; absent on a simple left-to-right layer. */
  lanes?: string[]; stages?: Stage[]
  nodes: MapNode[]; links: Link[]
}
/** Where you are: the stages and steps opened, outermost first. */
export type Path = { kind: "stage" | "node"; id: string }[]

const FENCE = /```process-map\s*\n([\s\S]*?)\n```/
const LIMITS = { nodes: 60, links: 120, lanes: 12, stages: 16, depth: 5, text: 200 }

// ---- the block in a document ----

/** Reads the ```process-map block from a document's text. Null when there is none or it cannot be read. */
export function parseMapBlock(markdown: string): Layer | null {
  const m = FENCE.exec(markdown ?? "")
  if (!m) return null
  try { const { layer, errors } = parseLayer(JSON.parse(m[1])); return errors.length ? null : layer } catch { return null }
}
/** The text with its block replaced, or added at the end when it has none. */
export function writeMapBlock(markdown: string, map: Layer): string {
  const block = "```process-map\n" + JSON.stringify(map) + "\n```"
  if (FENCE.test(markdown)) return markdown.replace(FENCE, () => block)
  return `${markdown.replace(/\s+$/, "")}\n\n${block}\n`
}
/** The text without its block: what a person reads and edits as words. */
export const stripMapBlock = (markdown: string): string => (markdown ?? "").replace(FENCE, "").replace(/\s+$/, "")

/** Reads a layer sent by a browser or an agent: keeps the known fields, trims the text, and says what is wrong. */
export function parseLayer(raw: unknown, depth = 1, where = "The map"): { layer: Layer; errors: string[] } {
  const errors: string[] = []
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const arr = (v: unknown, what: keyof typeof LIMITS): unknown[] => {
    const a = Array.isArray(v) ? v : []
    if (a.length > LIMITS[what]) errors.push(`${where}: too many ${what} (${a.length}, the most is ${LIMITS[what]})`)
    return a.slice(0, LIMITS[what])
  }
  const text = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LIMITS.text) : "")
  // Stages and steps are named separately: a stage "fix" and a step "fix" are different things.
  const taken = { stage: new Set<string>(), step: new Set<string>() }
  const id = (v: unknown, what: "stage" | "step"): string => {
    const ids = taken[what]
    const s = typeof v === "string" ? v.trim() : ""
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(s)) errors.push(`${where}: a ${what} needs an id of letters, digits, - or _`)
    else if (ids.has(s)) errors.push(`${where}: the id "${s}" is used twice`)
    ids.add(s)
    return s
  }
  const inside = (v: unknown, title: string): Layer | undefined => {
    if (v === undefined || v === null) return undefined
    if (depth >= LIMITS.depth) { errors.push(`${where}: layers go no deeper than ${LIMITS.depth}`); return undefined }
    const r = parseLayer(v, depth + 1, `Inside ${title || "a step"}`)
    errors.push(...r.errors)
    return r.layer
  }
  const d = obj(raw)
  if (depth === 1 && !Array.isArray(d.nodes)) errors.push("The map has no list of steps")
  const lanes = d.lanes === undefined ? undefined : arr(d.lanes, "lanes").map(text)
  const stages = d.stages === undefined ? undefined : arr(d.stages, "stages").map((s) => { const o = obj(s), title = text(o.title); return clean<Stage>({ id: id(o.id, "stage"), title, sub: text(o.sub), inside: inside(o.inside, title) }) })
  if ((lanes === undefined) !== (stages === undefined)) errors.push(`${where}: lanes and stages come together`)
  const nodes = arr(d.nodes, "nodes").map((n) => {
    const o = obj(n), title = text(o.title)
    if (!title) errors.push(`${where}: a step has no title`)
    const node = clean<MapNode>({ id: id(o.id, "step"), title, sub: text(o.sub), who: text(o.who), you: o.you === true, todo: o.todo === true, inside: inside(o.inside, title) })
    if (lanes && stages) {
      const stage = typeof o.stage === "string" ? o.stage : "", lane = Number.isInteger(o.lane) ? (o.lane as number) : -1
      if (!stages.some((s) => s.id === stage) || lane < 0 || lane >= lanes.length) errors.push(`${where}: "${title}" is not in a stage and lane that exist`)
      return { ...node, stage, lane }
    }
    return node
  })
  const nodeIds = new Set(nodes.map((n) => n.id))
  const links = arr(d.links, "links").flatMap((l) => {
    const o = obj(l), from = typeof o.from === "string" ? o.from : "", to = typeof o.to === "string" ? o.to : ""
    if (!nodeIds.has(from) || !nodeIds.has(to)) { errors.push(`${where}: a line joins a step that is not there`); return [] }
    const via = (["top", "top2", "left", "bottom"] as const).find((v) => v === o.via)
    return [clean<Link>({ from, to, label: text(o.label), via })]
  })
  return { layer: clean<Layer>({ say: text(d.say), lanes, stages, nodes, links }), errors }
}
/** Drops empty text, false flags and undefined, so a saved map carries only what was said. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && v !== false)) as T
}

// ---- reading a map ----

export const isLanes = (l: Layer): l is Layer & { lanes: string[]; stages: Stage[] } => !!l.lanes && !!l.stages

/** The layer at a path, or null when the path no longer leads anywhere (something on it was removed). */
export function layerAt(root: Layer, path: Path): Layer | null {
  let cur: Layer | undefined = root
  for (const seg of path) {
    cur = seg.kind === "stage" ? cur.stages?.find((s) => s.id === seg.id)?.inside : cur.nodes.find((n) => n.id === seg.id)?.inside
    if (!cur) return null
  }
  return cur
}
/** The names along a path, for showing where you are. */
export function crumbs(root: Layer, path: Path): string[] {
  const out: string[] = []
  let cur: Layer | undefined = root
  for (const seg of path) {
    const hit: Stage | MapNode | undefined = seg.kind === "stage" ? cur?.stages?.find((s) => s.id === seg.id) : cur?.nodes.find((n) => n.id === seg.id)
    if (!hit) break
    out.push(hit.title)
    cur = hit.inside
  }
  return out
}
/** What opening a box leads to: its own layer, or (for a step in a lane) the layer of the stage it belongs to. */
export function doorOf(layer: Layer, kind: "stage" | "node", id: string): Path[number] | null {
  if (kind === "stage") return layer.stages?.find((s) => s.id === id)?.inside ? { kind, id } : null
  const node = layer.nodes.find((n) => n.id === id)
  if (!node) return null
  if (node.inside) return { kind: "node", id }
  return node.stage && layer.stages?.find((s) => s.id === node.stage)?.inside ? { kind: "stage", id: node.stage } : null
}

export const DIM = { laneLabel: 170, col: 268, node: 208, lane: 122, nodeH: 78, gap: 320, chainNode: 236, header: 140 }
export interface Point { x: number; y: number }

/** Where each step sits. With lanes: its stage's column and its lane's row. Without: left to right, in order. */
export function place(layer: Layer): Record<string, Point> {
  if (!isLanes(layer)) return Object.fromEntries(layer.nodes.map((n, i) => [n.id, { x: i * DIM.gap, y: 0 }]))
  return Object.fromEntries(layer.nodes.map((n) => [n.id, { x: DIM.laneLabel + Math.max(0, layer.stages.findIndex((s) => s.id === n.stage)) * DIM.col + (DIM.col - DIM.node) / 2, y: (n.lane ?? 0) * DIM.lane + (DIM.lane - 6 - DIM.nodeH) / 2 }]))
}
/** The stage and lane under a point of a swim lane layer, when that place is inside it. */
export function cellAt(layer: Layer, p: Point): { stage: string; lane: number } | null {
  if (!isLanes(layer)) return null
  const col = Math.floor((p.x - DIM.laneLabel) / DIM.col), lane = Math.floor(p.y / DIM.lane)
  return col >= 0 && col < layer.stages.length && lane >= 0 && lane < layer.lanes.length ? { stage: layer.stages[col].id, lane } : null
}
export const cellFree = (layer: Layer, cell: { stage: string; lane: number }) => !layer.nodes.some((n) => n.stage === cell.stage && n.lane === cell.lane)

export type Side = "t" | "r" | "b" | "l"
/**
 * Which sides a line leaves and enters by, and how far it stands off. Forward lines leave by the right (or straight up
 * or down inside a column). A line given a side leaves and comes back by it; it is a loop when it goes back, and
 * longer ones stand further off so two never run on top of each other.
 */
export function routeLink(a: Point, b: Point, e: Link, lanes: boolean): { from: Side; to: Side; offset: number; loop: boolean } {
  const span = Math.round(Math.abs(a.x - b.x) / DIM.gap), back = b.x <= a.x
  if (e.from === e.to) return { from: "b", to: "l", offset: 30, loop: true }
  if (e.via === "left") return { from: "l", to: "l", offset: 26, loop: back }
  if (e.via === "top" || e.via === "top2") return { from: "t", to: "t", offset: e.via === "top2" ? 46 : 20 + (lanes ? 0 : span * 12), loop: back }
  if (e.via) return { from: "b", to: "b", offset: 24 + (lanes ? 6 : span * 12), loop: back }
  if (b.x > a.x + 1) return { from: "r", to: "l", offset: 20, loop: false }
  return b.y > a.y ? { from: "b", to: "t", offset: 20, loop: false } : { from: "t", to: "b", offset: 20, loop: false }
}

/** What is wrong with one layer, for the person editing it. Empty means it reads cleanly. */
export function checkLayer(layer: Layer): string[] {
  const out: string[] = [], pos = place(layer), title = (id: string) => layer.nodes.find((n) => n.id === id)?.title ?? id
  if (isLanes(layer)) {
    const cells = new Set<string>()
    for (const n of layer.nodes) { const c = `${n.stage}/${n.lane}`; if (cells.has(c)) out.push(`"${n.title}" sits on top of another step`); cells.add(c) }
    for (const s of layer.stages) if (!layer.nodes.some((n) => n.stage === s.id)) out.push(`Stage "${s.title}" has no steps`)
  }
  for (const e of layer.links) {
    if (e.from !== e.to && !e.via && pos[e.to].x < pos[e.from].x) out.push(`The line from "${title(e.from)}" back to "${title(e.to)}" is not drawn as a loop`)
    if ((e.via || e.from === e.to) && pos[e.to].x <= pos[e.from].x && !e.label) out.push(`The loop from "${title(e.from)}" to "${title(e.to)}" does not say why`)
  }
  layer.nodes.forEach((n, i) => { if (i > 0 && !layer.links.some((e) => e.to === n.id && e.from !== n.id)) out.push(`Nothing leads to "${n.title}"`) })
  return out
}

// ---- changing a map (every change returns a new copy) ----

/** The map with the layer at `path` replaced by what `change` returns for it. */
export function updateAt(root: Layer, path: Path, change: (layer: Layer) => Layer): Layer {
  if (!path.length) return change(root)
  const [seg, ...rest] = path
  if (seg.kind === "stage") return { ...root, stages: root.stages?.map((s) => (s.id === seg.id && s.inside ? { ...s, inside: updateAt(s.inside, rest, change) } : s)) }
  return { ...root, nodes: root.nodes.map((n) => (n.id === seg.id && n.inside ? { ...n, inside: updateAt(n.inside, rest, change) } : n)) }
}
export function newId(layer: Layer, prefix = "n"): string {
  const used = new Set([...layer.nodes.map((n) => n.id), ...(layer.stages ?? []).map((s) => s.id)])
  for (let i = layer.nodes.length + 1; ; i++) if (!used.has(prefix + i)) return prefix + i
}
export const setNode = (layer: Layer, id: string, patch: Partial<Pick<MapNode, "title" | "sub" | "who" | "you" | "todo">>): Layer =>
  ({ ...layer, nodes: layer.nodes.map((n) => (n.id === id ? clean({ ...n, ...patch }) : n)) })
export const setStage = (layer: Layer, id: string, patch: Partial<Pick<Stage, "title" | "sub">>): Layer =>
  ({ ...layer, stages: layer.stages?.map((s) => (s.id === id ? clean({ ...s, ...patch }) : s)) })
export const renameLane = (layer: Layer, index: number, name: string): Layer => ({ ...layer, lanes: layer.lanes?.map((l, i) => (i === index ? name : l)) })
/** Adds a step: into a cell of a swim lane, or after another step (or at the end) of a left-to-right layer. */
export function addNode(layer: Layer, node: Omit<MapNode, "id">, afterId?: string): { layer: Layer; id: string } {
  const id = newId(layer), full = clean({ ...node, id }) as MapNode
  const at = afterId ? layer.nodes.findIndex((n) => n.id === afterId) + 1 : layer.nodes.length
  return { id, layer: { ...layer, nodes: [...layer.nodes.slice(0, at), full, ...layer.nodes.slice(at)] } }
}
/** Removes a step with every line that touched it (and whatever was inside it). */
export const removeNode = (layer: Layer, id: string): Layer => ({ ...layer, nodes: layer.nodes.filter((n) => n.id !== id), links: layer.links.filter((e) => e.from !== id && e.to !== id) })
/**
 * Joins two steps. A line that goes back (or to itself) is drawn as a loop automatically, on the side that keeps it
 * clear of the boxes, and one that jumps over a box arcs over it; one that already exists is left alone.
 */
export function addLink(layer: Layer, from: string, to: string, label?: string): Layer {
  if (layer.links.some((e) => e.from === from && e.to === to)) return layer
  const pos = place(layer), a = pos[from], b = pos[to]
  if (!a || !b) return layer
  let via: Via | undefined
  if (from === to) via = undefined   // a step looping on itself is always drawn the same way
  else if (b.x < a.x) via = isLanes(layer) && layer.nodes.find((n) => n.id === from)?.lane === 0 && layer.nodes.find((n) => n.id === to)?.lane === 0 ? "top" : "bottom"
  else if (b.x === a.x && layer.links.some((e) => e.from === to && e.to === from)) via = "left"
  // Left to right, a line that jumps over a box goes over the top rather than through it.
  else if (!isLanes(layer) && b.x - a.x > DIM.gap) via = "top"
  return { ...layer, links: [...layer.links, clean<Link>({ from, to, label, via })] }
}
export const setLink = (layer: Layer, index: number, patch: Partial<Pick<Link, "label">>): Layer => ({ ...layer, links: layer.links.map((e, i) => (i === index ? clean({ ...e, ...patch }) : e)) })
export const removeLink = (layer: Layer, index: number): Layer => ({ ...layer, links: layer.links.filter((_, i) => i !== index) })
/** Gives a stage or step a layer of its own to open: two steps joined by a line, ready to be reworded. */
export function addInside(layer: Layer, kind: "stage" | "node", id: string): Layer {
  const fresh: Layer = { nodes: [{ id: "a", title: "First step" }, { id: "b", title: "Next step" }], links: [{ from: "a", to: "b" }] }
  if (kind === "stage") return { ...layer, stages: layer.stages?.map((s) => (s.id === id && !s.inside ? { ...s, inside: fresh } : s)) }
  return { ...layer, nodes: layer.nodes.map((n) => (n.id === id && !n.inside ? { ...n, inside: fresh } : n)) }
}
/** Takes away the layer inside a stage or step, with everything in it. */
export function removeInside(layer: Layer, kind: "stage" | "node", id: string): Layer {
  const drop = <T extends { id: string; inside?: Layer }>(x: T): T => { if (x.id !== id) return x; const { inside: _gone, ...rest } = x; return rest as T }
  return kind === "stage" ? { ...layer, stages: layer.stages?.map(drop) } : { ...layer, nodes: layer.nodes.map(drop) }
}

// ---- lanes and stages ----

const swap = <T,>(a: T[], i: number, j: number): T[] => { const out = [...a]; [out[i], out[j]] = [out[j], out[i]]; return out }
/** Adds a lane at `index` (0 is the top). The steps in lanes below move down with their lanes. */
export function addLane(layer: Layer, index: number, name = "New lane"): Layer {
  if (!isLanes(layer) || layer.lanes.length >= LIMITS.lanes) return layer
  const at = Math.max(0, Math.min(index, layer.lanes.length))
  return { ...layer, lanes: [...layer.lanes.slice(0, at), name, ...layer.lanes.slice(at)], nodes: layer.nodes.map((n) => ((n.lane ?? 0) >= at ? { ...n, lane: (n.lane ?? 0) + 1 } : n)) }
}
/** Removes a lane with the steps in it and their lines. The last lane cannot be removed. */
export function removeLane(layer: Layer, index: number): Layer {
  if (!isLanes(layer) || layer.lanes.length <= 1 || index < 0 || index >= layer.lanes.length) return layer
  const gone = new Set(layer.nodes.filter((n) => n.lane === index).map((n) => n.id))
  return { ...layer, lanes: layer.lanes.filter((_, i) => i !== index), nodes: layer.nodes.filter((n) => !gone.has(n.id)).map((n) => ((n.lane ?? 0) > index ? { ...n, lane: (n.lane ?? 0) - 1 } : n)), links: layer.links.filter((e) => !gone.has(e.from) && !gone.has(e.to)) }
}
/** Moves a lane up (-1) or down (+1), with its steps. */
export function moveLane(layer: Layer, index: number, by: -1 | 1): Layer {
  const to = index + by
  if (!isLanes(layer) || index < 0 || to < 0 || index >= layer.lanes.length || to >= layer.lanes.length) return layer
  return { ...layer, lanes: swap(layer.lanes, index, to), nodes: layer.nodes.map((n) => (n.lane === index ? { ...n, lane: to } : n.lane === to ? { ...n, lane: index } : n)) }
}
/** Adds a stage (a column) at `index`. Steps keep their stage, so everything to the right moves over. */
export function addStage(layer: Layer, index: number, title = "New stage"): { layer: Layer; id: string } {
  if (!isLanes(layer) || layer.stages.length >= LIMITS.stages) return { layer, id: "" }
  const id = newId(layer, "g"), at = Math.max(0, Math.min(index, layer.stages.length))
  return { id, layer: { ...layer, stages: [...layer.stages.slice(0, at), { id, title }, ...layer.stages.slice(at)] } }
}
/** Removes a stage with the steps in it, their lines and whatever was inside it. The last stage cannot be removed. */
export function removeStage(layer: Layer, id: string): Layer {
  if (!isLanes(layer) || layer.stages.length <= 1 || !layer.stages.some((s) => s.id === id)) return layer
  const gone = new Set(layer.nodes.filter((n) => n.stage === id).map((n) => n.id))
  return { ...layer, stages: layer.stages.filter((s) => s.id !== id), nodes: layer.nodes.filter((n) => !gone.has(n.id)), links: layer.links.filter((e) => !gone.has(e.from) && !gone.has(e.to)) }
}
/** Moves a stage left (-1) or right (+1), with its steps. */
export function moveStage(layer: Layer, id: string, by: -1 | 1): Layer {
  if (!isLanes(layer)) return layer
  const i = layer.stages.findIndex((s) => s.id === id), to = i + by
  return i < 0 || to < 0 || to >= layer.stages.length ? layer : { ...layer, stages: swap(layer.stages, i, to) }
}

// ---- moving steps, and keeping lines true to where things are ----

/**
 * After steps move, every line is looked at again: one that now goes forward is drawn plainly, and one that now goes
 * back becomes a loop. A line that was already a loop and still goes back keeps the side it was given.
 */
export function reroute(layer: Layer): Layer {
  const pos = place(layer), bare = { ...layer, links: [] as Link[] }
  let out = bare
  for (const e of layer.links) {
    const a = pos[e.from], b = pos[e.to], back = e.from === e.to || b.x < a.x
    if (back && e.via) out = { ...out, links: [...out.links, e] }
    else if (!back && e.via && !isLanes(layer) && b.x - a.x > DIM.gap) out = { ...out, links: [...out.links, e] }   // an arc over a box keeps its side
    else out = addLink({ ...out, nodes: layer.nodes }, e.from, e.to, e.label)
  }
  return { ...layer, links: out.links }
}
/** Puts a step in another place of a swim lane. Refused (unchanged) when that place is taken. */
export function moveNode(layer: Layer, id: string, cell: { stage: string; lane: number }): Layer {
  const n = layer.nodes.find((x) => x.id === id)
  if (!isLanes(layer) || !n || (n.stage === cell.stage && n.lane === cell.lane) || !cellFree(layer, cell)) return layer
  return reroute({ ...layer, nodes: layer.nodes.map((x) => (x.id === id ? { ...x, stage: cell.stage, lane: cell.lane } : x)) })
}
/** Puts a step at another position of a left-to-right layer. */
export function reorderNode(layer: Layer, id: string, toIndex: number): Layer {
  const from = layer.nodes.findIndex((x) => x.id === id), to = Math.max(0, Math.min(toIndex, layer.nodes.length - 1))
  if (isLanes(layer) || from < 0 || from === to) return layer
  const rest = layer.nodes.filter((x) => x.id !== id)
  return reroute({ ...layer, nodes: [...rest.slice(0, to), layer.nodes[from], ...rest.slice(to)] })
}
/** The position a step dropped at `x` belongs in, on a left-to-right layer. */
export const indexAt = (layer: Layer, x: number): number => Math.max(0, Math.min(layer.nodes.length - 1, Math.round(x / DIM.gap)))
/**
 * Puts a new step in the middle of a line: A to B becomes A to the new step to B, and the line's words stay on the
 * first half. On a swim lane the step goes where there is room between the two (a stage that lies between them, else
 * B's stage in A's lane, else A's stage in B's lane); when there is none, a new stage is opened between them for it.
 */
export function splitLink(layer: Layer, index: number): { layer: Layer; id: string } {
  const e = layer.links[index]
  if (!e || e.from === e.to) return { layer, id: "" }
  const without = removeLink(layer, index), join = (l: Layer, id: string) => addLink(addLink(l, e.from, id, e.label), id, e.to)
  if (!isLanes(layer)) { const made = addNode(without, { title: "New step" }, e.from); return { id: made.id, layer: reroute(join(made.layer, made.id)) } }
  const a = layer.nodes.find((n) => n.id === e.from)!, b = layer.nodes.find((n) => n.id === e.to)!
  const ia = layer.stages.findIndex((s) => s.id === a.stage), ib = layer.stages.findIndex((s) => s.id === b.stage)
  // First a stage that lies between the two, in either's lane; then the corners.
  const between = layer.stages.slice(Math.min(ia, ib) + 1, Math.max(ia, ib)).flatMap((g) => [{ stage: g.id, lane: a.lane! }, { stage: g.id, lane: b.lane! }])
  const tries = [...between, { stage: b.stage!, lane: a.lane! }, { stage: a.stage!, lane: b.lane! }]
  let base: Layer = without, cell = tries.find((c) => cellFree(without, c))
  if (!cell) {
    const made = addStage(without, Math.max(ia, ib) === Math.min(ia, ib) ? ia + 1 : Math.min(ia, ib) + 1, "New stage")
    if (!made.id) return { layer, id: "" }
    base = made.layer; cell = { stage: made.id, lane: a.lane! }
  }
  const made = addNode(base, { title: "New step", ...cell })
  return { id: made.id, layer: reroute(join(made.layer, made.id)) }
}

// ---- the map this planner starts with ----

/** How work is built here, from plan to proven: the first process map, and the pattern for others. */
export function seedMap(): Layer {
  const S = (id: string, stage: string, lane: number, title: string, sub: string, todo?: boolean): MapNode => clean({ id, stage, lane, title, sub, todo, you: lane === 0 })
  const E = (from: string, to: string, label?: string, via?: Via): Link => clean({ from, to, label, via })
  const N = (id: string, title: string, sub: string, who: string, todo?: boolean): MapNode => clean({ id, title, sub, who, todo, you: who === "You" })
  const inside: Record<string, Layer> = {
    plan: { say: "Loops until you say the plan is right.", nodes: [N("a", "Say what you want", "In your own words, or with a mock-up", "You"), N("b", "Draft people and use cases", "With the pointed follow-up questions", "Planning agent", true), N("c", "Correct the draft", "Edit any text, add or drop steps", "You"), N("d", "Plan recorded", "Every item with where it came from", "The planner")], links: [E("a", "b"), E("b", "c"), E("c", "d"), E("c", "b", "not right yet", "bottom")] },
    intent: { say: "Loops over every planned item until nothing is unanswered.", nodes: [N("a", "Ask each item its questions", "By what kind of thing it is", "The planner"), N("b", "Answer from the code", "Where a figure comes from, what a button changes", "Builder agent"), N("c", "Answer what only you know", "What it is for, who uses it", "You"), N("d", "Intent settled", "Each answer with who gave it and what it rests on", "The planner")], links: [E("a", "b"), E("b", "c"), E("c", "d"), E("c", "a", "next item", "bottom")] },
    build: { say: "Loops per file. A file that fails goes straight back.", nodes: [N("a", "Write one file", "", "Builder agent"), N("b", "Automatic checks", "Secrets, size, a caller check, your statements", "A script"), N("c", "Checks the agent performs", "Run it, call it, look at it", "Builder agent"), N("d", "File owes nothing", "Recorded with what was seen", "The record")], links: [E("a", "b"), E("b", "c"), E("c", "d"), E("b", "a", "failed: fix it now", "bottom"), E("d", "a", "next file", "top")] },
    scan: { say: "Loops over each menu and dialog the page can open.", nodes: [N("a", "Map the page", "Controls, words, cards, charts", "A script"), N("b", "Open each menu and dialog", "Screenshot it, list it, close it", "A script"), N("c", "Line up with what is known", "Same control, same number, same verdicts", "The planner"), N("d", "Findings recorded as claims", "Not yet counted", "The record")], links: [E("a", "b"), E("b", "c"), E("c", "d"), E("b", "b", "next opener")] },
    validate: { say: "Loops over every claim. Three ways out, and only one of them reaches you.", nodes: [N("a", "Take the next claim", "", "Reviewer agent"), N("b", "Look at the real thing", "A real screenshot, against the criterion", "Reviewer agent"), N("c", "Confirmed: an error", "Goes to be fixed. Not to you", "To stage 6"), N("d", "Dismissed: a false alarm", "With the reason, remembered next time", "The record"), N("e", "A matter of taste", "The only way out that reaches you", "You")], links: [E("a", "b"), E("b", "c", "an error"), E("b", "d", "not a problem", "top"), E("b", "e", "works, but you may not like it", "top"), E("e", "a", "next claim", "bottom")] },
    fix: { say: "Loops until a second look agrees it is fixed.", nodes: [N("a", "Find the cause in the code", "What was intended, and why it broke", "Builder agent"), N("b", "Fix it on a review branch", "", "Builder agent"), N("c", "Scan just that area again", "And what immediately surrounds it", "A script"), N("d", "Keep a proof screenshot", "", "Builder agent"), N("e", "Second look", "", "Reviewer agent")], links: [E("a", "b"), E("b", "c"), E("c", "d"), E("d", "e"), E("e", "a", "still wrong", "bottom")] },
    finish: { say: "The only loop that starts with you: a preference goes back to the plan.", nodes: [N("a", "Every check cleared?", "", "The planner"), N("b", "Everything planned is there?", "And nothing unplanned", "The planner"), N("c", "Is the flow right? Do you like it?", "The one question left to you", "You"), N("d", "Passed", "The record is closed and kept", "The record")], links: [E("a", "b"), E("b", "c"), E("c", "d"), E("a", "a", "not yet: back to the work"), E("c", "a", "change it: to the plan, then round again", "top")] },
  }
  const G = (id: string, title: string, sub: string): Stage => ({ id, title, sub, inside: inside[id] })
  return {
    say: "Each lane is who does the work; each column is a stage. Outlined boxes are yours; everything else happens without you.",
    lanes: ["You", "Planning agent", "Builder agent", "The scan (a script)", "Reviewer agent", "The planner's record"],
    stages: [G("plan", "1. Plan", "Who it is for and what they come to do"), G("intent", "2. Intent", "Why each thing is there"), G("build", "3. Build", "Code, checked file by file against the rules"), G("scan", "4. Scan", "The page mapped, with real screenshots"), G("validate", "5. Validate", "Every claim confirmed or dismissed"), G("fix", "6. Fix and prove", "Each confirmed error fixed, then shown fixed"), G("finish", "7. Finish", "Every check cleared, and you like it")],
    nodes: [
      S("say", "plan", 0, "Say what you want", "Who it is for, what they come to do"), S("draft", "plan", 1, "Draft people and use cases", "Not built yet", true),
      S("code", "intent", 2, "Answer what the code settles", "Where a figure comes from, what a button changes"), S("yours", "intent", 0, "Answer what only you know", "What it is for, who uses it"),
      S("write", "build", 2, "Write one file", ""), S("auto", "build", 3, "Automatic checks on that file", "The rules in force"),
      S("map", "scan", 3, "Map the page", "Real screenshots, every menu and dialog"), S("claims", "scan", 5, "Record findings as claims", "Not yet counted"),
      S("look", "validate", 4, "Look at the real thing", "Against the criterion"), S("taste", "validate", 0, "Judge a matter of taste", "Works, but you may not like it"),
      S("fix", "fix", 2, "Fix the cause", "On a review branch"), S("second", "fix", 4, "Second look", "By someone who did not write the fix"),
      S("cleared", "finish", 5, "Every check cleared?", "And nothing planned is missing"), S("like", "finish", 0, "Is the flow right? Do you like it?", "The one question left to you"),
    ],
    links: [
      E("say", "draft"), E("draft", "code"), E("code", "yours"), E("yours", "write"), E("write", "auto"), E("auto", "map"), E("map", "claims"), E("claims", "look"),
      E("look", "fix", "an error"), E("look", "taste", "works, but you may not like it"), E("fix", "second"), E("second", "cleared"), E("taste", "like"), E("cleared", "like"),
      E("yours", "say", "an answer changes the plan", "top"), E("auto", "write", "failed: fix it now", "left"), E("second", "fix", "still wrong", "left"),
      E("cleared", "look", "not yet: round again", "bottom"), E("like", "say", "you want it different: back to the plan", "top2"),
    ],
  }
}
