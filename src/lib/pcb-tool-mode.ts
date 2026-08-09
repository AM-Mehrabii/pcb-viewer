/** External tool modes controlled by host apps (mirrors schematic-viewer `toolMode`). */
export type PcbToolMode =
  | "select"
  | "marquee"
  | "move_footprint"
  | "move_track"
  | "draw_trace"
  | "draw_via"
  | "draw_copper_pour"
  | "draw_keepout_region"
  | "draw_cutout"
  | "draw_silkscreen_text"

export type PcbInternalEditMode =
  | "off"
  | "marquee"
  | "move_footprint"
  | "move_track"
  | "draw_trace"
  | "draw_via"
  | "draw_copper_pour"
  | "draw_keepout_region"
  | "draw_cutout"
  | "draw_silkscreen_text"

export interface PcbToolDefinition {
  id: PcbToolMode
  enabled: boolean
  shortcut?: string
  disabledReason?: string
}

/** Tools not yet wired in the viewer store map to `off` until implemented. */
export const PCB_TOOLS: Record<PcbToolMode, PcbToolDefinition> = {
  select: { id: "select", enabled: true, shortcut: "Shift+S" },
  marquee: { id: "marquee", enabled: true, shortcut: "Shift+M" },
  move_footprint: { id: "move_footprint", enabled: true, shortcut: "Shift+G" },
  move_track: { id: "move_track", enabled: true, shortcut: "Shift+R" },
  draw_trace: { id: "draw_trace", enabled: true, shortcut: "Shift+T" },
  draw_via: { id: "draw_via", enabled: true, shortcut: "Shift+V" },
  draw_copper_pour: { id: "draw_copper_pour", enabled: true, shortcut: "Shift+P" },
  draw_keepout_region: { id: "draw_keepout_region", enabled: true, shortcut: "Shift+K" },
  draw_cutout: { id: "draw_cutout", enabled: true, shortcut: "Shift+C" },
  draw_silkscreen_text: { id: "draw_silkscreen_text", enabled: true, shortcut: "Shift+L" },
}

export function pcbToolModeToEditMode(
  toolMode: PcbToolMode,
): PcbInternalEditMode {
  switch (toolMode) {
    case "marquee":
      return "marquee"
    case "move_footprint":
      return "move_footprint"
    case "move_track":
      return "move_track"
    case "draw_trace":
      return "draw_trace"
    case "draw_via":
      return "draw_via"
    case "draw_copper_pour":
      return "draw_copper_pour"
    case "draw_keepout_region":
      return "draw_keepout_region"
    case "draw_cutout":
      return "draw_cutout"
    case "draw_silkscreen_text":
      return "draw_silkscreen_text"
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
