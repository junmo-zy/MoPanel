import { useEffect, useState, type CSSProperties } from "react";
import { Sidebar, type SectionId } from "./components/Sidebar";
import { OverviewPage } from "./components/OverviewPage";
import { NodeSwitcher } from "./components/NodeSwitcher";
import { ProxiesPage } from "./components/ProxiesPage";
import { ProfilesPage } from "./components/ProfilesPage";
import { ConnectionsPage } from "./components/ConnectionsPage";
import { LogsPage } from "./components/LogsPage";
import { SettingsPage } from "./components/SettingsPage";
import { TestPage } from "./components/TestPage";
import { RulesPage } from "./components/RulesPage";
import { TooltipLayer } from "./components/TooltipLayer";
import { createToolsClient, type ToolsClient } from "./api/tools";
import type { ProviderConfigurationChange } from "./components/ProfilesPage";
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
import { useMemoryStream, useTrafficStream, type TrafficSource } from "./hooks/useTrafficStream";
import { useMihomoLogs } from "./hooks/useMihomoLogs";
import { useDelayTester } from "./hooks/useDelayTester";

interface AppProps {
  client?: MihomoClient;
  providerManager?: ProviderManagerClient;
  autoGroupManager?: AutoGroupManagerClient;
  activeProviderClient?: ActiveProviderClient;
  panelSettingsClient?: PanelSettingsClient;
  toolsClient?: ToolsClient;
  wallpaperRepository?: WallpaperRepository;
}

const defaultDemoClient = createDemoClient();
const defaultProviderManager = createProviderManagerClient();
const defaultAutoGroupManager = createAutoGroupManagerClient();
const defaultActiveProviderClient = createActiveProviderClient();
const defaultPanelSettingsClient = createPanelSettingsClient();
const defaultToolsClient = createToolsClient();
const THEME_STORAGE_KEY = "mihomo-mini:theme";
const CONTROLLER_RETRY_INTERVAL_MS = 8_000;
const NOTICE_DURATION_MS = 4_000;

type LoadState = "loading" | "live" | "demo" | "offline";

// Shown while a real controller is loading or unreachable. Fake demo nodes
// must never appear in place of the user's actual proxies.
const emptyOverview: OverviewData = {
  connected: false,
  version: "—",
  mode: "rule",
  mixedPort: null,
  allowLan: false,
  downloadTotal: 0,
  uploadTotal: 0,
  connectionCount: 0,
  tcpCount: 0,
  udpCount: 0,
  groups: [],
  providers: [],
  providerNodes: [],
};

function loadStateFor(data: OverviewData): LoadState {
  return data.version === demoOverview.version ? "demo" : "live";
}

function errorDetail(error: unknown) {
  return error instanceof Error && error.message ? error.message : "";
}

type Theme = "light" | "dark";

function loadTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function AppContent({ client, providerManager, autoGroupManager, activeProviderClient, panelSettingsClient, toolsClient }: Required<Pick<AppProps, "client" | "providerManager" | "autoGroupManager" | "activeProviderClient" | "panelSettingsClient" | "toolsClient">>) {
  const [section, setSection] = useState<SectionId>("overview");
  const isDemoClient = client === defaultDemoClient;
  const [overview, setOverview] = useState<OverviewData>(() => structuredClone(isDemoClient ? demoOverview : emptyOverview));
  const [loadState, setLoadState] = useState<LoadState>(isDemoClient ? "demo" : "loading");
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
        setLoadState(loadStateFor(data));
      })
      .catch(() => {
        if (!active) return;
        setOverview({ ...emptyOverview });
        setLoadState("offline");
        setNotice("无法连接代理服务，正在自动重试");
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Keep automatic-group selections and delays current, notice when the core
  // goes away, and reconnect by itself once it is back.
  useEffect(() => {
    if (loadState !== "live" && loadState !== "offline") return;
    let active = true;
    let fetching = false;

    async function poll() {
      if (fetching) return;
      fetching = true;
      try {
        const refreshed = await client.getOverview();
        if (!active) return;
        setOverview(refreshed);
        setLoadState(loadStateFor(refreshed));
        if (loadState === "offline") setNotice("已重新连接代理服务");
      } catch {
        if (!active) return;
        setOverview((current) => ({ ...current, connected: false }));
        setLoadState("offline");
      } finally {
        fetching = false;
      }
    }

    const timer = window.setInterval(() => { void poll(); }, CONTROLLER_RETRY_INTERVAL_MS);
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

  // Close the node dialog when its group disappears (e.g. after a subscription
  // switch) instead of silently showing a different group.
  const switchGroup = switchGroupName
    ? overview.groups.find((group) => group.name === switchGroupName) || null
    : null;
  if (switchGroupName && !switchGroup && loadState !== "loading") {
    setSwitchGroupName(null);
  }

  async function reloadSubscriptionState() {
    try {
      setSubscriptionState(await activeProviderClient.get());
    } catch {
      // The provider list stays as last known; the next successful action refreshes it.
    }
  }

  async function refreshOverview() {
    const refreshed = await client.getOverview();
    setOverview(refreshed);
    setLoadState(loadStateFor(refreshed));
    return refreshed;
  }

  async function refreshOverviewQuietly() {
    try {
      await refreshOverview();
    } catch {
      // The periodic poll reports a lost controller.
    }
  }

  // Clash-Verge-style per-node speed tests; results stream in node by node.
  const tester = useDelayTester(client, speedTestUrl, refreshOverviewQuietly);

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
      await refreshOverviewQuietly();
      setSwitchGroupName(null);
      setNotice(`已切换到 ${nodeName}`);
    } catch {
      setNotice("节点切换失败，请稍后重试");
    }
  }

  async function handleTestNode(node: ProxyNode, groupName?: string) {
    const group = groupName ? overview.groups.find((item) => item.name === groupName) : undefined;
    return tester.testNode(node, group);
  }

  function testSummary(label: string, total: number, failed: number) {
    return failed > 0 ? `${label} 测速完成：${total} 个节点，${failed} 个超时` : `${label} 测速完成：${total} 个节点`;
  }

  async function handleTestGroup(groupName: string) {
    let group = overview.groups.find((item) => item.name === groupName);
    if (!group) {
      // A just-saved auto group appears only after the next refresh.
      try {
        group = (await refreshOverview()).groups.find((item) => item.name === groupName);
      } catch {
        group = undefined;
      }
    }
    if (!group) throw new Error(`找不到代理组 ${groupName}`);
    const { total, failed } = await tester.testGroup(group);
    setNotice(testSummary(groupName, total, failed));
  }

  async function handleTestAllGroups() {
    // GLOBAL repeats every node; rule mode never uses it.
    const groups = overview.mode === "global" ? overview.groups : overview.groups.filter((group) => group.name !== "GLOBAL");
    const { total, failed } = await tester.testGroups(groups);
    setNotice(testSummary("全部", total, failed));
  }

  function ruleSummary(state: ActiveProviderState) {
    const source = state.ruleSource;
    if (!source) return "";
    if (source.warning) return `，${source.warning}`;
    return source.mode === "profile" ? `，使用订阅自带的 ${source.ruleCount} 条规则` : `，使用本地 ${source.ruleCount} 条规则`;
  }

  async function handleProviderUpdate(name: string) {
    try {
      await client.updateProvider(name);
      // Like Clash Verge, updating the current subscription also refreshes
      // its proxy groups and rules.
      let summary = "";
      if (name === subscriptionState.activeProvider && activeProviderClient.sync) {
        const synced = await activeProviderClient.sync();
        setSubscriptionState(synced);
        summary = ruleSummary(synced);
      }
      await refreshOverview();
      setNotice(`${name} 更新成功${summary}`);
    } catch (error) {
      setNotice(`${name} 更新失败${errorDetail(error) ? `：${errorDetail(error)}` : ""}`);
    }
  }

  async function handleSyncRules() {
    if (!activeProviderClient.sync) return;
    try {
      const synced = await activeProviderClient.sync();
      setSubscriptionState(synced);
      await refreshOverviewQuietly();
      setNotice(`已同步订阅规则${ruleSummary(synced)}`);
    } catch (error) {
      setNotice(`同步规则失败${errorDetail(error) ? `：${errorDetail(error)}` : ""}`);
      throw error;
    }
  }

  async function handleProviderConfigurationChanged(change: ProviderConfigurationChange) {
    // The subscription switcher lists providers from config.yaml, so it must be
    // re-read after every add / rename / delete or new entries never appear.
    await reloadSubscriptionState();
    let loaded: OverviewData | null = null;
    try {
      loaded = await refreshOverview();
    } catch {
      // The config change itself succeeded; the poll will catch up.
    }
    if (change.action === "delete") {
      setNotice(`已删除订阅：${change.provider.name}`);
      return;
    }

    const savedName = change.provider.name.trim();
    if (loaded?.providers.some((provider) => provider.name === savedName)) {
      try {
        await client.updateProvider(savedName);
        await refreshOverview();
      } catch {
        setNotice(`已保存订阅：${savedName}，但立即拉取失败，Mihomo 会按更新间隔重试`);
        return;
      }
    }
    setNotice(change.action === "create" ? `已添加订阅：${savedName}` : `已更新订阅：${savedName}`);
  }

  async function handleActiveProviderSelect(name: string) {
    setSubscriptionSwitching(true);
    setSubscriptionError(null);
    try {
      const nextState = await activeProviderClient.select(name);
      setSubscriptionState(nextState);
      await refreshOverviewQuietly();
      setNotice(`已切换到订阅：${name}${ruleSummary(nextState)}`);
    } catch (error) {
      const detail = errorDetail(error);
      setSubscriptionError(`订阅切换失败，原配置已保留。${detail}`);
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
      // Only send what actually changed so untouched core options are never overwritten.
      if (Object.keys(patch).length > 0) {
        await client.updateConfig(patch);
        setOverview((current) => ({
          ...current,
          allowLan: patch.allowLan ?? current.allowLan,
          mixedPort: patch.mixedPort ?? current.mixedPort,
          ipv6: patch.ipv6 ?? current.ipv6,
        }));
      }
      const savedSettings = await panelSettingsClient.save({ speedTestUrl: savedSpeedTestUrl });
      setSpeedTestUrl(saveSpeedTestUrl(savedSettings.speedTestUrl));
      setNotice("设置已保存");
    } catch (error) {
      const detail = errorDetail(error);
      setNotice(`设置保存失败${detail ? `：${detail}` : "，请检查参数"}`);
      throw error;
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
        activeProvider={subscriptionState.activeProvider}
        traffic={traffic}
        delays={tester.view}
        extras={{
          client,
          tools: toolsClient,
          memory,
          onUpdateProvider: handleProviderUpdate,
          onManageSubscriptions: () => setSection("profiles"),
        }}
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
        onTestGroup={handleTestGroup}
        onTestAll={handleTestAllGroups}
        onRefresh={refreshOverview}
        mode={overview.mode}
        onModeChange={overview.connected ? handleModeChange : undefined}
        onSelectNode={handleNodeSelect}
        onTestNode={handleTestNode}
        delays={tester.view}
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
        ruleSource={subscriptionState.ruleSource}
        subscriptionSwitching={subscriptionSwitching}
        subscriptionError={subscriptionError}
        onSelectActiveProvider={handleActiveProviderSelect}
      />
    );
    if (section === "connections") return <ConnectionsPage client={client} live={loadState === "live"} />;
    if (section === "test") return <TestPage tools={toolsClient} />;
    if (section === "rules") return <RulesPage client={client} onNotice={setNotice} ruleSource={subscriptionState.ruleSource} onSyncRules={activeProviderClient.sync ? handleSyncRules : undefined} />;
    if (section === "logs") return <LogsPage state={logs} live={loadState === "live"} demo={loadState === "demo"} />;
    // Remount once real data arrives so the form never edits placeholder values.
    return <SettingsPage key={loadState} data={overview} speedTestUrl={speedTestUrl} onSave={handleConfigSave} />;
  }

  const wallpaper = useWallpaper();
  // One shared stream for the sidebar and the overview charts.
  const trafficSource: TrafficSource = loadState === "live" ? "live" : loadState === "demo" ? "demo" : "off";
  const traffic = useTrafficStream(trafficSource);
  const memory = useMemoryStream(trafficSource);
  // Logs are collected all the time, so history survives switching pages.
  const logs = useMihomoLogs(loadState === "live", loadState === "demo");
  // Wallpaper blur and veil act on the wallpaper only; the frosted panels blur
  // whatever is behind them on their own (Apple-style materials), so the two
  // never stack into a double blur.
  const wallpaperImage = wallpaper.wallpaperUrl ? `url(${wallpaper.wallpaperUrl})` : "none";
  const desktopStyle = {
    "--wallpaper-image": wallpaperImage,
    "--wallpaper-blur": `${wallpaper.blur}px`,
    "--wallpaper-dim": `${wallpaper.dim / 100}`,
    "--glass-alpha": `${wallpaper.glass / 100}`,
  } as CSSProperties;
  const wallpaperLayerStyle = { backgroundImage: wallpaperImage } as CSSProperties;
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
      <div className="wallpaper-layer" aria-hidden="true" data-empty={!wallpaper.wallpaperUrl} style={wallpaperLayerStyle} />
      <div className="wallpaper-shade" aria-hidden="true" />
      <div className="app-window" data-layout="fullscreen">
        <div className="app-shell">
          <Sidebar activeSection={section} onNavigate={setSection} theme={theme} onToggleTheme={handleThemeToggle} traffic={traffic} memory={memory} connection={{ state: connectionState, label: connectionLabel }} />
          <main className="app-main">
            {/* Phones have no sidebar header: show the identity above the page. */}
            <div className="mobile-brand">
              <img src="/brand/mopanel-cat.png" alt="" width={24} height={24} />
              <strong>MoPanel</strong>
              <span className="mobile-status" data-state={connectionState}><i aria-hidden="true" />{connectionLabel}</span>
            </div>
            {renderSection()}
          </main>
        </div>
        {notice && <div className="toast" role="status">{notice}</div>}
        <TooltipLayer />
        {switchGroup && (
          <NodeSwitcher
            group={switchGroup}
            onClose={() => setSwitchGroupName(null)}
            onSelect={handleNodeSelect}
            onTest={handleTestNode}
            onTestGroup={handleTestGroup}
            delays={tester.view}
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
  toolsClient = defaultToolsClient,
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
        toolsClient={toolsClient}
      />
    </WallpaperProvider>
  );
}
