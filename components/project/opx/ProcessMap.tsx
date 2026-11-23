"use client"

/*
 * A process map, drawn with React Flow: a swim lane (who does it, by stage)
 * or a left-to-right layer, with the lines forward and the loops back.
 * Double-click a stage or step to open the layer inside it; the path back is
 * always on screen (and Esc goes back one). A step can lead to another process
 * document: it carries a mark that opens it (double-click does too), the page
 * that holds the documents does the going and offers the way back, and a link
 * whose document is gone says so in words. Right-click anything to change it,
 * or use the buttons above the drawing. A step dragged somewhere lands in the
 * nearest place and the lines follow; every change can be undone.
 * Display only: what is on the map, where each box sits, how each line is
 * routed and every edit come from lib/sops/process-map.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useLayoutEffect, type CSSProperties } from "react"
import { Controls, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, ArrowUpRight, Layers, Maximize2, Redo2, Undo2, Unlink } from "lucide-react"
import {
  DIM, addInside, addLane, addLink, addNode, addStage, brokenRefs, brokenWords, cellAt, cellFree, checkLayer, clearOpens, clearUses, crumbs, doorOf, indexAt, isLanes, layerAt, leadsTo, moveLane, moveNode, moveStage, place,
  removeInside, removeLane, removeLink, removeNode, removeStage, renameLane, reorderNode, routeLink, setLink, setNode, setOpens, setStage, setUses, splitLink, updateAt,
  type Layer, type Link, type Path, type Point, type Side,
} from "@/lib/sops/process-map"

const SIDES: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }
type BoxData = { title: string; sub?: string; who?: string; you?: boolean; todo?: boolean; opens?: boolean; from?: boolean; process?: string; skill?: string }

export type Whole = null | "edit" | "view"
/** What the page that holds the documents tells the map, so a step can lead to another process and come back. */
export interface MapLinks {
  /** The document this map is in. A step cannot open it. */
  self?: string
  /** Every process document that exists, id to title. Left out when not known: then nothing is called missing. */
  processes?: Record<string, string>
  /** Goes to another process document. `from` is where the reader was, to be given back on return. */
  onOpen?: (process: string, from: { path: Path; whole: Whole }) => void
  /** The map the reader came from, when they got here through a step. */
  cameFrom?: { name: string; back: (whole: Whole) => void }
}
type LinkState = { name: string | null; broken: null | "missing" | "own" }
const Links = createContext<{ state: (process: string) => LinkState; go?: (process: string) => void; fix?: (e: React.MouseEvent, id: string) => void }>({ state: () => ({ name: null, broken: null }) })
const short = (text: string, most = 40) => (text.length > most ? `${text.slice(0, most - 1)}…` : text)

// The marks under a step: where it leads and the skill that does it. They sit on the step's lower edge, inside the
// room a lane leaves under a box, so the box keeps its size and nothing else moves. Existing tokens only.
const MARKS: CSSProperties = { position: "absolute", left: 10, right: 10, bottom: -13, display: "flex", gap: 4, pointerEvents: "none" }
const MARK: CSSProperties = { pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, height: 24, padding: "0 9px", borderRadius: 999, border: "1px solid var(--opx-line)", background: "var(--opx-card)", color: "var(--opx-muted)", font: "inherit", fontSize: 12, lineHeight: 1, whiteSpace: "nowrap" }
const MARK_TEXT: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: "inherit" }
const FIELD: CSSProperties = { border: "1px solid var(--opx-line)", background: "var(--opx-bg)", color: "var(--opx-ink)", borderRadius: 8, padding: "6px 8px", font: "inherit", fontSize: 13.5 }

function Marks({ id, process, skill }: { id: string; process?: string; skill?: string }) {
  const links = useContext(Links), st = process ? links.state(process) : null
  // A press on a mark is its own act: it must not also pick the step or count as half of a double-click on it.
  const own = { onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() }
  const brokenText = st?.broken === "own" ? "Opens itself" : "Process missing"
  const brokenTitle = st?.broken === "own" ? "This step opens the document it is in, so there is nowhere to go" : "The process this step opened is no longer there"
  const openText = st?.name ? `Opens ${st.name}` : "Opens a process"
  return (
    <div style={MARKS}>
      {st?.broken && (links.fix
        ? <button type="button" className="nodrag nopan" style={{ ...MARK, color: "var(--opx-warn)", borderStyle: "dashed", cursor: "pointer" }} title={`${brokenTitle}. Press to choose another or remove the link.`} onClick={(e) => { e.stopPropagation(); links.fix!(e, id) }} {...own}><Unlink size={12} style={{ flex: "none" }} aria-hidden="true" /><span style={MARK_TEXT}>{brokenText}</span></button>
        : <span style={{ ...MARK, color: "var(--opx-warn)", borderStyle: "dashed" }} title={brokenTitle}><Unlink size={12} style={{ flex: "none" }} aria-hidden="true" /><span style={MARK_TEXT}>{brokenText}</span></span>)}
      {process && st && !st.broken && (links.go
        ? <button type="button" className="nodrag nopan" style={{ ...MARK, color: "var(--opx-accent-text)", cursor: "pointer" }} title={st.name ? `Open "${st.name}"` : "Open the process this step leads to"} onClick={(e) => { e.stopPropagation(); links.go!(process) }} {...own}><ArrowUpRight size={12} style={{ flex: "none" }} aria-hidden="true" /><span style={MARK_TEXT}>{openText}</span></button>
        : <span style={MARK} title={openText}><ArrowUpRight size={12} style={{ flex: "none" }} aria-hidden="true" /><span style={MARK_TEXT}>{openText}</span></span>)}
      {skill && <span style={{ ...MARK, flex: "0 1 auto" }} title={`Done with the skill ${skill}`}><span style={MARK_TEXT}>Uses {skill}</span></span>}
    </div>
  )
}

