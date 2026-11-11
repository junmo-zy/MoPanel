import {
  CaretDown,
  CheckCircle,
  CircleNotch,
  Crosshair,
  Gauge,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Power,
  SortAscending,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AutoGroupManagerClient, ManagedAutoGroup, ManagedAutoGroupInput } from "../api/auto-group-manager";
import type { ProviderProxyNode, ProxyGroup, ProxyMode, ProxyNode } from "../api/types";
import { isManualProxyGroup, proxyActivationLabel, proxyGroupTypeLabel } from "../proxy-context";
import { delayRank, delayText, delayToneOf } from "../delay";
import { liveDelay, type DelayView } from "../hooks/useDelayTester";
import { AutoGroupEditorDialog } from "./AutoGroupEditorDialog";
import { LoadMore } from "./LoadMore";
import { PageHeader } from "./PageHeader";

interface ProxiesPageProps {
  groups: ProxyGroup[];
  providerNodes: ProviderProxyNode[];
  manager: AutoGroupManagerClient;
  speedTestUrl: string;
  onTestGroup: (name: string) => Promise<void>;
  onTestAll: () => Promise<void>;
  onRefresh: () => Promise<unknown>;
  mode: ProxyMode;
  onModeChange?: (mode: ProxyMode) => void;
  onSelectNode?: (group: string, node: string) => Promise<void>;
  onTestNode?: (node: ProxyNode, groupName?: string) => Promise<number>;
  // Live per-node test state shared with the rest of the app.
  delays?: DelayView;
  activeProxyGroupName: string | null;
  onUseAutoGroup: (name: string) => Promise<void>;
}

type EditorState = "new" | ManagedAutoGroup | null;
type SortMode = "default" | "delay" | "name";

const EXPANDED_STORAGE_KEY = "mopanel:proxy-groups-open";
const SORT_STORAGE_KEY = "mopanel:proxy-node-sort";
const SORT_LABELS: Record<SortMode, string> = { default: "默认排序", delay: "按延迟排序", name: "按名称排序" };
const NEXT_SORT: Record<SortMode, SortMode> = { default: "delay", delay: "name", name: "default" };
const MODES: Array<[ProxyMode, string]> = [["rule", "规则"], ["global", "全局"], ["direct", "直连"]];
// Large subscriptions put hundreds of nodes in one group (GLOBAL, 节点选择);
// render them in batches so expanding a group stays instant.
const NODE_BATCH = 120;


function loadExpanded(): Set<string> | null {
  try {
    const saved = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((item) => typeof item === "string")) : null;
  } catch {
    return null;
  }
}

function saveExpanded(names: Set<string>) {
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...names]));
  } catch {
    // Collapsing still works for this visit when storage is unavailable.
  }
}

function loadSorts(): Record<string, SortMode> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SORT_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === "delay" || value === "name")) as Record<string, SortMode>;
  } catch {
    return {};
  }
}

function sortNodes(nodes: ProxyNode[], sort: SortMode, rankOf: (node: ProxyNode) => number) {
  if (sort === "default") return nodes;
  const sorted = [...nodes];
  if (sort === "name") {
    sorted.sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  } else {
    // Measured fastest first, then timeouts, then untested (like Clash Verge).
    sorted.sort((left, right) => rankOf(left) - rankOf(right));
  }
  return sorted;
}

// Rule mode never consults GLOBAL, so it would only be noise there; in global
// mode it is the entry point and goes first.
function visibleGroups(groups: ProxyGroup[], mode: ProxyMode) {
  const global = groups.find((group) => group.name === "GLOBAL");
  const others = groups.filter((group) => group.name !== "GLOBAL");
  if (mode === "global" && global) return [global, ...others];
  return others.length > 0 ? others : groups;
}

function groupTypeTip(type: string) {
  switch (type.replace(/[\s_-]/g, "").toLowerCase()) {
    case "selector": return "手动选择：点击下方节点即可切换";
    case "urltest": return "自动选优：Mihomo 按延迟自动选择最快的节点";
    case "fallback": return "故障转移：按顺序使用第一个可用的节点";
    case "loadbalance": return "负载均衡：在多个节点之间分摊流量";
    default: return `Mihomo 类型：${type}`;
  }
}

