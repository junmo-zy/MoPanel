import { useEffect, useState } from "react";
import { buildMihomoSocketUrl } from "../api/streams";

export interface TrafficPoint {
  sequence?: number;
  // Mbps, for the charts.
  up: number;
  down: number;
  // Raw bytes per second, for adaptive B/s, KB/s, MB/s labels.
  upBytes?: number;
  downBytes?: number;
}

export interface TrafficState {
  points: TrafficPoint[];
  current: TrafficPoint;
  currentBytes: { up: number; down: number };
}

export type TrafficSource = "live" | "demo" | "off";

const POINT_LIMIT = 20;
const RECONNECT_DELAY_MS = 3_000;

const demoPoints: TrafficPoint[] = [
  { down: 12.8, up: 2.2 }, { down: 13.7, up: 2.7 }, { down: 13.2, up: 2.3 },
  { down: 14.9, up: 3.0 }, { down: 13.8, up: 2.6 }, { down: 15.6, up: 3.4 },
  { down: 14.1, up: 2.5 }, { down: 13.7, up: 2.8 }, { down: 17.2, up: 3.7 },
  { down: 14.4, up: 2.4 }, { down: 18.6, up: 3.2 },
].map((point, sequence) => ({ ...point, sequence }));

const idlePoints: TrafficPoint[] = Array.from({ length: POINT_LIMIT }, (_, sequence) => ({ up: 0, down: 0, sequence }));

export function bytesPerSecondToMbps(value: number) {
  return Number(((value * 8) / 1_000_000).toFixed(1));
}

export function appendTrafficPoint(points: TrafficPoint[], point: TrafficPoint, limit = POINT_LIMIT) {
  // Stable identities let the charts slide samples left instead of morphing neighboring peaks.
  const sequence = (points.at(-1)?.sequence ?? -1) + 1;
  return [...points, { ...point, sequence }].slice(-limit);
}

// Accepts the legacy boolean form: true = live, false = demo animation.
export function useTrafficStream(source: TrafficSource | boolean): TrafficState {
  const mode: TrafficSource = source === true ? "live" : source === false ? "demo" : source;
  const [points, setPoints] = useState<TrafficPoint[]>(mode === "demo" ? demoPoints : idlePoints);
  const [pointsMode, setPointsMode] = useState(mode);
  if (pointsMode !== mode) {
    // Reset during render when the source changes; never mix demo and real samples.
    setPointsMode(mode);
    setPoints(mode === "demo" ? demoPoints : idlePoints);
  }

  useEffect(() => {
    if (mode === "demo") {
      let tick = 0;
      const timer = window.setInterval(() => {
        tick += 1;
        setPoints((current) => appendTrafficPoint(current, {
          down: Number((15.1 + Math.sin(tick / 2) * 3.5).toFixed(1)),
          up: Number((2.8 + Math.cos(tick / 2) * 0.7).toFixed(1)),
        }));
      }, 1800);
      return () => window.clearInterval(timer);
    }

    // Real controller: never show invented numbers, start from zero.
    if (mode === "off" || typeof WebSocket === "undefined") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      try {
        socket = new WebSocket(buildMihomoSocketUrl(window.location.protocol, window.location.host, "/traffic"));
      } catch {
        return;
      }
      socket.onmessage = (event) => {
        try {
          const value = JSON.parse(String(event.data)) as { up?: number; down?: number };
          setPoints((current) => appendTrafficPoint(current, {
            up: bytesPerSecondToMbps(value.up || 0),
            down: bytesPerSecondToMbps(value.down || 0),
            upBytes: value.up || 0,
            downBytes: value.down || 0,
          }));
        } catch {
          return;
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [mode]);

  const current = points.at(-1) || { up: 0, down: 0 };
  return {
    points,
    current,
    currentBytes: {
      up: current.upBytes ?? current.up * 125_000,
      down: current.downBytes ?? current.down * 125_000,
    },
  };
}

const DEMO_MEMORY_BYTES = 48 * 1024 * 1024;

// Mihomo's /memory stream reports the core's in-use memory once per second.
export function useMemoryStream(source: TrafficSource): number | null {
  const [memory, setMemory] = useState<number | null>(source === "demo" ? DEMO_MEMORY_BYTES : null);
  const [memorySource, setMemorySource] = useState(source);
  if (memorySource !== source) {
    setMemorySource(source);
    setMemory(source === "demo" ? DEMO_MEMORY_BYTES : null);
  }

  useEffect(() => {
    if (source !== "live" || typeof WebSocket === "undefined") return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    const connect = () => {
      try {
        socket = new WebSocket(buildMihomoSocketUrl(window.location.protocol, window.location.host, "/memory"));
      } catch {
        return;
      }
      socket.onmessage = (event) => {
        try {
          const value = JSON.parse(String(event.data)) as { inuse?: number };
          // The first sample is always 0 before Mihomo has measured anything.
          if (typeof value.inuse === "number" && value.inuse > 0) setMemory(value.inuse);
        } catch {
          return;
        }
      };
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
  }, [source]);

  return memory;
}
