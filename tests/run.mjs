import { CONFIG } from '../src/config.js';
import { damp, clamp, wrapAngle } from '../src/core/math.js';
import { shapeStick, updateSprintLatch } from '../src/input/stickMath.js';
import { World } from '../src/world/World.js';
import { CharacterController } from '../src/systems/CharacterController.js';
import { CameraRig } from '../src/systems/CameraRig.js';

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const near = (a, b, tol, m = '') => ok(Math.abs(a - b) <= tol, `${m} expected ${b}±${tol}, got ${a}`);
const DT = CONFIG.loop.step, P = CONFIG.player;
const cmd = (o = {}) => ({ moveX: 0, moveY: 0, yaw: 0, sprint: false, jump: false, crouch: false, ...o });
const run = (pl, secs, c) => { for (let i = 0; i < Math.round(secs / DT); i++) pl.update(DT, typeof c === 'function' ? c(i) : c); };

test('damp is frame-rate independent', () => {
  const a = damp(0, 1, 8, 1 / 30), b = damp(damp(0, 1, 8, 1 / 60), 1, 8, 1 / 60);
  near(a, b, 1e-9);
});
test('wrapAngle / clamp', () => { near(wrapAngle(7), 7 - 2 * Math.PI, 1e-9); ok(clamp(5, 0, 1) === 1, 'clamp'); });
test('stick deadzone, range, curve monotonic', () => {
  ok(shapeStick(3, 0).mag === 0, 'deadzone');
  near(shapeStick(56, 0).mag, 1, 1e-9, 'full');
  near(shapeStick(0, -56).y, 1, 1e-9, 'up is +y');
  let prev = 0; for (let d = 8; d <= 56; d += 4) { const m = shapeStick(d, 0).mag; ok(m >= prev, 'monotonic'); prev = m; }
});
test('sprint latch hysteresis', () => {
  ok(!updateSprintLatch(false, 0.85), 'not on below threshold');
  ok(updateSprintLatch(false, 0.95), 'on');
  ok(updateSprintLatch(true, 0.85), 'stays latched');
  ok(!updateSprintLatch(true, 0.7), 'off');
});
test('world: ground, ceiling, push-out, raycast', () => {
  const w = new World(); w.addBox(-1, 0, -1, 1, 1, 1); w.addBox(5, 2, -1, 7, 3, 1);
  near(w.groundHeight(0, 0, 0.4, 10), 1, 1e-9); near(w.groundHeight(0, 0, 0.4, 0.5), 0, 1e-9);
  near(w.ceilingHeight(6, 0, 0.4, 0), 2, 1e-9); ok(w.ceilingHeight(0, 0, 0.4, 1.2) === Infinity, 'open');
  const p = { x: 1.2, z: 0 }; ok(w.resolveHorizontal(p, 0.4, 0, 1.8), 'hit'); near(p.x, 1.4, 1e-6);
  near(w.raycast(-5, 0.5, 0, 1, 0, 0, 10), 4, 1e-9); ok(w.raycast(-5, 5, 0, 1, 0, 0, 10) === null, 'miss');
  near(w.raycast(0, 2, 5, 0, -0.7071, 0, 10) ?? -1, 2 / 0.7071, 1e-3, 'ground ray');
});
test('controller accelerates to walk, sprints, crouches', () => {
  const pl = new CharacterController(new World());
  run(pl, 0.5, cmd({ moveY: 1 })); near(pl.speed, P.walk, 0.01, 'walk');
  run(pl, 0.8, cmd({ moveY: 1, sprint: true })); near(pl.speed, P.sprint, 0.01, 'sprint'); ok(pl.sprinting, 'flag');
  run(pl, 0.5, (i) => cmd({ moveY: 1, sprint: true, crouch: i === 0 })); near(pl.speed, P.crouch, 0.01, 'crouch'); ok(!pl.sprinting, 'no sprint while crouched');
});
test('acceleration is gradual, not instant', () => {
  const pl = new CharacterController(new World()); pl.update(DT, cmd({ moveY: 1 }));
  ok(pl.speed > 0 && pl.speed < P.walk, 'ramping'); near(pl.speed, P.accelGround * DT, 1e-6);
});
test('forward direction follows yaw (yaw 0 = -z, yaw 90deg = -x)', () => {
  const a = new CharacterController(new World()); run(a, 0.3, cmd({ moveY: 1 })); ok(a.z < -0.3 && Math.abs(a.x) < 1e-6, 'yaw0');
  const b = new CharacterController(new World()); run(b, 0.3, cmd({ moveY: 1, yaw: Math.PI / 2 })); ok(b.x < -0.3 && Math.abs(b.z) < 1e-6, 'yaw90');
});
test('diagonal input is not faster', () => {
  const pl = new CharacterController(new World()); const d = Math.SQRT1_2; run(pl, 0.5, cmd({ moveX: d, moveY: d })); near(pl.speed, P.walk, 0.01);
});
test('jump apex, landing event, grounded again', () => {
  const pl = new CharacterController(new World()); let apex = 0, impact = 0;
  run(pl, 1.2, (i) => { apex = Math.max(apex, pl.y); impact = Math.max(impact, pl.events.landImpact); return cmd({ jump: i === 0 }); });
  ok(apex > 1.0 && apex < 1.2, 'apex ' + apex); ok(pl.grounded && pl.y === 0, 'landed'); ok(impact > 5, 'impact ' + impact);
});
test('coyote time allows a jump just after leaving a ledge', () => {
  const w = new World(); w.addBox(-5, 0, -5, 5, 1, 0); const pl = new CharacterController(w, { x: 0, y: 1, z: -1 });
  for (let i = 0; i < 120 && pl.grounded; i++) pl.update(DT, cmd({ moveY: -1 })); // walk +z off the edge
  ok(!pl.grounded, 'airborne'); pl.update(DT, cmd({ jump: true })); ok(pl.vy > 0, 'jumped in coyote window');
});
test('jump buffer: press just before landing still jumps', () => {
  const pl = new CharacterController(new World(), { x: 0, y: 0, z: 0 }); pl.grounded = false; pl.y = 0.05; pl.vy = -3;
  pl.update(DT, cmd({ jump: true })); ok(pl.grounded, 'landed'); pl.update(DT, cmd()); ok(pl.vy > 0, 'buffered jump fired');
});
test('walls block and slide', () => {
  const w = new World(); w.addBox(-5, 0, -10, 5, 4, -9); const pl = new CharacterController(w);
  run(pl, 4, cmd({ moveY: 1 })); ok(pl.z >= -9 + P.radius - 1e-3, 'blocked ' + pl.z);
  const x0 = pl.x; run(pl, 0.5, cmd({ moveY: 1, moveX: 1 })); ok(pl.x > x0 + 0.5, 'slides along wall');
});
test('stairs: step-up without jumping, smooth visual offset', () => {
  const w = new World(); for (let k = 0; k < 6; k++) w.addBox(-2, 0, -2 - 1.2 * (k + 1), 2, 0.3 * (k + 1), -2 - 1.2 * k);
  const pl = new CharacterController(w), rs = {}; let maxJump = 0, last = 0;
  run(pl, 2.15, (i) => { pl.getRenderState(1, rs); maxJump = Math.max(maxJump, Math.abs(rs.y - last)); last = rs.y; return cmd({ moveY: 1 }); });
  near(pl.y, 1.8, 1e-6, 'top of stairs'); ok(pl.grounded, 'grounded'); ok(maxJump < 0.08, 'visual y step ' + maxJump);
});
test('low ceiling: blocks standing, allows crouch, cannot stand inside', () => {
  const w = new World(); w.addBox(-1, 1.45, -6, 1, 1.75, -3); const pl = new CharacterController(w);
  run(pl, 3, cmd({ moveY: 1 })); ok(pl.z > -3 + 0.3, 'standing blocked at ' + pl.z);
  const c = new CharacterController(w); run(c, 0.1, (i) => cmd({ crouch: i === 0 })); ok(c.crouching, 'crouched');
  run(c, 2.5, cmd({ moveY: 1 })); ok(c.z < -3.5 && c.z > -6.2, 'inside tunnel ' + c.z);
  c.update(DT, cmd({ crouch: true })); ok(c.crouching, 'stays crouched under ceiling');
  run(c, 3, cmd({ moveY: 1 })); c.update(DT, cmd({ crouch: true })); ok(!c.crouching, 'stands after exit');
});
test('head bump stops upward velocity', () => {
  const w = new World(); w.addBox(-3, 2.4, -3, 3, 3, 3); const pl = new CharacterController(w);
  let maxHead = 0; run(pl, 1, (i) => { maxHead = Math.max(maxHead, pl.y + pl.height); return cmd({ jump: i === 0 }); }); ok(maxHead <= 2.4 + 1e-6, 'head ' + maxHead);
});
test('render interpolation is continuous', () => {
  const pl = new CharacterController(new World()), rs = {}; let prev = 0;
  for (let i = 0; i < 30; i++) { pl.update(DT, cmd({ moveY: 1 })); for (const a of [0, 0.5, 1]) { pl.getRenderState(a, rs); ok(rs.z <= prev + 1e-9, 'monotonic'); prev = rs.z; } }
});
test('camera: tps collision pulls in, then eases back out', () => {
  const w = new World(); w.addBox(-5, 0, 1.0, 5, 4, 1.5); const rig = new CameraRig(w); rig.toggleMode();
  const t = { x: 0, y: 0, z: 0, eye: 1.65 }, m = { speed: 0, sprinting: false, crouching: false, grounded: true, stride: 0 };
  for (let i = 0; i < 30; i++) rig.update(1 / 60, t, m);
  ok(rig.pose.z < 1.0, 'camera in front of wall: ' + rig.pose.z);
  w.boxes.length = 0; w.grid.clear();
  for (let i = 0; i < 5; i++) rig.update(1 / 60, t, m); ok(rig.pose.z < CONFIG.camera.tps.distance - 0.5, 'eases out slowly');
  for (let i = 0; i < 300; i++) rig.update(1 / 60, t, m); near(rig.pose.z, CONFIG.camera.tps.distance, 0.1, 'back to full distance');
});
test('camera: pitch clamp, fov sprint, shake decay, landing dip settles', () => {
  const rig = new CameraRig(new World()); rig.look(0, 100); ok(rig.pitch >= CONFIG.camera.pitchMin, 'pitch clamp');
  const t = { x: 0, y: 0, z: 0, eye: 1.65 };
  for (let i = 0; i < 120; i++) rig.update(1 / 60, t, { speed: 7, sprinting: true, crouching: false, grounded: true, stride: i });
  ok(rig.pose.fov > CONFIG.camera.fov + 8, 'fov ' + rig.pose.fov);
  rig.onLand(14); rig.addTrauma(1); let minY = 9; for (let i = 0; i < 90; i++) { rig.update(1 / 60, t, { speed: 0, sprinting: false, crouching: false, grounded: true, stride: 0 }); minY = Math.min(minY, rig.pose.y); }
  ok(minY < 1.65 - 0.05, 'dip visible ' + minY); ok(rig.trauma === 0, 'trauma decayed');
  for (let i = 0; i < 120; i++) rig.update(1 / 60, t, { speed: 0, sprinting: false, crouching: false, grounded: true, stride: 0 });
  near(rig.pose.y, 1.65, 0.002, 'dip settled'); near(rig.pose.roll, 0, 1e-9, 'shake gone');
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
