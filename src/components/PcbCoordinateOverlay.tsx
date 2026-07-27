import { useEffect, useMemo, useRef, useState } from "react"
import { applyToPoint, inverse, type Matrix } from "transformation-matrix"

interface Props {
  width: number
  height: number
  transform?: Matrix
}

const READOUT_COLOR = "rgba(0, 255, 0, 0.85)"
const ORIGIN_COLOR = "rgba(0, 255, 0, 0.55)"
const ORIGIN_ARM_PX = 9
const ORIGIN_RING_PX = 4

const fmtMm = (mm: number) => {
  const v = Math.abs(mm) < 1e-4 ? 0 : mm
  return v.toFixed(2)
}

/**
 * Draws NO grid lines — only the board origin (0,0) and the live cursor
 * position relative to it, like Altium's origin marker and X/Y readout.
 * Pointer-events are disabled so it never blocks panning or editing.
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

  const cursorReal = useMemo(() => {
    if (!cursor || !transform) return null
    return applyToPoint(inverse(transform), cursor)
  }, [cursor, transform])

  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    // Origin marker at real (0,0).
    if (transform) {
      const origin = applyToPoint(transform, { x: 0, y: 0 })
      ctx.strokeStyle = ORIGIN_COLOR
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(origin.x - ORIGIN_ARM_PX, origin.y)
      ctx.lineTo(origin.x + ORIGIN_ARM_PX, origin.y)
      ctx.moveTo(origin.x, origin.y - ORIGIN_ARM_PX)
      ctx.lineTo(origin.x, origin.y + ORIGIN_ARM_PX)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, ORIGIN_RING_PX, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = ORIGIN_COLOR
      ctx.font = "10px sans-serif"
      ctx.fillText("(0, 0)", origin.x + ORIGIN_ARM_PX + 2, origin.y - 4)
    }

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
