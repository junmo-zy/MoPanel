import { useEffect, useRef, useState } from "react";
import { buildMihomoSocketUrl } from "../api/streams";

export interface LogEntry {
  id: string;
  time: string;
  type: string;
  payload: string;
}

export type LogLevel = "debug" | "info" | "warning" | "error";

export interface LogsState {
  logs: LogEntry[];
  clear: () => void;
  // Lowest level Mihomo streams; "debug" includes everything.
  streamLevel: LogLevel;
  setStreamLevel: (level: LogLevel) => void;
  paused: boolean;
  setPaused: (paused: boolean) => void;
}

const demoLogs: LogEntry[] = [
  { id: "demo-log-1", time: "12:42:18", type: "info", payload: "[TCP] 192.168.1.20:52344 --> github.com:443 match DomainSuffix(github.com) using 自动选择[香港 01]" },
  { id: "demo-log-2", time: "12:42:16", type: "info", payload: "[UDP] 192.168.1.20:5353 --> 8.8.8.8:53 match GeoIP(CN) using DIRECT" },
  { id: "demo-log-3", time: "12:42:11", type: "warning", payload: "[Provider] 机场订阅 pull error: context deadline exceeded" },
  { id: "demo-log-4", time: "12:42:02", type: "error", payload: "dial tcp 203.0.113.10:443: i/o timeout" },
];

const LOG_LIMIT = 1000;
const RECONNECT_DELAY_MS = 3_000;
let sequence = 0;

export function useMihomoLogs(enabled: boolean, demo = !enabled): LogsState {
  const [logs, setLogs] = useState<LogEntry[]>(!enabled && demo ? demoLogs : []);
  const [logsEnabled, setLogsEnabled] = useState(enabled);
  const [streamLevel, setStreamLevel] = useState<LogLevel>("info");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  if (logsEnabled !== enabled) {
    setLogsEnabled(enabled);
    setLogs((current) => (enabled ? current.filter((entry) => !entry.id.startsWith("demo-log-")) : current));
  }

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      try {
        socket = new WebSocket(buildMihomoSocketUrl(window.location.protocol, window.location.host, `/logs?level=${streamLevel}`));
      } catch {
        return;
      }
      socket.onmessage = (event) => {
        if (pausedRef.current) return;
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; payload?: string };
          const now = new Date();
          sequence += 1;
          const entry: LogEntry = {
            id: `${now.getTime()}-${sequence}`,
            time: now.toLocaleTimeString("zh-CN", { hour12: false }),
            type: message.type || "info",
            payload: message.payload || String(event.data),
          };
          setLogs((current) => [entry, ...current].slice(0, LOG_LIMIT));
        } catch {
          return;
        }
      };
      // Mihomo restarts (or a config reload) close the stream; keep listening.
      socket.onclose = () => {
        if (!disposed) reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled, streamLevel]);

  return { logs, clear: () => setLogs([]), streamLevel, setStreamLevel, paused, setPaused };
}
