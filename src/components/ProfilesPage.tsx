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
  configuredProviderNames: string[];
  activeProvider: string | null;
  subscriptionSwitching: boolean;
  subscriptionError: string | null;
  onSelectActiveProvider: (name: string) => Promise<void>;
}

function formatUpdateTime(value: string | null) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "更新时间未知" : date.toLocaleString("zh-CN", { hour12: false });
}

export function ProfilesPage({
  data,
  manager,
  onUpdate,
  onConfigurationChanged,
  configuredProviderNames,
  activeProvider,
  subscriptionSwitching,
  subscriptionError,
  onSelectActiveProvider,
}: ProfilesPageProps) {
  const fallbackProviderNames = data.providers
    .filter((provider) => provider.vehicleType.toLowerCase() !== "compatible")
    .map((provider) => provider.name);
  const subscriptionNames = configuredProviderNames.length > 0 ? configuredProviderNames : fallbackProviderNames;
  const subscriptions = subscriptionNames.map((name) => (
    data.providers.find((provider) => provider.name === name) ?? {
      name,
      vehicleType: "Configured",
      updatedAt: null,
      proxyCount: 0,
    }
  ));

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
        <div>
          <h2>订阅切换</h2>
          <p>一次只启用一个订阅。切换会同步更新 Mihomo 代理组并热重载，概览和代理页随核心实际节点刷新。</p>
        </div>
        <span className="subscription-selection-count">当前：{activeProvider ?? "未设置"}</span>
      </div>
      {subscriptionError && <p className="inline-error" role="alert">{subscriptionError}</p>}
      <div className="subscription-card-grid" role="list">
        {subscriptions.map((provider) => {
          const selected = provider.name === activeProvider;
          return (
            <article className="provider-card" data-active={selected} key={provider.name} role="listitem">
              <button
                type="button"
                className="provider-card-select"
                aria-label={`选择订阅 ${provider.name}`}
                aria-pressed={selected}
                disabled={subscriptionSwitching}
                onClick={() => {
                  if (!selected) void onSelectActiveProvider(provider.name);
                }}
              >
                <span className="provider-card-heading">
                  <span className="provider-icon"><CloudArrowDown size={22} aria-hidden="true" /></span>
                  <span>
                    <strong>{provider.name}</strong>
                    <small>{provider.vehicleType} · {provider.proxyCount} 个节点</small>
                  </span>
                </span>
                <span className="provider-card-meta">
                  {selected ? "当前使用" : subscriptionSwitching ? "切换中…" : "点击切换"}
                  <time>{formatUpdateTime(provider.updatedAt)}</time>
                </span>
                <i className="provider-card-progress" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button provider-card-refresh"
                disabled={subscriptionSwitching}
                onClick={() => void onUpdate(provider.name)}
                aria-label={`更新订阅 ${provider.name}`}
                title="更新订阅"
              >
                <ArrowsClockwise size={18} aria-hidden="true" />
              </button>
            </article>
          );
        })}
        {subscriptions.length === 0 && <p className="empty-state">当前配置没有可切换的订阅。</p>}
      </div>
    </section>
  );
}
