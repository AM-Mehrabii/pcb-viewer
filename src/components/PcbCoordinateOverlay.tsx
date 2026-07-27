import { useEffect, useMemo, useRef, useState } from "react"
import { applyToPoint, inverse, type Matrix } from "transformation-matrix"

interface Props {
  width: number
  height: number
  transform?: Matrix
}

const READOUT_COLOR = "rgba(0, 255, 0, 0.85)"

// Format a millimetre value for the cursor readout.
const fmtMm = (mm: number) => {
  const v = Math.abs(mm) < 1e-4 ? 0 : mm
  return v.toFixed(2)
}

/**
 * Lightweight replacement for the previous SuperGrid overlay. It deliberately
 * draws NO grid lines (PCBAI-360); it only reports the live cursor position.
 *
 * The canvas itself is `pointer-events: none` so it never interferes with
 * panning / editing — the cursor position comes from a passive window
 * `mousemove` listener measured against the canvas bounds.
 */
export const PcbCoordinateOverlay = ({ width, height, transform }: Props) => {
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

  // Cursor position in real millimetre coordinates.
  const cursorReal = useMemo(() => {
    if (!cursor || !transform) return null
    return applyToPoint(inverse(transform), cursor)
  }, [cursor, transform])

  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!cursor || !cursorReal) return

    ctx.strokeStyle = READOUT_COLOR
    ctx.lineWidth = 1
    ctx.strokeRect(cursor.x - 5, cursor.y - 5, 10, 10)

    ctx.fillStyle = READOUT_COLOR
    ctx.font = "12px sans-serif"
    ctx.fillText(
      `X ${fmtMm(cursorReal.x)}  Y ${fmtMm(cursorReal.y)} mm`,
      cursor.x + 8,
      cursor.y - 8,
    )
  }, [width, height, transform, cursor, cursorReal])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
      }}
    />
  )
}
