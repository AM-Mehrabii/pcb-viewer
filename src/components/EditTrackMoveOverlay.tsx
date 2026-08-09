import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type {
  AnyCircuitElement,
  LayerRef,
  PcbTrace,
  PcbTraceRoutePoint,
  PcbTraceRoutePointWire,
} from "circuit-json"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Matrix } from "transformation-matrix"
import { applyToPoint, identity, inverse } from "transformation-matrix"
import { useGlobalStore } from "../global-store"

type TraceRoute = PcbTrace["route"]

export type EditPcbTraceMoveEvent = {
  edit_event_id: string
  edit_event_type: "edit_pcb_trace_move"
  pcb_trace_id: string
  original_route: TraceRoute
  new_route: TraceRoute
  in_progress: boolean
  created_at: number
}

interface Props {
  transform?: Matrix
  children: any
  soup: AnyCircuitElement[]
  disabled?: boolean
  cancelPanDrag: () => void
  onCreateEditEvent: (event: EditPcbTraceMoveEvent) => void
  onModifyEditEvent: (event: Partial<EditPcbTraceMoveEvent>) => void
}

const GRID_MM = 0.1
/** Pick radius in screen pixels, converted to mm using the live zoom. */
const SEGMENT_PICK_PX = 6
const CORNER_PICK_PX = 9
const DEFAULT_TRACE_WIDTH = 0.15

const snap = (v: number) => Math.round(v / GRID_MM) * GRID_MM

function mkId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function cloneRoute(route: TraceRoute): TraceRoute {
  return route.map((p) => ({ ...p })) as TraceRoute
}

/**
 * A route point is an anchor when moving it would break connectivity:
 * trace endpoints (they sit on a pad), points bound to a pcb_port, and vias
 * (they are a layer transition and belong to the stack-up, not the segment).
 */
function isAnchorPoint(route: TraceRoute, index: number): boolean {
  if (index <= 0 || index >= route.length - 1) return true
  const point = route[index] as PcbTraceRoutePoint | undefined
  if (!point) return true
  if (point.route_type === "via") return true
  return Boolean(point.start_pcb_port_id || point.end_pcb_port_id)
}

function getWireStyle(
  route: TraceRoute,
  preferred: PcbTraceRoutePoint,
): { width: number; layer: LayerRef } {
  for (const point of [preferred, ...route] as PcbTraceRoutePoint[]) {
    if (point.route_type === "wire") {
      return { width: point.width, layer: point.layer }
    }
  }
  return { width: DEFAULT_TRACE_WIDTH, layer: "top" }
}

/** A fresh wire point that carries no pad/via binding — safe to move freely. */
function makeStubPoint(
  route: TraceRoute,
  reference: PcbTraceRoutePoint,
  x: number,
  y: number,
): PcbTraceRoutePointWire {
  const { width, layer } = getWireStyle(route, reference)
  return { route_type: "wire", x: snap(x), y: snap(y), width, layer }
}

function movePoint(
  point: PcbTraceRoutePoint,
  dx: number,
  dy: number,
): PcbTraceRoutePoint {
  return { ...point, x: snap(point.x + dx), y: snap(point.y + dy) }
}

/** Restrict the delta to the segment's normal so the segment stays parallel. */
function constrainToNormal(
  a: PcbTraceRoutePoint,
  b: PcbTraceRoutePoint,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const length = Math.hypot(vx, vy)
  if (length === 0) return { dx, dy }
  const nx = -vy / length
  const ny = vx / length
  const projected = dx * nx + dy * ny
  return { dx: projected * nx, dy: projected * ny }
}

type Grab =
  | {
      type: "corner"
      pcb_trace_id: string
      segmentIndex: number
      pointIndex: number
    }
  | { type: "segment"; pcb_trace_id: string; segmentIndex: number }

/**
 * Rebuilds the route for a drag, KiCad/Altium "drag" semantics:
 * the grabbed geometry follows the cursor while every anchored end stays put,
 * so the neighbouring segments rubber-band instead of the whole track sliding
 * off its pads.
 */
