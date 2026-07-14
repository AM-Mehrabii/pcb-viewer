import type { AnyCircuitElement } from "circuit-json"
import { useGlobalStore } from "../global-store"
import { applyToPoint, inverse, type Matrix } from "transformation-matrix"
import type { ManualEditEvent } from "@tscircuit/props"

interface Props {
  transform?: Matrix
  soup: AnyCircuitElement[]
  disabled?: boolean
  cancelPanDrag: () => void
  onCreateEditEvent: (event: ManualEditEvent) => void
  children: React.ReactNode
}

export const PlaceViaOverlay = ({
  transform,
  soup,
  disabled: disabledProp,
  cancelPanDrag,
  onCreateEditEvent,
  children,
}: Props) => {
  const inViaMode = useGlobalStore((s) => s.in_draw_via_mode)
  const selectedLayer = useGlobalStore((s) => s.selected_layer)
  const disabled = disabledProp || !inViaMode

  return (
    <div
      style={{ position: "relative", overflow: "hidden" }}
      onMouseDown={(e) => {
        if (disabled || !transform) return
        const rect = e.currentTarget.getBoundingClientRect()
        const point = applyToPoint(inverse(transform), {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
        cancelPanDrag()
        onCreateEditEvent({
          edit_event_id: crypto.randomUUID(),
          edit_event_type: "edit_pcb_via_add",
          pcb_edit_event_type: "add_via",
          x: point.x,
          y: point.y,
          layers: [selectedLayer],
          outer_diameter: 0.6,
          hole_diameter: 0.3,
          created_at: Date.now(),
        } as ManualEditEvent)
      }}
    >
      {children}
    </div>
  )
}