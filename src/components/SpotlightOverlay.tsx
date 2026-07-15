import type { AnyCircuitElement } from "circuit-json"
import { useEffect, useMemo, useRef } from "react"
import {
  applyToPoint,
  type Matrix,
} from "transformation-matrix"

interface Props {
  elements: AnyCircuitElement[]
  spotlightComponentId?: string | null
  transform?: Matrix
  setTransform?: (transform: Matrix) => void
  width?: number
  height?: number
  children: React.ReactNode
}

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

const mergeBounds = (a: Bounds | null, b: Bounds | null): Bounds | null => {
  if (!a) return b
  if (!b) return a
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

const getElementBounds = (el: AnyCircuitElement): Bounds | null => {
  const e = el as any
  if (e?.center && typeof e.center.x === "number" && typeof e.center.y === "number") {
    if (typeof e.width === "number" && typeof e.height === "number") {
      return {
        minX: e.center.x - e.width / 2,
        maxX: e.center.x + e.width / 2,
        minY: e.center.y - e.height / 2,
        maxY: e.center.y + e.height / 2,
      }
    }
    if (typeof e.radius === "number") {
      return {
        minX: e.center.x - e.radius,
        maxX: e.center.x + e.radius,
        minY: e.center.y - e.radius,
        maxY: e.center.y + e.radius,
      }
    }
  }

  if (Array.isArray(e?.points) && e.points.length > 0) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of e.points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    if (Number.isFinite(minX)) return { minX, minY, maxX, maxY }
  }

  if (Array.isArray(e?.route) && e.route.length > 0) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of e.route) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue
      const r = Math.max((typeof p.width === "number" ? p.width : 0.2) / 2, 0.15)
      minX = Math.min(minX, p.x - r)
      minY = Math.min(minY, p.y - r)
      maxX = Math.max(maxX, p.x + r)
      maxY = Math.max(maxY, p.y + r)
    }
    if (Number.isFinite(minX)) return { minX, minY, maxX, maxY }
  }

  return null
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
  const zoomedForSpotlightRef = useRef<string | null>(null)
  const target = useMemo(() => {
    if (!spotlightComponentId) return null
    const component = elements.find(
      (el) =>
        el.type === "pcb_component" &&
        el.pcb_component_id === spotlightComponentId,
    ) as (AnyCircuitElement & {
      center?: { x: number; y: number }
      width?: number
      height?: number
      pcb_component_id?: string
    }) | null

    const related = elements.filter(
      (el) => (el as any)?.pcb_component_id === spotlightComponentId,
    )
    let bounds: Bounds | null = null
    for (const el of related) bounds = mergeBounds(bounds, getElementBounds(el))
    if (!bounds && component) bounds = getElementBounds(component)
    if (!bounds) return null

    return {
      center: {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      },
      width: Math.max(0.4, bounds.maxX - bounds.minX),
      height: Math.max(0.4, bounds.maxY - bounds.minY),
    }
  }, [elements, spotlightComponentId])

  const screenCenter =
    target?.center && transform
      ? applyToPoint(transform, target.center)
      : null
  const targetScreenRadius = useMemo(() => {
    if (!target?.center || !transform) return 34
    const pLeft = applyToPoint(transform, {
      x: target.center.x - target.width / 2,
      y: target.center.y,
    })
    const pRight = applyToPoint(transform, {
      x: target.center.x + target.width / 2,
      y: target.center.y,
    })
    const pTop = applyToPoint(transform, {
      x: target.center.x,
      y: target.center.y - target.height / 2,
    })
    const pBottom = applyToPoint(transform, {
      x: target.center.x,
      y: target.center.y + target.height / 2,
    })
    const w = Math.abs(pRight.x - pLeft.x)
    const h = Math.abs(pBottom.y - pTop.y)
    const halfDiagonal = Math.hypot(w, h) / 2
    const viewportCap = Math.max(40, Math.min(width, height) * 0.46)
    const padded = (halfDiagonal + 12) * 1.42
    return Math.max(28, Math.min(viewportCap, padded))
  }, [target, transform, width, height])

  const holeLeft = Math.max(0, screenCenter ? screenCenter.x - targetScreenRadius : 0)
  const holeTop = Math.max(0, screenCenter ? screenCenter.y - targetScreenRadius : 0)
  const holeRight = Math.min(width, screenCenter ? screenCenter.x + targetScreenRadius : width)
  const holeBottom = Math.min(height, screenCenter ? screenCenter.y + targetScreenRadius : height)

  useEffect(() => {
    if (!target?.center || !transform || !setTransform) return
    if (width < 120 || height < 120) return
    if (zoomedForSpotlightRef.current === spotlightComponentId) return

    const readableRadiusPx = 92
    const minReadableScale = 12
    const currentScale = Math.hypot(transform.a, transform.b)
    const shouldZoomIn =
      targetScreenRadius < readableRadiusPx || currentScale < minReadableScale
    const zoomFactor = shouldZoomIn
      ? Math.max(
          1,
          Math.min(
            8,
            Math.max(
              readableRadiusPx / Math.max(targetScreenRadius, 6),
              minReadableScale / Math.max(currentScale, 0.001),
            ),
          ),
        )
      : 1
    const cx = target.center.x
    const cy = target.center.y
    const nextA = transform.a * zoomFactor
    const nextB = transform.b * zoomFactor
    const nextC = transform.c * zoomFactor
    const nextD = transform.d * zoomFactor
    const nextE = width / 2 - (nextA * cx + nextC * cy)
    const nextF = height / 2 - (nextB * cx + nextD * cy)

    const next: Matrix = {
      a: nextA,
      b: nextB,
      c: nextC,
      d: nextD,
      e: nextE,
      f: nextF,
    }
    const nextScale = Math.hypot(next.a, next.b)
    if (shouldZoomIn && !(nextScale > currentScale)) return

    zoomedForSpotlightRef.current = spotlightComponentId ?? null
    setTransform(next)
  }, [
    target,
    transform,
    setTransform,
    width,
    height,
    targetScreenRadius,
    spotlightComponentId,
  ])

  useEffect(() => {
    if (!spotlightComponentId) {
      zoomedForSpotlightRef.current = null
    }
  }, [spotlightComponentId])

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {children}
      {screenCenter ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width,
              height: holeTop,
              pointerEvents: "none",
              zIndex: 19,
              background: "rgba(2, 6, 23, 0.42)",
              backdropFilter: "blur(7px) saturate(90%)",
              WebkitBackdropFilter: "blur(7px) saturate(90%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: holeBottom,
              width,
              height: Math.max(0, height - holeBottom),
              pointerEvents: "none",
              zIndex: 19,
              background: "rgba(2, 6, 23, 0.42)",
              backdropFilter: "blur(7px) saturate(90%)",
              WebkitBackdropFilter: "blur(7px) saturate(90%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: holeTop,
              width: holeLeft,
              height: Math.max(0, holeBottom - holeTop),
              pointerEvents: "none",
              zIndex: 19,
              background: "rgba(2, 6, 23, 0.42)",
              backdropFilter: "blur(7px) saturate(90%)",
              WebkitBackdropFilter: "blur(7px) saturate(90%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: holeRight,
              top: holeTop,
              width: Math.max(0, width - holeRight),
              height: Math.max(0, holeBottom - holeTop),
              pointerEvents: "none",
              zIndex: 19,
              background: "rgba(2, 6, 23, 0.42)",
              backdropFilter: "blur(7px) saturate(90%)",
              WebkitBackdropFilter: "blur(7px) saturate(90%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: screenCenter.x - targetScreenRadius,
              top: screenCenter.y - targetScreenRadius,
              width: targetScreenRadius * 2,
              height: targetScreenRadius * 2,
              borderRadius: "999px",
              pointerEvents: "none",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.0) 42%, rgba(255,255,255,0.82) 57%, rgba(255,255,255,0.15) 70%, rgba(255,255,255,0.0) 100%)",
              boxShadow: "0 0 45px rgba(255, 255, 255, 0.22)",
              opacity: 0.92,
              transition: "opacity 260ms ease, transform 260ms ease",
              zIndex: 20,
            }}
          />
        </>
      ) : null}
    </div>
  )
}