function buildDraggedRoute(
  route: TraceRoute,
  grab: Grab,
  rawDx: number,
  rawDy: number,
  constrain: boolean,
): TraceRoute {
  const points = route as PcbTraceRoutePoint[]

  if (grab.type === "corner") {
    return points.map((point, index) =>
      index === grab.pointIndex ? movePoint(point, rawDx, rawDy) : { ...point },
    ) as TraceRoute
  }

  const i = grab.segmentIndex
  const a = points[i]
  const b = points[i + 1]
  if (!a || !b) return cloneRoute(route)

  const { dx, dy } = constrain
    ? constrainToNormal(a, b, rawDx, rawDy)
    : { dx: rawDx, dy: rawDy }

  const next: PcbTraceRoutePoint[] = points.slice(0, i).map((p) => ({ ...p }))

  if (isAnchorPoint(route, i)) {
    // Keep the pad/via connection and grow a stub segment up to the moved end.
    next.push({ ...a })
    next.push(makeStubPoint(route, a, a.x + dx, a.y + dy))
  } else {
    next.push(movePoint(a, dx, dy))
  }

  if (isAnchorPoint(route, i + 1)) {
    next.push(makeStubPoint(route, b, b.x + dx, b.y + dy))
    next.push({ ...b })
  } else {
    next.push(movePoint(b, dx, dy))
  }

  next.push(...points.slice(i + 2).map((p) => ({ ...p })))

  return next as TraceRoute
}

/** Index of the dragged segment inside the route returned by buildDraggedRoute. */
function getDraggedSegmentIndex(route: TraceRoute, grab: Grab): number {
  if (grab.type === "corner") return grab.pointIndex
  return isAnchorPoint(route, grab.segmentIndex)
    ? grab.segmentIndex + 1
    : grab.segmentIndex
}

function findGrab(
  traces: PcbTrace[],
  point: { x: number; y: number },
  transformScale: number,
): Grab | null {
  const scale = Math.max(Math.abs(transformScale), 1e-6)
  const segmentPickMm = SEGMENT_PICK_PX / scale
  const cornerPickMm = CORNER_PICK_PX / scale

  let best: { grab: Grab; dist: number } | null = null

  for (const trace of traces) {
    const route = trace.route as PcbTraceRoutePoint[]
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i]
      const b = route[i + 1]
      if (!a || !b) continue

      const widthA = a.route_type === "wire" ? a.width : 0
      const widthB = b.route_type === "wire" ? b.width : 0
      const halfWidth = Math.max(widthA, widthB, DEFAULT_TRACE_WIDTH) / 2
      const threshold = Math.max(halfWidth, segmentPickMm)

      const dist = pointToSegmentDistance(
        point,
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      )
      if (dist > threshold) continue
      if (best && dist >= best.dist) continue

      const distToA = Math.hypot(point.x - a.x, point.y - a.y)
      const distToB = Math.hypot(point.x - b.x, point.y - b.y)

      let grab: Grab
      if (distToA <= cornerPickMm && !isAnchorPoint(trace.route, i)) {
        grab = {
          type: "corner",
          pcb_trace_id: trace.pcb_trace_id,
          segmentIndex: i,
          pointIndex: i,
        }
      } else if (
        distToB <= cornerPickMm &&
        !isAnchorPoint(trace.route, i + 1)
      ) {
        grab = {
          type: "corner",
          pcb_trace_id: trace.pcb_trace_id,
          segmentIndex: i,
          pointIndex: i + 1,
        }
      } else {
        grab = {
          type: "segment",
          pcb_trace_id: trace.pcb_trace_id,
          segmentIndex: i,
        }
      }

      best = { grab, dist }
    }
  }

  return best?.grab ?? null
}

type DragState = {
  edit_event_id: string
  grab: Grab
  dragStart: { x: number; y: number }
  originalRoute: TraceRoute
  previewRoute: TraceRoute
}

/**
 * Dedicated move-track tool. A drag moves only the grabbed segment (or corner)
 * of a pcb_trace; pad and via connections stay anchored and the adjacent
 * segments stretch to follow, matching KiCad/Altium track dragging.
 * Hold Shift to keep the segment parallel to itself.
 */