function groupMonogram(name: string) {
  return Array.from(name.replace(/[^\p{L}\p{N}]/gu, "") || name)[0]?.toUpperCase() || "?";
}

function GroupAvatar({ group }: { group: ProxyGroup }) {
  const [broken, setBroken] = useState(false);
  if (group.icon && !broken) {
    return (
      <span className="proxy-group-avatar">
        <img src={group.icon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      </span>
    );
  }
  return <span className="proxy-group-avatar" aria-hidden="true">{groupMonogram(group.name)}</span>;
}

export function ProxiesPage({
  groups,
  providerNodes,
  manager,
  speedTestUrl,
  onTestGroup,
  onTestAll,
  onRefresh,
  mode,
  onModeChange,
  onSelectNode,
  onTestNode,
  delays,
  activeProxyGroupName,
  onUseAutoGroup,
}: ProxiesPageProps) {
  const [testingAll, setTestingAll] = useState(false);
  const [localTesting, setLocalTesting] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [managedGroups, setManagedGroups] = useState<ManagedAutoGroup[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<ManagedAutoGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [usingGroup, setUsingGroup] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string> | null>(loadExpanded);
  const [sorts, setSorts] = useState<Record<string, SortMode>>(loadSorts);
  const [searchOpen, setSearchOpen] = useState<Set<string>>(() => new Set());
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const groupRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let active = true;
    manager.list()
      .then((items) => {
        if (active) setManagedGroups(items);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法读取自定义自动组。");
      });
    return () => { active = false; };
  }, [manager]);

  const managedByName = useMemo(
    () => new Map(managedGroups.map((group) => [group.name, group])),
    [managedGroups],
  );
  const groupsByName = useMemo(() => new Map(groups.map((group) => [group.name, group])), [groups]);
  const shownGroups = useMemo(() => visibleGroups(groups, mode), [groups, mode]);
  // First visit: open only the group the user is most likely to change.
  const openGroups = expanded ?? new Set(shownGroups.slice(0, 1).map((group) => group.name));
  const activationLabel = proxyActivationLabel(mode);
  const canActivateGroup = mode !== "direct";

  // PROXY -> 自动选择 -> 香港 01: show the node that actually carries traffic.
  function currentChain(group: ProxyGroup) {
    const chain = [group.current];
    const visited = new Set([group.name]);
    let child = groupsByName.get(group.current);
    while (child && !visited.has(child.name) && chain.length < 4) {
      visited.add(child.name);
      chain.push(child.current);
      child = groupsByName.get(child.current);
    }
    return chain.join(" → ");
  }

  // The node that actually carries the group's traffic (PROXY -> AUTO -> 香港 01).
  function leafNode(group: ProxyGroup): ProxyNode | undefined {
    const visited = new Set([group.name]);
    let current = group;
    let node = current.nodes.find((item) => item.name === current.current);
    while (node && groupsByName.has(node.name) && !visited.has(node.name)) {
      visited.add(node.name);
      current = groupsByName.get(node.name) as ProxyGroup;
      node = current.nodes.find((item) => item.name === current.current);
    }
    return node;
  }

  function setOpen(name: string, open: boolean) {
    const next = new Set(openGroups);
    if (open) next.add(name);
    else next.delete(name);
    setExpanded(next);
    saveExpanded(next);
  }

  function cycleSort(name: string) {
    const next = { ...sorts, [name]: NEXT_SORT[sorts[name] || "default"] };
    if (next[name] === "default") delete next[name];
    setSorts(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Sorting still applies for this visit.
    }
  }

  function toggleSearch(name: string) {
    const next = new Set(searchOpen);
    if (next.has(name)) {
      next.delete(name);
      setQueries((current) => ({ ...current, [name]: "" }));
    } else {
      next.add(name);
      setOpen(name, true);
    }
    setSearchOpen(next);
  }

  function scrollToGroup(name: string) {
    setOpen(name, true);
    window.requestAnimationFrame(() => {
      groupRefs.current.get(name)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
  }

  function viewOf(node: ProxyNode) {
    return liveDelay(delays, node);
  }

  function groupNodes(group: ProxyGroup) {
    const query = (queries[group.name] || "").trim().toLowerCase();
    // While a batch is running the order stays put (Clash Verge defers
    // re-sorting until every result is in), so cards do not jump under the pointer.
    const settled = !delays?.progress.has(group.name) && !delays?.progress.has("*");
    return sortNodes(
      query ? group.nodes.filter((node) => node.name.toLowerCase().includes(query)) : group.nodes,
      sorts[group.name] || "default",
      (node) => {
        const view = settled ? viewOf(node) : node;
        return delayRank(view.delay, view.alive);
      },
    );
  }

  function showMore(name: string, atLeast = 0) {
    setLimits((current) => {
      const next = Math.max((current[name] || NODE_BATCH) + NODE_BATCH, atLeast);
      return { ...current, [name]: next };
    });
  }

  function locateCurrent(group: ProxyGroup) {
    setOpen(group.name, true);
    // Make sure the current node is rendered before scrolling to it.
    const index = groupNodes(group).findIndex((node) => node.name === group.current);
    if (index >= (limits[group.name] || NODE_BATCH)) showMore(group.name, index + 1);
    window.requestAnimationFrame(() => {
      const card = groupRefs.current.get(group.name)
        ?.querySelector<HTMLElement>(`[data-node="${CSS.escape(group.current)}"]`);
      // Smooth-scrolling across hundreds of cards is slow and easily
      // interrupted; jump when the target is more than two screens away.
      const distance = card ? Math.abs(card.getBoundingClientRect().top - window.innerHeight / 2) : 0;
      card?.scrollIntoView?.({ block: "center", behavior: distance > window.innerHeight * 2 ? "auto" : "smooth" });
      card?.classList.add("node-card-flash");
      window.setTimeout(() => card?.classList.remove("node-card-flash"), 900);
    });
  }

  function markLocal(key: string, on: boolean) {
    setLocalTesting((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function testGroup(name: string) {
    // Local mark covers callers that do not pass shared delay state.
    markLocal(`group:${name}`, true);
    try {
      await onTestGroup(name);
    } catch {
      // The shared notice reports the failure.
    } finally {
      markLocal(`group:${name}`, false);
    }
  }

  async function testNode(node: ProxyNode, group: ProxyGroup) {
    if (!onTestNode) return;
    markLocal(`node:${node.name}`, true);
    try {
      await onTestNode(node, group.name);
    } catch {
      // A failed test shows up as 超时.
    } finally {
      markLocal(`node:${node.name}`, false);
    }
  }

  async function selectNode(group: ProxyGroup, node: ProxyNode) {
    if (!onSelectNode || node.name === group.current || pendingSelection) return;
    setPendingSelection(`${group.name}\u0000${node.name}`);
    try {
      await onSelectNode(group.name, node.name);
    } finally {
      setPendingSelection(null);
    }
  }

  async function testAll() {
    setTestingAll(true);
    try {
      await onTestAll();
    } finally {
      setTestingAll(false);
    }
  }

  async function saveAutoGroup(input: ManagedAutoGroupInput) {
    const original = editor === "new" || !editor ? null : editor;
    setSaving(true);
    setError("");
    try {
      const next = original
        ? await manager.update(original.name, input)
        : await manager.create(input);
      setManagedGroups(next);
      setEditor(null);
      setOpen(input.name, true);
      try {
        await onTestGroup(input.name);
      } catch {
        setError("自动组已保存，但首次测速失败；Mihomo 仍会在后台继续自动选择节点。");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动组保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function removeAutoGroup() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    try {
      setManagedGroups(await manager.remove(deleting.name));
      setDeleting(null);
      await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动组删除失败。");
    } finally {
      setSaving(false);
    }
  }

  async function activateAutoGroup(group: ManagedAutoGroup) {
    setUsingGroup(group.name);
    setError("");
    try {
      setManagedGroups(await manager.attach(group.name));
      await onUseAutoGroup(group.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "启用自动组失败。");
    } finally {
      setUsingGroup(null);
    }
  }

  function renderNode(group: ProxyGroup, node: ProxyNode, manual: boolean) {
    const selected = node.name === group.current;
    const view = viewOf(node);
    const testing = view.testing || localTesting.has(`node:${node.name}`) || (!delays && localTesting.has(`group:${group.name}`));
    const tone = testing ? "testing" : delayToneOf(view.delay, view.alive);
    const resultAt = delays?.results.get(node.name)?.at;
    const pending = pendingSelection === `${group.name}\u0000${node.name}`;
    const childGroup = groupsByName.get(node.name);
    const typeLabel = childGroup ? proxyGroupTypeLabel(childGroup.type) : node.type;
    const body = (
      <>
        <span className="node-card-name" data-tip={node.name} data-tip-auto="">{node.name}</span>
        <span className="node-card-tags">
          <span className="node-tag">{typeLabel}</span>
          {node.udp && <span className="node-tag">UDP</span>}
          {childGroup && <span className="node-card-child" data-tip={`当前：${childGroup.current}`}>{childGroup.current}</span>}
        </span>
      </>
    );
    return (
      <div className="node-card" data-node={node.name} data-selected={selected} data-alive={view.alive} data-testing={testing} key={node.name}>
        {manual ? (
          <button
            type="button"
            className="node-card-main"
            aria-label={node.name}
            aria-pressed={selected}
            disabled={pendingSelection !== null}
            onClick={() => void selectNode(group, node)}
          >
            {body}
          </button>
        ) : (
          <div className="node-card-main" aria-current={selected ? "true" : undefined}>{body}</div>
        )}
        <span className="node-card-side">
          {pending
            ? <CircleNotch className="spin" size={16} aria-label="切换中" />
            : selected && <CheckCircle size={19} weight="fill" className="node-card-check" aria-hidden="true" />}
          <button
            type="button"
            className="node-delay"
            data-tone={tone}
            aria-label={`测速 ${node.name}`}
            aria-busy={testing}
            data-tip={testing ? "正在测速…" : tone === "untested" ? "点击测速" : "点击重新测速"}
            disabled={testing || !onTestNode}
            onClick={() => void testNode(node, group)}
          >
            {testing
              ? <span className="delay-dots" aria-label="测速中"><i /><i /><i /></span>
              : <span className="delay-value" key={resultAt ?? "history"}>{delayText(view.delay, view.alive)}</span>}
          </button>
        </span>
      </div>
    );
  }

  return (
    <section className="page proxies-page">
      <PageHeader
        title="代理"
        description="展开代理组，点击节点即可切换；点击延迟可单独测速。"
        action={(
          <div className="proxy-page-actions">
            <div className="segmented-control proxy-mode-control" role="group" aria-label="代理模式">
              {MODES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={value === mode}
                  disabled={!onModeChange}
                  onClick={() => { if (value !== mode) onModeChange?.(value); }}
                >{label}</button>
              ))}
            </div>
            <button type="button" className="button button-secondary" onClick={testAll} disabled={testingAll || groups.length === 0}>
              <Gauge size={18} aria-hidden="true" className={testingAll ? "pulse" : undefined} />
              {delays?.progress.get("*") ? `测速中 ${delays.progress.get("*")?.done}/${delays.progress.get("*")?.total}` : testingAll ? "测速中…" : "全部测速"}
            </button>
            <button type="button" className="button button-primary" onClick={() => { setError(""); setEditor("new"); }} disabled={saving}>
              <Plus size={18} aria-hidden="true" />新建自动组
            </button>
          </div>
        )}
      />
      {error && !editor && !deleting && <p className="inline-error" role="alert">{error}</p>}
      {mode === "direct" && (
        <p className="proxy-mode-note">当前为直连模式，所有流量都不经过代理组；切换到规则或全局后，这里的选择才会生效。</p>
      )}

      <div className="proxy-groups-layout" data-rail={shownGroups.length > 3}>
        <div className="proxy-groups">
          {shownGroups.map((group) => {
            const managed = managedByName.get(group.name);
            const isActiveAutoGroup = managed?.name === activeProxyGroupName;
            const manual = isManualProxyGroup(group);
            const open = openGroups.has(group.name);
            const query = (queries[group.name] || "").trim().toLowerCase();
            const sort = sorts[group.name] || "default";
            const nodes = groupNodes(group);
            const limit = limits[group.name] || NODE_BATCH;
            const progress = delays?.progress.get(group.name);
            const testing = Boolean(progress) || localTesting.has(`group:${group.name}`);
            const leaf = leafNode(group);
            const leafView = leaf ? viewOf(leaf) : null;
            const headerDelay = leafView ? leafView.delay : group.delay;
            const panelId = `proxy-group-${encodeURIComponent(group.name)}`;
            return (
              <section
                className="proxy-group-card"
                data-open={open}
                key={group.name}
                aria-label={group.name}
                ref={(element) => {
                  if (element) groupRefs.current.set(group.name, element);
                  else groupRefs.current.delete(group.name);
                }}
              >
                <header className="proxy-group-header">
                  <button
                    type="button"
                    className="proxy-group-toggle"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label={`${open ? "收起" : "展开"} ${group.name}`}
                    onClick={() => setOpen(group.name, !open)}
                  >
                    <GroupAvatar group={group} />
                    <span className="proxy-group-title">
                      <strong>{group.name}{managed && <small className="custom-group-badge">自定义</small>}</strong>
                      <span className="proxy-group-meta">
                        <span className="node-tag node-tag-accent" data-tip={groupTypeTip(group.type)}>{proxyGroupTypeLabel(group.type)}</span>
                        <span className="proxy-group-current" data-tip={`当前使用：${currentChain(group)}`}>{currentChain(group)}</span>
                        {progress
                          ? <span className="proxy-group-delay" data-tone="testing">测速中 {progress.done}/{progress.total}</span>
                          : headerDelay !== null && headerDelay > 0 && <span className="proxy-group-delay" data-tone={delayToneOf(headerDelay)}>{headerDelay} ms</span>}
                      </span>
                    </span>
                  </button>
                  <div className="proxy-group-tools">
                    <button type="button" className="icon-button" aria-label={`定位 ${group.name} 当前节点`} data-tip="定位：滚动到本组当前使用的节点" onClick={() => locateCurrent(group)}>
                      <Crosshair size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-button" aria-label={`整组测速 ${group.name}`} data-tip={testing ? "正在测速…" : "测速：逐个测试本组所有节点的延迟"} onClick={() => void testGroup(group.name)} disabled={testing}>
                      {testing ? <Gauge size={18} className="pulse" aria-hidden="true" /> : <Gauge size={18} aria-hidden="true" />}
                    </button>
                    <button type="button" className="icon-button" data-active={sort !== "default"} aria-label={`${group.name} 排序，当前${SORT_LABELS[sort]}`} data-tip={`排序（当前：${SORT_LABELS[sort]}）：点击在 默认 → 按延迟 → 按名称 之间切换`} onClick={() => cycleSort(group.name)}>
                      <SortAscending size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-button" data-active={searchOpen.has(group.name)} aria-label={`搜索 ${group.name} 节点`} data-tip="搜索：按名称筛选本组节点" onClick={() => toggleSearch(group.name)}>
                      <MagnifyingGlass size={18} aria-hidden="true" />
                    </button>
                    {managed && (
                      <>
                        <button
                          type="button"
                          className="icon-button"
                          data-active={isActiveAutoGroup}
                          aria-label={`${isActiveAutoGroup ? "正在使用" : activationLabel} ${group.name}`}
                          data-tip={!canActivateGroup ? "请先切换到规则或全局模式" : isActiveAutoGroup ? "正在使用" : activationLabel}
                          onClick={() => void activateAutoGroup(managed)}
                          disabled={saving || usingGroup !== null || isActiveAutoGroup || !canActivateGroup}
                        >
                          {usingGroup === group.name ? <CircleNotch className="spin" size={18} aria-hidden="true" /> : <Power size={18} aria-hidden="true" />}
                        </button>
                        <button type="button" className="icon-button" aria-label={`编辑 ${group.name}`} data-tip="编辑这个自动组的候选节点和测速参数" onClick={() => { setError(""); setEditor(managed); }} disabled={saving}>
                          <PencilSimple size={18} aria-hidden="true" />
                        </button>
                        <button type="button" className="icon-button danger-icon-button" aria-label={`删除 ${group.name}`} data-tip="删除这个自动组（不会删除订阅和节点）" onClick={() => { setError(""); setDeleting(managed); }} disabled={saving}>
                          <Trash size={18} aria-hidden="true" />
                        </button>
                      </>
                    )}
                    <span className="proxy-group-count" data-tip={`本组共 ${group.nodes.length} 个节点`}>{group.nodes.length}</span>
                    <button type="button" className="icon-button proxy-group-caret" aria-hidden="true" tabIndex={-1} data-tip={open ? "收起" : "展开"} onClick={() => setOpen(group.name, !open)}>
                      <CaretDown size={18} />
                    </button>
                  </div>
                </header>

                {progress && (
                  <div className="proxy-group-progress" role="progressbar" aria-label={`${group.name} 测速进度`} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                    <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                )}
                {open && (
                  <div className="proxy-group-body" id={panelId}>
                    {!manual && (
                      <p className="proxy-group-hint">
                        {proxyGroupTypeLabel(group.type)}组由 Mihomo 自动决定使用哪个节点，这里只能查看和测速。
                      </p>
                    )}
                    {searchOpen.has(group.name) && (
                      <label className="search-field proxy-group-search">
                        <MagnifyingGlass size={17} aria-hidden="true" />
                        <span className="sr-only">搜索 {group.name} 节点</span>
                        <input
                          autoFocus
                          value={queries[group.name] || ""}
                          onChange={(event) => setQueries((current) => ({ ...current, [group.name]: event.target.value }))}
                          placeholder="搜索节点"
                        />
                        <button type="button" className="icon-button" aria-label="关闭搜索" onClick={() => toggleSearch(group.name)}>
                          <X size={15} aria-hidden="true" />
                        </button>
                      </label>
                    )}
                    <div className="node-grid">
                      {nodes.slice(0, limit).map((node) => renderNode(group, node, manual))}
                    </div>
                    {nodes.length > limit && (
                      <LoadMore remaining={nodes.length - limit} onMore={() => showMore(group.name)} />
                    )}
                    {nodes.length === 0 && <p className="empty-state">{query ? "没有匹配的节点" : "此代理组没有节点"}</p>}
                  </div>
                )}
              </section>
            );
          })}
          {shownGroups.length === 0 && <p className="empty-state proxy-groups-empty">当前配置没有可选择的代理组</p>}
        </div>

        {shownGroups.length > 3 && (
          <nav className="proxy-group-rail" aria-label="快速跳转代理组">
            {shownGroups.map((group) => (
              <button type="button" key={group.name} data-tip={`跳转到 ${group.name}`} aria-label={`跳转到 ${group.name}`} onClick={() => scrollToGroup(group.name)}>
                <GroupAvatar group={group} />
              </button>
            ))}
          </nav>
        )}
      </div>

      {editor && (
        <AutoGroupEditorDialog
          key={editor === "new" ? "new" : editor.name}
          group={editor === "new" ? null : editor}
          providerNodes={providerNodes}
          defaultTestUrl={speedTestUrl}
          saving={saving}
          saveError={error}
          onClose={() => { setEditor(null); setError(""); }}
          onSave={saveAutoGroup}
        />
      )}
      {deleting && (
        <dialog open className="provider-dialog auto-group-dialog" aria-labelledby="delete-auto-group-title">
          <div className="auto-group-backdrop" aria-hidden="true" onClick={saving ? undefined : () => { setDeleting(null); setError(""); }} />
          <div className="confirm-modal">
            <h2 id="delete-auto-group-title">删除自动组</h2>
            <p>确定删除“{deleting.name}”吗？不会删除原订阅或节点。</p>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="provider-modal-actions">
              <button type="button" className="button button-secondary compact-button" onClick={() => { setDeleting(null); setError(""); }} disabled={saving}>取消</button>
              <button type="button" className="button button-danger compact-button" onClick={removeAutoGroup} disabled={saving}>确认删除</button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
