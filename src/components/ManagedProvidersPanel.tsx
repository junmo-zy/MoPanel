import { useEffect, useState } from "react";
import { CloudArrowDown, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { ManagedProviderInput, ManagedProxyProvider, ProviderManagerClient } from "../api/provider-manager";
import { ProviderEditorDialog } from "./ProviderEditorDialog";

export type ProviderConfigurationChange =
  | { action: "create" | "update"; provider: ManagedProviderInput; originalName?: string }
  | { action: "delete"; provider: ManagedProxyProvider };

interface ManagedProvidersPanelProps {
  manager: ProviderManagerClient;
  onChanged?: (change: ProviderConfigurationChange) => Promise<void> | void;
}

function providerType(type: ManagedProxyProvider["type"]) {
  if (type === "http") return "HTTP 订阅";
  if (type === "file") return "本地文件";
  return "内联配置";
}

export function ManagedProvidersPanel({ manager, onChanged }: ManagedProvidersPanelProps) {
  const [providers, setProviders] = useState<ManagedProxyProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ originalName: string; provider: ManagedProxyProvider | null } | null>(null);
  const [deleting, setDeleting] = useState<ManagedProxyProvider | null>(null);

  useEffect(() => {
    let active = true;
    manager.list()
      .then((items) => {
        if (active) setProviders(items);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [manager]);

  async function saveProvider(provider: ManagedProviderInput) {
    if (!editor) return;
    setLoading(true);
    setError("");
    try {
      const items = editor.provider
        ? await manager.update(editor.originalName, provider)
        : await manager.create(provider);
      setProviders(items);
      setEditor(null);
      await onChanged?.(
        editor.provider
          ? { action: "update", originalName: editor.originalName, provider }
          : { action: "create", provider },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提供者保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeProvider() {
    if (!deleting) return;
    setLoading(true);
    setError("");
    try {
      setProviders(await manager.remove(deleting.name));
      await onChanged?.({ action: "delete", provider: deleting });
      setDeleting(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提供者删除失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="managed-provider-section" aria-labelledby="managed-providers-title">
      <div className="section-heading">
        <div>
          <h2 id="managed-providers-title">配置中的代理提供者</h2>
          <p>直接管理 config.yaml；保存失败会恢复原配置。</p>
        </div>
        <div className="section-actions">
          <button type="button" className="button button-primary compact-button" onClick={() => setEditor({ originalName: "", provider: null })} disabled={loading}>
            <Plus size={18} aria-hidden="true" />添加提供者
          </button>
        </div>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="simple-table managed-provider-table" aria-busy={loading}>
        {providers.map((provider) => (
          <div className="managed-provider-row" key={provider.name}>
            <span className="provider-icon"><CloudArrowDown size={23} aria-hidden="true" /></span>
            <div className="managed-provider-name">
              <strong>{provider.name}</strong>
              <small>{providerType(provider.type)} · 每 {Math.round(provider.interval / 60)} 分钟更新</small>
            </div>
            <span className="managed-provider-path" title={provider.path}>{provider.path || "未设置缓存路径"}</span>
            <div className="row-actions">
              <button type="button" className="icon-button" aria-label={`编辑 ${provider.name}`} onClick={() => setEditor({ originalName: provider.name, provider })} disabled={loading}>
                <PencilSimple size={19} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button danger-icon-button" aria-label={`删除 ${provider.name}`} onClick={() => setDeleting(provider)} disabled={loading}>
                <Trash size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {!loading && providers.length === 0 && <p className="empty-state">还没有代理提供者，点击右上角添加。</p>}
        {loading && <p className="empty-state">正在读取配置…</p>}
      </div>

      {editor && (
        <ProviderEditorDialog
          provider={editor.provider}
          saving={loading}
          onClose={() => setEditor(null)}
          onSave={saveProvider}
        />
      )}

      {deleting && (
        <dialog open className="provider-dialog" aria-labelledby="delete-provider-title">
          <div className="dialog-backdrop" aria-hidden="true" onClick={() => setDeleting(null)} />
          <div className="confirm-modal">
            <h2 id="delete-provider-title">删除代理提供者</h2>
            <p>确定删除“{deleting.name}”吗？代理组中的相关引用也会一并移除。</p>
            <div className="provider-modal-actions">
              <button type="button" className="button button-secondary compact-button" onClick={() => setDeleting(null)} disabled={loading}>取消</button>
              <button type="button" className="button button-danger compact-button" onClick={removeProvider} disabled={loading}>确认删除</button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