/** A step. It has a joining point on every side, so a line can leave or arrive wherever reads best. */
function Box({ id, data }: NodeProps<Node<BoxData>>) {
  return (
    <div className={`opx-pm-box${data.you ? " you" : ""}${data.todo ? " todo" : ""}${data.from ? " from" : ""}`}>
      {(Object.keys(SIDES) as Side[]).flatMap((k) => [
        <Handle key={`s${k}`} id={k} type="source" position={SIDES[k]} isConnectable={false} />,
        <Handle key={`t${k}`} id={k} type="target" position={SIDES[k]} isConnectable={false} />,
      ])}
      {data.who && <small>{data.who}</small>}
      <b>{data.title}{data.opens && <Layers size={12} aria-label="Has a layer inside" />}</b>
      {data.sub && <span>{data.sub}</span>}
      {(data.process || data.skill) && <Marks id={id} process={data.process} skill={data.skill} />}
    </div>
  )
}
function Lane({ data }: NodeProps<Node<{ name: string; alt: boolean }>>) {
  return <div className={`opx-pm-lane${data.alt ? " alt" : ""}`}><b>{data.name}</b></div>
}
function Stage({ data }: NodeProps<Node<{ title: string; sub?: string; opens?: boolean }>>) {
  return <div className="opx-pm-stage"><b>{data.title}{data.opens && <Layers size={12} aria-label="Has a layer inside" />}</b><span>{data.sub}</span></div>
}
const nodeTypes = { box: Box, lane: Lane, stage: Stage }

function toEdges(links: Link[], pos: Record<string, Point>, lanes: boolean): Edge[] {
  return links.map((e, i) => {
    const r = routeLink(pos[e.from], pos[e.to], e, lanes), color = r.loop ? "var(--opx-warn)" : "var(--opx-muted)"
    return {
      id: `e${i}`, source: e.from, target: e.to, sourceHandle: r.from, targetHandle: r.to, type: "smoothstep", label: e.label, animated: r.loop, interactionWidth: 18,
      pathOptions: { borderRadius: 14, offset: r.offset },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 }, style: { stroke: color, strokeWidth: 1.6 },
      labelStyle: { fill: r.loop ? "var(--opx-warn)" : "var(--opx-ink)", fontSize: 12 }, labelBgStyle: { fill: "var(--opx-card)" }, labelBgPadding: [7, 4] as [number, number], labelBgBorderRadius: 7,
    }
  })
}
function toNodes(layer: Layer, linking: string | null): Node[] {
  const pos = place(layer)
  const steps = layer.nodes.map((n): Node => ({ id: n.id, type: "box", position: pos[n.id], data: { title: n.title, sub: n.sub, who: isLanes(layer) ? undefined : n.who, todo: n.todo, you: n.you, opens: !!n.inside, from: linking === n.id, process: n.opens?.process, skill: n.uses?.skill }, style: { width: isLanes(layer) ? DIM.node : DIM.chainNode } }))
  if (!isLanes(layer)) return steps
  const width = DIM.laneLabel + layer.stages.length * DIM.col
  const lanes = layer.lanes.map((name, i): Node => ({ id: `lane${i}`, type: "lane", position: { x: 0, y: i * DIM.lane }, data: { name, alt: i % 2 === 1 }, style: { width, height: DIM.lane - 6 }, draggable: false, selectable: false, zIndex: -1 }))
  const heads = layer.stages.map((g, i): Node => ({ id: `stage-${g.id}`, type: "stage", position: { x: DIM.laneLabel + i * DIM.col + 8, y: -DIM.header }, data: { title: g.title, sub: g.sub, opens: !!g.inside }, style: { width: DIM.col - 16 }, draggable: false, selectable: false }))
  return [...lanes, ...heads, ...steps]
}

type Target =
  | { kind: "node"; id: string } | { kind: "stage"; id: string } | { kind: "lane"; index: number; at?: Point }
  | { kind: "edge"; index: number } | { kind: "pane"; at: Point }
// fresh: the form names something just made, so saving it joins that change (one act, one Undo).
// link: the form for where a step leads and the skill it uses, in place of the form for its words.
interface Floating { x: number; y: number; target: Target; form?: { title: string; sub: string; who: string }; fresh?: boolean; link?: { process: string; skill: string; error?: string } }
const BLANK = { title: "", sub: "", who: "" }
const targetOf = (n: Node): Target | null => (n.type === "box" ? { kind: "node", id: n.id } : n.type === "stage" ? { kind: "stage", id: n.id.replace(/^stage-/, "") } : n.type === "lane" ? { kind: "lane", index: Number(n.id.replace("lane", "")) } : null)

