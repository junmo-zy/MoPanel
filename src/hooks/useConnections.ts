import { useEffect, useRef, useState } from "react";
import { mapConnectionSnapshot, type RawConnectionSnapshot } from "../api/mihomo";
import { buildMihomoSocketUrl } from "../api/streams";
import type { ConnectionItem, ConnectionSnapshot, MihomoClient } from "../api/types";

export interface LiveConnection extends ConnectionItem {
  // Bytes per second since the previous snapshot.
  downloadSpeed: number;
  uploadSpeed: number;
  closedAt?: string;
}

export interface ConnectionsState {
  active: LiveConnection[];
  closed: LiveConnection[];
  downloadTotal: number;
  uploadTotal: number;
  clearClosed: () => void;
}

const CLOSED_LIMIT = 500;
const POLL_INTERVAL_MS = 2_000;
const RECONNECT_DELAY_MS = 3_000;

// Mihomo pushes a full snapshot every second on /connections; per-connection
// speeds are the byte difference between two snapshots, and connections that
// disappear are kept as "closed" history like Clash Verge does.
export function useConnections(client: MihomoClient, live: boolean): ConnectionsState {
  const [state, setState] = useState<Omit<ConnectionsState, "clearClosed">>({ active: [], closed: [], downloadTotal: 0, uploadTotal: 0 });
  const previous = useRef<{ at: number; byId: Map<string, LiveConnection> }>({ at: 0, byId: new Map() });

  useEffect(() => {
    let disposed = false;

    function apply(snapshot: ConnectionSnapshot) {
      if (disposed) return;
      const now = Date.now();
      const seconds = previous.current.at ? Math.max((now - previous.current.at) / 1000, 0.25) : 1;
      const byId = new Map<string, LiveConnection>();
      const active = snapshot.connections.map((connection) => {
        const before = previous.current.byId.get(connection.id);
        const item: LiveConnection = {
          ...connection,
          downloadSpeed: before ? Math.max(0, (connection.download - before.download) / seconds) : 0,
          uploadSpeed: before ? Math.max(0, (connection.upload - before.upload) / seconds) : 0,
        };
        byId.set(item.id, item);
        return item;
      });
      const closedNow = [...previous.current.byId.values()]
        .filter((item) => !byId.has(item.id))
        .map((item) => ({ ...item, downloadSpeed: 0, uploadSpeed: 0, closedAt: new Date(now).toISOString() }));
      previous.current = { at: now, byId };
      setState((current) => ({
        active,
        closed: closedNow.length ? [...closedNow, ...current.closed].slice(0, CLOSED_LIMIT) : current.closed,
        downloadTotal: snapshot.downloadTotal,
        uploadTotal: snapshot.uploadTotal,
      }));
    }

    if (!live || typeof WebSocket === "undefined") {
      const poll = () => { client.getConnections().then(apply).catch(() => undefined); };
      poll();
      const timer = window.setInterval(poll, POLL_INTERVAL_MS);
      return () => {
        disposed = true;
        window.clearInterval(timer);
      };
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    const connect = () => {
      try {
        socket = new WebSocket(buildMihomoSocketUrl(window.location.protocol, window.location.host, "/connections?interval=1000"));
      } catch {
        return;
      }
      socket.onmessage = (event) => {
        try {
          apply(mapConnectionSnapshot(JSON.parse(String(event.data)) as RawConnectionSnapshot));
        } catch {
          // Ignore a malformed frame; the next one replaces it.
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
  }, [client, live]);

  return { ...state, clearClosed: () => setState((current) => ({ ...current, closed: [] })) };
}
