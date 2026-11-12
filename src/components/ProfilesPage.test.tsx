import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedProxyProvider, ProviderManagerClient } from "../api/provider-manager";
import type { OverviewData } from "../api/types";
import { formatTraffic } from "../format";
import { ProfilesPage } from "./ProfilesPage";

const overview: OverviewData = {
  connected: true, version: "v-test", mode: "rule", mixedPort: 7890, allowLan: false,
  downloadTotal: 0, uploadTotal: 0, connectionCount: 0, tcpCount: 0, udpCount: 0,
  groups: [], providerNodes: [],
  providers: [{
    name: "机场订阅", vehicleType: "HTTP", updatedAt: "2026-11-10T08:00:00.000Z", proxyCount: 12,
    subscriptionInfo: { upload: 1024 ** 3, download: 31 * 1024 ** 3, total: 100 * 1024 ** 3, expire: 1798732800 },
  }],
};

function ManagedProvidersPanel({ manager, onChanged, ...rest }: {
  manager: ProviderManagerClient;
  onChanged?: (change: unknown) => Promise<void>;
} & Partial<React.ComponentProps<typeof ProfilesPage>>) {
  return (
    <ProfilesPage
      data={overview}
      manager={manager}
      onUpdate={vi.fn(async () => undefined)}
      onConfigurationChanged={onChanged || vi.fn(async () => undefined)}
      configuredProviderNames={[]}
      activeProvider="机场订阅"
      subscriptionSwitching={false}
      subscriptionError={null}
      onSelectActiveProvider={vi.fn(async () => undefined)}
      {...rest}
    />
  );
}

