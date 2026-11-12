import { describe, expect, it } from "vitest";
import { glassDisplacement } from "./glass-displacement";

describe("glass rim refraction", () => {
  it("leaves the centre and pixels outside the rounded surface undistorted", () => {
    expect(glassDisplacement(200, 100, 400, 200, 20)).toEqual([0, 0]);
    expect(glassDisplacement(0, 0, 400, 200, 20)).toEqual([0, 0]);
  });

  it("bends opposite edges inward equally and fades towards the centre", () => {
    const left = glassDisplacement(2, 100, 400, 200, 20);
    const right = glassDisplacement(398, 100, 400, 200, 20);
    expect(left[0]).toBeGreaterThan(0);
    expect(left[0]).toBe(-right[0]);
    expect(left[1]).toBeCloseTo(0);
    expect(glassDisplacement(10, 100, 400, 200, 20)[0]).toBeLessThan(left[0]);
  });

  it("follows the corner arc and keeps the rim width consistent across surface sizes", () => {
    const corner = glassDisplacement(6, 6, 400, 200, 20);
    expect(corner[0]).toBeGreaterThan(0);
    expect(corner[0]).toBe(corner[1]);
    expect(glassDisplacement(2, 100, 400, 200, 20)).toEqual(glassDisplacement(2, 500, 180, 1000, 20));
    expect(glassDisplacement(0, 0, 0, 0, 20)).toEqual([0, 0]);
  });
});
