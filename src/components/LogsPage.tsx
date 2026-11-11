import { Broom, MagnifyingGlass, Pause, Play } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import type { LogLevel, LogsState } from "../hooks/useMihomoLogs";
import { PageHeader } from "./PageHeader";

interface LogsPageProps {
  state: LogsState;
  live: boolean;
  demo?: boolean;
}

type Filter = "all" | LogLevel;

const FILTERS: Array<[Filter, string]> = [["all", "全部"], ["debug", "调试"], ["info", "信息"], ["warning", "警告"], ["error", "错误"]];
const LEVEL_LABEL: Record<string, string> = { debug: "DEBUG", info: "INFO", warning: "WARN", error: "ERROR", silent: "SILENT" };

function highlight(text: string, term: string): ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let index = 0;
  let found = lower.indexOf(term);
  while (found >= 0) {
    if (found > index) parts.push(text.slice(index, found));
    parts.push(<mark key={found}>{text.slice(found, found + term.length)}</mark>);
    index = found + term.length;
    found = lower.indexOf(term, index);
  }
  parts.push(text.slice(index));
  return parts;
}

export function LogsPage({ state, live, demo = !live }: LogsPageProps) {
  const [filter, setFilter] = useState<Filter>(state.streamLevel === "debug" ? "debug" : "all");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const log of state.logs) result[log.type] = (result[log.type] || 0) + 1;
    return result;
  }, [state.logs]);
  const visible = useMemo(() => state.logs.filter((log) => (
    (filter === "all" || log.type === filter)
    && (!term || log.payload.toLowerCase().includes(term))
  )), [filter, state.logs, term]);

  function chooseFilter(next: Filter) {
    setFilter(next);
    // Debug lines only arrive when the stream itself is at debug level.
    state.setStreamLevel(next === "debug" ? "debug" : "info");
  }

  const description = live
    ? state.paused ? "已暂停接收，新日志不会显示。" : `正在接收 Mihomo 日志（${state.streamLevel === "debug" ? "含调试" : "信息及以上"}），最多保留 1000 条。`
    : demo ? "未连接控制器，当前显示示例日志。" : "未连接代理服务，恢复连接后自动接收日志。";

  return (
    <section className="page logs-page">
      <PageHeader
        title="日志"
        description={description}
        action={(
          <div className="logs-actions">
            <button type="button" className="button button-secondary" onClick={() => state.setPaused(!state.paused)} disabled={!live} aria-pressed={state.paused}>
              {state.paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{state.paused ? "继续" : "暂停"}
            </button>
            <button type="button" className="button button-secondary" onClick={state.clear} disabled={state.logs.length === 0}>
              <Broom size={17} aria-hidden="true" />清空
            </button>
          </div>
        )}
      />
      <div className="logs-toolbar">
        <label className="search-field logs-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <span className="sr-only">搜索日志</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索日志内容" />
        </label>
        <div className="segmented-control logs-filter" role="group" aria-label="日志级别">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => chooseFilter(value)}>
              {label}{value !== "all" && counts[value] ? <small>{counts[value]}</small> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="log-stream" role="log" aria-live="off">
        {visible.map((log) => (
          <div className="log-row" key={log.id} data-level={log.type}>
            <div className="log-row-head">
              <time>{log.time}</time>
              <span className={`log-level log-${log.type}`}>{LEVEL_LABEL[log.type] || log.type.toUpperCase()}</span>
            </div>
            <code>{highlight(log.payload, term)}</code>
          </div>
        ))}
        {visible.length === 0 && <p className="empty-state">{term || filter !== "all" ? "没有匹配的日志" : "暂无日志"}</p>}
      </div>
    </section>
  );
}
