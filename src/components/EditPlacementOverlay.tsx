import type { AnyCircuitElement, PcbComponent } from "circuit-json"
import { useGlobalStore } from "../global-store"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Matrix } from "transformation-matrix"
import { applyToPoint, identity, inverse } from "transformation-matrix"
import type { ManualEditEvent } from "@tscircuit/props"
import { HotkeyActionMenu } from "./HotkeyActionMenu"

interface Props {
  transform?: Matrix
  children: any
  soup: AnyCircuitElement[]
  disabled?: boolean
  cancelPanDrag: () => void
  onCreateEditEvent: (event: ManualEditEvent) => void
  onModifyEditEvent: (event: Partial<ManualEditEvent>) => void
}

const GRID_MM = 0.1
const snap = (v: number) => Math.round(v / GRID_MM) * GRID_MM

const isInsideOf = (
  pcb_component: PcbComponent,
  point: { x: number; y: number },
  padding = 0,
) => {
  const halfWidth = pcb_component.width / 2
  const halfHeight = pcb_component.height / 2

  const left = pcb_component.center.x - halfWidth - padding
  const right = pcb_component.center.x + halfWidth + padding
  const top = pcb_component.center.y - halfHeight - padding
  const bottom = pcb_component.center.y + halfHeight + padding

  return point.x > left && point.x < right && point.y > top && point.y < bottom
}

type DragEventState = {
  dragStart: { x: number; y: number }
  editEvents: Array<{
    edit_event_id: string
    pcb_component_id: string
    originalCenter: { x: number; y: number }
  }>
}

function mkId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

