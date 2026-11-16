import { CONFIG } from '../config.js';
import { damp, lerp } from '../core/math.js';

const P = CONFIG.player, EPS = 1e-4;

/**
 * Kinematic character. Runs on the fixed timestep; getRenderState() interpolates for smooth drawing.
 * Command: { moveX, moveY (forward +), yaw, sprint, jump (edge), crouch (edge, toggles) }.
 */
export class CharacterController {
  constructor(world, spawn = { x: 0, y: 0, z: 0 }) {
    this.world = world;
    this.x = this.px = spawn.x; this.y = this.py = spawn.y; this.z = this.pz = spawn.z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.grounded = true; this.crouching = false; this.sprinting = false;
    this.height = P.heightStand; this.eye = P.eyeStand;
    this.stepOff = 0; this.pStep = 0; this.speed = 0; this.stride = 0;
    this.coyote = 0; this.jumpBuf = 0;
    this.events = { landImpact: 0, jumped: false };
    this._ev = { landImpact: 0, jumped: false };
  }
  update(dt, c) {
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pStep = this.stepOff;
    this._crouch(dt, c);
    this._jump(dt, c);
    this._move(dt, c);
    this._vertical(dt);
    this.stepOff = damp(this.stepOff, 0, P.stepSmooth, dt);
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.grounded) this.stride += this.speed * dt * P.strideRate;
  }
  _canStand() { return this.world.ceilingHeight(this.x, this.z, P.radius, this.y + P.heightCrouch) >= this.y + P.heightStand; }
  _crouch(dt, c) {
    if (c.crouch) {
      if (this.crouching) { if (this._canStand()) this.crouching = false; }
      else if (this.grounded) this.crouching = true;
    }
    this.height = this.crouching ? P.heightCrouch : P.heightStand;
    this.eye = damp(this.eye, this.crouching ? P.eyeCrouch : P.eyeStand, 14, dt);
  }
  _jump(dt, c) {
    this.jumpBuf = c.jump ? P.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    this.coyote = this.grounded ? P.coyote : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) {
      if (this.crouching) { if (!this._canStand()) return; this.crouching = false; this.height = P.heightStand; }
      this.vy = P.jump; this.grounded = false; this.coyote = this.jumpBuf = 0; this.events.jumped = true;
    }
  }
  _move(dt, c) {
    const raw = Math.hypot(c.moveX, c.moveY), mag = Math.min(1, raw);
    this.sprinting = !!c.sprint && !this.crouching && mag > 0.3 && c.moveY >= P.sprintMinForward * mag;
    let tx = 0, tz = 0;
    if (raw > 1e-4) {
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      const ux = (-s * c.moveY + co * c.moveX) / raw, uz = (-co * c.moveY - s * c.moveX) / raw;
      const base = this.crouching ? P.crouch : this.sprinting ? P.sprint : P.walk;
      const amt = this.sprinting ? 1 : mag;
      tx = ux * base * amt; tz = uz * base * amt;
    }
    const accel = this.grounded ? (mag > 0.01 ? P.accelGround : P.decelGround) : (mag > 0.01 ? P.accelAir : P.decelAir);
    const rate = accel * dt, dx = tx - this.vx, dz = tz - this.vz, l = Math.hypot(dx, dz);
    if (l <= rate) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / l) * rate; this.vz += (dz / l) * rate; }

    const ox = this.x, oz = this.z, before = Math.hypot(this.vx, this.vz);
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (this.world.resolveHorizontal(this, P.radius, this.y + P.stepHeight, this.y + this.height)) {
      this.vx = (this.x - ox) / dt; this.vz = (this.z - oz) / dt; // keep the tangential (sliding) part
      const after = Math.hypot(this.vx, this.vz);
      if (after > before && after > 0) { const k = before / after; this.vx *= k; this.vz *= k; }
    }
  }
  _vertical(dt) {
    const w = this.world;
    if (!this.grounded) {
      const headBefore = this.y + this.height;
      this.vy -= P.gravity * dt; this.y += this.vy * dt;
      if (this.vy > 0) {
        const ceil = w.ceilingHeight(this.x, this.z, P.radius, headBefore);
        if (this.y + this.height > ceil) { this.y = ceil - this.height; this.vy = 0; }
      }
    }
    const gh = w.groundHeight(this.x, this.z, P.radius, this.y + P.stepHeight);
    if (this.grounded) {
      if (this.y - gh <= P.stepHeight + EPS) {
        if (Math.abs(this.y - gh) > EPS) this.stepOff += this.y - gh; // hide the snap from the camera
        this.y = gh; this.vy = 0;
      } else { this.grounded = false; this.vy = 0; } // walked off a ledge
    } else if (this.vy <= 0 && this.y <= gh + EPS) {
      this.events.landImpact = Math.max(this.events.landImpact, -this.vy);
      if (this.y < gh) this.stepOff += this.y - gh;
      this.y = gh; this.vy = 0; this.grounded = true;
    }
  }
  /** Returns accumulated events and resets them. The returned object is reused. */
  takeEvents() {
    const e = this._ev;
    e.landImpact = this.events.landImpact; e.jumped = this.events.jumped;
    this.events.landImpact = 0; this.events.jumped = false;
    return e;
  }
  /** Interpolated pose between the last two fixed steps (y includes the step-smoothing offset). */
  getRenderState(alpha, out) {
    out.x = lerp(this.px, this.x, alpha);
    out.y = lerp(this.py + this.pStep, this.y + this.stepOff, alpha);
    out.z = lerp(this.pz, this.z, alpha);
    out.eye = this.eye;
    return out;
  }
}
