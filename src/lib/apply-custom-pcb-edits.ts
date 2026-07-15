import type { AnyCircuitElement } from "circuit-json"

type CustomAddEvent = {
  edit_event_id?: string
  edit_event_type:
    | "add_pcb_copper_pour"
    | "add_pcb_keepout"
    | "add_pcb_cutout"
    | "add_pcb_silkscreen_text"
  element: AnyCircuitElement
}

type CustomDeleteEvent = {
  edit_event_id?: string
  edit_event_type: "delete_pcb_custom_element"
  target_type?: string
  target_id?: string
}

type UnknownEditEvent = Record<string, any>

function getElementIdentity(el: AnyCircuitElement): { type: string; id: string } | null {
  const anyEl = el as any
  if (!anyEl?.type || typeof anyEl.type !== "string") return null

  const keys = Object.keys(anyEl).filter((k) => k.endsWith("_id"))
  const idKey = keys.find((k) => typeof anyEl[k] === "string")
  if (!idKey) return null

  return { type: anyEl.type, id: String(anyEl[idKey]) }
}

export function isCoreCompatibleEditEvent(event: UnknownEditEvent): boolean {
  const t = event?.edit_event_type
  const deprecated = event?.pcb_edit_event_type
  return (
    t === "edit_pcb_component_location" ||
    t === "edit_pcb_trace_hint" ||
    t === "edit_pcb_via_add" ||
    t === "edit_schematic_component_location" ||
    deprecated === "edit_component_location" ||
    deprecated === "edit_trace_hint" ||
    deprecated === "add_via"
  )
}

/**
 * Applies custom local PCB edit events that are currently outside @tscircuit/core
 * manual-edit support. These edits are additive and deterministic.
 */
export function applyCustomPcbEditEvents(
  elements: AnyCircuitElement[],
  editEvents: UnknownEditEvent[],
): AnyCircuitElement[] {
  let next = [...elements]

  for (const raw of editEvents) {
    const event = raw as CustomAddEvent | CustomDeleteEvent
    if (!event || typeof event !== "object") continue

    if (
      event.edit_event_type === "add_pcb_copper_pour" ||
      event.edit_event_type === "add_pcb_keepout" ||
      event.edit_event_type === "add_pcb_cutout" ||
      event.edit_event_type === "add_pcb_silkscreen_text"
    ) {
      const el = { ...(event as CustomAddEvent).element } as AnyCircuitElement & {
        layer?: string[] | string
        layers?: string[] | string
      }
      if (!el) continue
      // Keepout payload compatibility across circuit-to-canvas versions.
      if ((el as any).type === "pcb_keepout") {
        const anyEl = el as any
        if (!anyEl.layer && anyEl.layers) anyEl.layer = anyEl.layers
        if (typeof anyEl.layer === "string") anyEl.layer = [anyEl.layer]
        if (!anyEl.layer) anyEl.layer = ["top"]
      }
      const identity = getElementIdentity(el)
      if (!identity) continue

      const exists = next.some((existing) => {
        const exId = getElementIdentity(existing)
        return exId?.type === identity.type && exId.id === identity.id
      })
      if (!exists) next.push(el)
      continue
    }

    if (event.edit_event_type === "delete_pcb_custom_element") {
      const { target_type, target_id } = event as CustomDeleteEvent
      if (!target_type || !target_id) continue
      next = next.filter((el) => {
        const id = getElementIdentity(el)
        return !(id?.type === target_type && id.id === target_id)
      })
    }
  }

  return next
}
