import { useEffect } from "react"
import { useGlobalStore } from "../global-store"
import {
  isPcbDrawingTool,
  pcbToolModeToEditMode,
  type PcbToolMode,
} from "../lib/pcb-tool-mode"

interface Props {
  toolMode?: PcbToolMode
  allowCanvasPan?: boolean
}

/**
 * Syncs the external `toolMode` prop into the viewer zustand store.
 * Host apps drive tools through PCBViewer.toolMode instead of the built-in overlay.
 */
export const PcbToolModeController = ({
  toolMode = "select",
  allowCanvasPan = true,
}: Props) => {
  const setEditMode = useGlobalStore((s) => s.setEditMode)

  useEffect(() => {
    setEditMode(pcbToolModeToEditMode(toolMode))
  }, [toolMode, setEditMode])

  useEffect(() => {
    if (!allowCanvasPan && isPcbDrawingTool(toolMode)) {
      // Reserved for future pan-policy wiring (same pattern as schematic-viewer).
    }
  }, [allowCanvasPan, toolMode])

  return null
}
