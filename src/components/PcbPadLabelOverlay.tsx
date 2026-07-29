import type { AnyCircuitElement } from "circuit-json"
import { useEffect, useMemo, useRef } from "react"
import { applyToPoint, type Matrix } from "transformation-matrix"

interface Props {
  width: number
  height: number
  transform?: Matrix
  elements: AnyCircuitElement[]
}

const PAD_NUMBER_COLOR = "rgba(255, 255, 255, 0.95)"
const NET_NAME_COLOR = "rgba(150, 214, 255, 0.95)"
const LABEL_OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)"
// Skip pads too small on screen to keep labels readable and non-overlapping.
const MIN_PAD_SCREEN_PX = 13
const PAD_NUMBER_FONT = "bold 9px sans-serif"
const NET_NAME_FONT = "8px sans-serif"

type LookupMaps = {
  pcbPort: Map<string, { source_port_id?: string }>
  sourcePort: Map<string, { pin_number?: number; name?: string }>
  // source_port_id -> net name, resolved through source_trace connectivity.
  netByPort: Map<string, string>
}

function padNumberFor(
  maps: LookupMaps,
  pcbPortId: string | undefined,
  portHints: string[] | undefined,
): string | null {
  const sourcePortId = pcbPortId
    ? maps.pcbPort.get(pcbPortId)?.source_port_id
    : undefined
  const pinNumber = sourcePortId
    ? maps.sourcePort.get(sourcePortId)?.pin_number
    : undefined
  if (pinNumber != null) return String(pinNumber)
  // Fall back to a numeric port hint, then any hint.
  const numeric = portHints?.find((h) => /^\d+$/.test(h))
  return numeric ?? portHints?.[0] ?? null
}

function netNameFor(
  maps: LookupMaps,
  pcbPortId: string | undefined,
): string | null {
  if (!pcbPortId) return null
  const sourcePortId = maps.pcbPort.get(pcbPortId)?.source_port_id
  if (!sourcePortId) return null
  return maps.netByPort.get(sourcePortId) ?? null
}

/**
 * Draws each pad's pin number and connected net name as a pointer-events-none
 * overlay above every layer canvas, so labels never hide behind copper.
 */
export const PcbPadLabelOverlay = ({
  width,
  height,
  transform,
  elements,
}: Props) => {
  const ref = useRef<HTMLCanvasElement>(null)

  const maps = useMemo<LookupMaps>(() => {
    const pcbPort = new Map<string, { source_port_id?: string }>()
    const sourcePort = new Map<string, { pin_number?: number; name?: string }>()
    const sourceNet = new Map<string, { name?: string }>()
    const traces: { ports: string[]; netId?: string }[] = []
    for (const el of elements) {
      if (el.type === "pcb_port") pcbPort.set(el.pcb_port_id, el)
      else if (el.type === "source_port") sourcePort.set(el.source_port_id, el)
      else if (el.type === "source_net") sourceNet.set(el.source_net_id, el)
      else if (el.type === "source_trace") {
        traces.push({
          ports: el.connected_source_port_ids ?? [],
          netId: el.connected_source_net_ids?.[0],
        })
      }
    }
    // A net's name reaches a port through the source_trace that connects them.
    const netByPort = new Map<string, string>()
    for (const { ports, netId } of traces) {
      const name = netId ? sourceNet.get(netId)?.name : undefined
      if (!name) continue
      for (const portId of ports) netByPort.set(portId, name)
    }
    return { pcbPort, sourcePort, netByPort }
  }, [elements])

  const pads = useMemo(
    () =>
      elements.filter(
        (el) => el.type === "pcb_smtpad" || el.type === "pcb_plated_hole",
      ),
    [elements],
  )

  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!transform) return

    const scale = Math.hypot(transform.a, transform.b)
    ctx.textAlign = "center"
    ctx.lineJoin = "round"

    for (const pad of pads) {
      const p = pad as {
        x?: number
        y?: number
        width?: number
        height?: number
        outer_width?: number
        outer_height?: number
        pcb_port_id?: string
        port_hints?: string[]
      }
      if (typeof p.x !== "number" || typeof p.y !== "number") continue

      const padW = (p.width ?? p.outer_width ?? 0) * scale
      const padH = (p.height ?? p.outer_height ?? 0) * scale
      if (Math.max(padW, padH) < MIN_PAD_SCREEN_PX) continue

      const center = applyToPoint(transform, { x: p.x, y: p.y })
      const number = padNumberFor(maps, p.pcb_port_id, p.port_hints)
      const net = netNameFor(maps, p.pcb_port_id)
      if (!number && !net) continue

      const drawLabel = (
        text: string,
        color: string,
        font: string,
        y: number,
        baseline: CanvasTextBaseline,
      ) => {
        ctx.font = font
        ctx.textBaseline = baseline
        ctx.lineWidth = 3
        ctx.strokeStyle = LABEL_OUTLINE_COLOR
        ctx.strokeText(text, center.x, y)
        ctx.fillStyle = color
        ctx.fillText(text, center.x, y)
      }

      if (number && net) {
        drawLabel(
          number,
          PAD_NUMBER_COLOR,
          PAD_NUMBER_FONT,
          center.y - 1,
          "bottom",
        )
        drawLabel(net, NET_NAME_COLOR, NET_NAME_FONT, center.y + 1, "top")
      } else if (number) {
        drawLabel(number, PAD_NUMBER_COLOR, PAD_NUMBER_FONT, center.y, "middle")
      } else if (net) {
        drawLabel(net, NET_NAME_COLOR, NET_NAME_FONT, center.y, "middle")
      }
    }
  }, [width, height, transform, pads, maps])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 50,
        pointerEvents: "none",
      }}
    />
  )
}
