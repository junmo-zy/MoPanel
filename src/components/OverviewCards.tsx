import { ArrowClockwise, ArrowSquareOut, CircleNotch, CloudArrowDown, Cpu, Eye, EyeSlash, GlobeHemisphereWest } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { regionFlag, type ExitIpInfo, type ToolsClient } from "../api/tools";
import type { MihomoClient, OverviewData, ProxyProvider } from "../api/types";
import { SubscriptionUsage } from "./SubscriptionUsage";

const HIDE_IP_KEY = "mopanel:hide-exit-ip";

function formatTime(value: string | null | undefined) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function maskIp(ip: string) {
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}:****`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : "****";
}

export function SubscriptionCard({ provider, name, onUpdate, onManage }: {
  provider?: ProxyProvider;
  name: string | null;
  onUpdate: (name: string) => Promise<void>;
  onManage: () => void;
}) {
  const [updating, setUpdating] = useState(false);
  async function update() {
    if (!provider) return;
    setUpdating(true);
    try {
      await onUpdate(provider.name);
    } finally {
      setUpdating(false);
    }
  }
  const title = provider?.name || name;
  return (
    <section className="home-card" aria-labelledby="home-subscription-title">
      <header>
        <span className="home-card-icon"><CloudArrowDown size={18} aria-hidden="true" /></span>
        <h2 id="home-subscription-title">当前订阅</h2>
        <button type="button" className="icon-button" aria-label="更新当前订阅" data-tip="立即更新" disabled={!provider || updating} onClick={() => void update()}>
          {updating ? <CircleNotch className="spin" size={17} aria-hidden="true" /> : <ArrowClockwise size={17} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-button" aria-label="管理订阅" data-tip="管理订阅" onClick={onManage}>
          <ArrowSquareOut size={17} aria-hidden="true" />
        </button>
      </header>
      {title ? (
        <>
          <strong className="home-card-value">{title}</strong>
          <span className="home-card-sub">{provider ? `${provider.proxyCount} 个节点 · ${provider.vehicleType}` : "Mihomo 尚未加载此订阅"}</span>
          {provider?.subscriptionInfo && <SubscriptionUsage info={provider.subscriptionInfo} />}
          <span className="home-card-foot">{provider ? `更新于 ${formatTime(provider.updatedAt)}` : "—"}</span>
        </>
      ) : (
        <p className="home-card-empty">还没有订阅，点击右上角前往添加。</p>
      )}
    </section>
  );
}

export function ExitIpCard({ tools, connected }: { tools: ToolsClient; connected: boolean }) {
  const [info, setInfo] = useState<ExitIpInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(HIDE_IP_KEY) === "1";
    } catch {
      return false;
    }
  });

  const lookup = useCallback(async () => {
    setLoading(true);
    try {
      setInfo(await tools.exitIp());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }, [tools]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    tools.exitIp()
      .then((next) => { if (active) { setInfo(next); setError(""); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "查询失败"); });
    return () => { active = false; };
  }, [tools, connected]);

  function toggleHidden() {
    setHidden((current) => {
      try {
        window.localStorage.setItem(HIDE_IP_KEY, current ? "0" : "1");
      } catch {
        // Applies for this visit only.
      }
      return !current;
    });
  }

  const flag = regionFlag(info?.countryCode);
  const place = [info?.city, info?.region, info?.country].filter((value, index, all) => value && all.indexOf(value) === index).join(" · ");
  return (
    <section className="home-card" aria-labelledby="home-ip-title">
      <header>
        <span className="home-card-icon"><GlobeHemisphereWest size={18} aria-hidden="true" /></span>
        <h2 id="home-ip-title">出口 IP</h2>
        <button type="button" className="icon-button" aria-label={hidden ? "显示 IP" : "隐藏 IP"} data-tip={hidden ? "显示完整 IP" : "隐藏部分 IP（截图时更安全）"} onClick={toggleHidden}>
          {hidden ? <EyeSlash size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-button" aria-label="重新查询出口 IP" data-tip="通过当前代理重新查询出口 IP" disabled={loading || !connected} onClick={() => void lookup()}>
          {loading ? <CircleNotch className="spin" size={17} aria-hidden="true" /> : <ArrowClockwise size={17} aria-hidden="true" />}
        </button>
      </header>
      {info ? (
        <>
          <strong className="home-card-value home-ip">{hidden ? maskIp(info.ip) : info.ip}</strong>
          <span className="home-card-sub">{flag && <span aria-hidden="true">{flag} </span>}{place || info.countryCode || "未知地区"}</span>
          <dl className="home-card-list">
            {info.isp && <div><dt>运营商</dt><dd data-tip={info.isp}>{info.isp}</dd></div>}
            {info.asn && <div><dt>ASN</dt><dd>{info.asn}</dd></div>}
            {info.timezone && <div><dt>时区</dt><dd>{info.timezone}</dd></div>}
          </dl>
        </>
      ) : (
        <p className={error ? "home-card-error" : "home-card-empty"}>{error || (connected ? "正在通过代理查询…" : "连接代理服务后查询")}</p>
      )}
    </section>
  );
}

export function CoreInfoCard({ data, client }: { data: OverviewData; client: MihomoClient }) {
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  useEffect(() => {
    if (!data.connected) return;
    let active = true;
    client.getRules().then((rules) => { if (active) setRuleCount(rules.length); }).catch(() => undefined);
    return () => { active = false; };
  }, [client, data.connected, data.version]);

  const rows: Array<[string, string]> = [
    ["内核版本", data.version],
    ["混合端口", data.mixedPort ? String(data.mixedPort) : "未启用"],
    ["局域网连接", data.allowLan ? "已允许" : "未允许"],
    ["IPv6", data.ipv6 === undefined ? "—" : data.ipv6 ? "已开启" : "已关闭"],
    ["规则数量", ruleCount === null ? "—" : `${ruleCount} 条`],
    ["代理组 / 节点", `${data.groups.length} 个 / ${data.providerNodes.length} 个`],
  ];
  return (
    <section className="home-card" aria-labelledby="home-core-title">
      <header>
        <span className="home-card-icon"><Cpu size={18} aria-hidden="true" /></span>
        <h2 id="home-core-title">内核信息</h2>
      </header>
      <dl className="home-card-list home-core-list">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}
