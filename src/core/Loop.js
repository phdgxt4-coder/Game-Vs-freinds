import { CONFIG } from '../config.js';

/** Fixed-timestep simulation with variable-rate rendering (render receives interpolation alpha). */
export class Loop {
  constructor(fixed, render) {
    this.fixed = fixed; this.render = render;
    this.acc = 0; this.last = 0; this.raf = 0; this.running = false;
    this._tick = this._tick.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now(); this.acc = 0;
    this.raf = requestAnimationFrame(this._tick);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  _tick(now) {
    if (!this.running) return;
    const { step, maxFrame, maxSteps } = CONFIG.loop;
    const dt = Math.min((now - this.last) / 1000, maxFrame);
    this.last = now; this.acc += dt;
    let n = 0;
    while (this.acc >= step && n < maxSteps) { this.fixed(step); this.acc -= step; n++; }
    if (n === maxSteps) this.acc = 0; // drop backlog instead of spiralling
    this.render(this.acc / step, dt);
    this.raf = requestAnimationFrame(this._tick);
  }
}
