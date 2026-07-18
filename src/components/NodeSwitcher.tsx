import { CheckCircle, Gauge, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProxyGroup, ProxyNode } from "../api/types";
import { isManualProxyGroup, proxyGroupTypeLabel } from "../proxy-context";

interface NodeSwitcherProps {
  group: ProxyGroup;
  onClose: () => void;
  onSelect: (group: string, node: string) => Promise<void>;
  onTest: (node: ProxyNode) => Promise<number>;
  onTestGroup: (group: string) => Promise<void>;
}

export function NodeSwitcher({ group, onClose, onSelect, onTest, onTestGroup }: NodeSwitcherProps) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testingGroup, setTestingGroup] = useState(false);
  const [testError, setTestError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const groupType = group.type.replace(/[\s_-]/g, "").toLowerCase();
  const isManual = isManualProxyGroup(group);
  const isAutomatic = groupType === "urltest";
  const dialogTitle = isManual ? "选择节点" : proxyGroupTypeLabel(group.type);
  const managementNote = isAutomatic
    ? "此组会按延迟自动切换节点。"
    : isManual
      ? "点击节点即可切换当前代理。"
      : "此代理组由 Mihomo 自动管理。";
  const nodes = useMemo(
    () => group.nodes.filter((node) => node.name.toLowerCase().includes(query.trim().toLowerCase())),
    [group.nodes, query],
  );

  useEffect(() => {
    searchInputRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function selectNode(name: string) {
    setPending(name);
    try {
      await onSelect(group.name, name);
    } finally {
      setPending(null);
    }
  }

  async function testNode(node: ProxyNode) {
    setTesting(node.name);
    setTestError("");
    try {
      await onTest(node);
    } catch {
      setTestError(`“${node.name}”测速失败，请检查测速地址或节点状态。`);
    } finally {
      setTesting(null);
    }
  }

  async function testGroup() {
    setTestingGroup(true);
    setTestError("");
    try {
      await onTestGroup(group.name);
    } catch {
      setTestError("全部测速失败，请检查测速地址或节点状态。");
    } finally {
      setTestingGroup(false);
    }
  }

  return (
    <dialog open className="node-dialog" aria-labelledby="node-dialog-title" aria-modal="true" data-presentation="modal">
      <div className="node-backdrop" aria-hidden="true" onClick={onClose} />
      <section className="node-modal">
        <header className="node-modal-header">
          <div>
            <span className="eyebrow">{group.name}</span>
            <h2 id="node-dialog-title">{dialogTitle}</h2>
          </div>
          <div className="node-modal-actions">
            <button type="button" className="button button-secondary compact-button node-test-all" onClick={testGroup} disabled={testingGroup}>
              <Gauge size={18} aria-hidden="true" />{testingGroup ? "测速中…" : "测速此组"}
            </button>
            <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={22} aria-hidden="true" /></button>
          </div>
        </header>

        <p className="node-auto-note">{managementNote}</p>
        <label className="search-field">
          <MagnifyingGlass size={19} aria-hidden="true" />
          <span className="sr-only">搜索节点</span>
          <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" />
        </label>
        {testError && <p className="inline-error node-test-error" role="alert">{testError}</p>}

        <div className="node-list">
          {nodes.map((node) => (
            <div className="node-option" data-selected={node.name === group.current} key={node.name}>
              {!isManual ? (
                <div className="node-select node-select-static" aria-current={node.name === group.current ? "true" : undefined}>
                  <span className="node-radio" aria-hidden="true">{node.name === group.current && <CheckCircle size={22} weight="fill" />}</span>
                  <span><strong>{node.name}</strong><small>{node.type} · {node.alive ? "可用" : "不可用"}{node.name === group.current ? " · 当前使用" : ""}</small></span>
                  <span className={node.delay && node.delay < 100 ? "healthy-text" : "warning-text"}>{testing === node.name ? "测速中…" : node.delay ? `${node.delay} ms` : "—"}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="node-select"
                  aria-label={`${node.name} ${node.delay ? `${node.delay} ms` : "未测速"}`}
                  aria-pressed={node.name === group.current}
                  disabled={pending !== null || testingGroup}
                  onClick={() => selectNode(node.name)}
                >
                  <span className="node-radio" aria-hidden="true">{node.name === group.current && <CheckCircle size={22} weight="fill" />}</span>
                  <span><strong>{node.name}</strong><small>{node.type} · {node.alive ? "可用" : "不可用"}</small></span>
                  <span className={node.delay && node.delay < 100 ? "healthy-text" : "warning-text"}>{pending === node.name ? "切换中…" : testing === node.name ? "测速中…" : node.delay ? `${node.delay} ms` : "—"}</span>
                </button>
              )}
              <button type="button" className="icon-button node-test" aria-label={`测试 ${node.name}`} onClick={() => testNode(node)} disabled={testing !== null || testingGroup}>
                <Gauge size={19} aria-hidden="true" />
              </button>
            </div>
          ))}
          {nodes.length === 0 && <p className="empty-state">没有匹配的节点</p>}
        </div>
      </section>
    </dialog>
  );
}
