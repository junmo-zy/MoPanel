import { useEffect, useState } from "react";
import { buildMihomoSocketUrl } from "../api/streams";

export interface LogEntry {
  id: string;
  time: string;
  type: string;
  payload: string;
}

const demoLogs: LogEntry[] = [
  { id: "demo-log-1", time: "12:42:18", type: "info", payload: "[TCP] 192.168.1.20:52344 → github.com:443 match DomainSuffix using 自动选择[香港 01]" },
  { id: "demo-log-2", time: "12:42:16", type: "info", payload: "[UDP] 192.168.1.20:5353 → 8.8.8.8:53 match GeoIP(CN) using DIRECT" },
  { id: "demo-log-3", time: "12:42:11", type: "warning", payload: "自动选择 health check completed, fastest node 香港 01 (42 ms)" },
];

export function useMihomoLogs(enabled: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>(demoLogs);

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(buildMihomoSocketUrl(window.location.protocol, window.location.host, "/logs?level=info"));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; payload?: string };
          const now = new Date();
          const entry: LogEntry = {
            id: `${now.getTime()}-${Math.random()}`,
            time: now.toLocaleTimeString("zh-CN", { hour12: false }),
            type: message.type || "info",
            payload: message.payload || String(event.data),
          };
          setLogs((current) => [entry, ...current].slice(0, 300));
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
    return () => socket?.close();
  }, [enabled]);

  return { logs, clear: () => setLogs([]) };
}
