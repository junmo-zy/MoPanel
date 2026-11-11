import { FloppyDisk, Info } from "@phosphor-icons/react";
import { useState } from "react";
import type { CoreConfigPatch, OverviewData } from "../api/types";
import { PageHeader } from "./PageHeader";
import { WallpaperSettings } from "./WallpaperSettings";

interface SettingsPageProps {
  data: OverviewData;
  speedTestUrl: string;
  onSave: (patch: CoreConfigPatch, speedTestUrl: string) => Promise<void>;
}

export function SettingsPage({ data, speedTestUrl, onSave }: SettingsPageProps) {
  const [initialMixedPort] = useState(data.mixedPort ?? 7890);
  const [mixedPort, setMixedPort] = useState(initialMixedPort);
  const [allowLan, setAllowLan] = useState(data.allowLan);
  const [ipv6, setIpv6] = useState(data.ipv6 ?? false);
  const [testUrl, setTestUrl] = useState(speedTestUrl);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!Number.isInteger(mixedPort) || mixedPort < 1 || mixedPort > 65535) {
        throw new Error("混合端口必须是 1–65535 之间的整数");
      }
      const patch: CoreConfigPatch = {};
      if (mixedPort !== initialMixedPort) patch.mixedPort = mixedPort;
      if (allowLan !== data.allowLan) patch.allowLan = allowLan;
      if (data.ipv6 === undefined ? ipv6 : ipv6 !== data.ipv6) patch.ipv6 = ipv6;
      await onSave(patch, testUrl);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设置保存失败");
    }
  }

  return (
    <section className="page settings-page">
      <PageHeader title="设置" description="只保留常用核心参数；高级配置仍建议直接维护 YAML。" />
      <form className="settings-form" onSubmit={submit}>
        <WallpaperSettings />
        <div className="settings-section">
          <h2>网络</h2>
          <label className="setting-row"><span><strong>混合端口</strong><small>HTTP 与 SOCKS 共用端口</small></span><input type="number" min="1" max="65535" value={mixedPort} onChange={(event) => setMixedPort(Number(event.target.value))} /></label>
          <label className="setting-row"><span><strong>允许局域网连接</strong><small>开启后同一网络内的设备可以使用此代理</small></span><input type="checkbox" role="switch" checked={allowLan} onChange={(event) => setAllowLan(event.target.checked)} /></label>
          <label className="setting-row"><span><strong>启用 IPv6</strong><small>让内核处理 IPv6 流量</small></span><input type="checkbox" role="switch" checked={ipv6} onChange={(event) => setIpv6(event.target.checked)} /></label>
        </div>
        <div className="settings-section">
          <h2>测速</h2>
          <label className="setting-row setting-row-input">
            <span><strong>测速地址</strong><small>节点和策略组测速都会请求这个 HTTP/HTTPS 地址</small></span>
            <input aria-label="测速地址" type="url" inputMode="url" value={testUrl} onChange={(event) => setTestUrl(event.target.value)} placeholder="https://www.gstatic.com/generate_204" />
          </label>
          {error && <p className="inline-error settings-inline-error" role="alert">{error}</p>}
        </div>
        <div className="settings-section">
          <h2>控制器</h2>
          <div className="info-row"><Info size={20} /><span><strong>连接由容器环境变量管理</strong><small>请使用 MIHOMO_API_URL 与 MIHOMO_SECRET，密钥不会下发到浏览器。</small></span></div>
        </div>
        <div className="form-actions"><button type="submit" className="button button-primary"><FloppyDisk size={18} />保存设置</button></div>
      </form>
    </section>
  );
}
