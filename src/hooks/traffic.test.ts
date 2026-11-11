import { describe, expect, it } from "vitest";
import { appendTrafficPoint, bytesPerSecondToMbps } from "./useTrafficStream";

describe("traffic stream helpers", () => {
  it("converts byte rates to Mbps and keeps only the latest samples", () => {
    expect(bytesPerSecondToMbps(2_325_000)).toBe(18.6);
    expect(appendTrafficPoint([{ up: 1, down: 2 }], { up: 3, down: 4 }, 1)).toEqual([{ up: 3, down: 4 }]);
  });
});

describe("speed formatting", () => {
  it("splits adaptive speeds into number and unit like Clash Verge", async () => {
    const { speedParts } = await import("../format");
    expect(speedParts(66)).toEqual(["66.0", "B/s"]);
    expect(speedParts(438)).toEqual(["438", "B/s"]);
    expect(speedParts(1536)).toEqual(["1.5", "KB/s"]);
    expect(speedParts(25 * 1024 * 1024)).toEqual(["25.0", "MB/s"]);
  });
});
