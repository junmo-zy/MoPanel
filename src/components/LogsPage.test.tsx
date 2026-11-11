import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LogsState } from "../hooks/useMihomoLogs";
import { LogsPage } from "./LogsPage";

function state(overrides: Partial<LogsState> = {}): LogsState {
  return {
    logs: [
      { id: "1", time: "10:00:01", type: "info", payload: "[TCP] a --> github.com:443 using PROXY" },
      { id: "2", time: "10:00:02", type: "warning", payload: "[Provider] airport pull error" },
      { id: "3", time: "10:00:03", type: "error", payload: "dial tcp timeout" },
    ],
    clear: vi.fn(),
    streamLevel: "info",
    setStreamLevel: vi.fn(),
    paused: false,
    setPaused: vi.fn(),
    ...overrides,
  };
}

describe("LogsPage", () => {
  it("filters by level and keyword, highlights matches, pauses and clears", async () => {
    const user = userEvent.setup();
    const logs = state();
    const { container } = render(<LogsPage state={logs} live />);

    await user.click(screen.getByRole("button", { name: /^警告/ }));
    expect(screen.getByText("[Provider] airport pull error")).toBeInTheDocument();
    expect(screen.queryByText(/github.com/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全部" }));
    await user.type(screen.getByPlaceholderText("搜索日志内容"), "github");
    expect(container.querySelectorAll(".log-row")).toHaveLength(1);
    expect(container.querySelector("mark")).toHaveTextContent("github");

    await user.click(screen.getByRole("button", { name: "调试" }));
    expect(logs.setStreamLevel).toHaveBeenCalledWith("debug");
    await user.click(screen.getByRole("button", { name: "暂停" }));
    expect(logs.setPaused).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(logs.clear).toHaveBeenCalled();
  });
});
