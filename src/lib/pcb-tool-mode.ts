/** External tool modes controlled by host apps (mirrors schematic-viewer `toolMode`). */
export type PcbToolMode =
  | "select"
  | "marquee"
  | "move_footprint"
  | "draw_trace"
  | "draw_via"
  | "draw_copper_pour"
  | "draw_keepout_region"
  | "draw_cutout"
  | "draw_silkscreen_text"

export type PcbInternalEditMode =
  | "off"
  | "move_footprint"
  | "draw_trace"
  | "draw_via"

export interface PcbToolDefinition {
  id: PcbToolMode
  enabled: boolean
  shortcut?: string
}

/** Tools not yet wired in the viewer store map to `off` until implemented. */
export const PCB_TOOLS: Record<PcbToolMode, PcbToolDefinition> = {
  select: { id: "select", enabled: true, shortcut: "S" },
  marquee: { id: "marquee", enabled: true, shortcut: "Shift+J" },
  move_footprint: { id: "move_footprint", enabled: true, shortcut: "M" },
  draw_trace: { id: "draw_trace", enabled: true, shortcut: "T" },
  draw_via: { id: "draw_via", enabled: true, shortcut: "V" },
  draw_copper_pour: { id: "draw_copper_pour", enabled: false },
  draw_keepout_region: { id: "draw_keepout_region", enabled: false },
  draw_cutout: { id: "draw_cutout", enabled: false },
  draw_silkscreen_text: { id: "draw_silkscreen_text", enabled: false },
}

export function pcbToolModeToEditMode(
  toolMode: PcbToolMode,
): PcbInternalEditMode {
  switch (toolMode) {
    case "move_footprint":
      return "move_footprint"
    case "draw_trace":
      return "draw_trace"
    case "draw_via":
      return "draw_via"
    default:
      return "off"
  }
}

export function isPcbDrawingTool(toolMode: PcbToolMode): boolean {
  return (
    toolMode === "draw_trace" ||
    toolMode === "draw_via" ||
    toolMode === "draw_copper_pour" ||
    toolMode === "draw_keepout_region" ||
    toolMode === "draw_cutout" ||
    toolMode === "draw_silkscreen_text"
  )
}
