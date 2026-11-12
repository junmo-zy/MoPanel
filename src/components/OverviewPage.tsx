import { ArrowDown, ArrowUp, ChartLine, Cpu, Gauge, Plugs } from "@phosphor-icons/react";
import { useState } from "react";
import type { ToolsClient } from "../api/tools";
import type { MihomoClient, OverviewData, ProxyMode } from "../api/types";
import { delayText, delayToneOf } from "../delay";
import { formatTraffic, speedParts } from "../format";
import { liveDelay, type DelayView } from "../hooks/useDelayTester";
import { useTrafficStream, type TrafficState } from "../hooks/useTrafficStream";
import { resolveCurrentProxy } from "../proxy-context";
import { CoreInfoCard, ExitIpCard, SubscriptionCard } from "./OverviewCards";
import { TrafficSparkline } from "./TrafficSparkline";

// Overview cards are optional so the page also renders on its own.
export interface OverviewExtras {
  client: MihomoClient;
  tools: ToolsClient;
  memory: number | null;
  onUpdateProvider: (name: string) => Promise<void>;
  onManageSubscriptions: () => void;
}

interface OverviewPageProps {
  data: OverviewData;
  loadState: "loading" | "live" | "demo" | "offline";
  activeProvider?: string | null;
  // Shared stream from the app shell; the page opens its own only when absent.
  traffic?: TrafficState;
  extras?: OverviewExtras;
  delays?: DelayView;
  onModeChange: (mode: ProxyMode) => void;
  onOpenGroup: (name: string) => void;
  onTestGroup: (name: string) => Promise<void>;
}

const MODES: Array<[ProxyMode, string, string]> = [
  ["rule", "规则", "按规则分流：命中规则的走代理，其余直连"],
  ["global", "全局", "所有流量都走当前代理"],
  ["direct", "直连", "所有流量都不走代理"],
];

function Stat({ icon, label, value, unit, tone, tip }: { icon: React.ReactNode; label: string; value: string; unit?: string; tone?: string; tip: string }) {
  return (
    <div className="traffic-stat" data-tone={tone} data-tip={tip}>
      <span className="traffic-stat-label">{icon}{label}</span>
      <strong>{value}{unit && <small>{unit}</small>}</strong>
    </div>
  );
}

