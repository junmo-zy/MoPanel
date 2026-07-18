import { Broom, FunnelSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useMihomoLogs } from "../hooks/useMihomoLogs";
import { PageHeader } from "./PageHeader";

interface LogsPageProps {
  live: boolean;
}

export function LogsPage({ live }: LogsPageProps) {
  const { logs, clear } = useMihomoLogs(live);
  const [level, setLevel] = useState("all");
  const visibleLogs = useMemo(() => level === "all" ? logs : logs.filter((log) => log.type === level), [level, logs]);

  return (
    <section className="page logs-page">
      <PageHeader
        title="实时日志"
        description={live ? "已连接 Mihomo 日志流。" : "未连接控制器，当前显示示例日志。"}
        action={<button type="button" className="button button-secondary" onClick={clear}><Broom size={18} />清空</button>}
      />
      <label className="log-filter"><FunnelSimple size={18} /><span>级别</span>
        <select value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="all">全部</option><option value="info">信息</option><option value="warning">警告</option><option value="error">错误</option>
        </select>
      </label>
      <div className="log-stream" role="log" aria-live="polite">
        {visibleLogs.map((log) => (
          <div className="log-row" key={log.id}><time>{log.time}</time><span className={`log-level log-${log.type}`}>{log.type}</span><code>{log.payload}</code></div>
        ))}
        {visibleLogs.length === 0 && <p className="empty-state">暂无日志</p>}
      </div>
    </section>
  );
}
