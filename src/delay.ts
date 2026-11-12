// Delay classification shared by every speed-test view:
// green < 250 ms, blue < 400 ms, orange above, red for timeout / error.

export const DELAY_TIMEOUT = 10_000;

export type DelayTone = "testing" | "untested" | "timeout" | "good" | "medium" | "slow";

export function delayToneOf(delay: number | null | undefined, alive = true): DelayTone {
  if (delay === undefined || delay === null || delay <= 0) return alive ? "untested" : "timeout";
  if (delay >= DELAY_TIMEOUT) return "timeout";
  if (delay < 250) return "good";
  if (delay < 400) return "medium";
  return "slow";
}

export function delayText(delay: number | null | undefined, alive = true) {
  const tone = delayToneOf(delay, alive);
  if (tone === "untested") return "测速";
  if (tone === "timeout") return "超时";
  return `${delay} ms`;
}

// Measured first (fastest first), then timeouts, then untested.
export function delayRank(delay: number | null | undefined, alive = true) {
  const tone = delayToneOf(delay, alive);
  if (tone === "timeout") return 1e7;
  if (tone === "untested" || tone === "testing") return 2e7;
  return delay as number;
}
