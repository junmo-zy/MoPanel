import { ArrowDown, ArrowUp, MagnifyingGlass, Rows, Table, Trash, X, XCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { MihomoClient } from "../api/types";
import { formatTraffic, speedParts } from "../format";
import { useConnections, type LiveConnection } from "../hooks/useConnections";
import { PageHeader } from "./PageHeader";

interface ConnectionsPageProps {
  client: MihomoClient;
  live?: boolean;
}

type Tab = "active" | "closed";
type View = "list" | "table";
type Sort = "time" | "downloadSpeed" | "uploadSpeed" | "download" | "upload";

const SORT_LABELS: Record<Sort, string> = {
  time: "最新连接",
  downloadSpeed: "下载速度",
  uploadSpeed: "上传速度",
  download: "下载量",
  upload: "上传量",
};
const VIEW_KEY = "mopanel:connections-view";
const SORT_KEY = "mopanel:connections-sort";
const RENDER_LIMIT = 300;

function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Still applies for this visit.
  }
}

function speed(value: number) {
  const [number, unit] = speedParts(value);
  return `${number} ${unit}`;
}

const relative = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

function timeAgo(value?: string, now = Date.now()) {
  if (!value) return "—";
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) return "—";
  if (Math.abs(seconds) < 60) return relative.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86400), "day");
}

