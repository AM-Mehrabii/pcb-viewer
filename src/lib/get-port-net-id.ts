import type { AnyCircuitElement } from "circuit-json"
import { su } from "@tscircuit/core"

export function getPortNetId(
  soup: AnyCircuitElement[],
  pcbPortId: string,
): string | null {
  const port = su(soup).pcb_port.get(pcbPortId)
  if (!port) return null

  const fromPort = (port as { connected_source_net_ids?: string[] })
    .connected_source_net_ids?.[0]
  if (fromPort) return fromPort

  const sourcePortId = (port as { source_port_id?: string }).source_port_id
  if (!sourcePortId) return null

  const sourcePort = soup.find(
    (el) =>
      el.type === "source_port" &&
      (el as { source_port_id?: string }).source_port_id === sourcePortId,
  ) as { source_net_id?: string } | undefined

  return sourcePort?.source_net_id ?? null
}

export function portsShareNet(
  soup: AnyCircuitElement[],
  a: string,
  b: string,
): boolean {
  const netA = getPortNetId(soup, a)
  const netB = getPortNetId(soup, b)
  if (!netA || !netB) return false
  return netA === netB
}