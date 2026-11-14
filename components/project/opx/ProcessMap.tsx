"use client"

/*
 * How the system works, drawn with React Flow: a swim lane (who does it, by
 * stage) with the lines forward and the loops back, and the loop inside a
 * stage when one is opened. Display only: what is on the map, where each box
 * sits and how each line is routed come from lib/people/process-map.
 */

import { useMemo, useState } from "react"
import { Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { DIM, placeSteps, placeSub, routeLink, type Link, type Point, type ProcessMap as MapData, type Side, type StageId } from "@/lib/people/process-map"

const SIDES: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }
type BoxData = { title: string; sub?: string; who?: string; you?: boolean; todo?: boolean; stage?: StageId }

/** A step. It has a joining point on every side, so a line can leave or arrive wherever reads best. */
function Box({ data }: NodeProps<Node<BoxData>>) {
  return (
    <div className={`opx-pm-box${data.you ? " you" : ""}${data.todo ? " todo" : ""}${data.stage ? " click" : ""}`}>
      {(Object.keys(SIDES) as Side[]).flatMap((k) => [
        <Handle key={`s${k}`} id={k} type="source" position={SIDES[k]} isConnectable={false} />,
        <Handle key={`t${k}`} id={k} type="target" position={SIDES[k]} isConnectable={false} />,
      ])}
      {data.who && <small>{data.who}</small>}
      <b>{data.title}</b>
      {data.sub && <span>{data.sub}</span>}
    </div>
  )
}
function Lane({ data }: NodeProps<Node<{ name: string; alt: boolean }>>) {
  return <div className={`opx-pm-lane${data.alt ? " alt" : ""}`}><b>{data.name}</b></div>
}
function Stage({ data }: NodeProps<Node<{ title: string; sub: string; stage: StageId }>>) {
  return <div className="opx-pm-stage"><b>{data.title}</b><span>{data.sub}</span></div>
}
const nodeTypes = { box: Box, lane: Lane, stage: Stage }

function toEdges(links: Link[], pos: Record<string, Point>, inSub: boolean): Edge[] {
  return links.map((e, i) => {
    const r = routeLink(pos[e.from], pos[e.to], e, inSub), color = r.loop ? "var(--opx-warn)" : "var(--opx-muted)"
    return {
      id: `e${i}`, source: e.from, target: e.to, sourceHandle: r.from, targetHandle: r.to, type: "smoothstep", label: e.label, animated: r.loop,
      pathOptions: { borderRadius: 14, offset: r.offset },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 }, style: { stroke: color, strokeWidth: 1.6 },
      labelStyle: { fill: r.loop ? "var(--opx-warn)" : "var(--opx-ink)", fontSize: 12 }, labelBgStyle: { fill: "var(--opx-card)" }, labelBgPadding: [7, 4] as [number, number], labelBgBorderRadius: 7,
    }
  })
}

export function ProcessMap({ map }: { map: MapData }) {
  const [open, setOpen] = useState<StageId | null>(null)
  const { nodes, edges } = useMemo(() => {
    if (open) {
      const sub = map.subs[open], pos = placeSub(sub)
      return {
        nodes: sub.nodes.map((n): Node => ({ id: n.id, type: "box", position: pos[n.id], data: { title: n.title, sub: n.sub, who: n.who, todo: n.todo, you: n.who === "You" }, style: { width: DIM.subNode } })),
        edges: toEdges(sub.edges, pos, true),
      }
    }
    const pos = placeSteps(map), width = DIM.laneLabel + map.stages.length * DIM.col
    const lanes = map.lanes.map((name, i): Node => ({ id: `lane${i}`, type: "lane", position: { x: 0, y: i * DIM.lane }, data: { name, alt: i % 2 === 1 }, style: { width, height: DIM.lane - 6 }, draggable: false, selectable: false, zIndex: -1 }))
    const heads = map.stages.map((g, i): Node => ({ id: `stage-${g.id}`, type: "stage", position: { x: DIM.laneLabel + i * DIM.col + 8, y: -DIM.header }, data: { title: g.title, sub: g.sub, stage: g.id }, style: { width: DIM.col - 16 }, draggable: false, selectable: false }))
    const steps = map.steps.map((s): Node => ({ id: s.id, type: "box", position: pos[s.id], data: { title: s.title, sub: s.sub, todo: s.todo, you: s.lane === 0, stage: s.stage }, style: { width: DIM.node } }))
    return { nodes: [...lanes, ...heads, ...steps], edges: toEdges(map.links, pos, false) }
  }, [map, open])
  const stage = open ? map.stages.find((g) => g.id === open) : null, sub = open ? map.subs[open] : null

  return (
    <section className="opx-sec">
      {stage && sub ? (
        <>
          <div className="opx-pm-crumb"><button type="button" className="opx-btn sm" onClick={() => setOpen(null)}>The whole process</button><h3 className="opx-ck-h3" style={{ margin: 0 }}>Inside {stage.title}</h3></div>
          <p className="opx-muted">{sub.say}{sub.nodes.some((n) => n.todo) ? " Dashed boxes are not built yet." : ""} Orange dashed lines are the loops.</p>
        </>
      ) : (
        <>
          <h3 className="opx-ck-h3" style={{ marginLeft: 0 }}>The whole process</h3>
          <p className="opx-muted">Each lane is who does the work; each column is a stage. Grey lines go forward. Orange dashed lines are loops: work going round again until a gate is satisfied. Outlined boxes are yours; everything else happens without you. Click a stage or a step to open the loop inside it. Drag a box to move it, scroll to zoom. The numbers are this project's.</p>
        </>
      )}
      {/* Remounted when a stage is opened or closed, so the new drawing is fitted to the space. */}
      <div className={`opx-pm${open ? " sub" : ""}`} role="img" aria-label={stage ? `The loop inside ${stage.title}` : "The whole process, as a swim lane"}>
        <ReactFlow
          key={open ?? "top"} defaultNodes={nodes} defaultEdges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.04 }} minZoom={0.25} maxZoom={1.6}
          nodesConnectable={false} onNodeClick={(_, n) => { const s = (n.data as BoxData).stage; if (!open && s) setOpen(s) }}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  )
}
