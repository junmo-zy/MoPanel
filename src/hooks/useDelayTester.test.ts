import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MihomoClient, ProxyGroup } from "../api/types";
import { liveDelay, useDelayTester } from "./useDelayTester";

afterEach(() => vi.useRealTimers());

function group(count: number, testUrl?: string): ProxyGroup {
  return {
    name: "节点选择",
    type: "Selector",
    current: "n1",
    delay: null,
    testUrl,
    nodes: Array.from({ length: count }, (_, index) => ({ name: `n${index + 1}`, type: "Trojan", delay: null, alive: true })),
  };
}

describe("useDelayTester", () => {
  it("tests nodes one by one, at most 10 at a time, with the group's own URL", async () => {
    vi.useFakeTimers();
    let running = 0;
    let peak = 0;
    const testProxy = vi.fn(async (node: { name: string }) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 100));
      running -= 1;
      if (node.name === "n3") throw new Error("timeout");
      return 120;
    });
    const onSettled = vi.fn();
    const { result } = renderHook(() => useDelayTester({ testProxy } as unknown as MihomoClient, "https://default/204", onSettled, { maxStaggerMs: 0 }));

    let summary: { total: number; failed: number } | undefined;
    act(() => { void result.current.testGroup(group(25, "https://group/204")).then((value) => { summary = value; }); });
    expect(result.current.view.testing.size).toBe(25);
    expect(result.current.view.progress.get("节点选择")).toEqual({ done: 0, total: 25 });

    // First wave finishes after the 500 ms minimum, not after 100 ms.
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(result.current.view.results.size).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.view.results.size).toBe(10);
    expect(result.current.view.testing.size).toBe(15);
    expect(result.current.view.progress.get("节点选择")).toEqual({ done: 10, total: 25 });

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(peak).toBe(10);
    expect(testProxy).toHaveBeenCalledWith(expect.objectContaining({ name: "n1" }), "https://group/204", 10_000);
    expect(summary).toEqual({ total: 25, failed: 1 });
    expect(result.current.view.testing.size).toBe(0);
    expect(result.current.view.progress.size).toBe(0);
    expect(onSettled).toHaveBeenCalledTimes(1);

    const failed = liveDelay(result.current.view, group(3).nodes[2]);
    expect(failed).toMatchObject({ testing: false, delay: null, alive: false });
    expect(liveDelay(result.current.view, group(1).nodes[0])).toMatchObject({ delay: 120, alive: true });
  });

  it("gives up at the timeout even if the core never answers", async () => {
    vi.useFakeTimers();
    const testProxy = vi.fn(() => new Promise<number>(() => undefined));
    const { result } = renderHook(() => useDelayTester({ testProxy } as unknown as MihomoClient, "https://default/204", vi.fn(), { timeout: 3000 }));
    let delay: number | undefined;
    act(() => { void result.current.testNode(group(1).nodes[0]).then((value) => { delay = value; }); });
    expect(result.current.view.testing.has("n1")).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(delay).toBe(0);
    expect(testProxy).toHaveBeenCalledWith(expect.objectContaining({ name: "n1" }), "https://default/204", 3000);
    expect(liveDelay(result.current.view, group(1).nodes[0])).toMatchObject({ testing: false, alive: false });
  });
});
