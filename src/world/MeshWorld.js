const EPS = 1e-4, TOL = 1e-3;
const GROUND = 1, CEILING = 2, WALL = 3;
const cp = { x: 0, z: 0 };

function segPt(px, pz, ax, az, bx, bz, best) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 1e-12 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qz = az + dz * t, d = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
  if (d < best) { cp.x = qx; cp.z = qz; return d; }
  return best;
}

/**
 * Collision world built from a triangle soup (world space, CCW front faces). Same interface as `World`:
 * groundHeight / ceilingHeight / resolveHorizontal / raycast, so the controller and camera work with either.
 * Triangles are classified by normal: ny > 0.5 ground, ny < -0.5 ceiling, otherwise wall.
 */
export class MeshWorld {
  /** @param {ArrayLike<number>} tris flat x0,y0,z0,x1,y1,z1,x2,y2,z2,... @param {Array} spawns optional spawn points */
  constructor(tris, spawns = [], cell = 4) {
    const n = (this.count = tris.length / 9);
    this.t = Float32Array.from(tris); this.cell = cell; this.spawns = spawns;
    this.nrm = new Float32Array(n * 3); this.kind = new Uint8Array(n);
    this.minY = new Float32Array(n); this.maxY = new Float32Array(n);
    this.grid = new Map(); this._mark = new Uint32Array(n); this._stamp = 0; this._buf = [];
    const t = this.t;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const e1x = t[o + 3] - t[o], e1y = t[o + 4] - t[o + 1], e1z = t[o + 5] - t[o + 2];
      const e2x = t[o + 6] - t[o], e2y = t[o + 7] - t[o + 1], e2z = t[o + 8] - t[o + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz);
      this.minY[i] = Math.min(t[o + 1], t[o + 4], t[o + 7]); this.maxY[i] = Math.max(t[o + 1], t[o + 4], t[o + 7]);
      if (l < 1e-9) continue; // degenerate: kind stays 0
      nx /= l; ny /= l; nz /= l;
      this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
      this.kind[i] = ny > 0.5 ? GROUND : ny < -0.5 ? CEILING : WALL;
      const x0 = Math.min(t[o], t[o + 3], t[o + 6]), x1 = Math.max(t[o], t[o + 3], t[o + 6]);
      const z0 = Math.min(t[o + 2], t[o + 5], t[o + 8]), z1 = Math.max(t[o + 2], t[o + 5], t[o + 8]);
      for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++)
        for (let b = Math.floor(z0 / cell); b <= Math.floor(z1 / cell); b++) {
          const k = this._key(a, b); let g = this.grid.get(k);
          if (!g) this.grid.set(k, (g = []));
          g.push(i);
        }
    }
  }
  /** @param {{tris:number[], spawns?:Array}} d */
  static fromData(d) { return new MeshWorld(d.tris, d.spawns || []); }
  _key(i, j) { return (i + 4096) * 8192 + (j + 4096); }
  /** Triangle indices touching the XZ rectangle (reused array). */
  query(minX, minZ, maxX, maxZ) {
    const out = this._buf, c = this.cell, s = ++this._stamp; out.length = 0;
    for (let a = Math.floor(minX / c); a <= Math.floor(maxX / c); a++)
      for (let b = Math.floor(minZ / c); b <= Math.floor(maxZ / c); b++) {
        const g = this.grid.get(this._key(a, b));
        if (g) for (const i of g) if (this._mark[i] !== s) { this._mark[i] = s; out.push(i); }
      }
    return out;
  }
  /** Squared XZ distance from (px,pz) to the triangle's projection; closest point left in `cp`. */
  _dist2(i, px, pz) {
    const t = this.t, o = i * 9, ax = t[o], az = t[o + 2], bx = t[o + 3], bz = t[o + 5], cx = t[o + 6], cz = t[o + 8];
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) > 1e-9) {
      const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) { cp.x = px; cp.z = pz; return 0; }
    }
    let best = Infinity;
    best = segPt(px, pz, ax, az, bx, bz, best); best = segPt(px, pz, bx, bz, cx, cz, best); return segPt(px, pz, cx, cz, ax, az, best);
  }
  _planeY(i, x, z) {
    const o = i * 9, n = this.nrm, j = i * 3;
    return this.t[o + 1] - (n[j] * (x - this.t[o]) + n[j + 2] * (z - this.t[o + 2])) / n[j + 1];
  }
  /** Highest walkable surface at or below maxY under the circle (-Infinity over a void). */
  groundHeight(x, z, r, maxY) {
    let h = -Infinity;
    for (const i of this.query(x - r, z - r, x + r, z + r)) {
      if (this.kind[i] !== GROUND || this.minY[i] > maxY + EPS) continue;
      if (this._dist2(i, x, z) >= r * r) continue;
      const y = this._planeY(i, cp.x, cp.z);
      if (y <= maxY + EPS && y > h) h = y;
    }
    return h;
  }
  /** Lowest underside at or above fromY over the circle (Infinity if open). */
  ceilingHeight(x, z, r, fromY) {
    let h = Infinity;
    for (const i of this.query(x - r, z - r, x + r, z + r)) {
      if (this.kind[i] !== CEILING || this.maxY[i] < fromY - 0.05) continue;
      if (this._dist2(i, x, z) >= r * r) continue;
      const y = this._planeY(i, cp.x, cp.z);
      if (y >= fromY - 0.05 && y < h) h = y;
    }
    return h;
  }
  /** Pushes the circle (p.x, p.z) out of wall triangles overlapping the vertical span (y0, y1). */
  resolveHorizontal(p, r, y0, y1) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const i of this.query(p.x - r, p.z - r, p.x + r, p.z + r)) {
        if (this.kind[i] !== WALL || this.maxY[i] <= y0 + TOL || this.minY[i] >= y1 - TOL) continue; // TOL absorbs float32 vertex error
        const d2 = this._dist2(i, p.x, p.z);
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += (p.x - cp.x) * k; p.z += (p.z - cp.z) * k; }
        else { const nx = this.nrm[i * 3], nz = this.nrm[i * 3 + 2], l = Math.hypot(nx, nz) || 1; p.x += (nx / l) * r; p.z += (nz / l) * r; }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }
  /** Distance along a unit direction to the nearest triangle (two-sided), or null if none within maxT. */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT, t = this.t;
    let best = maxT, hit = false;
    for (const i of this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez))) {
      if (!this.kind[i]) continue;
      const o = i * 9, e1x = t[o + 3] - t[o], e1y = t[o + 4] - t[o + 1], e1z = t[o + 5] - t[o + 2];
      const e2x = t[o + 6] - t[o], e2y = t[o + 7] - t[o + 1], e2z = t[o + 8] - t[o + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = ox - t[o], ty = oy - t[o + 1], tz = oz - t[o + 2];
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d > 1e-4 && d < best) { best = d; hit = true; }
    }
    return hit ? best : null;
  }
}
