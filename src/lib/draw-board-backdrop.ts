import type { AnyCircuitElement } from "circuit-json"
import { applyToPoint, type Matrix } from "transformation-matrix"

const BOARD_BLACK = "rgb(0, 0, 0)"

type BoardShape = {
  center?: { x: number; y: number }
  width?: number
  height?: number
  outline?: { x: number; y: number }[]
}

function boardPolygon(board: BoardShape): { x: number; y: number }[] | null {
  if (board.outline && board.outline.length >= 3) return board.outline
  if (board.center && board.width != null && board.height != null) {
    const { x, y } = board.center
    const w = board.width / 2
    const h = board.height / 2
    return [
      { x: x - w, y: y - h },
      { x: x + w, y: y - h },
      { x: x + w, y: y + h },
      { x: x - w, y: y + h },
    ]
  }
  return null
}

/**
 * Fills the board area solid black as an always-on bottom layer. It is not part
 * of the toggleable layer list, so the board reads black on the gray workspace
 * even when every other layer is hidden.
 */
export function drawBoardBackdrop({
  canvas,
  elements,
  realToCanvasMat,
}: {
  canvas: HTMLCanvasElement
  elements: AnyCircuitElement[]
  realToCanvasMat: Matrix
}) {
  const board = elements.find((e) => e.type === "pcb_board") as
    | BoardShape
    | undefined
  if (!board) return
  const polygon = boardPolygon(board)
  if (!polygon) return

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.save()
  ctx.beginPath()
  polygon.forEach((p, i) => {
    const s = applyToPoint(realToCanvasMat, p)
    if (i === 0) ctx.moveTo(s.x, s.y)
    else ctx.lineTo(s.x, s.y)
  })
  ctx.closePath()
  ctx.fillStyle = BOARD_BLACK
  ctx.fill()
  ctx.restore()
}