export function OverviewPage({ data, loadState, activeProvider = null, traffic: sharedTraffic, extras, delays, onModeChange, onOpenGroup, onTestGroup }: OverviewPageProps) {
  const currentProxy = resolveCurrentProxy(data);
  const activeSelector = currentProxy.selectorName
    ? data.groups.find((group) => group.name === currentProxy.selectorName)
    : undefined;
  const primaryGroup = currentProxy.groupName
    ? data.groups.find((group) => group.name === currentProxy.groupName)
    : undefined;
  const ownTraffic = useTrafficStream(sharedTraffic ? "off" : loadState === "live" ? "live" : loadState === "demo" ? "demo" : "off");
  const traffic = sharedTraffic ?? ownTraffic;
  const subscription = activeProvider ? data.providers.find((provider) => provider.name === activeProvider) : data.providers[0];
  const [testing, setTesting] = useState(false);

  // The delay of the node that actually carries traffic, live while testing.
  const leafNode = primaryGroup?.nodes.find((node) => node.name === currentProxy.nodeName);
  const leafView = leafNode ? liveDelay(delays, leafNode) : null;
  const progress = primaryGroup ? delays?.progress.get(primaryGroup.name) : undefined;
  const leafTone = leafView?.testing ? "testing" : delayToneOf(leafView?.delay ?? primaryGroup?.delay, leafView?.alive ?? true);

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

  const statusState = loadState === "loading" ? "connecting" : data.connected ? "connected" : "disconnected";
  const statusText = loadState === "loading" ? "正在连接代理服务…" : data.connected ? "代理服务运行正常" : "代理服务未连接";
  const [downValue, downUnit] = speedParts(traffic.currentBytes.down);
  const [upValue, upUnit] = speedParts(traffic.currentBytes.up);

  return (
    <div className="overview-page">
      <header className="overview-header">
        <h1>概览</h1>
        <span className="overview-status" data-state={statusState}>
          <span className="status-dot" data-state={statusState} aria-hidden="true" />
          {statusText}
          {data.connected && data.version && data.version !== "—" && <small>Mihomo {data.version}</small>}
          {loadState === "demo" && <span className="demo-badge">演示数据</span>}
        </span>
      </header>

      <section className="primary-controls" aria-label="代理控制">
        <div>
          <span className="eyebrow">代理模式</span>
          <div className="segmented-control" role="group" aria-label="代理模式">
            {MODES.map(([value, label, tip]) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === data.mode}
                disabled={!data.connected}
                data-tip={tip}
                onClick={() => { if (value !== data.mode) onModeChange(value); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="current-proxy">
          <span className="eyebrow">当前代理</span>
          {!data.connected ? (
            <>
              <strong>{loadState === "loading" ? "正在读取…" : "暂时无法获取"}</strong>
              <span className="muted-text">{loadState === "loading" ? "正在连接代理服务" : "代理服务恢复连接后自动刷新"}</span>
            </>
          ) : currentProxy.canChange ? (
            <>
              <strong data-tip={`${currentProxy.selectorName} → ${currentProxy.groupName === currentProxy.selectorName ? "" : `${currentProxy.groupName} → `}${currentProxy.nodeName}`}>
                {currentProxy.groupName} <span aria-hidden="true">·</span> {currentProxy.nodeName}
              </strong>
              <span className="node-delay current-proxy-delay" data-tone={progress ? "testing" : leafTone}>
                {progress
                  ? <><span className="delay-dots" aria-hidden="true"><i /><i /><i /></span>测速中 {progress.done}/{progress.total}</>
                  : leafView?.testing
                    ? <span className="delay-dots" aria-label="测速中"><i /><i /><i /></span>
                    : <span className="delay-value" key={leafNode ? delays?.results.get(leafNode.name)?.at ?? "history" : "none"}>{(leafView?.delay ?? primaryGroup?.delay) ? delayText(leafView?.delay ?? primaryGroup?.delay, true) : leafView && !leafView.alive ? "超时" : "尚未测速"}</span>}
              </span>
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
            onClick={() => activeSelector && onOpenGroup(activeSelector.name)}
            disabled={!data.connected || !currentProxy.canChange || !activeSelector}
            data-tip={currentProxy.canChange ? `从 ${activeSelector?.name ?? "代理组"} 中选择要使用的节点或自动组` : "切换到规则或全局模式后可更换代理"}
          >{!data.connected || currentProxy.canChange ? "更换代理" : "直连模式下代理未生效"}</button>
          <button
            type="button"
            className="button button-secondary"
            onClick={testPrimaryGroup}
            disabled={!primaryGroup || testing}
            data-tip={primaryGroup ? `逐个测试 ${primaryGroup.name} 中所有节点的延迟` : undefined}
          >
            <Gauge size={21} aria-hidden="true" className={testing ? "pulse" : undefined} />{testing ? "测速中…" : "测速"}
          </button>
        </div>
      </section>

      <div className="home-grid">
        <section className="home-card traffic-card" aria-labelledby="home-traffic-title">
          <header>
            <span className="home-card-icon"><ChartLine size={18} aria-hidden="true" /></span>
            <h2 id="home-traffic-title">流量统计</h2>
            <span className="traffic-legend"><i data-tone="down" />下载<i data-tone="up" />上传</span>
          </header>
          <TrafficSparkline points={traffic.points} dataKey="down" color="#0a84ff" secondary={{ dataKey: "up", color: "#ff9f0a" }} height={112} fillHeight label="实时上传下载速度曲线" />
          <div className="traffic-stats">
            <Stat icon={<ArrowDown size={14} weight="bold" aria-hidden="true" />} label="下载速度" value={downValue} unit={downUnit} tone="down" tip="当前每秒下载量" />
            <Stat icon={<ArrowUp size={14} weight="bold" aria-hidden="true" />} label="上传速度" value={upValue} unit={upUnit} tone="up" tip="当前每秒上传量" />
            <Stat icon={<Plugs size={14} aria-hidden="true" />} label="活动连接" value={String(data.connectionCount)} unit={`TCP ${data.tcpCount} · UDP ${data.udpCount}`} tip="当前经过 Mihomo 的连接数，可在“连接”页查看详情" />
            <Stat icon={<ArrowDown size={14} aria-hidden="true" />} label="已下载" value={formatTraffic(data.downloadTotal)} tip="Mihomo 本次启动以来的下载总量" />
            <Stat icon={<ArrowUp size={14} aria-hidden="true" />} label="已上传" value={formatTraffic(data.uploadTotal)} tip="Mihomo 本次启动以来的上传总量" />
            <Stat icon={<Cpu size={14} aria-hidden="true" />} label="内存" value={extras?.memory ? formatTraffic(extras.memory) : "—"} tip="Mihomo 内核当前占用的内存" />
          </div>
        </section>

        {extras && <ExitIpCard tools={extras.tools} connected={data.connected && loadState === "live"} />}
        {extras && (
          <SubscriptionCard
            provider={subscription}
            name={activeProvider || subscription?.name || null}
            onUpdate={extras.onUpdateProvider}
            onManage={extras.onManageSubscriptions}
          />
        )}
        {extras && <CoreInfoCard data={data} client={extras.client} />}
      </div>
    </div>
  );
}
