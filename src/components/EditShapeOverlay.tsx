import type { AnyCircuitElement } from "circuit-json"
import type { ManualEditEvent } from "@tscircuit/props"
import { useMemo, useRef, useState } from "react"
import { applyToPoint, identity, inverse, type Matrix } from "transformation-matrix"
import { useGlobalStore } from "../global-store"
import { HotkeyActionMenu } from "./HotkeyActionMenu"
import { zIndexMap } from "lib/util/z-index-map"

interface Props {
  transform?: Matrix
  soup: AnyCircuitElement[]
  disabled?: boolean
  cancelPanDrag: () => void
  onCreateEditEvent: (event: ManualEditEvent) => void
  children: React.ReactNode
}

type DrawShape = "rect" | "circle" | "triangle" | "arrow"
type DrawMode = "copper_pour" | "keepout" | "cutout" | "silkscreen_text" | "none"

const MIN_SIZE = 0.2

const mkId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const clampSize = (v: number) => Math.max(MIN_SIZE, v)

export const EditShapeOverlay = ({
  transform,
  soup,
  disabled: disabledProp,
  cancelPanDrag,
  onCreateEditEvent,
  children,
}: Props) => {
  if (!transform) transform = identity()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [drawState, setDrawState] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
  } | null>(null)
  const [shape, setShape] = useState<DrawShape>("rect")
  const [silkText, setSilkText] = useState("REF**")
  const [silkLayer, setSilkLayer] = useState<"top" | "bottom">("top")
  const [pendingSilkPoint, setPendingSilkPoint] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [silkDraft, setSilkDraft] = useState("REF**")
  const [silkDraftLayer, setSilkDraftLayer] = useState<"top" | "bottom">("top")
  const [netIndex, setNetIndex] = useState(0)

  const selectedLayer = useGlobalStore((s) => s.selected_layer)
  const inDrawCopperPourMode = useGlobalStore((s) => s.in_draw_copper_pour_mode)
  const inDrawKeepoutMode = useGlobalStore((s) => s.in_draw_keepout_region_mode)
  const inDrawCutoutMode = useGlobalStore((s) => s.in_draw_cutout_mode)
  const inDrawSilkscreenTextMode = useGlobalStore(
    (s) => s.in_draw_silkscreen_text_mode,
  )

  const mode: DrawMode = inDrawCopperPourMode
    ? "copper_pour"
    : inDrawKeepoutMode
      ? "keepout"
      : inDrawCutoutMode
        ? "cutout"
        : inDrawSilkscreenTextMode
          ? "silkscreen_text"
          : "none"

  const sourceNetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of soup as any[]) {
      if (e?.type === "source_trace" && typeof e.source_trace_id === "string") {
        ids.add(e.source_trace_id)
      }
      if (e?.type === "source_net" && typeof e.source_net_id === "string") {
        ids.add(e.source_net_id)
      }
    }
    return Array.from(ids)
  }, [soup])

  const currentSourceNetId = sourceNetIds[netIndex] ?? "source_net_0"

  const disabled = disabledProp || mode === "none"

  const createCopperPour = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    const w = clampSize(maxX - minX)
    const h = clampSize(maxY - minY)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    let vertices: Array<{ x: number; y: number }>
    if (shape === "circle") {
      const r = Math.max(w, h) / 2
      const segments = 20
      vertices = Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * Math.PI * 2
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
      })
    } else if (shape === "triangle") {
      vertices = [
        { x: cx, y: maxY },
        { x: minX, y: minY },
        { x: maxX, y: minY },
      ]
    } else if (shape === "arrow") {
      const midY = (minY + maxY) / 2
      vertices = [
        { x: minX, y: minY + h * 0.2 },
        { x: minX + w * 0.62, y: minY + h * 0.2 },
        { x: minX + w * 0.62, y: minY },
        { x: maxX, y: midY },
        { x: minX + w * 0.62, y: maxY },
        { x: minX + w * 0.62, y: maxY - h * 0.2 },
        { x: minX, y: maxY - h * 0.2 },
      ]
    } else {
      vertices = [
        { x: minX, y: minY },
        { x: minX, y: maxY },
        { x: maxX, y: maxY },
        { x: maxX, y: minY },
      ]
    }

    const element: AnyCircuitElement = {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: mkId("pcb_copper_pour"),
      shape: "brep",
      layer: selectedLayer as any,
      brep_shape: {
        outer_ring: { vertices },
        inner_rings: [],
      },
      source_net_id: currentSourceNetId,
      covered_with_solder_mask: true,
    } as any

    onCreateEditEvent({
      edit_event_id: mkId("edit"),
      edit_event_type: "add_pcb_copper_pour",
      element,
      created_at: Date.now(),
    } as any)
  }

  const createKeepout = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const w = clampSize(maxX - minX)
    const h = clampSize(maxY - minY)

    const element: AnyCircuitElement =
      shape === "circle"
        ? ({
            type: "pcb_keepout",
            shape: "circle",
            pcb_keepout_id: mkId("pcb_keepout"),
            center: { x: cx, y: cy },
            radius: Math.max(w, h) / 2,
            layer: [selectedLayer as any],
            layers: [selectedLayer as any],
          } as any)
        : ({
            type: "pcb_keepout",
            shape: "rect",
            pcb_keepout_id: mkId("pcb_keepout"),
            center: { x: cx, y: cy },
            width: w,
            height: h,
            layer: [selectedLayer as any],
            layers: [selectedLayer as any],
          } as any)

    onCreateEditEvent({
      edit_event_id: mkId("edit"),
      edit_event_type: "add_pcb_keepout",
      element,
      created_at: Date.now(),
    } as any)
  }

  const createCutout = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const w = clampSize(maxX - minX)
    const h = clampSize(maxY - minY)

    let element: AnyCircuitElement
    if (shape === "circle") {
      element = {
        type: "pcb_cutout",
        pcb_cutout_id: mkId("pcb_cutout"),
        shape: "circle",
        center: { x: cx, y: cy },
        radius: Math.max(w, h) / 2,
      } as any
    } else if (shape === "triangle") {
      element = {
        type: "pcb_cutout",
        pcb_cutout_id: mkId("pcb_cutout"),
        shape: "polygon",
        points: [
          { x: cx, y: maxY },
          { x: minX, y: minY },
          { x: maxX, y: minY },
        ],
      } as any
    } else if (shape === "arrow") {
      const midY = (minY + maxY) / 2
      element = {
        type: "pcb_cutout",
        pcb_cutout_id: mkId("pcb_cutout"),
        shape: "polygon",
        points: [
          { x: minX, y: minY + h * 0.2 },
          { x: minX + w * 0.62, y: minY + h * 0.2 },
          { x: minX + w * 0.62, y: minY },
          { x: maxX, y: midY },
          { x: minX + w * 0.62, y: maxY },
          { x: minX + w * 0.62, y: maxY - h * 0.2 },
          { x: minX, y: maxY - h * 0.2 },
        ],
      } as any
    } else {
      element = {
        type: "pcb_cutout",
        pcb_cutout_id: mkId("pcb_cutout"),
        shape: "rect",
        center: { x: cx, y: cy },
        width: w,
        height: h,
      } as any
    }

    onCreateEditEvent({
      edit_event_id: mkId("edit"),
      edit_event_type: "add_pcb_cutout",
      element,
      created_at: Date.now(),
    } as any)
  }

  const createSilkText = (
    point: { x: number; y: number },
    text: string,
    layer: "top" | "bottom",
  ) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSilkText(trimmed)

    const componentRef = (soup as any[]).find((e) => e?.type === "pcb_component")
    const pcbComponentId = componentRef?.pcb_component_id ?? "pcb_component_0"

    const element: AnyCircuitElement = {
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: mkId("pcb_silkscreen_text"),
      pcb_component_id: pcbComponentId,
      font: "tscircuit2024",
      font_size: 0.95,
      text: trimmed,
      anchor_position: point,
      anchor_alignment: "center",
      layer,
    } as any

    onCreateEditEvent({
      edit_event_id: mkId("edit"),
      edit_event_type: "add_pcb_silkscreen_text",
      element,
      created_at: Date.now(),
    } as any)
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", overflow: "hidden" }}
      onMouseDown={(e) => {
        if (disabled) return
        const rect = e.currentTarget.getBoundingClientRect()
        const point = applyToPoint(inverse(transform), {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
        cancelPanDrag()

        if (mode === "silkscreen_text") {
          setSilkDraft(silkText)
          setSilkDraftLayer(silkLayer)
          setPendingSilkPoint(point)
          return
        }
        setDrawState({ start: point, end: point })
      }}
      onMouseMove={(e) => {
        if (!drawState || disabled) return
        const rect = e.currentTarget.getBoundingClientRect()
        const point = applyToPoint(inverse(transform), {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
        setDrawState({ ...drawState, end: point })
      }}
      onMouseUp={() => {
        if (!drawState) return
        if (mode === "copper_pour") createCopperPour(drawState.start, drawState.end)
        if (mode === "keepout") createKeepout(drawState.start, drawState.end)
        if (mode === "cutout") createCutout(drawState.start, drawState.end)
        setDrawState(null)
      }}
    >
      {children}

      {drawState && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            mixBlendMode: "difference",
            zIndex: zIndexMap.editTraceHintOverlay,
          }}
          width={containerRef.current?.clientWidth}
          height={containerRef.current?.clientHeight}
        >
          <rect
            x={Math.min(
              applyToPoint(transform, drawState.start).x,
              applyToPoint(transform, drawState.end).x,
            )}
            y={Math.min(
              applyToPoint(transform, drawState.start).y,
              applyToPoint(transform, drawState.end).y,
            )}
            width={Math.abs(
              applyToPoint(transform, drawState.start).x -
                applyToPoint(transform, drawState.end).x,
            )}
            height={Math.abs(
              applyToPoint(transform, drawState.start).y -
                applyToPoint(transform, drawState.end).y,
            )}
            fill="rgba(244, 114, 182, 0.15)"
            stroke="rgb(244, 114, 182)"
            strokeDasharray="6 4"
          />
        </svg>
      )}

      {pendingSilkPoint && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: zIndexMap.editTraceHintOverlay + 20,
            minWidth: 280,
            background: "rgba(8, 12, 24, 0.95)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: 10,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.9 }}>
            Place silkscreen text
          </div>
          <input
            value={silkDraft}
            onChange={(e) => setSilkDraft(e.target.value)}
            placeholder="Text"
            style={{
              width: "100%",
              height: 30,
              borderRadius: 6,
              border: "1px solid rgba(148, 163, 184, 0.35)",
              background: "rgba(2, 6, 23, 0.8)",
              color: "white",
              padding: "0 9px",
              marginBottom: 8,
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setSilkDraftLayer("top")}
              style={{
                borderRadius: 6,
                border: "1px solid rgba(148, 163, 184, 0.35)",
                background:
                  silkDraftLayer === "top"
                    ? "rgba(59,130,246,0.25)"
                    : "rgba(2, 6, 23, 0.6)",
                color: "white",
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              Top
            </button>
            <button
              type="button"
              onClick={() => setSilkDraftLayer("bottom")}
              style={{
                borderRadius: 6,
                border: "1px solid rgba(148, 163, 184, 0.35)",
                background:
                  silkDraftLayer === "bottom"
                    ? "rgba(59,130,246,0.25)"
                    : "rgba(2, 6, 23, 0.6)",
                color: "white",
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              Bottom
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPendingSilkPoint(null)}
              style={{
                borderRadius: 6,
                border: "1px solid rgba(148, 163, 184, 0.35)",
                background: "rgba(2, 6, 23, 0.6)",
                color: "white",
                padding: "4px 10px",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                createSilkText(pendingSilkPoint, silkDraft, silkDraftLayer)
                setSilkLayer(silkDraftLayer)
                setPendingSilkPoint(null)
              }}
              style={{
                borderRadius: 6,
                border: "1px solid rgba(37,99,235,0.7)",
                background: "rgba(37,99,235,0.28)",
                color: "white",
                padding: "4px 10px",
                fontSize: 12,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {!disabled && (
        <div style={{ position: "absolute", right: 0, bottom: 0 }}>
          <HotkeyActionMenu
            hotkeys={[
              { key: "1", name: "Rect shape", onUse: () => setShape("rect") },
              { key: "2", name: "Circle shape", onUse: () => setShape("circle") },
              { key: "3", name: "Triangle shape", onUse: () => setShape("triangle") },
              { key: "4", name: "Arrow shape", onUse: () => setShape("arrow") },
              {
                key: "l",
                name: "Toggle silk layer",
                onUse: () =>
                  setSilkLayer((prev) => (prev === "top" ? "bottom" : "top")),
              },
              {
                key: "n",
                name: "Next net (pour)",
                onUse: () =>
                  setNetIndex((prev) =>
                    sourceNetIds.length === 0 ? 0 : (prev + 1) % sourceNetIds.length,
                  ),
              },
              {
                key: "t",
                name: "Prepare silk text",
                onUse: () => {
                  setSilkDraft(silkText)
                  setSilkDraftLayer(silkLayer)
                },
              },
            ]}
          />
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.8)",
              fontFamily: "monospace",
              margin: "0 10px 8px 10px",
              textAlign: "right",
            }}
          >
            mode={mode} shape={shape} net={currentSourceNetId} silk={silkLayer}
          </div>
        </div>
      )}
    </div>
  )
}
