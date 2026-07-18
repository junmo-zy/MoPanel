import { ArrowsClockwise, CloudArrowDown } from "@phosphor-icons/react";
import type { ProviderManagerClient } from "../api/provider-manager";
import type { OverviewData } from "../api/types";
import { ManagedProvidersPanel, type ProviderConfigurationChange } from "./ManagedProvidersPanel";
import { PageHeader } from "./PageHeader";

interface ProfilesPageProps {
  data: OverviewData;
  manager: ProviderManagerClient;
  onUpdate: (name: string) => Promise<void>;
  onConfigurationChanged: (change: ProviderConfigurationChange) => Promise<void>;
}

function formatUpdateTime(value: string | null) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "更新时间未知" : date.toLocaleString("zh-CN", { hour12: false });
}

export function ProfilesPage({ data, manager, onUpdate, onConfigurationChanged }: ProfilesPageProps) {
  return (
    <section className="page">
      <PageHeader title="订阅" description="管理代理订阅、查看节点数量，并立即更新 Mihomo 已加载的订阅。" />

      <div className="config-summary" aria-label="核心配置摘要">
        <div><span>运行模式</span><strong>{data.mode === "rule" ? "规则" : data.mode === "global" ? "全局" : "直连"}</strong></div>
        <div><span>混合端口</span><strong>{data.mixedPort ?? "未启用"}</strong></div>
        <div><span>局域网访问</span><strong>{data.allowLan ? "已允许" : "未允许"}</strong></div>
        <div><span>内核版本</span><strong>{data.version}</strong></div>
      </div>

      <ManagedProvidersPanel manager={manager} onChanged={onConfigurationChanged} />

      <div className="section-heading loaded-provider-heading">
        <div><h2>已加载的提供者</h2><p>让 Mihomo 立即拉取一次订阅，不改动配置内容。</p></div>
      </div>
      <div className="simple-table provider-table">
        {data.providers.map((provider) => (
          <div className="provider-row" key={provider.name}>
            <span className="provider-icon"><CloudArrowDown size={24} aria-hidden="true" /></span>
            <div><strong>{provider.name}</strong><small>{provider.vehicleType} · {provider.proxyCount} 个节点</small></div>
            <span className="muted-text">{formatUpdateTime(provider.updatedAt)}</span>
            <button type="button" className="button button-secondary compact-button" onClick={() => onUpdate(provider.name)}>
              <ArrowsClockwise size={18} aria-hidden="true" />更新
            </button>
          </div>
        ))}
        {data.providers.length === 0 && <p className="empty-state">当前配置没有代理提供者</p>}
      </div>
    </section>
  );
}
