import { CONFIG } from '../config.js';
import { clamp } from '../core/math.js';

const C = CONFIG.character;

/**
 * Chooses the animation clip for a character from its motion state (pure logic, no renderer).
 * m: { speed, grounded, crouching, firing, dead }. Returns a shared { clip, timeScale, loop } (alias names, see CharacterModel).
 */
export class Locomotion {
  constructor() {
    this.out = { clip: 'Idle', timeScale: 1, loop: true };
    this.wasGrounded = true; this.airTime = 0; this.landTimer = 0;
  }
  _set(clip, timeScale = 1, loop = true) { const o = this.out; o.clip = clip; o.timeScale = timeScale; o.loop = loop; return o; }
  update(dt, m) {
    if (m.dead) return this._set('Death', 1, false);
    if (!m.grounded) {
      this.airTime = this.wasGrounded ? 0 : this.airTime + dt; this.wasGrounded = false;
      return this.airTime < 0.2 ? this._set('Jump', 1, false) : this._set('Jump_Idle');
    }
    if (!this.wasGrounded) { this.wasGrounded = true; this.landTimer = 0.25; }
    if (this.landTimer > 0) { this.landTimer -= dt; return this._set('Jump_Land', 1, false); }
    const sh = m.firing ? '_Shoot' : '';
    if (m.speed < 0.3) return m.crouching ? this._set('Duck') : this._set(m.firing ? 'Idle_Shoot' : 'Idle');
    if (m.crouching) return this._set('Walk' + sh, clamp(m.speed / C.walkRef, 0.5, 1));
    if (m.speed >= C.runFrom) return this._set(m.firing ? 'Run_Shoot' : 'Run_Gun', clamp(m.speed / C.runRef, 0.8, 1.4));
    return this._set('Walk' + sh, clamp(m.speed / C.walkRef, 0.6, 1.7));
  }
}
