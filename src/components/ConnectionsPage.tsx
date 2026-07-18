import { MagnifyingGlass, Trash, XCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { ConnectionSnapshot, MihomoClient } from "../api/types";
import { PageHeader } from "./PageHeader";

interface ConnectionsPageProps {
  client: MihomoClient;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ConnectionsPage({ client }: ConnectionsPageProps) {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({ downloadTotal: 0, uploadTotal: 0, connections: [] });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      client.getConnections()
        .then((data) => {
          if (active) setSnapshot(data);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [client]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return snapshot.connections;
    return snapshot.connections.filter((item) => [item.host, item.process, item.chain, item.rule].some((value) => value.toLowerCase().includes(term)));
  }, [query, snapshot.connections]);

  async function closeOne(id: string) {
    await client.closeConnection(id);
    setSnapshot((current) => ({ ...current, connections: current.connections.filter((item) => item.id !== id) }));
  }

  async function closeAll() {
    await client.closeAllConnections();
    setSnapshot((current) => ({ ...current, connections: [] }));
  }

  return (
    <section className="page connections-page">
      <PageHeader
        title="活动连接"
        description={`${snapshot.connections.length} 个连接 · 下载 ${formatBytes(snapshot.downloadTotal)} · 上传 ${formatBytes(snapshot.uploadTotal)}`}
        action={<button type="button" className="button button-secondary" onClick={closeAll} disabled={!snapshot.connections.length}><Trash size={18} />全部关闭</button>}
      />
      <label className="search-field page-search">
        <MagnifyingGlass size={19} aria-hidden="true" /><span className="sr-only">搜索连接</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索域名、进程、规则或链路" />
      </label>
      <div className="simple-table connections-table">
        <div className="table-head connection-grid"><span>目标</span><span>进程</span><span>链路 / 规则</span><span>流量</span><span /></div>
        {filtered.map((item) => (
          <div className="table-row connection-grid" key={item.id}>
            <div><strong>{item.host}</strong><small>{item.network} · {item.destination}</small></div>
            <span>{item.process}</span>
            <div><span>{item.chain}</span><small>{item.rule}</small></div>
            <span>{formatBytes(item.download)} ↓<br />{formatBytes(item.upload)} ↑</span>
            <button type="button" className="icon-button" aria-label={`关闭 ${item.host}`} onClick={() => closeOne(item.id)}><XCircle size={20} /></button>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty-state">当前没有匹配的活动连接</p>}
      </div>
    </section>
  );
}
