import { useEffect, useState, type CSSProperties } from "react";
import { Sidebar, type SectionId } from "./components/Sidebar";
import { OverviewPage } from "./components/OverviewPage";
import { NodeSwitcher } from "./components/NodeSwitcher";
import { ProxiesPage } from "./components/ProxiesPage";
import { ProfilesPage } from "./components/ProfilesPage";
import { ConnectionsPage } from "./components/ConnectionsPage";
import { LogsPage } from "./components/LogsPage";
import { SettingsPage } from "./components/SettingsPage";
import type { ProviderConfigurationChange } from "./components/ManagedProvidersPanel";
import { createAutoGroupManagerClient, type AutoGroupManagerClient } from "./api/auto-group-manager";
import { createProviderManagerClient, type ProviderManagerClient } from "./api/provider-manager";
import { createActiveProviderClient, type ActiveProviderClient, type ActiveProviderState } from "./api/active-provider";
import { createPanelSettingsClient, type PanelSettingsClient } from "./api/panel-settings";
import type { MihomoClient, OverviewData, ProxyMode, ProxyNode } from "./api/types";
import { createDemoClient, demoOverview } from "./data/demo";
import { WallpaperProvider } from "./wallpaper/WallpaperContext";
import { useWallpaper } from "./wallpaper/useWallpaper";
import type { WallpaperRepository } from "./wallpaper/wallpaper-store";
import { loadSpeedTestUrl, saveSpeedTestUrl } from "./speed-test-url";
import { getProxyActivationSteps, resolveCurrentProxy } from "./proxy-context";

interface AppProps {
  client?: MihomoClient;
  providerManager?: ProviderManagerClient;
  autoGroupManager?: AutoGroupManagerClient;
  activeProviderClient?: ActiveProviderClient;
  panelSettingsClient?: PanelSettingsClient;
  wallpaperRepository?: WallpaperRepository;
}

const defaultDemoClient = createDemoClient();
const defaultProviderManager = createProviderManagerClient();
const defaultAutoGroupManager = createAutoGroupManagerClient();
const defaultActiveProviderClient = createActiveProviderClient();
const defaultPanelSettingsClient = createPanelSettingsClient();
const THEME_STORAGE_KEY = "mihomo-mini:theme";
const CONTROLLER_RETRY_INTERVAL_MS = 8_000;

type Theme = "light" | "dark";

function loadTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function AppContent({ client, providerManager, autoGroupManager, activeProviderClient, panelSettingsClient }: Required<Pick<AppProps, "client" | "providerManager" | "autoGroupManager" | "activeProviderClient" | "panelSettingsClient">>) {
  const [section, setSection] = useState<SectionId>("overview");
  const [overview, setOverview] = useState<OverviewData>(() => structuredClone(demoOverview));
  const [loadState, setLoadState] = useState<"loading" | "live" | "demo">("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [switchGroupName, setSwitchGroupName] = useState<string | null>(null);
  const [speedTestUrl, setSpeedTestUrl] = useState(loadSpeedTestUrl);
  const [subscriptionState, setSubscriptionState] = useState<ActiveProviderState>({ providers: [], activeProvider: null });
  const [subscriptionSwitching, setSubscriptionSwitching] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    let active = true;
    client.getOverview()
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setLoadState(data.version === "演示数据" ? "demo" : "live");
      })
      .catch(() => {
        if (!active) return;
        setOverview(structuredClone(demoOverview));
        setLoadState("demo");
        setNotice("无法连接代理服务，当前显示演示数据");
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (loadState !== "demo") return;

    let active = true;
    const retryConnection = async () => {
      try {
        const data = await client.getOverview();
        if (!active) return;
        setOverview(data);
        setLoadState(data.version === "演示数据" ? "demo" : "live");
        if (data.version !== "演示数据") setNotice(null);
      } catch {
        // Stay on the last safe fallback and try again after the controller finishes starting.
      }
    };

    const timer = window.setInterval(() => { void retryConnection(); }, CONTROLLER_RETRY_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [client, loadState]);

  useEffect(() => {
    let active = true;
    panelSettingsClient.get()
      .then((settings) => {
        if (!active) return;
        setSpeedTestUrl(saveSpeedTestUrl(settings.speedTestUrl));
      })
      .catch(() => {
        // Keep the local cache as an offline fallback when the panel API is unavailable.
      });
    return () => { active = false; };
  }, [panelSettingsClient]);

  useEffect(() => {
    let active = true;
    activeProviderClient.get()
      .then((state) => {
        if (active) setSubscriptionState(state);
      })
      .catch(() => {
        // Keep real runtime provider information visible while the config API is temporarily unavailable.
      });
    return () => { active = false; };
  }, [activeProviderClient]);

  useEffect(() => {
    if (loadState !== "live") return;
    let active = true;
    let fetching = false;

    async function refreshLiveProxyState() {
      if (fetching) return;
      fetching = true;
      try {
        const refreshed = await client.getOverview();
        if (!active) return;
        setOverview(refreshed);
        setLoadState(refreshed.version === "演示数据" ? "demo" : "live");
      } catch {
        // Keep the last confirmed proxy state while a transient poll fails.
      } finally {
        fetching = false;
      }
    }

    const timer = window.setInterval(refreshLiveProxyState, CONTROLLER_RETRY_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [client, loadState]);

  async function refreshOverview() {
    const refreshed = await client.getOverview();
    setOverview(refreshed);
    setLoadState(refreshed.version === "演示数据" ? "demo" : "live");
    return refreshed;
  }

  async function handleModeChange(mode: ProxyMode) {
    const previous = overview.mode;
    try {
      await client.setMode(mode);
      const refreshed = await refreshOverview();
      if (refreshed.mode !== mode) {
        setNotice("代理服务尚未确认模式变更，请稍后刷新");
        return;
      }
      setNotice(mode === "rule" ? "已切换到规则模式" : mode === "global" ? "已切换到全局模式" : "已切换到直连模式");
    } catch {
      setOverview((current) => ({ ...current, mode: previous }));
      setNotice("模式切换失败，请检查控制器连接");
    }
  }

  async function handleNodeSelect(groupName: string, nodeName: string) {
    try {
      await client.selectProxy(groupName, nodeName);
      await refreshOverview();
      setSwitchGroupName(null);
      setNotice(`已切换到 ${nodeName}`);
    } catch {
      setNotice("节点切换失败，请稍后重试");
    }
  }

  async function handleTestNode(node: ProxyNode) {
    const delay = await client.testProxy(node, speedTestUrl);
    await refreshOverview();
    return delay;
  }

  async function handleTestGroup(groupName: string) {
    try {
      await client.testGroup(groupName, speedTestUrl);
      await refreshOverview();
      setNotice(`${groupName} 测速完成`);
    } catch (error) {
      setNotice(`${groupName} 测速失败，请检查测速地址或节点状态`);
      throw error;
    }
  }

  async function handleProviderUpdate(name: string) {
    try {
      await client.updateProvider(name);
      await refreshOverview();
      setNotice(`${name} 更新成功`);
    } catch {
      setNotice(`${name} 更新失败`);
    }
  }

  async function handleProviderConfigurationChanged(change: ProviderConfigurationChange) {
    const loaded = await refreshOverview();
    if (change.action === "delete") {
      setNotice(`已删除订阅：${change.provider.name}`);
      return;
    }

    if (loaded.providers.some((provider) => provider.name === change.provider.name)) {
      await client.updateProvider(change.provider.name);
      await refreshOverview();
    }
    setNotice(change.action === "create" ? `已添加订阅：${change.provider.name}` : `已更新订阅：${change.provider.name}`);
  }

  async function handleActiveProviderSelect(name: string) {
    setSubscriptionSwitching(true);
    setSubscriptionError(null);
    try {
      const nextState = await activeProviderClient.select(name);
      setSubscriptionState(nextState);
      await refreshOverview();
      setNotice(`已切换到订阅：${name}`);
    } catch {
      setSubscriptionError("订阅切换失败，原配置已保留，请稍后重试。");
    } finally {
      setSubscriptionSwitching(false);
    }
  }

  async function handleUseAutoGroup(name: string) {
    try {
      const current = await refreshOverview();
      const activationSteps = getProxyActivationSteps(current, name);
      if (!activationSteps) {
        throw new Error("当前为直连模式，请先切换到规则或全局模式");
      }
      for (const step of activationSteps) {
        await client.selectProxy(step.selectorName, step.nodeName);
      }
      const applied = await refreshOverview();
      const modeName = applied.mode === "global" ? "全局" : "规则";
      setNotice(`已设为${modeName}代理：${name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "请检查当前代理组";
      setNotice(`设置 ${name} 失败：${detail}`);
      throw error;
    }
  }

  async function handleConfigSave(patch: Parameters<MihomoClient["updateConfig"]>[0], nextSpeedTestUrl: string) {
    const savedSpeedTestUrl = saveSpeedTestUrl(nextSpeedTestUrl);
    try {
      await client.updateConfig(patch);
      const savedSettings = await panelSettingsClient.save({
        speedTestUrl: savedSpeedTestUrl,
        selectedProviders: null,
      });
      setSpeedTestUrl(saveSpeedTestUrl(savedSettings.speedTestUrl));
      setOverview((current) => ({
        ...current,
        allowLan: patch.allowLan ?? current.allowLan,
        mixedPort: patch.mixedPort ?? current.mixedPort,
      }));
      setNotice("设置已保存");
    } catch {
      setNotice("设置保存失败，请检查参数");
    }
  }

  function handleThemeToggle() {
    setTheme((current) => {
      const next: Theme = current === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // The visual toggle should remain usable when browser storage is unavailable.
      }
      return next;
    });
  }

  function renderSection() {
    if (section === "overview") return (
      <OverviewPage
        data={overview}
        loadState={loadState}
        notice={notice}
        onModeChange={handleModeChange}
        onOpenGroup={(name) => setSwitchGroupName(name)}
        onTestGroup={handleTestGroup}
      />
    );
    if (section === "proxies") return (
      <ProxiesPage
        groups={overview.groups}
        providerNodes={overview.providerNodes}
        manager={autoGroupManager}
        speedTestUrl={speedTestUrl}
        onOpenGroup={setSwitchGroupName}
        onTestGroup={handleTestGroup}
        onRefresh={refreshOverview}
        mode={overview.mode}
        activeProxyGroupName={resolveCurrentProxy(overview).groupName}
        onUseAutoGroup={handleUseAutoGroup}
      />
    );
    if (section === "profiles") return (
      <ProfilesPage
        data={overview}
        manager={providerManager}
        onUpdate={handleProviderUpdate}
        onConfigurationChanged={handleProviderConfigurationChanged}
        configuredProviderNames={subscriptionState.providers}
        activeProvider={subscriptionState.activeProvider}
        subscriptionSwitching={subscriptionSwitching}
        subscriptionError={subscriptionError}
        onSelectActiveProvider={handleActiveProviderSelect}
      />
    );
    if (section === "connections") return <ConnectionsPage client={client} />;
    if (section === "logs") return <LogsPage live={loadState === "live"} />;
    return <SettingsPage data={overview} speedTestUrl={speedTestUrl} onSave={handleConfigSave} />;
  }

  const wallpaper = useWallpaper();
  const hasClearWallpaper = wallpaper.blur === 0 && wallpaper.dim === 0;
  const desktopStyle = {
    "--wallpaper-image": `url(${wallpaper.wallpaperUrl})`,
    "--wallpaper-blur": `${wallpaper.blur}px`,
    "--wallpaper-dim": `${wallpaper.dim / 100}`,
    "--wallpaper-material-blur": `${Math.round((wallpaper.blur * 4) / 3)}px`,
    ...(hasClearWallpaper ? {
      "--window-surface": "transparent",
      "--main-surface": "transparent",
      "--titlebar-surface": "transparent",
      "--sidebar-surface": "transparent",
    } : {}),
  } as CSSProperties;
  const wallpaperLayerStyle = {
    backgroundImage: `url(${wallpaper.wallpaperUrl})`,
  } as CSSProperties;
  const connectionState = loadState === "loading"
    ? "connecting"
    : loadState === "live" && overview.connected
      ? "connected"
      : "disconnected";
  const connectionLabel = connectionState === "connected"
    ? "已连接"
    : connectionState === "connecting"
      ? "连接中"
      : "未连接";

  return (
    <div className="wallpaper-desktop" data-testid="wallpaper-desktop" data-theme={theme} style={desktopStyle}>
      <div className="wallpaper-layer" aria-hidden="true" style={wallpaperLayerStyle} />
      <div className="wallpaper-shade" aria-hidden="true" />
      <div className="app-window" data-layout="fullscreen">
        <header className="window-titlebar">
          <div className="window-controls" aria-label="窗口控制">
            <span className="window-close" /><span className="window-minimize" /><span className="window-zoom" />
          </div>
          <strong className="product-brand">
            <img src="/brand/mopanel-cat.png" alt="" width={20} height={20} />
            <span>MoPanel</span>
          </strong>
          <span className="window-status" data-state={connectionState} aria-live="polite"><i aria-hidden="true" />{connectionLabel}</span>
        </header>
        <div className="app-shell">
          <Sidebar activeSection={section} onNavigate={setSection} theme={theme} onToggleTheme={handleThemeToggle} />
          <main className="app-main">
            {renderSection()}
          </main>
        </div>
        {switchGroupName && (
          <NodeSwitcher
            group={overview.groups.find((group) => group.name === switchGroupName) || overview.groups[0]}
            onClose={() => setSwitchGroupName(null)}
            onSelect={handleNodeSelect}
            onTest={handleTestNode}
            onTestGroup={handleTestGroup}
          />
        )}
      </div>
    </div>
  );
}

export function App({
  client = defaultDemoClient,
  providerManager = defaultProviderManager,
  autoGroupManager = defaultAutoGroupManager,
  activeProviderClient = defaultActiveProviderClient,
  panelSettingsClient = defaultPanelSettingsClient,
  wallpaperRepository,
}: AppProps) {
  return (
    <WallpaperProvider repository={wallpaperRepository}>
      <AppContent
        client={client}
        providerManager={providerManager}
        autoGroupManager={autoGroupManager}
        activeProviderClient={activeProviderClient}
        panelSettingsClient={panelSettingsClient}
      />
    </WallpaperProvider>
  );
}
