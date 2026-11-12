const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

// 512 B, 1.5 KB, 32.0 GB, 250 GB: one decimal below 100, none above.
export function formatTraffic(bytes: number) {
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

// Split a speed into its number and unit, e.g. ["66.0", "B/s"].
export function speedParts(bytesPerSecond: number): [string, string] {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = Math.max(0, Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return [value >= 100 ? value.toFixed(0) : value.toFixed(1), units[unit]];
}
