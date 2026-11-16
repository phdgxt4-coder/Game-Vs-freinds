import { CONFIG } from '../config.js';
const out = { x: 0, y: 0, mag: 0 };

/** Radial deadzone + response curve. Input: finger offset in px. Output (shared object): x right+, y up+, mag 0..1. */
export function shapeStick(dx, dy, radius = CONFIG.input.stickRadius, dead = CONFIG.input.deadzone, curve = CONFIG.input.curve) {
  const d = Math.hypot(dx, dy);
  const raw = Math.min(1, d / radius);
  if (raw <= dead || d === 0) { out.x = out.y = out.mag = 0; return out; }
  const m = Math.pow((raw - dead) / (1 - dead), curve);
  out.mag = m; out.x = (dx / d) * m; out.y = (-dy / d) * m;
  return out;
}

/** Hysteresis so sprint does not flicker around the threshold. */
export function updateSprintLatch(latched, mag) {
  return latched ? mag > CONFIG.input.sprintOff : mag >= CONFIG.input.sprintOn;
}
