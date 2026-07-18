import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OverviewData } from "../api/types";
import { OverviewPage } from "./OverviewPage";

const data: OverviewData = {
  connected: true,
  version: "v-test",
  mode: "rule",
  mixedPort: 7890,
  allowLan: false,
  downloadTotal: 0,
  uploadTotal: 0,
  connectionCount: 0,
  tcpCount: 0,
  udpCount: 0,
  providers: [],
  providerNodes: [],
  groups: [
    { name: "AUTO", type: "URLTest", current: "香港 01", delay: 42, nodes: [] },
    { name: "PROXY", type: "Selector", current: "我的自定义", delay: 78, nodes: [] },
    { name: "我的自定义", type: "URLTest", current: "日本 02", delay: 78, nodes: [] },
  ],
};

describe("OverviewPage current proxy", () => {
  it("shows the group selected by PROXY as the current proxy instead of always showing AUTO", async () => {
    const user = userEvent.setup();
    const onOpenGroup = vi.fn();
    const { container } = render(
      <OverviewPage
        data={data}
        loadState="live"
        notice={null}
        onModeChange={vi.fn()}
        onOpenGroup={onOpenGroup}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("当前代理")).toBeInTheDocument();
    expect(screen.queryByText("当前路由")).not.toBeInTheDocument();
    expect(container.querySelector(".current-proxy strong")).toHaveTextContent("我的自定义 · 日本 02");
    await user.click(screen.getByRole("button", { name: "更换代理" }));

    expect(onOpenGroup).toHaveBeenCalledWith("PROXY");
  });

  it("uses GLOBAL as the current proxy selector in global mode", async () => {
    const user = userEvent.setup();
    const onOpenGroup = vi.fn();
    const globalData: OverviewData = {
      ...data,
      mode: "global",
      groups: [
        { name: "GLOBAL", type: "Selector", current: "我的自定义", delay: 78, nodes: [] },
        ...data.groups,
      ],
    };
    const { container } = render(
      <OverviewPage
        data={globalData}
        loadState="live"
        notice={null}
        onModeChange={vi.fn()}
        onOpenGroup={onOpenGroup}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    expect(container.querySelector(".current-proxy strong")).toHaveTextContent("我的自定义 · 日本 02");
    await user.click(screen.getByRole("button", { name: "更换代理" }));

    expect(onOpenGroup).toHaveBeenCalledWith("GLOBAL");
  });

  it("states that direct mode leaves proxies inactive without showing a fake proxy", () => {
    const { container } = render(
      <OverviewPage
        data={{ ...data, mode: "direct" }}
        loadState="live"
        notice={null}
        onModeChange={vi.fn()}
        onOpenGroup={vi.fn()}
        onTestGroup={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("当前为直连，代理未生效")).toBeInTheDocument();
    expect(container.textContent).not.toContain("DIRECT → DIRECT");
    expect(screen.getByRole("button", { name: "直连模式下代理未生效" })).toBeDisabled();
  });
});
