"use client"

/*
 * A process map, drawn with React Flow: a swim lane (who does it, by stage)
 * or a left-to-right layer, with the lines forward and the loops back.
 * Double-click a stage or step to open the layer inside it; the path back is
 * always on screen (and Esc goes back one). Right-click anything to change it.
 * Display only: what is on the map, where each box sits, how each line is
 * routed and every edit come from lib/sops/process-map.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Controls, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, Layers } from "lucide-react"
import {
  DIM, addInside, addLink, addNode, cellAt, cellFree, checkLayer, crumbs, doorOf, isLanes, layerAt, place, removeInside, removeLink, removeNode, renameLane, routeLink,
  setLink, setNode, setStage, updateAt, type Layer, type Link, type Path, type Point, type Side,
} from "@/lib/sops/process-map"

const SIDES: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }
type BoxData = { title: string; sub?: string; who?: string; you?: boolean; todo?: boolean; opens?: boolean; from?: boolean }

/** A step. It has a joining point on every side, so a line can leave or arrive wherever reads best. */
function Box({ data }: NodeProps<Node<BoxData>>) {
  return (
    <div className={`opx-pm-box${data.you ? " you" : ""}${data.todo ? " todo" : ""}${data.from ? " from" : ""}`}>
      {(Object.keys(SIDES) as Side[]).flatMap((k) => [
        <Handle key={`s${k}`} id={k} type="source" position={SIDES[k]} isConnectable={false} />,
        <Handle key={`t${k}`} id={k} type="target" position={SIDES[k]} isConnectable={false} />,
      ])}
      {data.who && <small>{data.who}</small>}
      <b>{data.title}{data.opens && <Layers size={12} aria-label="Has a layer inside" />}</b>
      {data.sub && <span>{data.sub}</span>}
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
  const steps = layer.nodes.map((n): Node => ({ id: n.id, type: "box", position: pos[n.id], data: { title: n.title, sub: n.sub, who: isLanes(layer) ? undefined : n.who, todo: n.todo, you: n.you, opens: !!n.inside, from: linking === n.id }, style: { width: isLanes(layer) ? DIM.node : DIM.chainNode } }))
  if (!isLanes(layer)) return steps
  const width = DIM.laneLabel + layer.stages.length * DIM.col
  const lanes = layer.lanes.map((name, i): Node => ({ id: `lane${i}`, type: "lane", position: { x: 0, y: i * DIM.lane }, data: { name, alt: i % 2 === 1 }, style: { width, height: DIM.lane - 6 }, draggable: false, selectable: false, zIndex: -1 }))
  const heads = layer.stages.map((g, i): Node => ({ id: `stage-${g.id}`, type: "stage", position: { x: DIM.laneLabel + i * DIM.col + 8, y: -DIM.header }, data: { title: g.title, sub: g.sub, opens: !!g.inside }, style: { width: DIM.col - 16 }, draggable: false, selectable: false }))
  return [...lanes, ...heads, ...steps]
}

type Target = { kind: "node"; id: string } | { kind: "stage"; id: string } | { kind: "lane"; index: number } | { kind: "edge"; index: number } | { kind: "pane"; at: Point }
interface Floating { x: number; y: number; target: Target; form?: { title: string; sub: string; who: string } }
const targetOf = (n: Node): Target | null => (n.type === "box" ? { kind: "node", id: n.id } : n.type === "stage" ? { kind: "stage", id: n.id.replace(/^stage-/, "") } : n.type === "lane" ? { kind: "lane", index: Number(n.id.replace("lane", "")) } : null)

export function ProcessMap(props: { map: Layer; onChange?: (next: Layer) => void; rootName?: string }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>
}

function Inner({ map, onChange, rootName = "The whole process" }: { map: Layer; onChange?: (next: Layer) => void; rootName?: string }) {
  const [path, setPath] = useState<Path>([])
  const [float, setFloat] = useState<Floating | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  // A path that no longer leads anywhere (what it went through was removed) falls back to the nearest layer that exists.
  const livePath = useMemo(() => { let p = path; while (p.length && !layerAt(map, p)) p = p.slice(0, -1); return p }, [map, path])
  const layer = layerAt(map, livePath) ?? map, names = crumbs(map, livePath), lanes = isLanes(layer), can = !!onChange
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  useEffect(() => { setNodes(toNodes(layer, linking)) }, [layer, linking, setNodes])
  const edges = useMemo(() => toEdges(layer.links, place(layer), lanes), [layer, lanes])
  const issues = useMemo(() => (can ? checkLayer(layer) : []), [layer, can])

  const change = useCallback((fn: (l: Layer) => Layer) => { onChange?.(updateAt(map, livePath, fn)) }, [map, livePath, onChange])
  const back = useCallback(() => setPath((p) => p.slice(0, -1)), [])
  const open = (kind: "stage" | "node", id: string) => { const door = doorOf(layer, kind, id); if (door) { setPath([...livePath, door]); setFloat(null) } return !!door }

  // Esc closes what is open on top (a form, a menu, a line being drawn); with nothing open it goes back one layer.
  const state = useRef({ float, linking, depth: livePath.length })
  state.current = { float, linking, depth: livePath.length }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const s = state.current, typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")
      if (s.float) setFloat(null)
      else if (s.linking) setLinking(null)
      else if (s.depth && !typing && wrap.current?.matches(":hover, :focus-within")) back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [back])

  const at = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: Math.max(8, Math.min(e.clientX - r.left, r.width - 268)), y: Math.max(8, Math.min(e.clientY - r.top, r.height - 250)) }
  }
  const menu = (e: React.MouseEvent | MouseEvent, target: Target) => { if (!can) return; e.preventDefault(); setFloat({ ...at(e), target }) }
  const formFor = (t: Target): Floating["form"] => {
    if (t.kind === "node") { const n = layer.nodes.find((x) => x.id === t.id); return { title: n?.title ?? "", sub: n?.sub ?? "", who: n?.who ?? "" } }
    if (t.kind === "stage") { const s = layer.stages?.find((x) => x.id === t.id); return { title: s?.title ?? "", sub: s?.sub ?? "", who: "" } }
    if (t.kind === "lane") return { title: layer.lanes?.[t.index] ?? "", sub: "", who: "" }
    if (t.kind === "edge") return { title: layer.links[t.index]?.label ?? "", sub: "", who: "" }
    return { title: "", sub: "", who: "" }
  }
  const saveForm = () => {
    if (!float?.form) return
    const { target: t, form: f } = float, title = f.title.trim()
    if (t.kind === "edge") change((l) => setLink(l, t.index, { label: title }))
    else if (!title) return
    else if (t.kind === "node") change((l) => setNode(l, t.id, { title, sub: f.sub.trim(), ...(lanes ? {} : { who: f.who.trim() }) }))
    else if (t.kind === "stage") change((l) => setStage(l, t.id, { title, sub: f.sub.trim() }))
    else if (t.kind === "lane") change((l) => renameLane(l, t.index, title))
    setFloat(null)
  }
  const addStep = (t: Target) => {
    if (t.kind === "pane") {
      const cell = cellAt(layer, t.at)
      if (lanes && (!cell || !cellFree(layer, cell))) return
      const made = addNode(layer, { title: "New step", ...(cell ?? {}), ...(cell?.lane === 0 ? { you: true } : {}) })
      change(() => made.layer)
      setFloat((f) => f && { ...f, target: { kind: "node", id: made.id }, form: { title: "New step", sub: "", who: "" } })
    } else if (t.kind === "node") {
      const made = addNode(layer, { title: "New step" }, t.id)
      change(() => addLink(made.layer, t.id, made.id))
      setFloat((f) => f && { ...f, target: { kind: "node", id: made.id }, form: { title: "New step", sub: "", who: "" } })
    }
  }
  const t = float?.target
  const node = t?.kind === "node" ? layer.nodes.find((n) => n.id === t.id) : null
  const paneCell = t?.kind === "pane" ? cellAt(layer, t.at) : null
  const item = (label: string, run: () => void, danger?: boolean) => <button type="button" role="menuitem" className={danger ? "danger" : ""} onClick={run}>{label}</button>
  const editItem = (label: string) => item(label, () => setFloat((f) => f && { ...f, form: formFor(f.target) }))

  return (
    <section className="opx-sec">
      <nav className="opx-pm-crumb" aria-label="Where you are in the map">
        {livePath.length > 0 && <button type="button" className="opx-btn sm primary" onClick={back}><ArrowLeft size={14} /> Back</button>}
        <button type="button" className={`opx-pm-step${livePath.length ? "" : " here"}`} onClick={() => setPath([])}>{rootName}</button>
        {names.map((name, i) => <span key={i} className="opx-pm-trail"><i aria-hidden="true">›</i><button type="button" className={`opx-pm-step${i === names.length - 1 ? " here" : ""}`} onClick={() => setPath(livePath.slice(0, i + 1))}>{name}</button></span>)}
      </nav>
      <p className="opx-muted">
        {layer.say ? `${layer.say} ` : ""}Grey lines go forward; orange dashed lines are loops. Double-click a stage or step to open what is inside it{livePath.length ? ", and Back (or Esc) to come out" : ""}.{can ? " Right-click anything to change it." : ""} Drag to move, scroll to zoom.
      </p>
      {linking && <p className="opx-pm-note" role="status">Click the step this line goes to. Esc cancels.</p>}
      <div ref={wrap} className={`opx-pm${lanes ? "" : " sub"}`} onContextMenu={(e) => { if (can) e.preventDefault() }}>
        <ReactFlow
          key={livePath.map((s) => s.id).join("/") || "top"} nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.04 }} minZoom={0.25} maxZoom={1.6} nodesConnectable={false} zoomOnDoubleClick={false} deleteKeyCode={null}
          onNodeDoubleClick={(_, n) => { const tg = targetOf(n); if (tg && (tg.kind === "node" || tg.kind === "stage")) open(tg.kind, tg.id) }}
          onNodeClick={(_, n) => { if (linking && n.type === "box") { const from = linking, index = layer.links.length; setLinking(null); if (!layer.links.some((e) => e.from === from && e.to === n.id)) { change((l) => addLink(l, from, n.id)); const r = wrap.current!.getBoundingClientRect(); setFloat({ x: r.width / 2 - 130, y: 16, target: { kind: "edge", index }, form: { title: "", sub: "", who: "" } }) } } }}
          onNodeContextMenu={(e, n) => { const tg = targetOf(n); if (tg) menu(e, tg) }}
          onEdgeContextMenu={(e, edge) => menu(e, { kind: "edge", index: Number(edge.id.slice(1)) })}
          onPaneContextMenu={(e) => menu(e, { kind: "pane", at: screenToFlowPosition({ x: e.clientX, y: e.clientY }) })}
          onPaneClick={() => setFloat(null)}
        >
          <Controls showInteractive={false} />
          {livePath.length > 0 && <Panel position="top-left"><button type="button" className="opx-btn primary" onClick={back}><ArrowLeft size={15} /> Back to {names.length > 1 ? names[names.length - 2] : rootName}</button></Panel>}
        </ReactFlow>

        {float && t && (
          <div className="opx-pm-float" style={{ left: float.x, top: float.y }} role={float.form ? "dialog" : "menu"} aria-label={float.form ? "Change the text" : "What to do with this"}>
            {float.form ? (
              <form onSubmit={(e) => { e.preventDefault(); saveForm() }}>
                <label>{t.kind === "edge" ? "What the line says" : t.kind === "lane" ? "Who this lane is" : "Title"}<input autoFocus value={float.form.title} maxLength={200} onChange={(e) => setFloat({ ...float, form: { ...float.form!, title: e.target.value } })} /></label>
                {(t.kind === "node" || t.kind === "stage") && <label>Detail<input value={float.form.sub} maxLength={200} onChange={(e) => setFloat({ ...float, form: { ...float.form!, sub: e.target.value } })} /></label>}
                {t.kind === "node" && !lanes && <label>Who does it<input value={float.form.who} maxLength={200} onChange={(e) => setFloat({ ...float, form: { ...float.form!, who: e.target.value } })} /></label>}
                <div className="row"><button type="button" className="opx-btn sm" onClick={() => setFloat(null)}>Cancel</button><button type="submit" className="opx-btn sm primary">Save</button></div>
              </form>
            ) : t.kind === "node" && node ? (
              <>
                {editItem("Change the text")}
                {doorOf(layer, "node", node.id) ? item("Open what is inside", () => open("node", node.id)) : item("Add a layer inside", () => { change((l) => addInside(l, "node", node.id)); setFloat(null) })}
                {item("Draw a line from here", () => { setLinking(node.id); setFloat(null) })}
                {!lanes && item("Add a step after this", () => addStep(t))}
                {item(node.you ? "Not the owner's step" : "Mark as the owner's step", () => { change((l) => setNode(l, node.id, { you: !node.you })); setFloat(null) })}
                {item(node.todo ? "Mark as built" : "Mark as not built yet", () => { change((l) => setNode(l, node.id, { todo: !node.todo })); setFloat(null) })}
                {node.inside && item("Remove the layer inside", () => { change((l) => removeInside(l, "node", node.id)); setFloat(null) }, true)}
                {item("Remove this step", () => { change((l) => removeNode(l, node.id)); setFloat(null) }, true)}
              </>
            ) : t.kind === "stage" ? (
              <>
                {editItem("Change the text")}
                {doorOf(layer, "stage", t.id) ? item("Open what is inside", () => open("stage", t.id)) : item("Add a layer inside", () => { change((l) => addInside(l, "stage", t.id)); setFloat(null) })}
                {doorOf(layer, "stage", t.id) && item("Remove the layer inside", () => { change((l) => removeInside(l, "stage", t.id)); setFloat(null) }, true)}
              </>
            ) : t.kind === "lane" ? editItem("Rename this lane")
              : t.kind === "edge" ? <>{editItem("Change what the line says")}{item("Remove this line", () => { change((l) => removeLink(l, t.index)); setFloat(null) }, true)}</>
              : lanes ? (paneCell && cellFree(layer, paneCell) ? item(`Add a step here (${layer.lanes![paneCell.lane]}, ${layer.stages!.find((s) => s.id === paneCell.stage)?.title})`, () => addStep(t)) : <span className="opx-muted">Right-click an empty place in a lane to add a step there, or a step, line, lane or stage to change it.</span>)
              : item("Add a step at the end", () => addStep(t))}
          </div>
        )}
      </div>
      {issues.length > 0 && <ul className="opx-pm-issues" aria-label="To tidy up on this layer">{issues.slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>}
    </section>
  )
}
