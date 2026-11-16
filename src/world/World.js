import { clamp } from '../core/math.js';

const EPS = 1e-4;
const slab = { t0: 0, t1: 0 };

function slabAxis(o, d, mn, mx) {
  if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
  let a = (mn - o) / d, c = (mx - o) / d;
  if (a > c) { const t = a; a = c; c = t; }
  if (a > slab.t0) slab.t0 = a;
  if (c < slab.t1) slab.t1 = c;
  return slab.t0 <= slab.t1;
}
function rayBox(b, ox, oy, oz, dx, dy, dz) {
  slab.t0 = 0; slab.t1 = Infinity;
  if (!slabAxis(ox, dx, b.minX, b.maxX) || !slabAxis(oy, dy, b.minY, b.maxY) || !slabAxis(oz, dz, b.minZ, b.maxZ)) return null;
  return slab.t0 > 0 ? slab.t0 : null; // origin inside a box counts as no hit
}
function overlapCircle(b, x, z, r) {
  const dx = x - clamp(x, b.minX, b.maxX), dz = z - clamp(z, b.minZ, b.maxZ);
  return dx * dx + dz * dz < r * r;
}

/** Static collision world of axis-aligned boxes (y up) over a ground plane at y = 0, indexed by a uniform XZ grid. */
export class World {
  constructor(cell = 8) { this.cell = cell; this.boxes = []; this.grid = new Map(); this._stamp = 0; this._buf = []; }
  _key(i, j) { return (i + 2048) * 4096 + (j + 2048); }
  addBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, stamp: 0 }, c = this.cell;
    this.boxes.push(b);
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = this._key(i, j); let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(b);
      }
    return b;
  }
  /** Boxes touching the XZ rectangle. The returned array is reused: consume it before the next query. */
  query(minX, minZ, maxX, maxZ) {
    const out = this._buf, c = this.cell, s = ++this._stamp;
    out.length = 0;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const a = this.grid.get(this._key(i, j));
        if (a) for (const b of a) if (b.stamp !== s) { b.stamp = s; out.push(b); }
      }
    return out;
  }
  /** Highest walkable surface at or below maxY under the circle. */
  groundHeight(x, z, r, maxY) {
    let h = 0;
    for (const b of this.query(x - r, z - r, x + r, z + r))
      if (b.maxY <= maxY + EPS && b.maxY > h && overlapCircle(b, x, z, r)) h = b.maxY;
    return h;
  }
  /** Lowest underside at or above fromY over the circle (Infinity when open sky). */
  ceilingHeight(x, z, r, fromY) {
    let h = Infinity;
    for (const b of this.query(x - r, z - r, x + r, z + r))
      if (b.minY >= fromY - 0.05 && b.minY < h && overlapCircle(b, x, z, r)) h = b.minY;
    return h;
  }
  /** Push a circle (p.x, p.z) out of every box overlapping the vertical span (y0, y1). Returns true if it moved. */
  resolveHorizontal(p, r, y0, y1) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of this.query(p.x - r, p.z - r, p.x + r, p.z + r)) {
        if (b.maxY <= y0 || b.minY >= y1) continue;
        const dx = p.x - clamp(p.x, b.minX, b.maxX), dz = p.z - clamp(p.z, b.minZ, b.maxZ), d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
        else { // centre inside the box: leave through the nearest face
          const l = p.x - b.minX, rt = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z, m = Math.min(l, rt, t, bt);
          if (m === l) p.x = b.minX - r; else if (m === rt) p.x = b.maxX + r; else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }
  /** Distance along a unit direction to the first surface (boxes + ground plane), or null if none within maxT. */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = false;
    if (dy < -1e-6) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; hit = true; } }
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    for (const b of this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez))) {
      const t = rayBox(b, ox, oy, oz, dx, dy, dz);
      if (t !== null && t < best) { best = t; hit = true; }
    }
    return hit ? best : null;
  }
}
