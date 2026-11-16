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

// A type, not an interface: the drawing library asks for data that is a plain record.
export type FlowStep = { id: string; does: string; expects: string; state: string; dot: string; picture: React.CSSProperties | null; noPicture: string; tag?: string | null; out?: boolean }

const W = 280, H = 250
const SIDES: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }
type StepData = FlowStep & { n: number }

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
const nodeTypes = { step: StepBox }

function Inner({ steps, onOpen, name }: { steps: FlowStep[]; onOpen: (index: number) => void; name: string }) {
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
  // The drawing is fitted to its room, so a step may be drawn down to 70% of its size before a row gives one up.
  const perRow = Math.min(4, perRowFor((room - 24) / 0.7, W))
  const { nodes, edges, height } = useMemo(() => {
    const lay = flowLayout(steps.length, { perRow, w: W, h: H })
    const nodes: Node<StepData>[] = lay.boxes.map((b) => ({ id: steps[b.index].id, type: "step", position: { x: b.x, y: b.y }, data: { ...steps[b.index], n: b.index + 1 }, draggable: false, connectable: false }))
    const edges: Edge[] = lay.joins.map((j) => ({ id: `j${j.from}`, source: steps[j.from].id, target: steps[j.to].id, sourceHandle: j.out, targetHandle: j.into, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 }, style: { strokeWidth: 1.6 } }))
    return { nodes, edges, height: lay.height }
  }, [steps, perRow])
  return (
    <div ref={host} className="opx-ucf" style={{ height: Math.min(Math.max(380, height + 90), 780) }} role="group" aria-label={`${name}, drawn as a flow of ${steps.length} step${steps.length === 1 ? "" : "s"}`}>
      {room > 0 && (
        <ReactFlow key={`${perRow}|${steps.length}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.06 }} minZoom={0.2} maxZoom={1.6}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => onOpen(steps.findIndex((s) => s.id === n.id))}>
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  )
}

export function UseCaseFlow(props: { steps: FlowStep[]; onOpen: (index: number) => void; name: string }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>
}
