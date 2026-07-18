import { describe, expect, it } from "vitest";
import { appendTrafficPoint, bytesPerSecondToMbps } from "./useTrafficStream";

describe("traffic stream helpers", () => {
  it("converts byte rates to Mbps and keeps only the latest samples", () => {
    expect(bytesPerSecondToMbps(2_325_000)).toBe(18.6);
    expect(appendTrafficPoint([{ up: 1, down: 2 }], { up: 3, down: 4 }, 1)).toEqual([{ up: 3, down: 4 }]);
  });
});
