import { ArrowClockwise, CheckCircle, CircleNotch, DotsThreeCircle, Gauge, Plus, Trash, Warning, XCircle } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { regionFlag, type ToolsClient, type UnlockResult, type UnlockService } from "../api/tools";
import { PageHeader } from "./PageHeader";

interface TestPageProps {
  tools: ToolsClient;
}

interface Site {
  id: string;
  name: string;
  url: string;
  custom?: boolean;
}

interface LatencyResult {
  delay: number | null;
  error?: string;
  checkedAt: string;
}

type Tab = "unlock" | "latency";

const UNLOCK_RESULTS_KEY = "mopanel:unlock-results";
const LATENCY_RESULTS_KEY = "mopanel:latency-results";
const CUSTOM_SITES_KEY = "mopanel:latency-sites";
const TAB_KEY = "mopanel:test-tab";
const CONCURRENCY = 4;

const DEFAULT_SITES: Site[] = [
  { id: "google", name: "Google", url: "https://www.google.com/generate_204" },
  { id: "github", name: "GitHub", url: "https://github.com" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com" },
  { id: "apple", name: "Apple", url: "https://www.apple.com" },
  { id: "cloudflare", name: "Cloudflare", url: "https://www.cloudflare.com" },
  { id: "telegram", name: "Telegram", url: "https://web.telegram.org" },
  { id: "openai", name: "OpenAI", url: "https://chatgpt.com" },
  { id: "baidu", name: "百度", url: "https://www.baidu.com" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Results still show for this visit.
  }
}

function formatTime(value?: string) {
  if (!value) return "-- --";
  const date = new Date(value);
  // sv-SE gives the compact "2026-10-21 15:03:43" timestamp format.
  return Number.isNaN(date.getTime()) ? "-- --" : date.toLocaleString("sv-SE", { hour12: false });
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift() as T);
  }));
}

function StatusPill({ result, testing }: { result?: UnlockResult; testing: boolean }) {
  if (testing) return <span className="test-pill" data-tone="pending"><CircleNotch className="spin" size={15} aria-hidden="true" />检测中</span>;
  if (!result) return <span className="test-pill" data-tone="pending"><DotsThreeCircle size={16} aria-hidden="true" />待检测</span>;
  if (result.status === "yes") return <span className="test-pill" data-tone="yes"><CheckCircle size={16} weight="fill" aria-hidden="true" />支持</span>;
  if (result.status === "originals") return <span className="test-pill" data-tone="partial"><CheckCircle size={16} weight="fill" aria-hidden="true" />仅自制剧</span>;
  if (result.status === "no") return <span className="test-pill" data-tone="no"><XCircle size={16} weight="fill" aria-hidden="true" />不支持</span>;
  return <span className="test-pill" data-tone="failed"><Warning size={16} weight="fill" aria-hidden="true" />检测失败</span>;
}

function delayTone(delay: number | null) {
  if (delay === null) return "timeout";
  if (delay < 300) return "good";
  if (delay < 800) return "fair";
  return "poor";
}

