import { useEffect, useState } from "react";
import { buildMihomoSocketUrl } from "../api/streams";

export interface TrafficPoint {
  up: number;
  down: number;
}

const initialPoints: TrafficPoint[] = [
  { down: 12.8, up: 2.2 }, { down: 13.7, up: 2.7 }, { down: 13.2, up: 2.3 },
  { down: 14.9, up: 3.0 }, { down: 13.8, up: 2.6 }, { down: 15.6, up: 3.4 },
  { down: 14.1, up: 2.5 }, { down: 13.7, up: 2.8 }, { down: 17.2, up: 3.7 },
  { down: 14.4, up: 2.4 }, { down: 18.6, up: 3.2 },
];

export function bytesPerSecondToMbps(value: number) {
  return Number(((value * 8) / 1_000_000).toFixed(1));
}

export function appendTrafficPoint(points: TrafficPoint[], point: TrafficPoint, limit = 20) {
  return [...points, point].slice(-limit);
}

export function useTrafficStream(live: boolean) {
  const [points, setPoints] = useState<TrafficPoint[]>(initialPoints);

  useEffect(() => {
    if (!live || typeof WebSocket === "undefined") {
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

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(buildMihomoSocketUrl(window.location.protocol, window.location.host, "/traffic"));
      socket.onmessage = (event) => {
        try {
          const value = JSON.parse(String(event.data)) as { up?: number; down?: number };
          setPoints((current) => appendTrafficPoint(current, {
            up: bytesPerSecondToMbps(value.up || 0),
            down: bytesPerSecondToMbps(value.down || 0),
          }));
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
    return () => socket?.close();
  }, [live]);

  return {
    points,
    current: points.at(-1) || { up: 0, down: 0 },
  };
}