const provider: ManagedProxyProvider = {
  name: "机场订阅",
  type: "http",
  url: "https://sub.example.com",
  path: "./proxy_providers/airport.yaml",
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

afterEach(() => {
  cleanup();
});

function fakeManager(initial: ManagedProxyProvider[] = []): ProviderManagerClient {
  return {
    list: vi.fn(async () => initial),
    create: vi.fn(async (next) => [...initial, next]),
    update: vi.fn(async (_name, next) => [next]),
    remove: vi.fn(async () => []),
  };
}

describe("subscriptions page", () => {
  it("loads immediately and adds an HTTP provider", async () => {
    const user = userEvent.setup();
    const manager = fakeManager();
    render(<ManagedProvidersPanel manager={manager} />);

    await screen.findByRole("button", { name: "添加订阅" });
    expect(manager.list).toHaveBeenCalledWith();
    await user.click(await screen.findByRole("button", { name: "添加订阅" }));

    const dialog = screen.getByRole("dialog", { name: "添加订阅" });
    await user.type(screen.getByLabelText("订阅名称", { selector: "input" }), "新订阅");
    await user.type(screen.getByLabelText("订阅地址", { selector: "input" }), "https://new.example.com/sub");
    await user.clear(screen.getByLabelText("更新间隔（分钟）"));
    await user.type(screen.getByLabelText("更新间隔（分钟）"), "120");
    await user.click(screen.getByRole("button", { name: "保存订阅" }));

    expect(dialog).not.toBeInTheDocument();
    expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "新订阅",
      type: "http",
      url: "https://new.example.com/sub",
      interval: 7200,
    }));
    expect(await screen.findByText("新订阅")).toBeInTheDocument();
  }, 10_000);

  it("notifies the shell after a provider is created so proxy candidates can refresh", async () => {
    const user = userEvent.setup();
    const manager = fakeManager();
    const onChanged = vi.fn(async () => undefined);
    render(<ManagedProvidersPanel manager={manager} {...{ onChanged }} />);

    await user.click(await screen.findByRole("button", { name: "添加订阅" }));
    await user.type(screen.getByLabelText("订阅名称", { selector: "input" }), "新订阅");
    await user.type(screen.getByLabelText("订阅地址", { selector: "input" }), "https://new.example.com/sub");
    await user.click(screen.getByRole("button", { name: "保存订阅" }));

    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({
      action: "create",
      provider: expect.objectContaining({ name: "新订阅" }),
    }));
  }, 10_000);

  it("edits, renames, and deletes an existing provider", async () => {
    const user = userEvent.setup();
    const manager = fakeManager([provider]);
    render(<ManagedProvidersPanel manager={manager} />);
    await screen.findByRole("button", { name: "编辑 机场订阅" });

    await user.click(await screen.findByRole("button", { name: "编辑 机场订阅" }));
    const nameInput = screen.getByLabelText("订阅名称", { selector: "input" });
    await user.clear(nameInput);
    await user.type(nameInput, "备用订阅");
    await user.click(screen.getByRole("button", { name: "保存订阅" }));

    expect(manager.update).toHaveBeenCalledWith("机场订阅", expect.objectContaining({ name: "备用订阅" }));
    expect(await screen.findByText("备用订阅")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 备用订阅" }));
    expect(screen.getByRole("dialog", { name: "删除订阅" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(manager.remove).toHaveBeenCalledWith("备用订阅");
    expect(screen.queryByText("备用订阅")).not.toBeInTheDocument();
  }, 10_000);

  it("shows a failed save inside the open editor instead of behind it", async () => {
    const user = userEvent.setup();
    const manager = fakeManager([provider]);
    manager.update = vi.fn(async () => { throw new Error("此订阅仍被自定义自动组引用，请先编辑或删除自动组"); });
    render(<ManagedProvidersPanel manager={manager} />);

    await user.click(await screen.findByRole("button", { name: "编辑 机场订阅" }));
    await user.click(screen.getByRole("button", { name: "保存订阅" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("自定义自动组引用");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a failed delete inside the confirmation dialog", async () => {
    const user = userEvent.setup();
    const manager = fakeManager([provider]);
    manager.remove = vi.fn(async () => { throw new Error("Mihomo 拒绝重载"); });
    render(<ManagedProvidersPanel manager={manager} />);

    await user.click(await screen.findByRole("button", { name: "删除 机场订阅" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Mihomo 拒绝重载");
  });

  it("shows one merged card per subscription with usage, expiry, update and switching", async () => {
    const user = userEvent.setup();
    const second = { ...provider, name: "备用机场", url: "https://backup.example.com/sub?token=secret", path: "./proxy_providers/b.yaml" };
    const manager = fakeManager([provider, second]);
    const onUpdate = vi.fn(async () => undefined);
    const onSelectActiveProvider = vi.fn(async () => undefined);
    render(<ManagedProvidersPanel manager={manager} onUpdate={onUpdate} onSelectActiveProvider={onSelectActiveProvider} />);

    const card = await screen.findByRole("listitem", { name: "机场订阅" });
    expect(within(card).getByText(/远程订阅 · 12 个节点/)).toBeInTheDocument();
    expect(within(card).getByText("32.0 GB / 100 GB")).toBeInTheDocument();
    expect(within(card).getByRole("meter", { name: "已用流量" })).toHaveAttribute("aria-valuenow", "32");
    expect(within(card).getByText(/到期/)).toBeInTheDocument();
    expect(within(card).getByText("当前使用")).toBeInTheDocument();

    const backup = screen.getByRole("listitem", { name: "备用机场" });
    expect(within(backup).getByText(/未加载/)).toBeInTheDocument();
    expect(within(backup).getByText("backup.example.com")).toBeInTheDocument();
    expect(backup).not.toHaveTextContent("secret");
    expect(within(backup).getByRole("button", { name: "更新订阅 备用机场" })).toBeDisabled();

    await user.click(within(card).getByRole("button", { name: "更新订阅 机场订阅" }));
    expect(onUpdate).toHaveBeenCalledWith("机场订阅");
    await user.click(within(backup).getByRole("button", { name: "选择订阅 备用机场" }));
    expect(onSelectActiveProvider).toHaveBeenCalledWith("备用机场");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks the whole pending card busy and prevents duplicate switches until it finishes", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const onSelectActiveProvider = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const manager = fakeManager([provider, { ...provider, name: "备用机场" }]);
    render(<ManagedProvidersPanel manager={manager} onSelectActiveProvider={onSelectActiveProvider} />);
    const backup = await screen.findByRole("listitem", { name: "备用机场" });
    const button = within(backup).getByRole("button", { name: "选择订阅 备用机场" });
    await user.click(button);
    expect(backup).toHaveAttribute("aria-busy", "true");
    expect(backup).toHaveAttribute("data-active", "false");
    expect(within(backup).getByText("切换中…")).toBeInTheDocument();
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSelectActiveProvider).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(backup).toHaveAttribute("aria-busy", "false");
    expect(button).toBeEnabled();
  });

  it("falls back to read-only cards when config management is unavailable", async () => {
    const manager = fakeManager();
    manager.list = vi.fn(async () => { throw new Error("配置管理尚未启用"); });
    render(<ManagedProvidersPanel manager={manager} />);

    const card = await screen.findByRole("listitem", { name: "机场订阅" });
    expect(within(card).queryByRole("button", { name: "编辑 机场订阅" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加订阅" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("配置管理尚未启用");
  });

  it("formats traffic with adaptive units", () => {
    expect(formatTraffic(512)).toBe("512 B");
    expect(formatTraffic(1536)).toBe("1.5 KB");
    expect(formatTraffic(250 * 1024 ** 3)).toBe("250 GB");
  });
});
