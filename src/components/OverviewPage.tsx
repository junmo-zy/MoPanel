import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  Crosshair,
  Gauge,
  GlobeHemisphereWest,
  User,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { OverviewData, ProxyMode } from "../api/types";
import { useTrafficStream } from "../hooks/useTrafficStream";
import { resolveCurrentProxy } from "../proxy-context";
import { TrafficSparkline } from "./TrafficSparkline";

interface OverviewPageProps {
  data: OverviewData;
  loadState: "loading" | "live" | "demo";
  notice: string | null;
  onModeChange: (mode: ProxyMode) => void;
  onOpenGroup: (name: string) => void;
  onTestGroup: (name: string) => Promise<void>;
}

const groupIcons = [Crosshair, GlobeHemisphereWest, User];

export function OverviewPage({ data, loadState, notice, onModeChange, onOpenGroup, onTestGroup }: OverviewPageProps) {
  const currentProxy = resolveCurrentProxy(data);
  const activeSelector = currentProxy.selectorName
    ? data.groups.find((group) => group.name === currentProxy.selectorName)
    : undefined;
  const primaryGroup = currentProxy.groupName
    ? data.groups.find((group) => group.name === currentProxy.groupName)
    : undefined;
  const chooserGroup = activeSelector;
  const summaryGroups = activeSelector
    ? [
      activeSelector,
      ...(primaryGroup && primaryGroup.name !== activeSelector.name ? [primaryGroup] : []),
      ...data.groups.filter((group) => group.name !== activeSelector.name && group.name !== primaryGroup?.name),
    ].slice(0, 3)
    : data.groups.slice(0, 3);
  const traffic = useTrafficStream(loadState === "live");
  const [testing, setTesting] = useState(false);

  async function testPrimaryGroup() {
    if (!primaryGroup) return;
    setTesting(true);
    try {
      await onTestGroup(primaryGroup.name);
    } catch {
      // The shared notice and node dialog surface the failure message.
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="overview-page">
      <header className="status-heading">
        <span className="status-dot" aria-hidden="true" />
        <h1>{data.connected ? "代理服务运行正常" : "代理服务未连接"}</h1>
        {loadState === "demo" && <span className="demo-badge">演示数据</span>}
      </header>

      <section className="primary-controls" aria-label="代理控制">
        <div>
          <span className="eyebrow">代理模式</span>
          <div className="segmented-control">
            {[
              ["rule", "规则"],
              ["global", "全局"],
              ["direct", "直连"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === data.mode}
                onClick={() => onModeChange(value as ProxyMode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="current-proxy">
          <span className="eyebrow">当前代理</span>
          {currentProxy.canChange ? (
            <>
              <strong>{currentProxy.groupName} <span aria-hidden="true">·</span> {currentProxy.nodeName}</strong>
              <span className="healthy-text">{primaryGroup?.delay ? `${primaryGroup.delay} ms` : "—"}</span>
            </>
          ) : (
            <>
              <strong>当前为直连，代理未生效</strong>
              <span className="muted-text">切换到规则或全局模式后可使用代理</span>
            </>
          )}
        </div>

        <div className="primary-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => chooserGroup && onOpenGroup(chooserGroup.name)}
            disabled={!currentProxy.canChange || !chooserGroup}
            title={currentProxy.canChange ? undefined : "切换到规则或全局模式后可更换代理"}
          >{currentProxy.canChange ? "更换代理" : "直连模式下代理未生效"}</button>
          <button type="button" className="button button-secondary" onClick={testPrimaryGroup} disabled={!primaryGroup || testing}>
            <Gauge size={21} aria-hidden="true" />{testing ? "测速中…" : "测速"}
          </button>
        </div>
      </section>

      <section className="traffic-panel" aria-label="实时流量">
        <div className="metric">
          <span><ArrowDown size={22} aria-hidden="true" />下载</span>
          <strong>{traffic.current.down.toFixed(1)} <small>Mbps</small></strong>
          <TrafficSparkline points={traffic.points} dataKey="down" color="#0a84ff" label="实时下载速度曲线" />
        </div>
        <div className="metric">
          <span><ArrowUp size={22} aria-hidden="true" />上传</span>
          <strong>{traffic.current.up.toFixed(1)} <small>Mbps</small></strong>
          <TrafficSparkline points={traffic.points} dataKey="up" color="#30d158" label="实时上传速度曲线" />
        </div>
        <div className="metric connections-metric">
          <span>活动连接</span>
          <strong>{data.connectionCount} <small>个</small></strong>
          <span>TCP {data.tcpCount} · UDP {data.udpCount}</span>
        </div>
      </section>

      <section className="groups-panel" aria-labelledby="groups-title">
        <div className="group-header">
          <span id="groups-title">代理组</span>
          <span>当前节点</span>
          <span>延迟</span>
          <span aria-hidden="true" />
        </div>
        {summaryGroups.map((group, index) => {
          const Icon = groupIcons[index] || Crosshair;
          return (
          <button type="button" className="group-row" key={group.name} onClick={() => onOpenGroup(group.name)}>
            <span className="group-name"><span className="group-icon"><Icon size={25} aria-hidden="true" /></span>{group.name}</span>
            <span>{group.current} <span className="mini-status" aria-label="可用" /></span>
            <span className="healthy-text">{group.delay ? `${group.delay} ms` : "—"}</span>
            <CaretRight size={20} aria-hidden="true" />
          </button>
          );
        })}
      </section>

      <footer className="profile-footer">
        <span>{data.providers[0]?.name || "本地配置"}</span><span aria-hidden="true">·</span><span>{data.providers[0]?.updatedAt ? "最近已更新" : "等待更新"}</span>
      </footer>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
