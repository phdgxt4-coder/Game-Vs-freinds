import { CONFIG } from '../config.js';
import { shapeStick, updateSprintLatch } from './stickMath.js';

const I = CONFIG.input;

/**
 * Multi-touch controls via Pointer Events. Every pointer is tracked by id, so the move stick,
 * look pad and buttons work simultaneously. The stick is dynamic: it spawns under the thumb and
 * drags its base along when the thumb passes the radius.
 */
export class TouchControls {
  /** @param {import('./InputState.js').InputState} state @param {{moveZone,lookZone,ring,knob,jumpBtn,crouchBtn}} els */
  constructor(state, els) {
    this.s = state; this.e = els;
    this.stick = null; this.look = null; this.latched = false;
    const { moveZone, lookZone, jumpBtn, crouchBtn } = els;
    const ends = ['pointerup', 'pointercancel', 'lostpointercapture'];

    moveZone.addEventListener('pointerdown', (e) => this._stickDown(e));
    moveZone.addEventListener('pointermove', (e) => this._stickMove(e));
    ends.forEach((t) => moveZone.addEventListener(t, (e) => this._stickUp(e)));

    lookZone.addEventListener('pointerdown', (e) => this._lookDown(e));
    lookZone.addEventListener('pointermove', (e) => this._lookMove(e));
    ends.forEach((t) => lookZone.addEventListener(t, (e) => this._lookUp(e)));

    this._button(jumpBtn, () => state.queueJump());
    this._button(crouchBtn, () => state.queueCrouch());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ } }
  _button(el, fn) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); fn(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, () => el.classList.remove('on')));
  }
  _stickDown(e) {
    if (this.stick) return;
    this._capture(this.e.moveZone, e);
    this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    this.e.ring.style.opacity = '1';
    this._stickMove(e);
  }
  _stickMove(e) {
    const st = this.stick;
    if (!st || e.pointerId !== st.id) return;
    let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
    const d = Math.hypot(dx, dy);
    if (d > I.stickRadius) { // drag the base along so the knob stays on the rim
      const k = (d - I.stickRadius) / d;
      st.ox += dx * k; st.oy += dy * k;
      dx = e.clientX - st.ox; dy = e.clientY - st.oy;
    }
    const o = shapeStick(dx, dy);
    this.latched = updateSprintLatch(this.latched, o.mag);
    const t = this.s.touch; t.x = o.x; t.y = o.y; t.sprint = this.latched;
    const r = I.stickRadius;
    this.e.ring.style.transform = `translate3d(${st.ox - r}px,${st.oy - r}px,0)`;
    this.e.knob.style.transform = `translate3d(${dx}px,${dy}px,0)`;
  }
  _stickUp(e) {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    this.stick = null; this.latched = false;
    const t = this.s.touch; t.x = t.y = 0; t.sprint = false;
    this.e.ring.style.opacity = '0';
  }
  _lookDown(e) {
    if (this.look) return;
    this._capture(this.e.lookZone, e);
    this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  _lookMove(e) {
    const l = this.look;
    if (!l || e.pointerId !== l.id) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY;
    const boost = 1 + Math.min(1, Math.hypot(dx, dy) / 40) * 0.6; // slight acceleration for fast flicks
    this.s.addLook(dx * I.lookSens * boost, dy * I.lookSens * boost);
  }
  _lookUp(e) { if (this.look && e.pointerId === this.look.id) this.look = null; }
}