export const EditPlacementOverlay = ({
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

  const [dragState, setDragState] = useState<DragEventState | null>(null)
  const [marqueeBox, setMarqueeBox] = useState<
    { start: { x: number; y: number }; end: { x: number; y: number } } | null
  >(null)
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([])

  const in_marquee_mode = useGlobalStore((s) => s.in_marquee_mode)
  const in_move_footprint_mode = useGlobalStore((s) => s.in_move_footprint_mode)
  const setIsMovingComponent = useGlobalStore((s) => s.setIsMovingComponent)

  const disabled = disabledProp || (!in_move_footprint_mode && !in_marquee_mode)

  const pcbComponents = useMemo(
    () => soup.filter((e): e is PcbComponent => e.type === "pcb_component"),
    [soup],
  )

  const componentById = useMemo(() => {
    const m = new Map<string, PcbComponent>()
    for (const comp of pcbComponents) m.set(comp.pcb_component_id, comp)
    return m
  }, [pcbComponents])

  useEffect(() => {
    if (!in_marquee_mode) {
      setMarqueeBox(null)
      setSelectedComponentIds([])
    }
  }, [in_marquee_mode])

  useEffect(
    () => () => {
      setIsMovingComponent(false)
    },
    [setIsMovingComponent],
  )

  const startDragForIds = (
    ids: string[],
    rwMousePoint: { x: number; y: number },
  ) => {
    const events: DragEventState["editEvents"] = []

    for (const id of ids) {
      const comp = componentById.get(id)
      if (!comp) continue
      const edit_event_id = mkId("edit_component")
      events.push({
        edit_event_id,
        pcb_component_id: id,
        originalCenter: comp.center,
      })
      onCreateEditEvent({
        edit_event_id,
        edit_event_type: "edit_pcb_component_location",
        pcb_edit_event_type: "edit_component_location",
        pcb_component_id: id,
        original_center: comp.center,
        new_center: comp.center,
        in_progress: true,
        created_at: Date.now(),
      } as ManualEditEvent)
    }

    if (events.length === 0) return

    cancelPanDrag()
    setDragState({ dragStart: rwMousePoint, editEvents: events })
    setIsMovingComponent(true)
  }

  const alignSelected = (axis: "x" | "y") => {
    const selected = selectedComponentIds
      .map((id) => componentById.get(id))
      .filter((c): c is PcbComponent => Boolean(c))

    if (selected.length < 2) return

    const target =
      axis === "x"
        ? getMedian(selected.map((c) => c.center.x))
        : getMedian(selected.map((c) => c.center.y))

    for (const comp of selected) {
      const newCenter =
        axis === "x"
          ? { x: snap(target), y: snap(comp.center.y) }
          : { x: snap(comp.center.x), y: snap(target) }

      onCreateEditEvent({
        edit_event_id: mkId("align_component"),
        edit_event_type: "edit_pcb_component_location",
        pcb_edit_event_type: "edit_component_location",
        pcb_component_id: comp.pcb_component_id,
        original_center: comp.center,
        new_center: newCenter,
        in_progress: false,
        created_at: Date.now(),
      } as ManualEditEvent)
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        overflow: "hidden",
      }}
      onMouseDown={(e) => {
        if (disabled) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (Number.isNaN(x) || Number.isNaN(y)) return
        const rwMousePoint = applyToPoint(inverse(transform!), { x, y })

        const hitComponent = pcbComponents.find((comp) =>
          isInsideOf(comp, rwMousePoint, 10 / transform.a),
        )

        if (in_move_footprint_mode) {
          if (!hitComponent) return
          setSelectedComponentIds([hitComponent.pcb_component_id])
          startDragForIds([hitComponent.pcb_component_id], rwMousePoint)
          e.preventDefault()
          return
        }

        if (!in_marquee_mode) return

        if (hitComponent) {
          const inSelection = selectedComponentIds.includes(
            hitComponent.pcb_component_id,
          )
          const dragIds =
            inSelection && selectedComponentIds.length > 0
              ? selectedComponentIds
              : [hitComponent.pcb_component_id]
          setSelectedComponentIds(dragIds)
          startDragForIds(dragIds, rwMousePoint)
          e.preventDefault()
          return
        }

        setSelectedComponentIds([])
        setMarqueeBox({ start: rwMousePoint, end: rwMousePoint })
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (Number.isNaN(x) || Number.isNaN(y)) return
        const rwMousePoint = applyToPoint(inverse(transform!), { x, y })

        if (dragState) {
          const dx = rwMousePoint.x - dragState.dragStart.x
          const dy = rwMousePoint.y - dragState.dragStart.y

          for (const d of dragState.editEvents) {
            onModifyEditEvent({
              edit_event_id: d.edit_event_id,
              new_center: {
                x: snap(d.originalCenter.x + dx),
                y: snap(d.originalCenter.y + dy),
              },
            })
          }
          return
        }

        if (marqueeBox) {
          setMarqueeBox({ ...marqueeBox, end: rwMousePoint })
        }
      }}
      onMouseUp={() => {
        if (dragState) {
          for (const d of dragState.editEvents) {
            onModifyEditEvent({
              edit_event_id: d.edit_event_id,
              in_progress: false,
            })
          }
          setDragState(null)
          setIsMovingComponent(false)
        }

        if (marqueeBox) {
          const minX = Math.min(marqueeBox.start.x, marqueeBox.end.x)
          const maxX = Math.max(marqueeBox.start.x, marqueeBox.end.x)
          const minY = Math.min(marqueeBox.start.y, marqueeBox.end.y)
          const maxY = Math.max(marqueeBox.start.y, marqueeBox.end.y)

          const selected = pcbComponents
            .filter(
              (c) =>
                c.center.x >= minX &&
                c.center.x <= maxX &&
                c.center.y >= minY &&
                c.center.y <= maxY,
            )
            .map((c) => c.pcb_component_id)

          setSelectedComponentIds(selected)
          setMarqueeBox(null)
        }
      }}
    >
      {children}

      {!disabled &&
        pcbComponents.map((comp) => {
          if (!comp?.center) return null
          const projectedCenter = applyToPoint(transform, comp.center)
          const isSelected = selectedComponentIds.includes(comp.pcb_component_id)

          if (!in_move_footprint_mode && !in_marquee_mode) return null
          if (!isSelected && in_marquee_mode) return null

          return (
            <div
              key={comp.pcb_component_id}
              style={{
                position: "absolute",
                pointerEvents: "none",
                left: projectedCenter.x,
                top: projectedCenter.y,
                width: comp.width * transform.a + 20,
                height: comp.height * transform.a + 20,
                transform: "translate(-50%, -50%)",
                border: isSelected ? "1px solid rgba(59,130,246,0.85)" : "none",
                background: isSelected ? "rgba(59, 130, 246, 0.12)" : "",
              }}
            />
          )
        })}

      {marqueeBox && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
          width={containerRef.current?.clientWidth}
          height={containerRef.current?.clientHeight}
        >
          <rect
            x={Math.min(
              applyToPoint(transform, marqueeBox.start).x,
              applyToPoint(transform, marqueeBox.end).x,
            )}
            y={Math.min(
              applyToPoint(transform, marqueeBox.start).y,
              applyToPoint(transform, marqueeBox.end).y,
            )}
            width={Math.abs(
              applyToPoint(transform, marqueeBox.start).x -
                applyToPoint(transform, marqueeBox.end).x,
            )}
            height={Math.abs(
              applyToPoint(transform, marqueeBox.start).y -
                applyToPoint(transform, marqueeBox.end).y,
            )}
            fill="rgba(59,130,246,0.12)"
            stroke="rgba(59,130,246,0.9)"
            strokeDasharray="6 4"
          />
        </svg>
      )}

      {in_marquee_mode && selectedComponentIds.length > 1 && (
        <div style={{ position: "absolute", right: 0, bottom: 0 }}>
          <HotkeyActionMenu
            hotkeys={[
              {
                key: "h",
                name: "Align horizontal",
                onUse: () => alignSelected("y"),
              },
              {
                key: "v",
                name: "Align vertical",
                onUse: () => alignSelected("x"),
              },
              {
                key: "a",
                name: "Auto align",
                onUse: () => {
                  const selected = selectedComponentIds
                    .map((id) => componentById.get(id))
                    .filter((c): c is PcbComponent => Boolean(c))
                  if (selected.length < 2) return
                  const xs = selected.map((c) => c.center.x)
                  const ys = selected.map((c) => c.center.y)
                  const spanX = Math.max(...xs) - Math.min(...xs)
                  const spanY = Math.max(...ys) - Math.min(...ys)
                  alignSelected(spanX >= spanY ? "y" : "x")
                },
              },
              {
                key: "c",
                name: "Clear selection",
                onUse: () => setSelectedComponentIds([]),
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
