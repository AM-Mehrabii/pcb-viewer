import type { AnyCircuitElement } from "circuit-json"
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import { applyToPoint, inverse, type Matrix } from "transformation-matrix"

interface Props {
  width: number
  height: number
  transform?: Matrix
  elements: AnyCircuitElement[]
}

const ORIGIN_COLOR = "rgba(0, 255, 0, 0.7)"
const ORIGIN_ARM_PX = 9
const ORIGIN_RING_PX = 4

const fmtMm = (mm: number) => (Math.abs(mm) < 1e-4 ? "0.00" : mm.toFixed(2))

// Board origin = bottom-left corner of the board (not its centre), matching
// Altium's default origin. Falls back to (0,0) when no board is present.
function boardOrigin(elements: AnyCircuitElement[]): { x: number; y: number } {
  const board = elements.find((e) => e.type === "pcb_board") as
    | { center?: { x: number; y: number }; width?: number; height?: number }
    | undefined
  if (board?.center && board.width != null && board.height != null) {
    return {
      x: board.center.x - board.width / 2,
      y: board.center.y - board.height / 2,
    }
  }
  return { x: 0, y: 0 }
}

/**
 * Draws NO grid lines. Marks the board origin on the canvas and shows a fixed
 * corner readout with the absolute cursor position (x/y) and its distance from
 * the origin (dx/dy), like Altium. Pointer-events are disabled throughout.
 */
export const PcbCoordinateOverlay = ({
  width,
  height,
  transform,
  elements,
}: Props) => {
  const ref = useRef<HTMLCanvasElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let frame = 0
    const onMove = (e: MouseEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
          setCursor(null)
          return
        }
        setCursor({ x, y })
      })
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => {
      window.removeEventListener("mousemove", onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const origin = useMemo(() => boardOrigin(elements), [elements])

  const cursorReal = useMemo(() => {
    if (!cursor || !transform) return null
    return applyToPoint(inverse(transform), cursor)
  }, [cursor, transform])

  // Draw only the origin marker on the canvas; the coordinates live in the
  // fixed corner readout below.
  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!transform) return
    const o = applyToPoint(transform, origin)
    ctx.strokeStyle = ORIGIN_COLOR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(o.x - ORIGIN_ARM_PX, o.y)
    ctx.lineTo(o.x + ORIGIN_ARM_PX, o.y)
    ctx.moveTo(o.x, o.y - ORIGIN_ARM_PX)
    ctx.lineTo(o.x, o.y + ORIGIN_ARM_PX)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(o.x, o.y, ORIGIN_RING_PX, 0, Math.PI * 2)
    ctx.stroke()
  }, [width, height, transform, origin])

  const rel = cursorReal
    ? { x: cursorReal.x - origin.x, y: cursorReal.y - origin.y }
    : null

  return (
    <>
      <canvas
        ref={ref}
        width={width}
        height={height}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      />
      <div style={READOUT_STYLE}>
        <div style={ROW_STYLE}>
          <span style={LABEL_STYLE}>x:</span>
          <span style={VALUE_STYLE}>
            {cursorReal ? fmtMm(cursorReal.x) : "—"}
          </span>
          <span style={LABEL_STYLE}>dx:</span>
          <span style={VALUE_STYLE}>{rel ? fmtMm(rel.x) : "—"}</span>
        </div>
        <div style={ROW_STYLE}>
          <span style={LABEL_STYLE}>y:</span>
          <span style={VALUE_STYLE}>
            {cursorReal ? fmtMm(cursorReal.y) : "—"}
          </span>
          <span style={LABEL_STYLE}>dy:</span>
          <span style={VALUE_STYLE}>{rel ? fmtMm(rel.y) : "—"}</span>
        </div>
      </div>
    </>
  )
}

const READOUT_STYLE: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  pointerEvents: "none",
  font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
  color: "rgba(0, 255, 0, 0.85)",
  background: "rgba(0, 0, 0, 0.55)",
  padding: "4px 8px",
  borderRadius: 4,
  lineHeight: 1.5,
}

const ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "20px 60px 30px 60px",
  columnGap: 4,
}

const LABEL_STYLE: CSSProperties = { opacity: 0.75 }
const VALUE_STYLE: CSSProperties = { textAlign: "right" }
