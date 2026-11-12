import { ArrowsClockwise, CheckCircle, CircleNotch, CloudArrowDown, FileText, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { ManagedProviderInput, ManagedProxyProvider, ProviderManagerClient } from "../api/provider-manager";
import type { OverviewData, ProxyProvider } from "../api/types";
import type { RuleSource } from "../api/active-provider";
import { PageHeader } from "./PageHeader";
import { SubscriptionUsage } from "./SubscriptionUsage";
import { ProviderEditorDialog } from "./ProviderEditorDialog";

export type ProviderConfigurationChange =
  | { action: "create" | "update"; provider: ManagedProviderInput; originalName?: string }
  | { action: "delete"; provider: ManagedProxyProvider };

interface ProfilesPageProps {
  data: OverviewData;
  manager: ProviderManagerClient;
  onUpdate: (name: string) => Promise<void>;
  onConfigurationChanged: (change: ProviderConfigurationChange) => Promise<void>;
  configuredProviderNames: string[];
  activeProvider: string | null;
  ruleSource?: RuleSource;
  subscriptionSwitching: boolean;
  subscriptionError: string | null;
  onSelectActiveProvider: (name: string) => Promise<void>;
}

interface EditorState {
  originalName: string;
  provider: ManagedProxyProvider | null;
}

function formatUpdateTime(value: string | null) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "更新时间未知" : `更新于 ${date.toLocaleString("zh-CN", { hour12: false })}`;
}

function typeLabel(config: ManagedProxyProvider | undefined, runtime: ProxyProvider | undefined) {
  const type = config?.type || runtime?.vehicleType.toLowerCase();
  if (type === "http") return "远程订阅";
  if (type === "file") return "本地文件";
  if (type === "inline") return "内联配置";
  return runtime?.vehicleType || "订阅";
}

// Subscription URLs usually carry a secret token; only the host is shown.
function sourceLabel(config: ManagedProxyProvider | undefined) {
  if (!config) return "";
  if (config.type === "http") {
    try {
      return new URL(config.url).host;
    } catch {
      return "";
    }
  }
  return config.type === "file" ? config.path : "";
}