function sortConnections(items: LiveConnection[], sort: Sort) {
  const sorted = [...items];
  if (sort === "time") sorted.sort((left, right) => (right.closedAt || right.start).localeCompare(left.closedAt || left.start));
  else sorted.sort((left, right) => right[sort] - left[sort]);
  return sorted;
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="connection-detail-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function ConnectionsPage({ client, live = true }: ConnectionsPageProps) {
  const connections = useConnections(client, live);
  const [tab, setTab] = useState<Tab>("active");
  const [view, setView] = useState<View>(() => readSetting(VIEW_KEY, ["list", "table"] as const, "list"));
  const [sort, setSort] = useState<Sort>(() => readSetting(SORT_KEY, ["time", "downloadSpeed", "uploadSpeed", "download", "upload"] as const, "time"));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [error, setError] = useState("");
  // Re-render "3 分钟前" labels as time passes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const source = tab === "active" ? connections.active : connections.closed;
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = term
      ? source.filter((item) => [item.host, item.destination, item.process, item.chain, item.rule, item.source || "", item.network, item.type || ""]
        .some((value) => value.toLowerCase().includes(term)))
      : source;
    return sortConnections(matched, sort);
  }, [query, source, sort]);
  const selected = selectedId
    ? connections.active.find((item) => item.id === selectedId) || connections.closed.find((item) => item.id === selectedId) || null
    : null;
  const totalDownSpeed = connections.active.reduce((sum, item) => sum + item.downloadSpeed, 0);
  const totalUpSpeed = connections.active.reduce((sum, item) => sum + item.uploadSpeed, 0);

  async function closeOne(id: string) {
    setError("");
    try {
      await client.closeConnection(id);
    } catch {
      setError("关闭连接失败，连接可能已经结束。");
    }
  }

  async function closeAll() {
    setConfirmingAll(false);
    setError("");
    try {
      await client.closeAllConnections();
    } catch {
      setError("关闭全部连接失败，请检查代理服务连接。");
    }
  }

  function chooseView(next: View) {
    setView(next);
    saveSetting(VIEW_KEY, next);
  }

  function chooseSort(next: Sort) {
    setSort(next);
    saveSetting(SORT_KEY, next);
  }

  const visible = filtered.slice(0, RENDER_LIMIT);

  return (
    <section className="page connections-page">
      <PageHeader
        title="连接"
        description={`下载 ${formatTraffic(connections.downloadTotal)} · 上传 ${formatTraffic(connections.uploadTotal)} · ↓ ${speed(totalDownSpeed)} ↑ ${speed(totalUpSpeed)}`}
        action={(
          <div className="connections-actions">
            <div className="segmented-control connections-tabs" role="tablist" aria-label="连接状态">
              <button type="button" role="tab" aria-selected={tab === "active"} aria-pressed={tab === "active"} onClick={() => setTab("active")}>活动 {connections.active.length}</button>
              <button type="button" role="tab" aria-selected={tab === "closed"} aria-pressed={tab === "closed"} onClick={() => setTab("closed")}>已关闭 {connections.closed.length}</button>
            </div>
            {tab === "active" ? (
              <button type="button" className="button button-secondary" onClick={() => setConfirmingAll(true)} disabled={connections.active.length === 0}>
                <Trash size={17} aria-hidden="true" />全部关闭
              </button>
            ) : (
              <button type="button" className="button button-secondary" onClick={connections.clearClosed} disabled={connections.closed.length === 0}>
                <Trash size={17} aria-hidden="true" />清空记录
              </button>
            )}
          </div>
        )}
      />

      <div className="connections-toolbar">
        <label className="search-field connections-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <span className="sr-only">搜索连接</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索域名、IP、进程、规则或链路" />
        </label>
        <label className="connections-sort">
          <span className="sr-only">排序方式</span>
          <select aria-label="排序方式" value={sort} onChange={(event) => chooseSort(event.target.value as Sort)}>
            {(Object.keys(SORT_LABELS) as Sort[]).map((value) => <option key={value} value={value}>{SORT_LABELS[value]}</option>)}
          </select>
        </label>
        <div className="connections-view" role="group" aria-label="显示方式">
          <button type="button" className="icon-button" aria-label="列表视图" data-tip="列表视图" aria-pressed={view === "list"} onClick={() => chooseView("list")}><Rows size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label="表格视图" data-tip="表格视图" aria-pressed={view === "table"} onClick={() => chooseView("table")}><Table size={18} aria-hidden="true" /></button>
        </div>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}

      {view === "list" ? (
        <div className="connection-list" role="list" aria-label={tab === "active" ? "活动连接" : "已关闭连接"}>
          {visible.map((item) => (
            <article className="connection-card" key={item.id} role="listitem" aria-label={item.host} data-closed={Boolean(item.closedAt)}>
              <button type="button" className="connection-card-main" onClick={() => setSelectedId(item.id)} aria-label={`查看 ${item.host} 详情`}>
                <strong>{item.host}{item.destination !== "—" && item.destination !== item.host && <small>{item.destination}</small>}</strong>
                <span className="connection-tags">
                  <span className="node-tag">{item.network}</span>
                  {item.type && <span className="node-tag">{item.type}</span>}
                  <span className="node-tag node-tag-accent connection-chain" data-tip={item.chain}>{item.chain}</span>
                  {item.rule !== "—" && <span className="connection-meta" data-tip={item.rule}>{item.rule}</span>}
                  {item.process !== "未知进程" && <span className="connection-meta">{item.process}</span>}
                </span>
              </button>
              <span className="connection-stats">
                {!item.closedAt && (
                  <span className="connection-speeds">
                    <span data-tone="down"><ArrowDown size={13} weight="bold" aria-hidden="true" />{speed(item.downloadSpeed)}</span>
                    <span data-tone="up"><ArrowUp size={13} weight="bold" aria-hidden="true" />{speed(item.uploadSpeed)}</span>
                  </span>
                )}
                <small>{formatTraffic(item.download)} ↓ · {formatTraffic(item.upload)} ↑ · {timeAgo(item.closedAt || item.start, now)}</small>
              </span>
              {!item.closedAt && (
                <button type="button" className="icon-button" aria-label={`关闭 ${item.host}`} data-tip="关闭连接" onClick={() => void closeOne(item.id)}>
                  <XCircle size={20} aria-hidden="true" />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="simple-table connection-table-wrap">
          <table className="connection-table">
            <thead>
              <tr><th>目标</th><th>下载速度</th><th>上传速度</th><th>下载量</th><th>上传量</th><th>链路</th><th>规则</th><th>进程</th><th>时间</th><th>来源</th><th>网络</th><th aria-label="操作" /></tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} onClick={() => setSelectedId(item.id)} data-closed={Boolean(item.closedAt)}>
                  <td data-tip={item.destination}>{item.host}</td>
                  <td>{item.closedAt ? "—" : speed(item.downloadSpeed)}</td>
                  <td>{item.closedAt ? "—" : speed(item.uploadSpeed)}</td>
                  <td>{formatTraffic(item.download)}</td>
                  <td>{formatTraffic(item.upload)}</td>
                  <td data-tip={item.chain}>{item.chain}</td>
                  <td data-tip={item.rule}>{item.rule}</td>
                  <td>{item.process}</td>
                  <td>{timeAgo(item.closedAt || item.start, now)}</td>
                  <td>{item.source || "—"}</td>
                  <td>{item.network}{item.type ? ` · ${item.type}` : ""}</td>
                  <td>
                    {!item.closedAt && (
                      <button type="button" className="icon-button" aria-label={`关闭 ${item.host}`} onClick={(event) => { event.stopPropagation(); void closeOne(item.id); }}>
                        <XCircle size={18} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > RENDER_LIMIT && <p className="empty-state">仅显示前 {RENDER_LIMIT} 条，可用搜索缩小范围（共 {filtered.length} 条）</p>}
      {filtered.length === 0 && (
        <p className="empty-state">{query ? "没有匹配的连接" : tab === "active" ? "当前没有活动连接" : "还没有已关闭的连接记录"}</p>
      )}

      {selected && (
        <dialog open className="provider-dialog" aria-labelledby="connection-detail-title">
          <div className="dialog-backdrop" aria-hidden="true" onClick={() => setSelectedId(null)} />
          <div className="confirm-modal connection-detail">
            <header>
              <h2 id="connection-detail-title">{selected.host}</h2>
              <button type="button" className="icon-button" aria-label="关闭详情" onClick={() => setSelectedId(null)}><X size={20} aria-hidden="true" /></button>
            </header>
            <dl>
              <DetailRow label="状态" value={selected.closedAt ? `已关闭（${timeAgo(selected.closedAt, now)}）` : "活动中"} />
              <DetailRow label="网络" value={`${selected.network}${selected.type ? ` · ${selected.type}` : ""}`} />
              <DetailRow label="目标地址" value={selected.destination} />
              <DetailRow label="远端地址" value={selected.remoteDestination} />
              <DetailRow label="嗅探域名" value={selected.sniffHost} />
              <DetailRow label="来源" value={selected.source} />
              <DetailRow label="入站" value={selected.inbound} />
              <DetailRow label="进程" value={selected.processPath || selected.process} />
              <DetailRow label="规则" value={selected.rule} />
              <DetailRow label="链路" value={selected.chain} />
              <DetailRow label="DNS 模式" value={selected.dnsMode} />
              <DetailRow label="下载" value={`${formatTraffic(selected.download)}${selected.closedAt ? "" : `（${speed(selected.downloadSpeed)}）`}`} />
              <DetailRow label="上传" value={`${formatTraffic(selected.upload)}${selected.closedAt ? "" : `（${speed(selected.uploadSpeed)}）`}`} />
              <DetailRow label="开始时间" value={selected.start ? new Date(selected.start).toLocaleString("zh-CN", { hour12: false }) : undefined} />
            </dl>
            {!selected.closedAt && (
              <div className="provider-modal-actions">
                <button type="button" className="button button-danger compact-button" onClick={() => { void closeOne(selected.id); setSelectedId(null); }}>关闭此连接</button>
              </div>
            )}
          </div>
        </dialog>
      )}

      {confirmingAll && (
        <dialog open className="provider-dialog" aria-labelledby="close-all-title">
          <div className="dialog-backdrop" aria-hidden="true" onClick={() => setConfirmingAll(false)} />
          <div className="confirm-modal">
            <h2 id="close-all-title">关闭全部连接</h2>
            <p>将断开当前 {connections.active.length} 个连接，正在进行的下载或通话会中断，客户端会自动重连。</p>
            <div className="provider-modal-actions">
              <button type="button" className="button button-secondary compact-button" onClick={() => setConfirmingAll(false)}>取消</button>
              <button type="button" className="button button-danger compact-button" onClick={() => void closeAll()}>全部关闭</button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
