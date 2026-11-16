"use client"

/**
 * A use case drawn as a flow: each step a box with its real picture and its state, joined in order.
 * The same drawing library the process maps use. View only: steps are edited on the cards. Layout rule in
 * lib/people/flow-layout.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { flowLayout, perRowFor, type Side } from "@/lib/people/flow-layout"
import { branchLayout, isChoice } from "@/lib/people/branches"
import type { Step } from "@/lib/people/people-model"

// A type, not an interface: the drawing library asks for data that is a plain record.
export type FlowStep = { id: string; does: string; expects: string; state: string; dot: string; picture: React.CSSProperties | null; noPicture: string; tag?: string | null; out?: boolean; n?: string }

const W = 280, H = 250
const SIDES: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }
type StepData = FlowStep & { n: number | string }
type EndData = { label: string }

function StepBox({ data }: NodeProps<Node<StepData>>) {
  return (
    <div className={`opx-ucf-box${data.out ? " out" : ""}`} style={{ width: W, height: H }}>
      {(Object.keys(SIDES) as Side[]).flatMap((k) => [
        <Handle key={`s${k}`} id={k} type="source" position={SIDES[k]} isConnectable={false} />,
        <Handle key={`t${k}`} id={k} type="target" position={SIDES[k]} isConnectable={false} />,
      ])}
      <div className="opx-ucf-pic" style={data.picture ?? undefined}>{data.picture ? null : data.noPicture}</div>
      <b><span className="opx-pf-num">{data.n}</span>{data.does}</b>
      {data.expects && <span className="opx-ucf-exp">{data.expects}</span>}
      <div className="opx-ucf-foot"><span className={`opx-pf-dot ${data.dot}`} />{data.state}{data.tag && <span className="opx-pf-tag">{data.tag}</span>}</div>
    </div>
  )
}
/** Where a way that ends the use case stops: a person who leaves, cancels or gives up. */
function EndBox({ data }: NodeProps<Node<EndData>>) {
  return (
    <div className="opx-ucf-end" style={{ width: W, height: 110 }}>
      <Handle id="l" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="t" type="target" position={Position.Top} isConnectable={false} />
      <b>Ends here</b><span>{data.label}</span>
    </div>
  )
}
const nodeTypes = { step: StepBox, end: EndBox }
const EDGE = { type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 }, style: { strokeWidth: 1.6 } } as const

function Drawing({ flow, describe, onOpen, name }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  // The room it has, not the window's: a side panel or a phone changes how many steps fit across.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const read = () => setRoom(el.clientWidth)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const branched = flow.steps.some(isChoice)
  // Straight use cases wrap in rows; the drawing is fitted, so a step may shrink to 70% before a row gives one up.
  const perRow = Math.min(4, perRowFor((room - 24) / 0.7, W))
  const count = flow.steps.length + flow.steps.reduce((t, s) => t + (s.ways ?? []).reduce((u, w) => u + w.steps.length, 0), 0)
  const drawn = useMemo(() => {
    if (!branched) {
      const lay = flowLayout(flow.steps.length, { perRow, w: W, h: H })
      const nodes: Node[] = lay.boxes.map((b) => ({ id: flow.steps[b.index].id, type: "step", position: { x: b.x, y: b.y }, data: { ...describe(flow.steps[b.index], b.index + 1), n: b.index + 1 }, draggable: false, connectable: false }))
      const edges: Edge[] = lay.joins.map((j) => ({ id: `j${j.from}`, source: flow.steps[j.from].id, target: flow.steps[j.to].id, sourceHandle: j.out, targetHandle: j.into, ...EDGE }))
      return { nodes, edges, width: 0, height: lay.height }
    }
    // With choices: the main line along the top, each other way in its own lane below, named on its first join.
    const number = new Map<string, string>(), byId = new Map<string, Step>()
    flow.steps.forEach((s, i) => {
      number.set(s.id, String(i + 1)); byId.set(s.id, s)
      ;(s.ways ?? []).forEach((w, k) => w.steps.forEach((x, m) => { number.set(x.id, `${i + 1}${"abcd"[k]}${w.steps.length > 1 ? m + 1 : ""}`); byId.set(x.id, x) }))
    })
    const lay = branchLayout(flow, { w: W, h: H, gapX: 90, gapY: 60 })
    const nodes: Node[] = lay.boxes.map((b) => b.kind === "end"
      ? { id: b.key, type: "end", position: { x: b.x, y: b.y + (H - 110) / 2 }, data: { label: b.label ?? "" }, draggable: false, connectable: false }
      : { id: b.key, type: "step", position: { x: b.x, y: b.y }, data: { ...describe(byId.get(b.stepId!)!, number.get(b.stepId!) ?? ""), n: number.get(b.stepId!) ?? "" }, draggable: false, connectable: false })
    const edges: Edge[] = lay.joins.map((j, k) => ({ id: `b${k}`, source: j.from, target: j.to, sourceHandle: j.out, targetHandle: j.into, ...EDGE,
      ...(j.label ? { label: j.label, labelStyle: { fontSize: 13, fontWeight: 600 }, labelBgPadding: [8, 4] as [number, number], labelBgBorderRadius: 6, labelBgStyle: { fill: "var(--opx-card)" } } : {}) }))
    return { nodes, edges, width: lay.width, height: lay.height }
  }, [flow, describe, perRow, branched])
  // A use case with choices is drawn at a size that can be read and moved sideways, not shrunk to a sliver.
  const zoom = branched && room ? Math.max(0.7, Math.min(1, (room - 24) / Math.max(1, drawn.width))) : 1
  const wide = branched && drawn.width * zoom > room - 24
  const height = branched ? Math.min(Math.max(320, drawn.height * zoom + 40), 900) : Math.min(Math.max(380, drawn.height + 90), 780)
  return (
    <>
      <div ref={host} className="opx-ucf" style={{ height }} role="group" aria-label={`${name}, drawn as a flow of ${count} step${count === 1 ? "" : "s"}${branched ? " with choices" : ""}`}>
        {room > 0 && (
          <ReactFlow key={`${perRow}|${count}|${branched}|${Math.round(zoom * 100)}`} nodes={drawn.nodes} edges={drawn.edges} nodeTypes={nodeTypes}
            {...(branched ? { defaultViewport: { x: 12, y: 16, zoom } } : { fitView: true, fitViewOptions: { padding: 0.06 } })}
            minZoom={0.2} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}
            onNodeClick={(_, n) => { if (n.type === "step") onOpen(n.id) }}>
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
      {wide && <small className="opx-muted">Drag the drawing sideways to see the rest of it.</small>}
    </>
  )
}

interface Props { flow: { steps: Step[] }; describe: (step: Step, n: number | string) => FlowStep; onOpen: (stepId: string) => void; name: string }

export function UseCaseFlow(props: Props) {
  return <ReactFlowProvider><Drawing {...props} /></ReactFlowProvider>
}
