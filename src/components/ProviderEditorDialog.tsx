import { useState, type FormEvent } from "react";
import { X } from "@phosphor-icons/react";
import type { ManagedProviderInput, ManagedProxyProvider } from "../api/provider-manager";

interface ProviderEditorDialogProps {
  provider: ManagedProxyProvider | null;
  saving: boolean;
  onClose: () => void;
  onSave: (provider: ManagedProviderInput) => Promise<void>;
}

const emptyProvider: ManagedProxyProvider = {
  name: "",
  type: "http",
  url: "",
  path: "",
  interval: 3600,
  proxy: "DIRECT",
  filter: "",
  excludeFilter: "",
  healthCheck: {
    enable: true,
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    lazy: true,
  },
};

export function ProviderEditorDialog({ provider, saving, onClose, onSave }: ProviderEditorDialogProps) {
  const [draft, setDraft] = useState<ManagedProxyProvider>(() => (
    structuredClone(provider || emptyProvider)
  ));

  function setField<Key extends keyof ManagedProxyProvider>(key: Key, value: ManagedProxyProvider[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(draft);
  }

  return (
    <dialog open className="provider-dialog" aria-labelledby="provider-editor-title">
      <div className="dialog-backdrop" aria-hidden="true" onClick={saving ? undefined : onClose} />
      <form className="provider-modal" onSubmit={submit}>
        <div className="provider-modal-header">
          <div>
            <h2 id="provider-editor-title">{provider ? "编辑代理提供者" : "添加代理提供者"}</h2>
            <p>保存后会校验配置并安全重载 Mihomo。</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose} disabled={saving}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="provider-form-grid">
          <label className="form-control">
            <span>提供者名称</span>
            <input required value={draft.name} onChange={(event) => setField("name", event.target.value)} placeholder="例如：机场订阅" />
          </label>
          <label className="form-control">
            <span>类型</span>
            <select value={draft.type} onChange={(event) => setField("type", event.target.value as "http" | "file")}>
              <option value="http">HTTP 订阅</option>
              <option value="file">本地文件</option>
              {draft.type === "inline" && <option value="inline">内联配置</option>}
            </select>
          </label>
          {draft.type === "http" && (
            <label className="form-control form-control-wide">
              <span>订阅地址</span>
              <input required type="url" value={draft.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://example.com/sub" />
            </label>
          )}
          <label className="form-control form-control-wide">
            <span>缓存路径 <small>留空自动生成</small></span>
            <input value={draft.path} onChange={(event) => setField("path", event.target.value)} placeholder="./proxy_providers/name.yaml" />
          </label>
          <label className="form-control">
            <span>更新间隔（分钟）</span>
            <input required type="number" min="1" value={draft.interval ? Math.round(draft.interval / 60) : ""} onChange={(event) => setField("interval", event.target.value ? Number(event.target.value) * 60 : 0)} />
          </label>
          <label className="form-control">
            <span>下载代理</span>
            <input value={draft.proxy} onChange={(event) => setField("proxy", event.target.value)} placeholder="DIRECT" />
          </label>
          <label className="form-control">
            <span>包含过滤</span>
            <input value={draft.filter} onChange={(event) => setField("filter", event.target.value)} placeholder="可选，正则表达式" />
          </label>
          <label className="form-control">
            <span>排除过滤</span>
            <input value={draft.excludeFilter} onChange={(event) => setField("excludeFilter", event.target.value)} placeholder="可选，正则表达式" />
          </label>
        </div>

        <div className="health-check-box">
          <label className="check-control">
            <input
              type="checkbox"
              checked={draft.healthCheck.enable}
              onChange={(event) => setField("healthCheck", { ...draft.healthCheck, enable: event.target.checked })}
            />
            <span>启用健康检查</span>
          </label>
          {draft.healthCheck.enable && (
            <div className="provider-form-grid compact-grid">
              <label className="form-control form-control-wide">
                <span>健康检查地址</span>
                <input type="url" required value={draft.healthCheck.url} onChange={(event) => setField("healthCheck", { ...draft.healthCheck, url: event.target.value })} />
              </label>
              <label className="form-control">
                <span>检查间隔（分钟）</span>
                <input type="number" min="1" required value={draft.healthCheck.interval ? Math.round(draft.healthCheck.interval / 60) : ""} onChange={(event) => setField("healthCheck", { ...draft.healthCheck, interval: event.target.value ? Number(event.target.value) * 60 : 0 })} />
              </label>
              <label className="check-control check-control-bottom">
                <input type="checkbox" checked={draft.healthCheck.lazy} onChange={(event) => setField("healthCheck", { ...draft.healthCheck, lazy: event.target.checked })} />
                <span>惰性检测</span>
              </label>
            </div>
          )}
        </div>

        <div className="provider-modal-actions">
          <button type="button" className="button button-secondary compact-button" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="button button-primary compact-button" disabled={saving}>
            {saving ? "正在保存…" : "保存提供者"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
