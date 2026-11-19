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

/** `over` = finger distance / ring radius. Sprint engages when the thumb is pulled past the ring (hysteresis avoids flicker). */
export function updateSprintLatch(latched, over) {
  return latched ? over > CONFIG.input.sprintOff : over >= CONFIG.input.sprintOn;
}