export function ProfilesPage({
  data,
  manager,
  onUpdate,
  onConfigurationChanged,
  configuredProviderNames,
  activeProvider,
  ruleSource,
  subscriptionSwitching,
  subscriptionError,
  onSelectActiveProvider,
}: ProfilesPageProps) {
  const [configProviders, setConfigProviders] = useState<ManagedProxyProvider[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<ManagedProxyProvider | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    manager.list()
      .then((items) => {
        if (active) setConfigProviders(items);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [manager]);

  // config.yaml is the source of truth; without config management fall back to
  // what the subscription API or the running core reports (read-only).
  const runtimeSubscriptions = data.providers.filter((provider) => provider.vehicleType.toLowerCase() !== "compatible");
  // Both lists come from config.yaml but are fetched separately; merge them so
  // a just-saved subscription never disappears between the two refreshes.
  const names = [...new Set([
    ...(configProviders?.map((provider) => provider.name) || []),
    ...configuredProviderNames,
    ...(configProviders || configuredProviderNames.length > 0 ? [] : runtimeSubscriptions.map((provider) => provider.name)),
  ])];
  const editable = configProviders !== null;

  async function saveProvider(provider: ManagedProviderInput) {
    if (!editor) return;
    setSaving(true);
    setError("");
    try {
      const items = editor.provider
        ? await manager.update(editor.originalName, provider)
        : await manager.create(provider);
      setConfigProviders(items);
      setEditor(null);
      await onConfigurationChanged(
        editor.provider
          ? { action: "update", originalName: editor.originalName, provider }
          : { action: "create", provider },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "订阅保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeProvider() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    try {
      setConfigProviders(await manager.remove(deleting.name));
      await onConfigurationChanged({ action: "delete", provider: deleting });
      setDeleting(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "订阅删除失败");
    } finally {
      setSaving(false);
    }
  }

  async function update(name: string) {
    setUpdating(name);
    try {
      await onUpdate(name);
    } finally {
      setUpdating(null);
    }
  }

  async function select(name: string) {
    setSwitchingTo(name);
    try {
      await onSelectActiveProvider(name);
    } finally {
      setSwitchingTo(null);
    }
  }

  const busy = saving || subscriptionSwitching || switchingTo !== null;

  return (
    <section className="page profiles-page">
      <PageHeader
        title="订阅"
        description={names.length > 1
          ? "点击订阅卡片即可切换；切换会更新代理组并热重载 Mihomo。"
          : "添加订阅链接后，Mihomo 会自动下载节点；添加多个订阅即可在这里切换。"}
        action={editable ? (
          <button type="button" className="button button-primary" onClick={() => { setError(""); setEditor({ originalName: "", provider: null }); }} disabled={busy}>
            <Plus size={18} aria-hidden="true" />添加订阅
          </button>
        ) : undefined}
      />

      {error && !editor && !deleting && <p className="inline-error" role="alert">{error}</p>}
      {subscriptionError && <p className="inline-error" role="alert">{subscriptionError}</p>}

      <div className="subscription-card-grid" role="list" aria-busy={loading}>
        {names.map((name) => {
          const config = configProviders?.find((provider) => provider.name === name);
          const runtime = data.providers.find((provider) => provider.name === name);
          const selected = name === activeProvider;
          const source = sourceLabel(config);
          const Icon = config?.type === "file" ? FileText : CloudArrowDown;
          return (
            <article className="provider-card" data-active={selected} data-switching={switchingTo === name} aria-busy={switchingTo === name} key={name} role="listitem" aria-label={name}>
              <button
                type="button"
                className="provider-card-select"
                aria-label={`选择订阅 ${name}`}
                aria-pressed={selected}
                disabled={busy}
                onClick={() => { if (!selected) void select(name); }}
              >
                <span className="provider-card-heading">
                  <span className="provider-icon"><Icon size={20} aria-hidden="true" /></span>
                  <span>
                    <strong>{name}</strong>
                    <small>{typeLabel(config, runtime)} · {runtime ? `${runtime.proxyCount} 个节点` : "未加载"}</small>
                    {source && <small className="provider-card-source" data-tip={source}>{source}</small>}
                  </span>
                </span>
                {runtime?.subscriptionInfo && <SubscriptionUsage info={runtime.subscriptionInfo} />}
                {selected && ruleSource && ruleSource.provider === name && (
                  <span className="provider-rule-source" data-mode={ruleSource.mode} data-tip={ruleSource.warning}>
                    {ruleSource.mode === "profile"
                      ? `代理组和规则来自此订阅 · ${ruleSource.ruleCount} 条规则`
                      : `此订阅只提供节点 · 使用本地 ${ruleSource.ruleCount} 条规则`}
                  </span>
                )}
                <span className="provider-card-meta">
                  <time>{formatUpdateTime(runtime?.updatedAt ?? null)}</time>
                  <span className="provider-card-state">
                    {switchingTo === name
                      ? <><CircleNotch className="spin" size={13} aria-hidden="true" />切换中…</>
                      : selected
                        ? <><CheckCircle size={14} weight="fill" aria-hidden="true" />当前使用</>
                        : "点击切换"}
                  </span>
                </span>
              </button>
              <span className="provider-card-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || updating !== null || !runtime}
                  onClick={() => void update(name)}
                  aria-label={`更新订阅 ${name}`}
                  data-tip={runtime ? "立即更新" : "Mihomo 尚未加载此订阅"}
                >
                  {updating === name ? <CircleNotch className="spin" size={17} aria-hidden="true" /> : <ArrowsClockwise size={17} aria-hidden="true" />}
                </button>
                {config && (
                  <>
                    <button type="button" className="icon-button" aria-label={`编辑 ${name}`} data-tip="编辑" disabled={busy} onClick={() => { setError(""); setEditor({ originalName: name, provider: config }); }}>
                      <PencilSimple size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-button danger-icon-button" aria-label={`删除 ${name}`} data-tip="删除" disabled={busy} onClick={() => { setError(""); setDeleting(config); }}>
                      <Trash size={17} aria-hidden="true" />
                    </button>
                  </>
                )}
              </span>
              <i className="provider-card-progress" aria-hidden="true" />
            </article>
          );
        })}
      </div>
      {!loading && names.length === 0 && (
        <div className="subscription-empty">
          <CloudArrowDown size={30} aria-hidden="true" />
          <p>还没有订阅。点击右上角「添加订阅」，粘贴机场提供的订阅链接即可。</p>
        </div>
      )}
      {loading && names.length === 0 && <p className="empty-state">正在读取配置…</p>}


      {editor && (
        <ProviderEditorDialog
          provider={editor.provider}
          saving={saving}
          error={error}
          onClose={() => { setEditor(null); setError(""); }}
          onSave={saveProvider}
        />
      )}

      {deleting && (
        <dialog open className="provider-dialog" aria-labelledby="delete-provider-title">
          <div className="dialog-backdrop" aria-hidden="true" onClick={saving ? undefined : () => { setDeleting(null); setError(""); }} />
          <div className="confirm-modal">
            <h2 id="delete-provider-title">删除订阅</h2>
            <p>确定删除“{deleting.name}”吗？使用它的代理组会改用其他订阅；没有其他订阅时改为直连。</p>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="provider-modal-actions">
              <button type="button" className="button button-secondary compact-button" onClick={() => { setDeleting(null); setError(""); }} disabled={saving}>取消</button>
              <button type="button" className="button button-danger compact-button" onClick={removeProvider} disabled={saving}>确认删除</button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
