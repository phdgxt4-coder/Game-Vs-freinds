import { CONFIG } from '../config.js';
import { clamp, damp, wrapAngle } from '../core/math.js';

const C = CONFIG.camera, T = C.tps, PL = CONFIG.player;
const noise = (t, f, s) => Math.sin(t * f + s) * 0.6 + Math.sin(t * f * 1.93 + s * 2.7) * 0.4;

/**
 * First/third-person camera. Pure math (no renderer dependency): produces `pose` for the renderer.
 * Look is applied immediately (no input lag); position uses frame-rate independent damping.
 */
export class CameraRig {
  constructor(world) {
    this.world = world; this.mode = 'fps';
    this.yaw = 0; this.pitch = 0;
    this.pivot = { x: 0, y: 0, z: 0, init: false };
    this.s = 1; // third-person collision ratio (1 = full distance)
    this.fov = C.fov; this.sprintAmt = 0; this.crouchAmt = 0; this.bobAmt = 0;
    this.dip = 0; this.dipV = 0; this.trauma = 0; this.time = 0;
    this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: C.fov };
  }
  look(dx, dy) { this.yaw = wrapAngle(this.yaw - dx); this.pitch = clamp(this.pitch - dy, C.pitchMin, C.pitchMax); }
  toggleMode() { this.mode = this.mode === 'fps' ? 'tps' : 'fps'; this.pivot.init = false; this.s = 1; }
  addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }
  onLand(impact) {
    this.dipV -= Math.min(impact, 14) * C.landDip;
    this.addTrauma(clamp((impact - 7) / 14, 0, 0.35));
  }
  /** t: interpolated target {x,y,z,eye}; m: motion {speed,sprinting,crouching,grounded,stride}. */
  update(rawDt, t, m) {
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;
    this.sprintAmt = damp(this.sprintAmt, m.sprinting ? 1 : 0, 6, dt);
    this.crouchAmt = damp(this.crouchAmt, m.crouching ? 1 : 0, 8, dt);
    const fovT = C.fov + (C.fovSprint - C.fov) * this.sprintAmt + (C.fovCrouch - C.fov) * this.crouchAmt;
    this.fov = damp(this.fov, fovT, C.fovDamp, dt);

    this.dipV += (-C.dipK * this.dip - C.dipC * this.dipV) * dt;
    this.dip += this.dipV * dt;

    this.trauma = Math.max(0, this.trauma - C.shake.decay * dt);
    const sh = this.trauma * this.trauma, f = C.shake.freq, tm = this.time, a = C.shake.angle, p = this.pose;
    const shPitch = sh * a * noise(tm, f, 1), shYaw = sh * a * noise(tm, f, 7), shRoll = sh * a * 1.4 * noise(tm, f, 13);
    const shX = sh * C.shake.offset * noise(tm, f, 21), shY = sh * C.shake.offset * noise(tm, f, 29);

    if (this.mode === 'fps') this._fps(dt, t, m, p); else this._tps(dt, t, p);
    p.x += shX * Math.cos(this.yaw); p.z -= shX * Math.sin(this.yaw); p.y += shY;
    p.pitch = this.pitch + shPitch; p.yaw = this.yaw + shYaw; p.roll = shRoll; p.fov = this.fov;
    return p;
  }
  _fps(dt, t, m, p) {
    this.bobAmt = damp(this.bobAmt, m.grounded ? clamp(m.speed / PL.sprint, 0, 1) : 0, C.bob.damp, dt);
    const bx = Math.cos(m.stride) * C.bob.x * this.bobAmt, by = Math.sin(m.stride * 2) * C.bob.y * this.bobAmt;
    p.x = t.x + Math.cos(this.yaw) * bx; p.z = t.z - Math.sin(this.yaw) * bx;
    p.y = t.y + t.eye + this.dip + by;
  }
  _tps(dt, t, p) {
    const hx = t.x, hy = t.y + t.eye + this.dip, hz = t.z; // true head: always a valid ray origin
    const pv = this.pivot;
    if (!pv.init) { pv.x = hx; pv.y = hy; pv.z = hz; pv.init = true; }
    pv.x = damp(pv.x, hx, T.followDamp, dt); pv.y = damp(pv.y, hy, T.followDamp * 0.8, dt); pv.z = damp(pv.z, hz, T.followDamp, dt);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const vx = pv.x + sy * cp * T.distance + cy * T.shoulder - hx;
    const vy = pv.y - sp * T.distance - hy;
    const vz = pv.z + cy * cp * T.distance - sy * T.shoulder - hz;
    const len = Math.hypot(vx, vy, vz);
    const hit = this.world.raycast(hx, hy, hz, vx / len, vy / len, vz / len, len + T.margin);
    const allowed = hit === null ? 1 : clamp((hit - T.margin) / len, T.minDist / len, 1);
    this.s = damp(this.s, allowed, allowed < this.s ? T.pullIn : T.pushOut, dt); // snap in, ease out
    p.x = hx + vx * this.s; p.y = Math.max(0.2, hy + vy * this.s); p.z = hz + vz * this.s;
  }
}
