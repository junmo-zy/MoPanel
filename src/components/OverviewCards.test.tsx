import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolsClient } from "../api/tools";
import type { MihomoClient, OverviewData } from "../api/types";
import { CoreInfoCard, ExitIpCard, SubscriptionCard } from "./OverviewCards";

afterEach(() => localStorage.clear());

const data: OverviewData = {
  connected: true, version: "v1.19.15", mode: "rule", mixedPort: 7890, allowLan: true, ipv6: false,
  downloadTotal: 3 * 1024 ** 3, uploadTotal: 200 * 1024 ** 2, connectionCount: 0, tcpCount: 0, udpCount: 0,
  groups: [], providerNodes: [],
  providers: [{ name: "机场", vehicleType: "HTTP", updatedAt: null, proxyCount: 42, subscriptionInfo: { upload: 0, download: 50 * 1024 ** 3, total: 100 * 1024 ** 3, expire: 0 } }],
};

describe("overview cards", () => {
  it("shows the exit IP through the proxy, can hide it and refresh", async () => {
    const user = userEvent.setup();
    const tools = { exitIp: vi.fn(async () => ({ ip: "103.151.173.202", countryCode: "JP", country: "Japan", city: "Tokyo", isp: "Example ISP", asn: "AS134972", timezone: "Asia/Tokyo" })) } as unknown as ToolsClient;
    render(<ExitIpCard tools={tools} connected />);

    expect(await screen.findByText("103.151.173.202")).toBeInTheDocument();
    expect(screen.getByText("AS134972")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "隐藏 IP" }));
    expect(screen.getByText("103.151.*.*")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新查询出口 IP" }));
    expect(tools.exitIp).toHaveBeenCalledTimes(2);
  });

  it("explains why the exit IP is unavailable", async () => {
    const tools = { exitIp: vi.fn(async () => { throw new Error("无法连接 Mihomo 代理端口"); }) } as unknown as ToolsClient;
    render(<ExitIpCard tools={tools} connected />);
    expect(await screen.findByText("无法连接 Mihomo 代理端口")).toBeInTheDocument();
  });

  it("shows the current subscription with usage and updates it", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => undefined);
    render(<SubscriptionCard provider={data.providers[0]} name="机场" onUpdate={onUpdate} onManage={vi.fn()} />);
    expect(screen.getByText("42 个节点 · HTTP")).toBeInTheDocument();
    expect(screen.getByText("50.0 GB / 100 GB")).toBeInTheDocument();
    expect(screen.getByText("长期有效")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更新当前订阅" }));
    expect(onUpdate).toHaveBeenCalledWith("机场");
  });

  it("summarises the core with version, ports and rule count", async () => {
    const client = { getRules: vi.fn(async () => new Array(1234).fill({ type: "Match", payload: "", proxy: "DIRECT" })) } as unknown as MihomoClient;
    render(<CoreInfoCard data={data} client={client} />);
    const card = screen.getByRole("region", { name: "内核信息" });
    await waitFor(() => expect(within(card).getByText("1234 条")).toBeInTheDocument());
    expect(within(card).getByText("v1.19.15")).toBeInTheDocument();
    expect(within(card).getByText("7890")).toBeInTheDocument();
  });
});
