import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipLayer } from "./TooltipLayer";

afterEach(() => vi.useRealTimers());

describe("TooltipLayer", () => {
  it("shows an element's data-tip shortly after hovering and hides it on click", async () => {
    vi.useFakeTimers();
    render(<><button type="button" data-tip="测速：逐个测试本组所有节点的延迟">icon</button><TooltipLayer /></>);

    fireEvent.pointerOver(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("测速：逐个测试本组所有节点的延迟");

    fireEvent.pointerDown(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
