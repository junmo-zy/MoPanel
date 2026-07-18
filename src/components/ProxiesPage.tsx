import { CaretRight, Gauge, PencilSimple, Plus, Power, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { AutoGroupManagerClient, ManagedAutoGroup, ManagedAutoGroupInput } from "../api/auto-group-manager";
import type { ProviderProxyNode, ProxyGroup, ProxyMode } from "../api/types";
import { proxyActivationLabel, proxyGroupTypeLabel } from "../proxy-context";
import { AutoGroupEditorDialog } from "./AutoGroupEditorDialog";
import { PageHeader } from "./PageHeader";

interface ProxiesPageProps {
  groups: ProxyGroup[];
  providerNodes: ProviderProxyNode[];
  manager: AutoGroupManagerClient;
  speedTestUrl: string;
  onOpenGroup: (name: string) => void;
  onTestGroup: (name: string) => Promise<void>;
  onRefresh: () => Promise<unknown>;
  mode: ProxyMode;
  activeProxyGroupName: string | null;
  onUseAutoGroup: (name: string) => Promise<void>;
}

type EditorState = "new" | ManagedAutoGroup | null;

export function ProxiesPage({
  groups,
  providerNodes,
  manager,
  speedTestUrl,
  onOpenGroup,
  onTestGroup,
  onRefresh,
  mode,
  activeProxyGroupName,
  onUseAutoGroup,
}: ProxiesPageProps) {
  const [testing, setTesting] = useState(false);
  const [managedGroups, setManagedGroups] = useState<ManagedAutoGroup[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<ManagedAutoGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [usingGroup, setUsingGroup] = useState<string | null>(null);
  const [error, setError] = useState("");

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
  const activationLabel = proxyActivationLabel(mode);
  const canActivateGroup = mode !== "direct";

  async function testAll() {
    setTesting(true);
    try {
      for (const group of groups) {
        await onTestGroup(group.name);
      }
    } catch {
      // The shared overview notice reports which policy group failed.
    } finally {
      setTesting(false);
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

  return (
    <section className="page">
      <PageHeader
        title="代理"
        description="选择代理组并切换节点，测速后查看实际延迟。"
        action={(
          <div className="proxy-page-actions">
            <button type="button" className="button button-secondary" onClick={testAll} disabled={testing}><Gauge size={19} />{testing ? "测速中…" : "全部测速"}</button>
            <button type="button" className="button button-primary" onClick={() => { setError(""); setEditor("new"); }} disabled={saving}><Plus size={19} />新建自动组</button>
          </div>
        )}
      />
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="simple-table proxy-table">
        <div className="table-head proxy-grid">
          <span>代理组</span><span>选择方式</span><span>当前节点</span><span>延迟</span><span />
        </div>
        {groups.map((group) => {
          const managed = managedByName.get(group.name);
          const isActiveAutoGroup = managed?.name === activeProxyGroupName;
          return (
            <div className="table-row proxy-grid proxy-table-row" key={group.name}>
              <button type="button" className="proxy-row-open" onClick={() => onOpenGroup(group.name)} aria-label={`查看 ${group.name}`}>
                <span className="proxy-group-name"><strong>{group.name}</strong>{managed && <small className="custom-group-badge">自定义</small>}</span>
                <span className="muted-text" title={`Mihomo 类型：${group.type}`}>{proxyGroupTypeLabel(group.type)}</span>
                <span>{group.current}</span>
                <span className={group.delay && group.delay < 100 ? "healthy-text" : "warning-text"}>{group.delay ? `${group.delay} ms` : "未测速"}</span>
                <CaretRight size={20} aria-hidden="true" />
              </button>
              {managed ? (
                <div className="row-actions proxy-row-actions">
                  <button
                    type="button"
                    className="button button-secondary compact-button auto-group-use-button"
                    aria-label={`${isActiveAutoGroup ? "正在使用" : activationLabel} ${group.name}`}
                    onClick={() => activateAutoGroup(managed)}
                    disabled={saving || usingGroup !== null || isActiveAutoGroup || !canActivateGroup}
                    title={canActivateGroup ? undefined : "请先切换到规则或全局模式"}
                  >
                    <Power size={16} aria-hidden="true" />{usingGroup === group.name ? "设置中…" : isActiveAutoGroup ? "正在使用" : activationLabel}
                  </button>
                  <button type="button" className="icon-button" aria-label={`编辑 ${group.name}`} onClick={() => { setError(""); setEditor(managed); }} disabled={saving}><PencilSimple size={18} aria-hidden="true" /></button>
                  <button type="button" className="icon-button danger-icon-button" aria-label={`删除 ${group.name}`} onClick={() => setDeleting(managed)} disabled={saving}><Trash size={18} aria-hidden="true" /></button>
                </div>
              ) : <span aria-hidden="true" />}
            </div>
          );
        })}
        {groups.length === 0 && <p className="empty-state">当前配置没有可选择的代理组</p>}
      </div>

      {editor && (
        <AutoGroupEditorDialog
          key={editor === "new" ? "new" : editor.name}
          group={editor === "new" ? null : editor}
          providerNodes={providerNodes}
          defaultTestUrl={speedTestUrl}
          saving={saving}
          onClose={() => setEditor(null)}
          onSave={saveAutoGroup}
        />
      )}
      {deleting && (
        <dialog open className="provider-dialog auto-group-dialog" aria-labelledby="delete-auto-group-title">
          <div className="auto-group-backdrop" aria-hidden="true" onClick={saving ? undefined : () => setDeleting(null)} />
          <div className="confirm-modal">
            <h2 id="delete-auto-group-title">删除自动组</h2>
            <p>确定删除“{deleting.name}”吗？不会删除原订阅或节点。</p>
            <div className="provider-modal-actions">
              <button type="button" className="button button-secondary compact-button" onClick={() => setDeleting(null)} disabled={saving}>取消</button>
              <button type="button" className="button button-danger compact-button" onClick={removeAutoGroup} disabled={saving}>确认删除</button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