export const EditTrackMoveOverlay = ({
  children,
  disabled: disabledProp,
  transform,
  soup,
  cancelPanDrag,
  onCreateEditEvent,
  onModifyEditEvent,
}: Props) => {
  if (!transform) transform = identity()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredGrab, setHoveredGrab] = useState<Grab | null>(null)

  const in_move_track_mode = useGlobalStore((s) => s.in_move_track_mode)
  const setIsMovingTrack = useGlobalStore((s) => s.setIsMovingTrack)

  const disabled = disabledProp || !in_move_track_mode

  const pcbTraces = useMemo(
    () => soup.filter((e): e is PcbTrace => e.type === "pcb_trace"),
    [soup],
  )

  useEffect(() => {
    if (!in_move_track_mode) {
      setDragState(null)
      setHoveredGrab(null)
    }
  }, [in_move_track_mode])

  useEffect(
    () => () => {
      setIsMovingTrack(false)
    },
    [setIsMovingTrack],
  )

  // Escape reverts the in-flight drag, like cancelling a drag in KiCad.
  useEffect(() => {
    if (!dragState) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      onModifyEditEvent({
        edit_event_id: dragState.edit_event_id,
        new_route: cloneRoute(dragState.originalRoute),
        in_progress: false,
      })
      setDragState(null)
      setIsMovingTrack(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dragState, onModifyEditEvent, setIsMovingTrack])

  const finishDrag = () => {
    if (!dragState) return
    onModifyEditEvent({
      edit_event_id: dragState.edit_event_id,
      in_progress: false,
    })
    setDragState(null)
    setIsMovingTrack(false)
  }

  const highlight = useMemo(() => {
    if (dragState) {
      const route = dragState.previewRoute as PcbTraceRoutePoint[]
      const index = getDraggedSegmentIndex(
        dragState.originalRoute,
        dragState.grab,
      )
      if (dragState.grab.type === "corner") {
        return {
          points: [route[index]].filter(Boolean) as PcbTraceRoutePoint[],
        }
      }
      return {
        points: [route[index], route[index + 1]].filter(
          Boolean,
        ) as PcbTraceRoutePoint[],
      }
    }
    if (!hoveredGrab) return null
    const trace = pcbTraces.find(
      (t) => t.pcb_trace_id === hoveredGrab.pcb_trace_id,
    )
    if (!trace) return null
    const route = trace.route as PcbTraceRoutePoint[]
    const i = hoveredGrab.segmentIndex
    return {
      points: [route[i], route[i + 1]].filter(Boolean) as PcbTraceRoutePoint[],
    }
  }, [dragState, hoveredGrab, pcbTraces])

  const highlightPath = useMemo(() => {
    if (!highlight || highlight.points.length === 0) return null
    return highlight.points.map((p) =>
      applyToPoint(transform!, { x: p.x, y: p.y }),
    )
  }, [highlight, transform])

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        overflow: "hidden",
        cursor: disabled
          ? undefined
          : dragState
            ? "grabbing"
            : hoveredGrab
              ? "grab"
              : "crosshair",
      }}
      onMouseDown={(e) => {
        if (disabled) return
        if (e.button !== 0) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (Number.isNaN(x) || Number.isNaN(y)) return
        const rwMousePoint = applyToPoint(inverse(transform!), { x, y })

        const grab = findGrab(pcbTraces, rwMousePoint, transform!.a)
        if (!grab) {
          setHoveredGrab(null)
          return
        }

        const trace = pcbTraces.find(
          (t) => t.pcb_trace_id === grab.pcb_trace_id,
        )
        if (!trace) return

        const edit_event_id = mkId("edit_track")
        const original_route = cloneRoute(trace.route)
        cancelPanDrag()
        setIsMovingTrack(true)
        setDragState({
          edit_event_id,
          grab,
          dragStart: rwMousePoint,
          originalRoute: original_route,
          previewRoute: cloneRoute(original_route),
        })
        onCreateEditEvent({
          edit_event_id,
          edit_event_type: "edit_pcb_trace_move",
          pcb_trace_id: grab.pcb_trace_id,
          original_route,
          new_route: cloneRoute(original_route),
          in_progress: true,
          created_at: Date.now(),
        })
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseMove={(e) => {
        if (disabled) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (Number.isNaN(x) || Number.isNaN(y)) return
        const rwMousePoint = applyToPoint(inverse(transform!), { x, y })

        if (dragState) {
          const new_route = buildDraggedRoute(
            dragState.originalRoute,
            dragState.grab,
            rwMousePoint.x - dragState.dragStart.x,
            rwMousePoint.y - dragState.dragStart.y,
            e.shiftKey,
          )
          setDragState({ ...dragState, previewRoute: new_route })
          onModifyEditEvent({
            edit_event_id: dragState.edit_event_id,
            new_route,
          })
          return
        }

        setHoveredGrab(findGrab(pcbTraces, rwMousePoint, transform!.a))
      }}
      onMouseUp={finishDrag}
      onMouseLeave={() => {
        if (dragState) {
          finishDrag()
          return
        }
        setHoveredGrab(null)
      }}
    >
      {children}

      {!disabled && highlightPath && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
          width={containerRef.current?.clientWidth}
          height={containerRef.current?.clientHeight}
        >
          {highlightPath.length > 1 && (
            <path
              d={highlightPath
                .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                .join(" ")}
              fill="none"
              stroke="rgba(59,130,246,0.95)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {highlightPath.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="rgba(59,130,246,0.95)"
            />
          ))}
        </svg>
      )}
    </div>
  )
}
