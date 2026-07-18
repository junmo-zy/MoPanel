import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import type { ManagedAutoGroup, ManagedAutoGroupInput } from "../api/auto-group-manager";
import type { ProviderProxyNode } from "../api/types";

interface AutoGroupEditorDialogProps {
  group: ManagedAutoGroup | null;
  providerNodes: ProviderProxyNode[];
  defaultTestUrl: string;
  saving: boolean;
  onClose: () => void;
  onSave: (group: ManagedAutoGroupInput) => Promise<void>;
}

interface Draft {
  name: string;
  url: string;
  intervalMinutes: number;
  tolerance: number;
  nodes: ManagedAutoGroupInput["nodes"];
}

function createDraft(group: ManagedAutoGroup | null, defaultTestUrl: string): Draft {
  return {
    name: group?.name || "",
    url: group?.url || defaultTestUrl,
    intervalMinutes: Math.max(1, Math.round((group?.interval || 300) / 60)),
    tolerance: group?.tolerance ?? 50,
    nodes: group?.nodes || [],
  };
}

function nodeKey(provider: string, name: string) {
  return `${provider}\u0000${name}`;
}

function delayText(delay: number | null) {
  return typeof delay === "number" && delay > 0 ? `${delay} ms` : "未测速";
}

export function AutoGroupEditorDialog({
  group,
  providerNodes,
  defaultTestUrl,
  saving,
  onClose,
  onSave,
}: AutoGroupEditorDialogProps) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(group, defaultTestUrl));
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const selectedKeys = useMemo(
    () => new Set(draft.nodes.map((node) => nodeKey(node.provider, node.name))),
    [draft.nodes],
  );
  const visibleByProvider = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const grouped = new Map<string, ProviderProxyNode[]>();
    for (const node of providerNodes) {
      const matches = !normalizedQuery
        || node.name.toLocaleLowerCase().includes(normalizedQuery)
        || node.provider.toLocaleLowerCase().includes(normalizedQuery);
      if (!matches) continue;
      const existing = grouped.get(node.provider) || [];
      existing.push(node);
      grouped.set(node.provider, existing);
    }
    return [...grouped.entries()];
  }, [providerNodes, query]);

  function toggleNode(node: ProviderProxyNode) {
    const key = nodeKey(node.provider, node.name);
    setError("");
    setDraft((current) => {
      const exists = current.nodes.some((item) => nodeKey(item.provider, item.name) === key);
      if (exists) {
        return { ...current, nodes: current.nodes.filter((item) => nodeKey(item.provider, item.name) !== key) };
      }
      if (current.nodes.some((item) => item.name === node.name && item.provider !== node.provider)) {
        setError(`“${node.name}”在多个订阅中重名，请只保留一个来源。`);
        return current;
      }
      return { ...current, nodes: [...current.nodes, { provider: node.provider, name: node.name }] };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.nodes.length === 0) {
      setError("请至少选择一个候选节点。");
      return;
    }
    await onSave({
      name: draft.name.trim(),
      url: draft.url.trim(),
      interval: Math.max(60, Math.round(draft.intervalMinutes) * 60),
      tolerance: Math.max(0, Math.round(draft.tolerance)),
      nodes: draft.nodes,
    });
  }

  return (
    <dialog open className="provider-dialog auto-group-dialog" aria-labelledby="auto-group-editor-title">
      <div className="auto-group-backdrop" aria-hidden="true" onClick={saving ? undefined : onClose} />
      <form className="provider-modal auto-group-modal" onSubmit={submit}>
        <div className="provider-modal-header">
          <div>
            <h2 id="auto-group-editor-title">{group ? "编辑自动组" : "新建自动组"}</h2>
            <p>选择候选节点后，Mihomo 会根据测速延迟自动选用更快的节点。</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose} disabled={saving}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="provider-form-grid auto-group-form-grid">
          <label className="form-control form-control-wide">
            <span>代理组名称</span>
            <input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：低延迟优选" />
          </label>
          <label className="form-control form-control-wide">
            <span>测速地址 <small>默认沿用设置中的地址</small></span>
            <input required type="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
          </label>
          <label className="form-control">
            <span>测速间隔（分钟）</span>
            <input required min="1" type="number" value={draft.intervalMinutes} onChange={(event) => setDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 0 }))} />
          </label>
          <label className="form-control">
            <span>延迟容差（毫秒） <small>差距小于此值时避免频繁切换</small></span>
            <input required min="0" type="number" value={draft.tolerance} onChange={(event) => setDraft((current) => ({ ...current, tolerance: Number(event.target.value) || 0 }))} />
          </label>
        </div>

        <div className="auto-group-candidates">
          <div className="auto-group-candidates-heading">
            <div>
              <strong>候选节点</strong>
              <small>已选 {draft.nodes.length} 个。测速和自动切换由 Mihomo 在后台完成。</small>
            </div>
            <label className="search-field auto-group-search">
              <MagnifyingGlass size={17} aria-hidden="true" />
              <span className="sr-only">搜索候选节点</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点或订阅" />
            </label>
          </div>
          <div className="auto-group-node-list">
            {visibleByProvider.map(([provider, nodes]) => (
              <section className="auto-group-provider" key={provider} aria-label={`${provider} 节点`}>
                <h3>{provider}<small>{nodes.length} 个节点</small></h3>
                {nodes.map((node) => {
                  const selected = selectedKeys.has(nodeKey(node.provider, node.name));
                  const duplicateSelected = !selected && draft.nodes.some((item) => item.name === node.name && item.provider !== node.provider);
                  return (
                    <label className="auto-group-node" key={nodeKey(node.provider, node.name)} data-selected={selected}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={saving || duplicateSelected}
                        onChange={() => toggleNode(node)}
                        aria-label={node.name}
                      />
                      <span className="auto-group-node-name"><strong>{node.name}</strong><small>{node.type} · {node.alive ? "可用" : "不可用"}</small></span>
                      <span className={node.delay && node.delay < 100 ? "healthy-text" : "warning-text"}>{delayText(node.delay)}</span>
                    </label>
                  );
                })}
              </section>
            ))}
            {visibleByProvider.length === 0 && <p className="empty-state">没有匹配的订阅节点。</p>}
          </div>
        </div>
        {error && <p className="inline-error auto-group-error" role="alert">{error}</p>}
        <div className="provider-modal-actions">
          <button type="button" className="button button-secondary compact-button" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="button button-primary compact-button" disabled={saving}>{saving ? "正在保存…" : "保存自动组"}</button>
        </div>
      </form>
    </dialog>
  );
}
