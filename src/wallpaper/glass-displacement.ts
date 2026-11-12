// A flat centre and a curved rim: only the wallpaper near the edge is refracted.
export function glassDisplacement(x: number, y: number, width: number, height: number, radius: number) {
  const px = x - width / 2;
  const py = y - height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const qx = Math.abs(px) - (width / 2 - r);
  const qy = Math.abs(py) - (height / 2 - r);
  const cx = Math.max(qx, 0);
  const cy = Math.max(qy, 0);
  const corner = Math.hypot(cx, cy);
  const depth = r - corner - Math.min(Math.max(qx, qy), 0);
  const rim = Math.min(18, r);
  if (depth < 0 || depth >= rim || rim === 0) return [0, 0];
  const strength = (1 - depth / rim) ** 2;
  const nx = corner ? cx / corner : Number(qx > qy);
  const ny = corner ? cy / corner : Number(qy >= qx);
  return [-Math.sign(px) * nx * strength, -Math.sign(py) * ny * strength];
}
