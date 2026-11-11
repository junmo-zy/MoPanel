import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionItem, MihomoClient } from "../api/types";
import { ConnectionsPage } from "./ConnectionsPage";

const base: ConnectionItem = {
  id: "c1", network: "TCP", host: "github.com", destination: "140.82.112.4:443", process: "chrome",
  chain: "PROXY → 香港 01", rule: "DomainSuffix · github.com", upload: 1000, download: 10_000,
  start: new Date().toISOString(), type: "HTTPS", source: "192.168.1.20:52344",
};

function client(snapshots: ConnectionItem[][]): MihomoClient {
  let index = 0;
  return {
    getConnections: vi.fn(async () => {
      const connections = snapshots[Math.min(index, snapshots.length - 1)];
      index += 1;
      return { downloadTotal: 5 * 1024 ** 3, uploadTotal: 1024 ** 2, connections };
    }),
    closeConnection: vi.fn(async () => undefined),
    closeAllConnections: vi.fn(async () => undefined),
  } as unknown as MihomoClient;
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("ConnectionsPage", () => {
  it("shows live speeds, keeps closed connections and opens details", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fake = client([
      [base],
      [{ ...base, download: 10_000 + 2 * 1024 * 1024, upload: 1000 + 2048 }],
      [],
    ]);
    render(<ConnectionsPage client={fake} live={false} />);

    expect(await screen.findByRole("listitem", { name: "github.com" })).toBeInTheDocument();
    expect(screen.getByText(/下载 5.0 GB/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    const card = screen.getByRole("listitem", { name: "github.com" });
    expect(within(card).getByText("1.0 MB/s")).toBeInTheDocument();
    expect(within(card).getByText("1.0 KB/s")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "查看 github.com 详情" }));
    const detail = screen.getByRole("dialog", { name: "github.com" });
    expect(within(detail).getByText("192.168.1.20:52344")).toBeInTheDocument();
    expect(within(detail).getByText("PROXY → 香港 01")).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "关闭此连接" }));
    expect(fake.closeConnection).toHaveBeenCalledWith("c1");

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByRole("listitem", { name: "github.com" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "已关闭 1" }));
    expect(screen.getByRole("listitem", { name: "github.com" })).toBeInTheDocument();
  });

  it("asks before closing every connection and supports a table view", async () => {
    const user = userEvent.setup();
    const fake = client([[base, { ...base, id: "c2", host: "example.com" }]]);
    render(<ConnectionsPage client={fake} live={false} />);
    await screen.findByRole("listitem", { name: "example.com" });

    await user.type(screen.getByPlaceholderText(/搜索域名/), "example");
    expect(screen.queryByRole("listitem", { name: "github.com" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "表格视图" }));
    expect(screen.getByRole("table")).toHaveTextContent("example.com");

    await user.click(screen.getByRole("button", { name: "全部关闭" }));
    await user.click(within(screen.getByRole("dialog", { name: "关闭全部连接" })).getByRole("button", { name: "全部关闭" }));
    expect(fake.closeAllConnections).toHaveBeenCalledTimes(1);
  });
});
