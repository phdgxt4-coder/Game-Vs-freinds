// Minimal allocation-light vector/quaternion math. Vectors: [x,y,z]. Quaternions: [x,y,z,w] (unit).
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

export const q = {
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },
  inv: (a) => [-a[0], -a[1], -a[2], a[3]],
  rotate(a, v) { // v' = a * v * a^-1
    const t = v3.scale(v3.cross([a[0], a[1], a[2]], v), 2);
    return v3.add(v3.add(v, v3.scale(t, a[3])), v3.cross([a[0], a[1], a[2]], t));
  },
  fromAxisAngle(axis, ang) { const s = Math.sin(ang / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)]; },
  /** Same convention as three.js Euler order 'XYZ'. */
  fromEuler(x, y, z) { return q.mul(q.mul(q.fromAxisAngle([1, 0, 0], x), q.fromAxisAngle([0, 1, 0], y)), q.fromAxisAngle([0, 0, 1], z)); },
  /** Shortest-arc rotation taking unit vector a onto unit vector b. */
  fromTo(a, b) {
    const d = v3.dot(a, b);
    if (d < -0.999999) {
      const ax = Math.abs(a[0]) < 0.9 ? v3.cross(a, [1, 0, 0]) : v3.cross(a, [0, 1, 0]);
      return q.fromAxisAngle(v3.norm(ax), Math.PI);
    }
    const c = v3.cross(a, b), w = 1 + d, l = Math.hypot(c[0], c[1], c[2], w);
    return [c[0] / l, c[1] / l, c[2] / l, w / l];
  },
};
