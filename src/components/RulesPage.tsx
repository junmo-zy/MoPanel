import { ArrowClockwise, ArrowsClockwise, CircleNotch, MagnifyingGlass, Stack, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MihomoClient, RuleItem, RuleProviderItem } from "../api/types";
import type { RuleSource } from "../api/active-provider";
import { LoadMore } from "./LoadMore";
import { PageHeader } from "./PageHeader";

interface RulesPageProps {
  client: MihomoClient;
  onNotice?: (message: string) => void;
  ruleSource?: RuleSource;
  onSyncRules?: () => Promise<void>;
}

const BATCH = 200;

function proxyTone(proxy: string) {
  const upper = proxy.toUpperCase();
  if (upper === "DIRECT") return "direct";
  if (upper.startsWith("REJECT")) return "reject";
  return "proxy";
}

function formatTime(value: string | null) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

export function RulesPage({ client, onNotice, ruleSource, onSyncRules }: RulesPageProps) {
  const [syncing, setSyncing] = useState(false);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [providers, setProviders] = useState<RuleProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(BATCH);
  const [showProviders, setShowProviders] = useState(false);
  const [updating, setUpdating] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRules, nextProviders] = await Promise.all([client.getRules(), client.getRuleProviders().catch(() => [])]);
      setRules(nextRules);
      setProviders(nextProviders);
      setError("");
    } catch {
      setError("无法读取规则，请检查代理服务连接。");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    Promise.all([client.getRules(), client.getRuleProviders().catch(() => [])])
      .then(([nextRules, nextProviders]) => {
        if (!active) return;
        setRules(nextRules);
        setProviders(nextProviders);
      })
      .catch(() => { if (active) setError("无法读取规则，请检查代理服务连接。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);

  const providerCounts = useMemo(() => new Map(providers.map((provider) => [provider.name, provider.ruleCount])), [providers]);
  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const indexed = rules.map((rule, index) => ({ rule, index }));
    if (!term) return indexed;
    return indexed.filter(({ rule }) => [rule.type, rule.payload, rule.proxy].some((value) => value.toLowerCase().includes(term)));
  }, [rules, term]);

  async function updateProvider(name: string) {
    setUpdating((current) => new Set(current).add(name));
    try {
      await client.updateRuleProvider(name);
      onNotice?.(`规则集合 ${name} 已更新`);
    } catch {
      onNotice?.(`规则集合 ${name} 更新失败`);
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        next.delete(name);
        return next;
      });
    }
  }

  async function updateAll() {
    for (const provider of providers) await updateProvider(provider.name);
    await load();
  }

  return (
    <section className="page rules-page">
      <PageHeader
        title="规则"
        description={loading ? "正在读取规则…" : `共 ${rules.length} 条规则，按顺序从上到下匹配，命中第一条即生效。`}
        action={(
          <div className="rules-actions">
            {onSyncRules && (
              <button
                type="button"
                className="button button-primary"
                disabled={syncing || !ruleSource?.provider}
                data-tip="重新下载当前订阅，更新代理组和规则"
                onClick={() => {
                  setSyncing(true);
                  void onSyncRules().then(load, () => undefined).finally(() => setSyncing(false));
                }}
              >
                <ArrowsClockwise size={17} className={syncing ? "spin" : undefined} aria-hidden="true" />{syncing ? "同步中…" : "从订阅同步"}
              </button>
            )}
            <button type="button" className="button button-secondary" onClick={() => setShowProviders(true)} disabled={providers.length === 0}>
              <Stack size={17} aria-hidden="true" />规则集合 {providers.length}
            </button>
            <button type="button" className="button button-secondary" onClick={() => void load()} disabled={loading}>
              <ArrowClockwise size={17} aria-hidden="true" />刷新
            </button>
          </div>
        )}
      />
      {ruleSource && (
        <div className="rule-source" data-mode={ruleSource.mode} role="note">
          <strong>{ruleSource.mode === "profile" ? `规则来自订阅「${ruleSource.provider}」` : "规则来自本地配置 config.yaml"}</strong>
          <span>
            {ruleSource.mode === "profile"
              ? `代理组与规则随订阅更新${ruleSource.syncedAt ? `，同步于 ${new Date(ruleSource.syncedAt).toLocaleString("zh-CN", { hour12: false })}` : ""}${ruleSource.repairedRules ? `；有 ${ruleSource.repairedRules} 条规则指向不存在的组，已改为主代理组` : ""}。`
              : ruleSource.provider
                ? "当前订阅没有提供规则（或尚未同步），点击「从订阅同步」可导入订阅自带的代理组和规则。"
                : "添加订阅后即可使用订阅自带的代理组和规则。"}
          </span>
          {ruleSource.warning && <span className="rule-source-warning">{ruleSource.warning}</span>}
        </div>
      )}
      <label className="search-field page-search rules-search">
        <MagnifyingGlass size={18} aria-hidden="true" />
        <span className="sr-only">搜索规则</span>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(BATCH); }} placeholder="搜索规则内容、类型或策略" />
      </label>
      {error && <p className="inline-error" role="alert">{error}</p>}

      <div className="rule-list" role="list" aria-label="规则列表">
        {filtered.slice(0, limit).map(({ rule, index }) => (
          <div className="rule-row" role="listitem" key={index}>
            <span className="rule-index">{index + 1}</span>
            <span className="rule-main">
              <strong data-tip={rule.payload}>{rule.payload || (rule.type === "Match" ? "其余所有流量" : "—")}</strong>
              <span className="rule-meta">
                <span className="node-tag">{rule.type}</span>
                {rule.type === "RuleSet" && providerCounts.has(rule.payload) && <small>{providerCounts.get(rule.payload)} 条</small>}
              </span>
            </span>
            <span className="rule-proxy" data-tone={proxyTone(rule.proxy)}>{rule.proxy}</span>
          </div>
        ))}
      </div>
      {filtered.length > limit && <LoadMore remaining={filtered.length - limit} unit="条" onMore={() => setLimit((current) => current + BATCH)} />}
      {!loading && filtered.length === 0 && <p className="empty-state">{term ? "没有匹配的规则" : "当前配置没有规则"}</p>}

      {showProviders && (
        <dialog open className="provider-dialog" aria-labelledby="rule-providers-title">
          <div className="dialog-backdrop" aria-hidden="true" onClick={() => setShowProviders(false)} />
          <div className="confirm-modal rule-providers-modal">
            <header>
              <h2 id="rule-providers-title">规则集合</h2>
              <button type="button" className="button button-secondary compact-button" onClick={() => void updateAll()} disabled={updating.size > 0}>
                <ArrowsClockwise size={15} aria-hidden="true" />全部更新
              </button>
              <button type="button" className="icon-button" aria-label="关闭" onClick={() => setShowProviders(false)}><X size={20} aria-hidden="true" /></button>
            </header>
            <div className="rule-provider-list" role="list">
              {providers.map((provider) => (
                <div className="rule-provider-row" role="listitem" key={provider.name} aria-label={provider.name}>
                  <span>
                    <strong>{provider.name}</strong>
                    <small>{provider.behavior} · {provider.ruleCount} 条 · {provider.vehicleType} · {formatTime(provider.updatedAt)}</small>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`更新 ${provider.name}`}
                    data-tip="立即更新"
                    disabled={updating.has(provider.name) || provider.vehicleType.toLowerCase() === "inline"}
                    onClick={() => void updateProvider(provider.name).then(load)}
                  >
                    {updating.has(provider.name) ? <CircleNotch className="spin" size={18} aria-hidden="true" /> : <ArrowsClockwise size={18} aria-hidden="true" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
