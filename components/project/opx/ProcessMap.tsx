"use client"

/*
 * A process map, drawn with React Flow: a swim lane (who does it, by stage)
 * or a left-to-right layer, with the lines forward and the loops back.
 * Double-click a stage or step to open the layer inside it; the path back is
 * always on screen (and Esc goes back one). Right-click anything to change it,
 * or use the buttons above the drawing. A step dragged somewhere lands in the
 * nearest place and the lines follow; every change can be undone.
 * Display only: what is on the map, where each box sits, how each line is
 * routed and every edit come from lib/sops/process-map.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Controls, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, Layers, Redo2, Undo2 } from "lucide-react"
import {
  DIM, addInside, addLane, addLink, addNode, addStage, cellAt, cellFree, checkLayer, crumbs, doorOf, indexAt, isLanes, layerAt, moveLane, moveNode, moveStage, place,
  removeInside, removeLane, removeLink, removeNode, removeStage, renameLane, reorderNode, routeLink, setLink, setNode, setStage, splitLink, updateAt,
  type Layer, type Link, type Path, type Point, type Side,
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

type Target =
  | { kind: "node"; id: string } | { kind: "stage"; id: string } | { kind: "lane"; index: number; at?: Point }
  | { kind: "edge"; index: number } | { kind: "pane"; at: Point }
interface Floating { x: number; y: number; target: Target; form?: { title: string; sub: string; who: string } }
const BLANK = { title: "", sub: "", who: "" }
const targetOf = (n: Node): Target | null => (n.type === "box" ? { kind: "node", id: n.id } : n.type === "stage" ? { kind: "stage", id: n.id.replace(/^stage-/, "") } : n.type === "lane" ? { kind: "lane", index: Number(n.id.replace("lane", "")) } : null)

export function ProcessMap(props: { map: Layer; onChange?: (next: Layer) => void; rootName?: string }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>
}

function Inner({ map, onChange, rootName = "The whole process" }: { map: Layer; onChange?: (next: Layer) => void; rootName?: string }) {
  const [path, setPath] = useState<Path>([])
  const [float, setFloat] = useState<Floating | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [history, setHistory] = useState<{ past: Layer[]; future: Layer[] }>({ past: [], future: [] })
  const wrap = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  // A path that no longer leads anywhere (what it went through was removed) falls back to the nearest layer that exists.
  const livePath = useMemo(() => { let p = path; while (p.length && !layerAt(map, p)) p = p.slice(0, -1); return p }, [map, path])
  const layer = layerAt(map, livePath) ?? map, names = crumbs(map, livePath), lanes = isLanes(layer), can = !!onChange
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  useEffect(() => { setNodes(toNodes(layer, linking)) }, [layer, linking, setNodes])
  const edges = useMemo(() => toEdges(layer.links, place(layer), lanes), [layer, lanes])
  const issues = useMemo(() => (can ? checkLayer(layer) : []), [layer, can])

  /** Every change goes through here, so every change can be undone. */
  const commit = useCallback((next: Layer) => {
    if (!onChange || next === map) return
    setHistory((h) => ({ past: [...h.past.slice(-49), map], future: [] }))
    onChange(next)
  }, [map, onChange])
  const change = useCallback((fn: (l: Layer) => Layer) => commit(updateAt(map, livePath, fn)), [commit, map, livePath])
  const undo = useCallback(() => { const prev = history.past.at(-1); if (!prev || !onChange) return; setHistory({ past: history.past.slice(0, -1), future: [map, ...history.future] }); onChange(prev) }, [history, map, onChange])
  const redo = useCallback(() => { const next = history.future[0]; if (!next || !onChange) return; setHistory({ past: [...history.past, map], future: history.future.slice(1) }); onChange(next) }, [history, map, onChange])
  const back = useCallback(() => setPath((p) => p.slice(0, -1)), [])
  const open = (kind: "stage" | "node", id: string) => { const door = doorOf(layer, kind, id); if (door) { setPath([...livePath, door]); setFloat(null) } return !!door }
  const tidy = () => { setNodes(toNodes(layer, linking)); requestAnimationFrame(() => fitView({ padding: 0.04, duration: 250 })) }

  // Keys, while the pointer is over the drawing: Esc closes what is open on top (a form, a menu, a line or step being
  // placed) and otherwise goes back one layer; Ctrl+Z undoes and Ctrl+Shift+Z (or Ctrl+Y) redoes.
  const live = useRef({ float, linking, placing, depth: livePath.length, undo, redo })
  live.current = { float, linking, placing, depth: livePath.length, undo, redo }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = live.current, typing = !!(e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]"), over = !!wrap.current?.matches(":hover, :focus-within")
      if (e.key === "Escape") {
        if (s.float) setFloat(null)
        else if (s.linking || s.placing) { setLinking(null); setPlacing(false) }
        else if (s.depth && !typing && over) back()
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
  const menu = (e: React.MouseEvent | MouseEvent, target: Target) => { if (!can) return; e.preventDefault(); setFloat({ ...at(e), target }) }
  const formFor = (t: Target): Floating["form"] => {
    if (t.kind === "node") { const n = layer.nodes.find((x) => x.id === t.id); return { title: n?.title ?? "", sub: n?.sub ?? "", who: n?.who ?? "" } }
    if (t.kind === "stage") { const s = layer.stages?.find((x) => x.id === t.id); return { title: s?.title ?? "", sub: s?.sub ?? "", who: "" } }
    if (t.kind === "lane") return { title: layer.lanes?.[t.index] ?? "", sub: "", who: "" }
    if (t.kind === "edge") return { title: layer.links[t.index]?.label ?? "", sub: "", who: "" }
    return BLANK
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
  /** Asks for the words of something just made, where the pointer is (or at the top of the drawing). */
  const nameIt = (target: Target, title: string, where?: { x: number; y: number }) => {
    const r = wrap.current!.getBoundingClientRect()
    setFloat({ x: where?.x ?? r.width / 2 - 130, y: where?.y ?? 16, target, form: { title, sub: "", who: "" } })
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
  const cell = t && (t.kind === "pane" || t.kind === "lane") && t.at ? cellAt(layer, t.at) : null
  const close = () => setFloat(null)
  const item = (label: string, run: () => void, danger?: boolean, off?: boolean) => <button type="button" role="menuitem" key={label} className={danger ? "danger" : ""} disabled={off} onClick={run}>{label}</button>
  const editItem = (label: string) => item(label, () => setFloat((f) => f && { ...f, form: formFor(f.target) }))
  const stageIndex = t?.kind === "stage" ? layer.stages?.findIndex((s) => s.id === t.id) ?? -1 : -1
  const laneCount = layer.lanes?.length ?? 0, stageCount = layer.stages?.length ?? 0
  const inLane = (i: number) => layer.nodes.filter((n) => n.lane === i).length, inStage = (id: string) => layer.nodes.filter((n) => n.stage === id).length

  return (
    <section className="opx-sec">
      <nav className="opx-pm-crumb" aria-label="Where you are in the map">
        {livePath.length > 0 && <button type="button" className="opx-btn sm primary" onClick={back}><ArrowLeft size={14} /> Back</button>}
        <button type="button" className={`opx-pm-step${livePath.length ? "" : " here"}`} onClick={() => setPath([])}>{rootName}</button>
        {names.map((name, i) => <span key={i} className="opx-pm-trail"><i aria-hidden="true">›</i><button type="button" className={`opx-pm-step${i === names.length - 1 ? " here" : ""}`} onClick={() => setPath(livePath.slice(0, i + 1))}>{name}</button></span>)}
      </nav>
      <p className="opx-muted">
        {layer.say ? `${layer.say} ` : ""}Grey lines go forward; orange dashed lines are loops. Double-click a stage or step to open what is inside it{livePath.length ? ", and Back (or Esc) to come out" : ""}.{can ? " Right-click a step, line, lane or stage to change it, or drag a step to move it: it lands in the nearest free place and the lines follow." : " Drag to look around, scroll to zoom."}
      </p>
      {can && (
        <div className="opx-pm-bar" role="toolbar" aria-label="Change the map">
          <button type="button" className={`opx-btn sm${placing ? " on" : ""}`} onClick={() => { if (lanes) { setPlacing((p) => !p); setLinking(null) } else stepAfter() }}>Add a step</button>
          {lanes && <button type="button" className="opx-btn sm" disabled={laneCount >= 12} onClick={() => newLane(laneCount)}>Add a lane</button>}
          {lanes && <button type="button" className="opx-btn sm" disabled={stageCount >= 16} onClick={() => newStage(stageCount)}>Add a stage</button>}
          <button type="button" className="opx-btn sm" onClick={tidy}>Tidy up</button>
          <span className="gap" />
          <button type="button" className="opx-btn sm" disabled={!history.past.length} onClick={undo}><Undo2 size={13} /> Undo</button>
          <button type="button" className="opx-btn sm" disabled={!history.future.length} onClick={redo}><Redo2 size={13} /> Redo</button>
        </div>
      )}
      {linking && <p className="opx-pm-note" role="status">Click the step this line goes to. Esc cancels.</p>}
      {placing && <p className="opx-pm-note" role="status">Click an empty place in a lane to put the step there. Esc cancels.</p>}
      <div ref={wrap} className={`opx-pm${lanes ? "" : " sub"}${placing ? " placing" : ""}`} onContextMenu={(e) => { if (can) e.preventDefault() }}>
        <ReactFlow
          key={livePath.map((s) => s.id).join("/") || "top"} nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.04 }} minZoom={0.25} maxZoom={1.6} nodesConnectable={false} zoomOnDoubleClick={false} deleteKeyCode={null} nodesDraggable={can}
          onNodeDoubleClick={(_, n) => { const tg = targetOf(n); if (tg && (tg.kind === "node" || tg.kind === "stage")) open(tg.kind, tg.id) }}
          onNodeClick={(e, n) => {
            if (placing && n.type === "lane") { const c = cellAt(layer, flowAt(e)); if (c && stepInto(c, at(e))) setPlacing(false) }
            else if (linking && n.type === "box") { const from = linking, index = layer.links.length; setLinking(null); if (!layer.links.some((x) => x.from === from && x.to === n.id)) { change((l) => addLink(l, from, n.id)); nameIt({ kind: "edge", index }, "") } }
          }}
          onNodeDragStop={(_, n) => drop(n)}
          onNodeContextMenu={(e, n) => { const tg = targetOf(n); if (tg) menu(e, tg.kind === "lane" ? { ...tg, at: flowAt(e) } : tg) }}
          onEdgeContextMenu={(e, edge) => menu(e, { kind: "edge", index: Number(edge.id.slice(1)) })}
          onPaneContextMenu={(e) => menu(e, { kind: "pane", at: flowAt(e) })}
        >
          <Controls showInteractive={false} />
          {livePath.length > 0 && <Panel position="top-left"><button type="button" className="opx-btn primary" onClick={back}><ArrowLeft size={15} /> Back to {names.length > 1 ? names[names.length - 2] : rootName}</button></Panel>}
        </ReactFlow>

        {float && t && (
          <div className="opx-pm-float" style={{ left: float.x, top: float.y }} role={float.form ? "dialog" : "menu"} aria-label={float.form ? "Change the text" : "What to do with this"}>
            {float.form ? (
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
      {issues.length > 0 && <ul className="opx-pm-issues" aria-label="To tidy up on this layer">{issues.slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>}
    </section>
  )
}
