import { CONFIG } from '../config.js';

/** Desktop input for development (WASD, Shift, Space, C crouch, V camera, mouse look via pointer lock). */
export class KeyboardMouse {
  constructor(state, canvas) {
    this.s = state; this.k = new Set();
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.k.add(e.code);
      if (e.code === 'Space') state.queueJump();
      else if (e.code === 'KeyC') state.queueCrouch();
      else if (e.code === 'KeyV') state.queueCamToggle();
      this._sync();
    });
    addEventListener('keyup', (e) => { this.k.delete(e.code); this._sync(); });
    addEventListener('blur', () => { this.k.clear(); this._sync(); });
    canvas.addEventListener('click', () => { if (matchMedia('(pointer:fine)').matches) canvas.requestPointerLock?.(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) state.addLook(e.movementX * CONFIG.input.mouseSens, e.movementY * CONFIG.input.mouseSens);
    });
  }
  _sync() {
    const k = this.k, has = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    const x = has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft');
    const y = has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown');
    const m = Math.hypot(x, y) || 1;
    this.s.keys.x = x / m; this.s.keys.y = y / m;
    this.s.keys.sprint = k.has('ShiftLeft') && y > 0;
  }
}