export function TestPage({ tools }: TestPageProps) {
  const [tab, setTab] = useState<Tab>(() => (readJson<Tab>(TAB_KEY, "unlock") === "latency" ? "latency" : "unlock"));
  const [services, setServices] = useState<UnlockService[]>([]);
  const [unlockResults, setUnlockResults] = useState<Record<string, UnlockResult>>(() => readJson(UNLOCK_RESULTS_KEY, {}));
  const [customSites, setCustomSites] = useState<Site[]>(() => readJson(CUSTOM_SITES_KEY, []));
  const [latencyResults, setLatencyResults] = useState<Record<string, LatencyResult>>(() => readJson(LATENCY_RESULTS_KEY, {}));
  const [testing, setTesting] = useState<Set<string>>(() => new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", url: "" });
  const sites = [...DEFAULT_SITES, ...customSites];

  useEffect(() => {
    let active = true;
    tools.listUnlockServices()
      .then((items) => { if (active) setServices(items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "无法读取检测项目"); });
    return () => { active = false; };
  }, [tools]);

  function mark(key: string, on: boolean) {
    setTesting((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function checkUnlock(id: string) {
    mark(id, true);
    try {
      const result = await tools.runUnlock(id);
      setUnlockResults((current) => {
        const next = { ...current, [id]: result };
        writeJson(UNLOCK_RESULTS_KEY, next);
        return next;
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "检测失败";
      // An unreachable proxy port affects every test: show it once at the top.
      if ((reason as { code?: string }).code === "PROXY_UNAVAILABLE") setError(message);
      setUnlockResults((current) => {
        const next = { ...current, [id]: { id, status: "failed" as const, detail: message, checkedAt: new Date().toISOString() } };
        writeJson(UNLOCK_RESULTS_KEY, next);
        return next;
      });
    } finally {
      mark(id, false);
    }
  }

  async function checkLatency(site: Site) {
    mark(site.id, true);
    let result: LatencyResult;
    try {
      result = { delay: await tools.latency(site.url), checkedAt: new Date().toISOString() };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "测试失败";
      if ((reason as { code?: string }).code === "PROXY_UNAVAILABLE") setError(message);
      result = { delay: null, error: message, checkedAt: new Date().toISOString() };
    }
    setLatencyResults((current) => {
      const next = { ...current, [site.id]: result };
      writeJson(LATENCY_RESULTS_KEY, next);
      return next;
    });
    mark(site.id, false);
  }

  async function runAll() {
    setRunningAll(true);
    setError("");
    try {
      if (tab === "unlock") await runPool(services.map((service) => service.id), checkUnlock);
      else await runPool(sites, checkLatency);
    } finally {
      setRunningAll(false);
    }
  }

  function chooseTab(next: Tab) {
    setTab(next);
    writeJson(TAB_KEY, next);
  }

  function addSite(event: FormEvent) {
    event.preventDefault();
    let url: URL;
    try {
      url = new URL(draft.url.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    } catch {
      setError("网址必须以 http:// 或 https:// 开头");
      return;
    }
    const site: Site = { id: `custom-${Date.now()}`, name: draft.name.trim() || url.host, url: url.toString(), custom: true };
    const next = [...customSites, site];
    setCustomSites(next);
    writeJson(CUSTOM_SITES_KEY, next);
    setDraft({ name: "", url: "" });
    setAdding(false);
    setError("");
    void checkLatency(site);
  }

  function removeSite(site: Site) {
    const next = customSites.filter((item) => item.id !== site.id);
    setCustomSites(next);
    writeJson(CUSTOM_SITES_KEY, next);
  }

  return (
    <section className="page test-page">
      <PageHeader
        title="测试"
        description={tab === "unlock"
          ? "通过当前代理检测流媒体与 AI 服务能否使用及所在地区。"
          : "通过当前代理（按规则分流）访问常用网站，测量响应延迟。"}
        action={(
          <div className="test-page-actions">
            <div className="segmented-control test-tabs" role="tablist" aria-label="测试类型">
              <button type="button" role="tab" aria-selected={tab === "unlock"} aria-pressed={tab === "unlock"} onClick={() => chooseTab("unlock")}>解锁测试</button>
              <button type="button" role="tab" aria-selected={tab === "latency"} aria-pressed={tab === "latency"} onClick={() => chooseTab("latency")}>网站延迟</button>
            </div>
            {tab === "latency" && (
              <button type="button" className="button button-secondary" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" />添加网站</button>
            )}
            <button type="button" className="button button-primary" onClick={() => void runAll()} disabled={runningAll || (tab === "unlock" && services.length === 0)}>
              <ArrowClockwise size={18} aria-hidden="true" />{runningAll ? "测试中…" : "测试全部"}
            </button>
          </div>
        )}
      />
      {error && <p className="inline-error" role="alert">{error}</p>}

      {tab === "unlock" ? (
        <div className="test-grid" role="list" aria-label="解锁测试">
          {services.map((service) => {
            const result = unlockResults[service.id];
            const busy = testing.has(service.id);
            const flag = regionFlag(result?.region);
            return (
              <article className="test-card" key={service.id} role="listitem" aria-label={service.name} data-status={busy ? "testing" : result?.status || "pending"}>
                <header>
                  <h2>{service.name}</h2>
                  <button type="button" className="test-card-refresh" aria-label={`检测 ${service.name}`} data-tip="重新检测" disabled={busy} onClick={() => void checkUnlock(service.id)}>
                    <ArrowClockwise size={18} className={busy ? "spin" : undefined} aria-hidden="true" />
                  </button>
                </header>
                <div className="test-card-badges">
                  <StatusPill result={result} testing={busy} />
                  {!busy && result?.region && <span className="test-region">{flag && <span aria-hidden="true">{flag}</span>}{result.region}</span>}
                </div>
                {!busy && result?.detail && <p className="test-card-detail" data-tip={result.detail}>{result.detail}</p>}
                <footer><time>{busy ? "检测中…" : formatTime(result?.checkedAt)}</time></footer>
              </article>
            );
          })}
          {services.length === 0 && !error && <p className="empty-state">正在读取检测项目…</p>}
        </div>
      ) : (
        <div className="test-grid" role="list" aria-label="网站延迟">
          {sites.map((site) => {
            const result = latencyResults[site.id];
            const busy = testing.has(site.id);
            let host = site.url;
            try { host = new URL(site.url).host; } catch { /* keep the raw value */ }
            return (
              <article className="test-card latency-card" key={site.id} role="listitem" aria-label={site.name}>
                <header>
                  <span className="latency-avatar" aria-hidden="true">{Array.from(site.name)[0]?.toUpperCase()}</span>
                  <div>
                    <h2>{site.name}</h2>
                    <small data-tip={site.url}>{host}</small>
                  </div>
                  {site.custom && (
                    <button type="button" className="icon-button danger-icon-button" aria-label={`删除 ${site.name}`} data-tip="删除" onClick={() => removeSite(site)}>
                      <Trash size={16} aria-hidden="true" />
                    </button>
                  )}
                </header>
                <button
                  type="button"
                  className="latency-value"
                  data-tone={busy ? "testing" : result ? delayTone(result.delay) : "untested"}
                  aria-label={`测试 ${site.name}`}
                  data-tip={result?.error || "点击测试"}
                  disabled={busy}
                  onClick={() => void checkLatency(site)}
                >
                  {busy ? <CircleNotch className="spin" size={20} aria-hidden="true" /> : result ? (result.delay !== null ? <>{result.delay}<small>ms</small></> : "超时") : <><Gauge size={20} aria-hidden="true" />测试</>}
                </button>
                <footer><time>{formatTime(result?.checkedAt)}</time></footer>
              </article>
            );
          })}
        </div>
      )}

      {adding && (
        <dialog open className="provider-dialog" aria-labelledby="add-site-title">
          <div className="dialog-backdrop" aria-hidden="true" onClick={() => setAdding(false)} />
          <form className="confirm-modal" onSubmit={addSite}>
            <h2 id="add-site-title">添加测试网站</h2>
            <label className="form-control">
              <span>名称</span>
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：Netflix" />
            </label>
            <label className="form-control">
              <span>网址</span>
              <input required type="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://www.netflix.com" />
            </label>
            <div className="provider-modal-actions">
              <button type="button" className="button button-secondary compact-button" onClick={() => setAdding(false)}>取消</button>
              <button type="submit" className="button button-primary compact-button">添加并测试</button>
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
