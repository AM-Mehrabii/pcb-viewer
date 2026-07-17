import type { AnyCircuitElement, PcbComponent } from "circuit-json"
import { useMemo, useRef } from "react"
import type { Matrix } from "transformation-matrix"
import { applyToPoint, identity, inverse } from "transformation-matrix"

export type PcbComponentClickOptions = {
  pcbComponentId: string
  sourceComponentId?: string
  event: MouseEvent
}

interface Props {
  transform?: Matrix
  elements: AnyCircuitElement[]
  onPcbComponentClicked: (options: PcbComponentClickOptions) => void
}

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

export const PcbComponentClickOverlay = ({
  transform,
  elements,
  onPcbComponentClicked,
}: Props) => {
  const tf = transform ?? identity()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const pcbComponents = useMemo(
    () => elements.filter((e): e is PcbComponent => e.type === "pcb_component"),
    [elements],
  )

  return (
    <div
      ref={containerRef}
      data-pcb-component-click-overlay
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        cursor: "pointer",
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const rw = applyToPoint(inverse(tf), { x, y })
        const padding = 10 / (Math.abs(tf.a) || 1)
        const hit = pcbComponents.find((comp) => isInsideOf(comp, rw, padding))
        if (!hit) return
        e.preventDefault()
        e.stopPropagation()
        onPcbComponentClicked({
          pcbComponentId: hit.pcb_component_id,
          sourceComponentId: hit.source_component_id,
          event: e.nativeEvent,
        })
      }}
    />
  )
}
