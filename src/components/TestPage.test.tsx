import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { regionFlag, ToolsError, type ToolsClient } from "../api/tools";
import { TestPage } from "./TestPage";

afterEach(() => localStorage.clear());

function fakeTools(): ToolsClient {
  return {
    listUnlockServices: vi.fn(async () => [{ id: "netflix", name: "Netflix" }, { id: "claude", name: "Claude" }]),
    runUnlock: vi.fn(async (id: string) => (id === "netflix"
      ? { id, status: "yes" as const, region: "US", checkedAt: "2026-10-21T07:03:46.000Z" }
      : { id, status: "no" as const, region: "HK", checkedAt: "2026-10-21T07:03:43.000Z" })),
    latency: vi.fn(async () => 120),
    exitIp: vi.fn(),
  };
}

describe("TestPage", () => {
  it("runs every unlock check and shows status, region and time", async () => {
    const user = userEvent.setup();
    const tools = fakeTools();
    render(<TestPage tools={tools} />);

    const netflix = await screen.findByRole("listitem", { name: "Netflix" });
    expect(within(netflix).getByText("待检测")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "测试全部" }));

    expect(await within(netflix).findByText("支持")).toBeInTheDocument();
    expect(within(netflix).getByText("US")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Claude" })).getByText("不支持")).toBeInTheDocument();
    expect(tools.runUnlock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("mopanel:unlock-results") || "{}").netflix.status).toBe("yes");
  });

  it("shows one clear message when the Mihomo proxy port cannot be reached", async () => {
    const user = userEvent.setup();
    const tools = fakeTools();
    tools.runUnlock = vi.fn(async () => { throw new ToolsError("无法连接 Mihomo 代理端口", "PROXY_UNAVAILABLE"); });
    render(<TestPage tools={tools} />);

    await user.click(await screen.findByRole("button", { name: "检测 Netflix" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接 Mihomo 代理端口");
    expect(within(screen.getByRole("listitem", { name: "Netflix" })).getByText("检测失败")).toBeInTheDocument();
  });

  it("tests websites and lets the user add and remove a custom one", async () => {
    const user = userEvent.setup();
    const tools = fakeTools();
    render(<TestPage tools={tools} />);

    await user.click(screen.getByRole("tab", { name: "网站延迟" }));
    await user.click(screen.getByRole("button", { name: "测试 GitHub" }));
    expect(tools.latency).toHaveBeenCalledWith("https://github.com");
    expect(await screen.findByRole("button", { name: "测试 GitHub" })).toHaveTextContent("120ms");

    await user.click(screen.getByRole("button", { name: "添加网站" }));
    await user.type(screen.getByLabelText("名称"), "Netflix");
    await user.type(screen.getByLabelText("网址"), "https://www.netflix.com");
    await user.click(screen.getByRole("button", { name: "添加并测试" }));
    await waitFor(() => expect(tools.latency).toHaveBeenCalledWith("https://www.netflix.com/"));

    await user.click(screen.getByRole("button", { name: "删除 Netflix" }));
    expect(screen.queryByRole("listitem", { name: "Netflix" })).not.toBeInTheDocument();
  });

  it("builds flag emoji only for known region codes", () => {
    expect(regionFlag("HK", () => true)).toBe("🇭🇰");
    expect(regionFlag("HKG", () => true)).toBe("🇭🇰");
    expect(regionFlag("ALISG", () => true)).toBe("");
    expect(regionFlag("HK", () => false)).toBe("");
  });
});
