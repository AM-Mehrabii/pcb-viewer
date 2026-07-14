import type { AnyCircuitElement } from "circuit-json"
import { useEffect, useMemo } from "react"
import { applyToPoint, type Matrix } from "transformation-matrix"
import {
  buildErrorPreviewElementIndexes,
  createTransformForBounds,
} from "lib/util/error-preview"
import { animateTransform } from "lib/util/transform-animation"

interface Props {
  elements: AnyCircuitElement[]
  spotlightComponentId?: string | null
  transform?: Matrix
  setTransform?: (transform: Matrix) => void
  width?: number
  height?: number
  children: React.ReactNode
}

export const SpotlightOverlay = ({
  elements,
  spotlightComponentId,
  transform,
  setTransform,
  width = 500,
  height = 500,
  children,
}: Props) => {
  const target = useMemo(() => {
    if (!spotlightComponentId) return null
    return elements.find(
      (el) =>
        el.type === "pcb_component" &&
        el.pcb_component_id === spotlightComponentId,
    ) as { center: { x: number; y: number }; width: number; height: number } | null
  }, [elements, spotlightComponentId])

  useEffect(() => {
    if (!target?.center || !setTransform) return
    const indexes = buildErrorPreviewElementIndexes(elements)
    const bounds = {
      minX: target.center.x - Math.max(target.width / 2, 1),
      maxX: target.center.x + Math.max(target.width / 2, 1),
      minY: target.center.y - Math.max(target.height / 2, 1),
      maxY: target.center.y + Math.max(target.height / 2, 1),
    }
    const next = createTransformForBounds({ bounds, width, height })
    animateTransform(transform ?? next, next, setTransform)
  }, [spotlightComponentId, target, elements, width, height, setTransform, transform])

  const screenCenter =
    target?.center && transform
      ? applyToPoint(transform, target.center)
      : null

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {children}
      {screenCenter ? (
        <div
          style={{
            position: "absolute",
            left: screenCenter.x - 24,
            top: screenCenter.y - 24,
            width: 48,
            height: 48,
            border: "2px solid #facc15",
            borderRadius: 8,
            pointerEvents: "none",
            boxShadow: "0 0 0 4px rgba(250, 204, 21, 0.25)",
            zIndex: 20,
          }}
        />
      ) : null}
    </div>
  )
}