const START_NARROW = { x: 8, y: DIM.header * 0.9 + 8, zoom: 0.9 }

/** `start` is read once, when the map is first shown: the layer to open on and whether it fills the screen. */
interface MapProps { map: Layer; onChange?: (next: Layer) => void; rootName?: string; links?: MapLinks; start?: { path?: Path; whole?: Whole } }

export function ProcessMap(props: MapProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>
}

function Inner({ map, onChange, rootName = "The whole process", links, start }: MapProps) {
  const [path, setPath] = useState<Path>(start?.path ?? [])
  const [float, setFloat] = useState<Floating | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  /** The thing last clicked. The toolbar's Change button opens its menu, so nothing depends on a right-click (a phone has none). */
  const [picked, setPicked] = useState<Target | null>(null)
  const [history, setHistory] = useState<{ past: Layer[]; future: Layer[] }>({ past: [], future: [] })
  // Whole screen (owner, 2026-11-15, mock-ups approved 2026-11-16 "Build it as shown"): the map fills the screen,
  // either to change it or just to look at it; Leave whole screen or Esc goes back.
  const [whole, setWhole] = useState<Whole>(start?.whole ?? null)
  const [showHelp, setShowHelp] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow()
  // A path that no longer leads anywhere (what it went through was removed) falls back to the nearest layer that exists.
  const livePath = useMemo(() => { let p = path; while (p.length && !layerAt(map, p)) p = p.slice(0, -1); return p }, [map, path])
  const layer = layerAt(map, livePath) ?? map, names = crumbs(map, livePath), lanes = isLanes(layer), can = !!onChange && whole !== "view"
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  useEffect(() => { setNodes(toNodes(layer, linking)) }, [layer, linking, setNodes])
  const edges = useMemo(() => toEdges(layer.links, place(layer), lanes), [layer, lanes])
  const issues = useMemo(() => (can ? checkLayer(layer) : []), [layer, can])
  // Links that lead nowhere, anywhere in the map, in words: one deep inside a layer is not on screen from the top.
  const processes = links?.processes, self = links?.self
  const here = livePath.map((s) => `${s.kind}:${s.id}`).join("/")
  const broken = useMemo(() => brokenRefs(map, { processes: processes ? Object.keys(processes) : undefined, self }).map((b) => {
    const inside = crumbs(map, b.path).join(" › ")
    return brokenWords(b) + (b.path.map((s) => `${s.kind}:${s.id}`).join("/") === here ? "" : ` (in ${inside || rootName})`)
  }), [map, processes, self, here, rootName])
  const linkState = useCallback((process: string): LinkState => {
    if (self && process === self) return { name: null, broken: "own" }
    if (!processes) return { name: null, broken: null }
    return Object.prototype.hasOwnProperty.call(processes, process) ? { name: processes[process], broken: null } : { name: null, broken: "missing" }
  }, [processes, self])
  /** The other process documents a step here could lead to, by name. */
  const choices = useMemo(() => Object.entries(processes ?? {}).filter(([id]) => id !== self).sort((a, b) => a[1].localeCompare(b[1])), [processes, self])
  const pathKey = livePath.map((s) => s.id).join("/")
  // On a phone the whole map shrunk to fit is too small to read: open at a size the words can be read (0.9 makes a
  // step's title 12px), from the top left corner where the process starts, and let it be dragged.
  // The same holds on a tablet whenever fitting the whole map would shrink it below three quarters of its size.
  const mapWidth = lanes ? DIM.laneLabel + (layer.stages?.length ?? 0) * DIM.col : Math.max(1, layer.nodes.length) * DIM.col
  // Judged by the room the drawing really has (the assistant may be open beside the page), once it has been measured.
  const [room, setRoom] = useState<number | null>(null)
  useLayoutEffect(() => { if (wrap.current) setRoom(wrap.current.clientWidth) }, [])
  const narrow = room != null ? room / mapWidth < 0.5 : typeof window !== "undefined" && window.innerWidth < 1100 && (window.innerWidth < 700 || (window.innerWidth - 80) / mapWidth < 0.75)
  // While the map fills the screen the page under it does not scroll, and the drawing is fitted to its new room.
  useEffect(() => {
    if (!whole) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [whole])
  useEffect(() => { const id = requestAnimationFrame(() => { if (!narrow) fitView({ padding: 0.04, duration: 200 }) }); return () => cancelAnimationFrame(id) }, [whole, fitView, narrow])
  useEffect(() => { setPicked(null) }, [pathKey])
  // What was picked may have been removed or moved since: only offer what is still there.
  const pickName = !picked ? null
    : picked.kind === "node" ? layer.nodes.find((n) => n.id === picked.id)?.title ?? null
    : picked.kind === "stage" ? layer.stages?.find((s) => s.id === picked.id)?.title ?? null
    : picked.kind === "lane" ? layer.lanes?.[picked.index] ?? null
    : picked.kind === "edge" ? (layer.links[picked.index] ? layer.links[picked.index].label || "this line" : null)
    : null
  const pick = pickName != null ? picked : null

  /** Every change goes through here, so every change can be undone. */
  // join: this edit finishes the one just made (naming a new lane, stage or step), so it shares that Undo
  // (Library check, 2026-11-15: adding then naming a lane took two Undo presses).
  const commit = useCallback((next: Layer, join = false) => {
    if (!onChange || next === map) return
    setHistory((h) => (join && h.past.length ? { past: h.past, future: [] } : { past: [...h.past.slice(-49), map], future: [] }))
    onChange(next)
  }, [map, onChange])
  const change = useCallback((fn: (l: Layer) => Layer, join = false) => commit(updateAt(map, livePath, fn), join), [commit, map, livePath])
  const undo = useCallback(() => { const prev = history.past.at(-1); if (!prev || !onChange) return; setHistory({ past: history.past.slice(0, -1), future: [map, ...history.future] }); onChange(prev) }, [history, map, onChange])
  const redo = useCallback(() => { const next = history.future[0]; if (!next || !onChange) return; setHistory({ past: [...history.past, map], future: history.future.slice(1) }); onChange(next) }, [history, map, onChange])
  const back = useCallback(() => setPath((p) => p.slice(0, -1)), [])
  const open = (kind: "stage" | "node", id: string) => { const door = doorOf(layer, kind, id); if (door) { setPath([...livePath, door]); setFloat(null) } return !!door }
  const onOpen = links?.onOpen
  /** Leaves for another process document, saying where the reader was so the way back can restore it. */
  const go = useMemo(() => (onOpen ? (process: string) => { setFloat(null); onOpen(process, { path: livePath, whole }) } : undefined), [onOpen, livePath, whole])
  const tidy = () => { setNodes(toNodes(layer, linking)); requestAnimationFrame(() => { if (narrow) setViewport(START_NARROW); else fitView({ padding: 0.04, duration: 250 }) }) }

  // Keys, while the pointer is over the drawing: Esc closes what is open on top (a form, a menu, a line or step being
  // placed) and otherwise goes back one layer; Ctrl+Z undoes and Ctrl+Shift+Z (or Ctrl+Y) redoes.
  const live = useRef({ float, linking, placing, depth: livePath.length, undo, redo, whole })
  live.current = { float, linking, placing, depth: livePath.length, undo, redo, whole }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = live.current, typing = !!(e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]"), over = !!wrap.current?.matches(":hover, :focus-within")
      if (e.key === "Escape") {
        if (s.float) setFloat(null)
        else if (s.linking || s.placing) { setLinking(null); setPlacing(false) }
        else if (s.depth && !typing && over) back()
        else if (s.whole && !typing) setWhole(null)
      } else if ((e.ctrlKey || e.metaKey) && !typing && over && (e.key === "z" || e.key === "Z" || e.key === "y")) {
        e.preventDefault()
        if (e.key === "y" || e.shiftKey) s.redo(); else s.undo()
      }
    }
    // A menu or form closes when anything outside it is pressed: the drawing, a box, or the rest of the page.
    const onDown = (e: PointerEvent) => { if (live.current.float && !(e.target as HTMLElement)?.closest?.(".opx-pm-float")) setFloat(null) }
    window.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown, true)
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown, true) }
  }, [back])

  const at = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: Math.max(8, Math.min(e.clientX - r.left, r.width - 268)), y: Math.max(8, Math.min(e.clientY - r.top, r.height - 300)) }
  }
  const flowAt = (e: { clientX: number; clientY: number }) => screenToFlowPosition({ x: e.clientX, y: e.clientY })
  // A step's menu is the longest: it is placed high enough to show all of it.
  const menu = (e: React.MouseEvent | MouseEvent, target: Target) => { if (!can) return; e.preventDefault(); const p = at(e), r = wrap.current!.getBoundingClientRect(); setFloat({ ...p, y: target.kind === "node" ? Math.max(8, Math.min(p.y, r.height - 372)) : p.y, target }) }
  const linkFor = (id: string): Floating["link"] => { const n = layer.nodes.find((x) => x.id === id); return { process: n?.opens?.process ?? "", skill: n?.uses?.skill ?? "" } }
  /** A broken mark was pressed: the form to choose another process, or remove the link, opens where the pointer is. */
  const fix = useMemo(() => (can ? (e: React.MouseEvent, id: string) => setFloat({ ...at(e), target: { kind: "node", id }, link: linkFor(id) }) : undefined), [can, layer]) // eslint-disable-line react-hooks/exhaustive-deps
  const linksValue = useMemo(() => ({ state: linkState, go, fix }), [linkState, go, fix])
  /** Double-click on a step: its own layer, else the process it opens, else its stage's loop. */
  const enter = (id: string) => {
    const to = leadsTo(layer, id)
    if (!to) return
    if ("layer" in to) { setPath([...livePath, to.layer]); setFloat(null); return }
    if (!linkState(to.process).broken) go?.(to.process)
    else if (can) { const r = wrap.current!.getBoundingClientRect(); setFloat({ x: Math.max(8, r.width / 2 - 130), y: 16, target: { kind: "node", id }, link: linkFor(id) }) }
  }
  /** Keeps where a step leads and the skill it uses, as one change (one Undo). */
  const saveLink = () => {
    if (!float?.link || float.target.kind !== "node") return
    const id = float.target.id, f = float.link, skill = f.skill.trim(), was = linkFor(id)!
    if (skill && skill !== was.skill && setUses(layer, id, skill) === layer) { setFloat({ ...float, link: { ...f, error: "A skill's name starts with a letter or digit and uses only letters, digits, spaces and - _ . : /" } }); return }
    if (f.process !== was.process || skill !== was.skill) change((l) => {
      const led = f.process ? setOpens(l, id, f.process, self) : clearOpens(l, id)
      return skill ? setUses(led, id, skill) : clearUses(led, id)
    })
    setFloat(null)
  }
  const formFor = (t: Target): Floating["form"] => {
    if (t.kind === "node") { const n = layer.nodes.find((x) => x.id === t.id); return { title: n?.title ?? "", sub: n?.sub ?? "", who: n?.who ?? "" } }
    if (t.kind === "stage") { const s = layer.stages?.find((x) => x.id === t.id); return { title: s?.title ?? "", sub: s?.sub ?? "", who: "" } }
    if (t.kind === "lane") return { title: layer.lanes?.[t.index] ?? "", sub: "", who: "" }
    if (t.kind === "edge") return { title: layer.links[t.index]?.label ?? "", sub: "", who: "" }
    return BLANK
  }
  const saveForm = () => {
    if (!float?.form) return
    const { target: t, form: f } = float, title = f.title.trim(), join = !!float.fresh
    if (t.kind === "edge") change((l) => setLink(l, t.index, { label: title }), join)
    else if (!title) return
    else if (t.kind === "node") change((l) => setNode(l, t.id, { title, sub: f.sub.trim(), ...(lanes ? {} : { who: f.who.trim() }) }), join)
    else if (t.kind === "stage") change((l) => setStage(l, t.id, { title, sub: f.sub.trim() }), join)
    else if (t.kind === "lane") change((l) => renameLane(l, t.index, title), join)
    setFloat(null)
  }
  /** Asks for the words of something just made, where the pointer is (or at the top of the drawing). */
  const nameIt = (target: Target, title: string, where?: { x: number; y: number }) => {
    const r = wrap.current!.getBoundingClientRect()
    setFloat({ x: where?.x ?? r.width / 2 - 130, y: where?.y ?? 16, target, form: { title, sub: "", who: "" }, fresh: true })
  }
  const stepInto = (cell: { stage: string; lane: number }, where?: { x: number; y: number }) => {
    if (!cellFree(layer, cell)) return false
    const made = addNode(layer, { title: "New step", ...cell, ...(layer.lanes?.[cell.lane] === "You" ? { you: true } : {}) })
    change(() => made.layer); nameIt({ kind: "node", id: made.id }, "New step", where)
    return true
  }
  const stepAfter = (afterId?: string) => {
    const made = addNode(layer, { title: "New step" }, afterId), last = afterId ?? layer.nodes.at(-1)?.id
    change(() => (last ? addLink(made.layer, last, made.id) : made.layer)); nameIt({ kind: "node", id: made.id }, "New step", float ? { x: float.x, y: float.y } : undefined)
  }
  const between = (index: number) => { const made = splitLink(layer, index); if (made.id) { change(() => made.layer); nameIt({ kind: "node", id: made.id }, "New step", float ? { x: float.x, y: float.y } : undefined) } }
  const newLane = (index: number) => { change((l) => addLane(l, index)); nameIt({ kind: "lane", index: Math.max(0, Math.min(index, layer.lanes?.length ?? 0)) }, "New lane", float ? { x: float.x, y: float.y } : undefined) }
  const newStage = (index: number) => { const made = addStage(layer, index); if (made.id) { change(() => made.layer); nameIt({ kind: "stage", id: made.id }, "New stage", float ? { x: float.x, y: float.y } : undefined) } }
  /** A step let go of somewhere lands in the nearest place; if that place is taken it goes back where it was. */
  const drop = (n: Node) => {
    if (!can || n.type !== "box") return
    const next = lanes
      ? (() => { const cell = cellAt(layer, { x: n.position.x + DIM.node / 2, y: n.position.y + DIM.nodeH / 2 }); return cell ? moveNode(layer, n.id, cell) : layer })()
      : reorderNode(layer, n.id, indexAt(layer, n.position.x))
    if (next === layer) setNodes(toNodes(layer, linking)); else change(() => next)
  }

  const t = float?.target
  const node = t?.kind === "node" ? layer.nodes.find((n) => n.id === t.id) : null
  const nodeLink = node?.opens ? linkState(node.opens.process) : null
  const back2 = links?.cameFrom
  const cell = t && (t.kind === "pane" || t.kind === "lane") && t.at ? cellAt(layer, t.at) : null
  const close = () => setFloat(null)
  const item = (label: string, run: () => void, danger?: boolean, off?: boolean) => <button type="button" role="menuitem" key={label} className={danger ? "danger" : ""} disabled={off} onClick={run}>{label}</button>
  const editItem = (label: string) => item(label, () => setFloat((f) => f && { ...f, form: formFor(f.target) }))
  const stageIndex = t?.kind === "stage" ? layer.stages?.findIndex((s) => s.id === t.id) ?? -1 : -1
  const laneCount = layer.lanes?.length ?? 0, stageCount = layer.stages?.length ?? 0
  const inLane = (i: number) => layer.nodes.filter((n) => n.lane === i).length, inStage = (id: string) => layer.nodes.filter((n) => n.stage === id).length

  return (
    <section className={`opx-sec${whole ? " opx-pm-whole" : ""}`} aria-label={whole ? `${rootName}, whole screen` : undefined}>
      {whole && (
        <div className="opx-pm-wholebar">
          <b>{rootName}</b>
          <span className="gap" />
          {whole === "edit" && <button type="button" className={`opx-btn${showHelp ? " on" : ""}`} aria-expanded={showHelp} onClick={() => setShowHelp((v) => !v)}>How to change it</button>}
          {!!onChange && <button type="button" className={`opx-btn${whole === "edit" ? " primary" : ""}`} aria-pressed={whole === "edit"} onClick={() => setWhole("edit")}>Change it</button>}
          <button type="button" className={`opx-btn${whole === "view" ? " primary" : ""}`} aria-pressed={whole === "view"} onClick={() => { setWhole("view"); setFloat(null); setLinking(null); setPlacing(false) }}>Just look</button>
          <button type="button" className="opx-btn" onClick={() => setWhole(null)}>Leave whole screen</button>
        </div>
      )}
      {(!whole || livePath.length > 0) && <nav className="opx-pm-crumb" aria-label="Where you are in the map">
        {livePath.length > 0 && <button type="button" className="opx-btn sm primary" onClick={back}><ArrowLeft size={14} /> Back</button>}
        {!livePath.length && back2 && <button type="button" className="opx-btn sm primary" onClick={() => back2.back(whole)}><ArrowLeft size={14} /> Back to {short(back2.name)}</button>}
        <button type="button" className={`opx-pm-step${livePath.length ? "" : " here"}`} onClick={() => setPath([])}>{rootName}</button>
        {names.map((name, i) => <span key={i} className="opx-pm-trail"><i aria-hidden="true">›</i><button type="button" className={`opx-pm-step${i === names.length - 1 ? " here" : ""}`} onClick={() => setPath(livePath.slice(0, i + 1))}>{name}</button></span>)}
        {!whole && <button type="button" className="opx-btn sm" style={{ marginLeft: "auto" }} onClick={() => setWhole(onChange ? "edit" : "view")}><Maximize2 size={13} /> Whole screen</button>}
      </nav>}
      {(!whole || (whole === "edit" && showHelp)) && <p className="opx-muted">
        {layer.say ? `${layer.say} ` : ""}Grey lines go forward; orange dashed lines are loops. Click a step, lane, stage or line and press Change to rename, move or remove it. Double-click a stage or step to open what is inside it{livePath.length ? ", and Back (or Esc) to come out" : ""}.{layer.nodes.some((n) => n.opens) ? " A step marked Opens leads to another process: press the mark, or double-click the step." : ""}{can ? " A right-click opens the same menu. Drag a step to move it: it lands in the nearest free place and the lines follow." : " Drag to look around, scroll to zoom."}
      </p>}
      {can && (
        <div className="opx-pm-bar" role="toolbar" aria-label="Change the map">
          <button type="button" className={`opx-btn sm${placing ? " on" : ""}`} onClick={() => { if (lanes) { setPlacing((p) => !p); setLinking(null) } else stepAfter() }}>Add a step</button>
          {lanes && <button type="button" className="opx-btn sm" disabled={laneCount >= 12} onClick={() => newLane(laneCount)}>Add a lane</button>}
          {lanes && <button type="button" className="opx-btn sm" disabled={stageCount >= 16} onClick={() => newStage(stageCount)}>Add a stage</button>}
          <button type="button" className="opx-btn sm" onClick={tidy}>Tidy up</button>
          <button type="button" className="opx-btn sm" disabled={!pick} aria-haspopup="menu" title={pick ? undefined : "Click a step, lane, stage or line first"}
            onClick={() => { if (!pick) return; const r = wrap.current!.getBoundingClientRect(); setLinking(null); setPlacing(false); setFloat({ x: Math.max(8, r.width / 2 - 130), y: 16, target: pick }) }}>
            {pick ? `Change "${pickName!.length > 28 ? `${pickName!.slice(0, 27)}…` : pickName}"` : "Change"}
          </button>
          <span className="gap" />
          <button type="button" className="opx-btn sm" disabled={!history.past.length} onClick={undo}><Undo2 size={13} /> Undo</button>
          <button type="button" className="opx-btn sm" disabled={!history.future.length} onClick={redo}><Redo2 size={13} /> Redo</button>
        </div>
      )}
      {/* A phone has no Esc key, so each of these modes has a Cancel to press. */}
      {linking && <p className="opx-pm-note" role="status">Press the step this line goes to. <button type="button" className="opx-btn sm" onClick={() => setLinking(null)}>Cancel</button></p>}
      {placing && <p className="opx-pm-note" role="status">Press an empty place in a lane to put the step there. <button type="button" className="opx-btn sm" onClick={() => setPlacing(false)}>Cancel</button></p>}
      <div ref={wrap} className={`opx-pm${lanes ? "" : " sub"}${placing ? " placing" : ""}`} onContextMenu={(e) => { if (can) e.preventDefault() }}>
        <Links.Provider value={linksValue}><ReactFlow
          key={`${pathKey || "top"}|${narrow ? "near" : "fit"}`} nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes}
          fitView={!narrow} defaultViewport={narrow ? START_NARROW : undefined} fitViewOptions={{ padding: 0.04 }} minZoom={0.25} maxZoom={1.6} nodesConnectable={false} zoomOnDoubleClick={false} deleteKeyCode={null} nodesDraggable={can}
          onNodeDoubleClick={(_, n) => { const tg = targetOf(n); if (tg?.kind === "node") enter(tg.id); else if (tg?.kind === "stage") open("stage", tg.id) }}
          onNodeClick={(e, n) => {
            if (placing && n.type === "lane") { const c = cellAt(layer, flowAt(e)); if (c && stepInto(c, at(e))) setPlacing(false) }
            else if (linking && n.type === "box") { const from = linking, index = layer.links.length; setLinking(null); if (!layer.links.some((x) => x.from === from && x.to === n.id)) { change((l) => addLink(l, from, n.id)); nameIt({ kind: "edge", index }, "") } }
            else if (!placing && !linking) { const tg = targetOf(n); if (tg) setPicked(tg) }
          }}
          onEdgeClick={(_, edge) => setPicked({ kind: "edge", index: Number(edge.id.slice(1)) })}
          onPaneClick={() => setPicked(null)}
          onNodeDragStop={(_, n) => drop(n)}
          onNodeContextMenu={(e, n) => { const tg = targetOf(n); if (tg) menu(e, tg.kind === "lane" ? { ...tg, at: flowAt(e) } : tg) }}
          onEdgeContextMenu={(e, edge) => menu(e, { kind: "edge", index: Number(edge.id.slice(1)) })}
          onPaneContextMenu={(e) => menu(e, { kind: "pane", at: flowAt(e) })}
        >
          <Controls showInteractive={false} />
          {livePath.length > 0 && <Panel position="top-left"><button type="button" className="opx-btn primary" onClick={back}><ArrowLeft size={15} /> Back to {names.length > 1 ? names[names.length - 2] : rootName}</button></Panel>}
          {!livePath.length && back2 && <Panel position="top-left"><button type="button" className="opx-btn primary" onClick={() => back2.back(whole)}><ArrowLeft size={15} /> Back to {short(back2.name)}</button></Panel>}
        </ReactFlow></Links.Provider>

        {float && t && (
          <div className="opx-pm-float" style={{ left: float.x, top: float.y, maxHeight: "calc(100% - 16px)", overflowY: "auto" }} role={float.form || float.link ? "dialog" : "menu"} aria-label={float.link ? "Where this step leads" : float.form ? "Change the text" : "What to do with this"}>
            {float.link && t.kind === "node" ? (
              <form onSubmit={(e) => { e.preventDefault(); saveLink() }}>
                <label>Process this step opens
                  <select autoFocus style={FIELD} value={float.link.process} onChange={(e) => setFloat({ ...float, link: { ...float.link!, process: e.target.value, error: undefined } })}>
                    <option value="">None</option>
                    {float.link.process && !choices.some(([id]) => id === float.link!.process) && <option value={float.link.process}>{float.link.process === self ? "This document (not allowed)" : processes ? "A process that is no longer there" : "The process it opens now"}</option>}
                    {choices.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                  </select>
                </label>
                {!choices.length && <span className="opx-muted" style={{ fontSize: 12 }}>{processes ? "There is no other process map to lead to yet." : "The list of process maps is not available here."}</span>}
                <label>Skill that does it (its name)<input value={float.link.skill} maxLength={120} onChange={(e) => setFloat({ ...float, link: { ...float.link!, skill: e.target.value, error: undefined } })} /></label>
                {float.link.error && <span role="alert" style={{ fontSize: 12, color: "var(--opx-warn)" }}>{float.link.error}</span>}
                <div className="row"><button type="button" className="opx-btn sm" onClick={close}>Cancel</button><button type="submit" className="opx-btn sm primary">Save</button></div>
              </form>
            ) : float.form ? (
              <form onSubmit={(e) => { e.preventDefault(); saveForm() }}>
                <label>{t.kind === "edge" ? "What the line says" : t.kind === "lane" ? "Who this lane is" : "Title"}<input autoFocus value={float.form.title} maxLength={200} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setFloat({ ...float, form: { ...float.form!, title: e.target.value } })} /></label>
                {(t.kind === "node" || t.kind === "stage") && <label>Detail<input value={float.form.sub} maxLength={200} onChange={(e) => setFloat({ ...float, form: { ...float.form!, sub: e.target.value } })} /></label>}
                {t.kind === "node" && !lanes && <label>Who does it<input value={float.form.who} maxLength={200} onChange={(e) => setFloat({ ...float, form: { ...float.form!, who: e.target.value } })} /></label>}
                <div className="row"><button type="button" className="opx-btn sm" onClick={close}>Cancel</button><button type="submit" className="opx-btn sm primary">Save</button></div>
              </form>
            ) : t.kind === "node" && node ? (
              <>
                {editItem("Change the text")}
                {doorOf(layer, "node", node.id) ? item("Open what is inside", () => open("node", node.id)) : item("Add a layer inside", () => { change((l) => addInside(l, "node", node.id)); close() })}
                {node.opens && nodeLink && !nodeLink.broken && go && item(nodeLink.name ? `Open "${short(nodeLink.name, 24)}"` : "Open the process it leads to", () => go(node.opens!.process))}
                {item(nodeLink?.broken ? "Fix or remove the broken link" : node.opens || node.uses ? "Change where it leads or the skill" : "Lead to a process or name a skill", () => setFloat((f) => f && { ...f, link: linkFor(node.id) }))}
                {item("Draw a line from here", () => { setLinking(node.id); setPlacing(false); close() })}
                {!lanes && item("Add a step after this", () => stepAfter(node.id))}
                {item(node.you ? "Not the owner's step" : "Mark as the owner's step", () => { change((l) => setNode(l, node.id, { you: !node.you })); close() })}
                {item(node.todo ? "Mark as built" : "Mark as not built yet", () => { change((l) => setNode(l, node.id, { todo: !node.todo })); close() })}
                {node.inside && item("Remove the layer inside", () => { change((l) => removeInside(l, "node", node.id)); close() }, true)}
                {item("Remove this step", () => { change((l) => removeNode(l, node.id)); close() }, true)}
              </>
            ) : t.kind === "stage" ? (
              <>
                {editItem("Change the text")}
                {doorOf(layer, "stage", t.id) ? item("Open what is inside", () => open("stage", t.id)) : item("Add a layer inside", () => { change((l) => addInside(l, "stage", t.id)); close() })}
                {item("Add a stage before", () => newStage(stageIndex), false, stageCount >= 16)}
                {item("Add a stage after", () => newStage(stageIndex + 1), false, stageCount >= 16)}
                {item("Move left", () => { change((l) => moveStage(l, t.id, -1)); close() }, false, stageIndex <= 0)}
                {item("Move right", () => { change((l) => moveStage(l, t.id, 1)); close() }, false, stageIndex >= stageCount - 1)}
                {doorOf(layer, "stage", t.id) && item("Remove the layer inside", () => { change((l) => removeInside(l, "stage", t.id)); close() }, true)}
                {item(inStage(t.id) ? `Remove this stage and its ${inStage(t.id)} step${inStage(t.id) === 1 ? "" : "s"}` : "Remove this stage", () => { change((l) => removeStage(l, t.id)); close() }, true, stageCount <= 1)}
              </>
            ) : t.kind === "lane" ? (
              <>
                {cell && cellFree(layer, cell) && item("Add a step here", () => { stepInto(cell, { x: float.x, y: float.y }) })}
                {editItem("Rename this lane")}
                {item("Add a lane above", () => newLane(t.index), false, laneCount >= 12)}
                {item("Add a lane below", () => newLane(t.index + 1), false, laneCount >= 12)}
                {item("Move up", () => { change((l) => moveLane(l, t.index, -1)); close() }, false, t.index <= 0)}
                {item("Move down", () => { change((l) => moveLane(l, t.index, 1)); close() }, false, t.index >= laneCount - 1)}
                {item(inLane(t.index) ? `Remove this lane and its ${inLane(t.index)} step${inLane(t.index) === 1 ? "" : "s"}` : "Remove this lane", () => { change((l) => removeLane(l, t.index)); close() }, true, laneCount <= 1)}
              </>
            ) : t.kind === "edge" ? (
              <>
                {editItem("Change what the line says")}
                {layer.links[t.index]?.from !== layer.links[t.index]?.to && item("Put a step in between", () => between(t.index))}
                {item("Remove this line", () => { change((l) => removeLink(l, t.index)); close() }, true)}
              </>
            ) : lanes ? (
              <>
                {cell && cellFree(layer, cell) && item("Add a step here", () => { stepInto(cell, { x: float.x, y: float.y }) })}
                {item("Add a lane at the bottom", () => newLane(laneCount), false, laneCount >= 12)}
                {item("Add a stage at the end", () => newStage(stageCount), false, stageCount >= 16)}
              </>
            ) : item("Add a step at the end", () => stepAfter())}
          </div>
        )}
      </div>
      {(broken.length > 0 || issues.length > 0) && <ul className="opx-pm-issues" aria-label="To tidy up">{[...new Set([...broken, ...issues])].slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>}
    </section>
  )
}
