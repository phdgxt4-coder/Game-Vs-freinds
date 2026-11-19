import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { damp, clamp, wrapAngle } from '../src/core/math.js';
import { shapeStick, updateSprintLatch } from '../src/input/stickMath.js';
import { World } from '../src/world/World.js';
import { MeshWorld } from '../src/world/MeshWorld.js';
import { CharacterController } from '../src/systems/CharacterController.js';
import { CameraRig } from '../src/systems/CameraRig.js';
import { Locomotion } from '../src/systems/Locomotion.js';
import { FootstepSystem } from '../src/systems/FootstepSystem.js';

let pass = 0, fail = 0, variant = 'pure';
const test = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', `[${variant}]`, name, '-', e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const near = (a, b, tol, m = '') => ok(Math.abs(a - b) <= tol, `${m} expected ${b}±${tol}, got ${a}`);
const DT = CONFIG.loop.step, P = CONFIG.player;
const cmd = (o = {}) => ({ moveX: 0, moveY: 0, yaw: 0, sprint: false, jump: false, crouch: false, ...o });
const run = (pl, secs, c) => { for (let i = 0; i < Math.round(secs / DT); i++) pl.update(DT, typeof c === 'function' ? c(i) : c); };
const idle = { speed: 0, sprinting: false, crouching: false, grounded: true, stride: 0 };

function boxTris(b) { // closed box, outward CCW triangles
  const [x0, y0, z0, x1, y1, z1] = b, out = [];
  const faces = [[[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[0,0,-1]], [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]], [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]], [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[0,1,0]]];
  for (const f of faces) for (const idx of [[0, 1, 2], [0, 2, 3]]) {
    let [a, b2, c] = idx.map((i) => f[i]);
    const e1 = b2.map((v, k) => v - a[k]), e2 = c.map((v, k) => v - a[k]);
    const n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    if (n[0]*f[4][0]+n[1]*f[4][1]+n[2]*f[4][2] < 0) [b2, c] = [c, b2];
    out.push(...a, ...b2, ...c);
  }
  return out;
}
/** World of the current variant from boxes [x0,y0,z0,x1,y1,z1] plus a ground slab. */
function W(boxes = []) {
  const all = [[-200, -1, -200, 200, 0, 200], ...boxes];
  if (variant === 'box') { const w = new World(); all.forEach((b) => w.addBox(...b)); return w; }
  return new MeshWorld(all.flatMap(boxTris));
}

test('damp is frame-rate independent', () => near(damp(0, 1, 8, 1 / 30), damp(damp(0, 1, 8, 1 / 60), 1, 8, 1 / 60), 1e-9));
test('wrapAngle / clamp', () => { near(wrapAngle(7), 7 - 2 * Math.PI, 1e-9); ok(clamp(5, 0, 1) === 1, 'clamp'); });
test('stick deadzone, range, curve monotonic', () => {
  const R = CONFIG.input.stickRadius; ok(shapeStick(3, 0).mag === 0, 'deadzone'); near(shapeStick(R, 0).mag, 1, 1e-9, 'full'); near(shapeStick(0, -R).y, 1, 1e-9, 'up is +y');
  let prev = 0; for (let d = 8; d <= R; d += 4) { const m = shapeStick(d, 0).mag; ok(m >= prev, 'monotonic'); prev = m; }
});
test('sprint latch (pull past the ring) with hysteresis', () => {
  ok(!updateSprintLatch(false, 1.1), 'inside the pull zone: off'); ok(updateSprintLatch(false, 1.3), 'pulled past the ring: on');
  ok(updateSprintLatch(true, 1.15), 'latched'); ok(!updateSprintLatch(true, 1.0), 'release');
});
test('box world: ground, ceiling, push-out, raycast', () => {
  const w = new World(); w.addBox(-1, 0, -1, 1, 1, 1); w.addBox(5, 2, -1, 7, 3, 1);
  near(w.groundHeight(0, 0, 0.4, 10), 1, 1e-9); near(w.groundHeight(0, 0, 0.4, 0.5), 0, 1e-9);
  near(w.ceilingHeight(6, 0, 0.4, 0), 2, 1e-9); ok(w.ceilingHeight(0, 0, 0.4, 1.2) === Infinity, 'open');
  const p = { x: 1.2, z: 0 }; ok(w.resolveHorizontal(p, 0.4, 0, 1.8), 'hit'); near(p.x, 1.4, 1e-6);
  near(w.raycast(-5, 0.5, 0, 1, 0, 0, 10), 4, 1e-9); ok(w.raycast(-5, 5, 0, 1, 0, 0, 10) === null, 'miss');
});
test('mesh world: ground, ceiling, push-out, raycast, ramp', () => {
  const w = new MeshWorld([[-1, 0, -1, 1, 1, 1], [5, 2, -1, 7, 3, 1]].flatMap(boxTris));
  near(w.groundHeight(0, 0, 0.4, 10), 1, 1e-6); ok(w.groundHeight(0, 0, 0.4, 0.5) === -Infinity, 'void below crate top only');
  near(w.ceilingHeight(6, 0, 0.4, 0), 2, 1e-6); ok(w.ceilingHeight(0, 0, 0.4, 1.2) === Infinity, 'open');
  const p = { x: 1.2, z: 0 }; ok(w.resolveHorizontal(p, 0.4, 0, 1.8), 'hit'); near(p.x, 1.4, 1e-6);
  near(w.raycast(-5, 0.5, 0, 1, 0, 0, 10), 4, 1e-5); ok(w.raycast(-5, 5, 0, 1, 0, 0, 10) === null, 'miss');
  const ramp = new MeshWorld([-2, 0, -2, -2, 2, 2, 2, 2, 2, -2, 0, -2, 2, 2, 2, 2, 0, -2]);
  near(ramp.groundHeight(0, 0, 0.01, 5), 1, 1e-3, 'ramp mid height');
});

for (variant of ['box', 'mesh']) {
  test('controller accelerates to walk, sprints, crouches', () => {
    const pl = new CharacterController(W());
    run(pl, 0.5, cmd({ moveY: 1 })); near(pl.speed, P.walk, 0.01, 'walk');
    run(pl, 0.8, cmd({ moveY: 1, sprint: true })); near(pl.speed, P.sprint, 0.01, 'sprint'); ok(pl.sprinting, 'flag');
    run(pl, 0.5, (i) => cmd({ moveY: 1, sprint: true, crouch: i === 0 })); near(pl.speed, P.crouch, 0.01, 'crouch'); ok(!pl.sprinting, 'no sprint while crouched');
  });
  test('acceleration is gradual', () => { const pl = new CharacterController(W()); pl.update(DT, cmd({ moveY: 1 })); near(pl.speed, P.accelGround * DT, 1e-6); });
  test('forward follows yaw (0 = -z, 90deg = -x)', () => {
    const a = new CharacterController(W()); run(a, 0.3, cmd({ moveY: 1 })); ok(a.z < -0.3 && Math.abs(a.x) < 1e-6, 'yaw0');
    const b = new CharacterController(W()); run(b, 0.3, cmd({ moveY: 1, yaw: Math.PI / 2 })); ok(b.x < -0.3 && Math.abs(b.z) < 1e-6, 'yaw90');
  });
  test('diagonal input is not faster', () => { const pl = new CharacterController(W()); const d = Math.SQRT1_2; run(pl, 0.5, cmd({ moveX: d, moveY: d })); near(pl.speed, P.walk, 0.01); });
  test('jump apex, landing event, grounded again', () => {
    const pl = new CharacterController(W()); let apex = 0, impact = 0;
    run(pl, 1.2, (i) => { apex = Math.max(apex, pl.y); impact = Math.max(impact, pl.events.landImpact); return cmd({ jump: i === 0 }); });
    ok(apex > 1.0 && apex < 1.2, 'apex ' + apex); ok(pl.grounded && Math.abs(pl.y) < 1e-6, 'landed'); ok(impact > 5, 'impact ' + impact);
  });
  test('fast falls never tunnel through the floor', () => {
    const pl = new CharacterController(W()); pl.grounded = false; pl.y = 30; run(pl, 3, cmd());
    ok(pl.grounded && Math.abs(pl.y) < 1e-6, 'landed at ' + pl.y);
  });
  test('no mantling: a jump cannot climb a 1.4 m wall, but can clear a 0.9 m one', () => {
    const climb = (h) => { let top = 0; const pl = new CharacterController(W([[-3, 0, -3, 3, h, -2]]), { x: 0, y: 0, z: 0 }); run(pl, 3, (i) => { if (pl.grounded) top = Math.max(top, pl.y); return cmd({ moveY: 1, jump: i % 20 === 0 }); }); return top; };
    ok(climb(1.4) < 0.01, 'tall wall stays blocked'); ok(climb(0.9) > 0.85, 'low wall can be hopped onto');
  });
  test('coyote time', () => {
    const pl = new CharacterController(W([[-5, 0, -5, 5, 1, 0]]), { x: 0, y: 1, z: -1 });
    for (let i = 0; i < 120 && pl.grounded; i++) pl.update(DT, cmd({ moveY: -1 }));
    ok(!pl.grounded, 'airborne'); pl.update(DT, cmd({ jump: true })); ok(pl.vy > 0, 'jumped in coyote window');
  });
  test('jump buffer', () => {
    const pl = new CharacterController(W()); pl.grounded = false; pl.y = 0.05; pl.vy = -3;
    pl.update(DT, cmd({ jump: true })); ok(pl.grounded, 'landed'); pl.update(DT, cmd()); ok(pl.vy > 0, 'buffered jump fired');
  });
  test('walls block and slide', () => {
    const pl = new CharacterController(W([[-5, 0, -10, 5, 4, -9]]));
    run(pl, 5, cmd({ moveY: 1 })); ok(pl.z >= -9 + P.radius - 1e-3, 'blocked ' + pl.z);
    const x0 = pl.x; run(pl, 0.7, cmd({ moveY: 1, moveX: 1 })); ok(pl.x > x0 + 0.5, 'slides along wall');
  });
  test('stairs: auto step-up, smooth visual offset', () => {
    const bs = []; for (let k = 0; k < 6; k++) bs.push([-2, 0, -2 - 1.2 * (k + 1), 2, 0.3 * (k + 1), -2 - 1.2 * k]);
    const pl = new CharacterController(W(bs)), rs = {}; let maxJump = 0, last = 0;
    run(pl, 3.0, () => { pl.getRenderState(1, rs); maxJump = Math.max(maxJump, Math.abs(rs.y - last)); last = rs.y; return cmd({ moveY: 1 }); });
    near(pl.y, 1.8, 1e-5, 'top of stairs'); ok(pl.grounded, 'grounded'); ok(maxJump < 0.08, 'visual step ' + maxJump);
  });
  test('low ceiling: blocks standing, allows crouch, cannot stand inside', () => {
    const w = W([[-1, 1.45, -6, 1, 1.75, -3]]), pl = new CharacterController(w);
    run(pl, 4, cmd({ moveY: 1 })); ok(pl.z > -3 + 0.3, 'standing blocked at ' + pl.z);
    const c = new CharacterController(w); run(c, 0.1, (i) => cmd({ crouch: i === 0 })); ok(c.crouching, 'crouched');
    run(c, 3.5, cmd({ moveY: 1 })); ok(c.z < -3.5 && c.z > -6.2, 'inside tunnel ' + c.z);
    c.update(DT, cmd({ crouch: true })); ok(c.crouching, 'stays crouched under ceiling');
    run(c, 3, cmd({ moveY: 1 })); c.update(DT, cmd({ crouch: true })); ok(!c.crouching, 'stands after exit');
  });
  test('head bump stops upward velocity', () => {
    const pl = new CharacterController(W([[-3, 2.4, -3, 3, 3, 3]])); let maxHead = 0;
    run(pl, 1, (i) => { maxHead = Math.max(maxHead, pl.y + pl.height); return cmd({ jump: i === 0 }); }); ok(maxHead <= 2.4 + 1e-5, 'head ' + maxHead);
  });
  test('render interpolation is continuous', () => {
    const pl = new CharacterController(W()), rs = {}; let prev = 0;
    for (let i = 0; i < 30; i++) { pl.update(DT, cmd({ moveY: 1 })); for (const a of [0, 0.5, 1]) { pl.getRenderState(a, rs); ok(rs.z <= prev + 1e-9, 'monotonic'); prev = rs.z; } }
  });
  test('footsteps: one per stride half-cycle, silent when still, soft when crouched', () => {
    const pl = new CharacterController(W()), f = new FootstepSystem(), got = [];
    run(pl, 3, () => { f.update(pl, (k, v) => got.push([k, v])); return cmd({ moveY: 1 }); });
    ok(got.length >= 4 && Math.abs(got.length - pl.stride / Math.PI) <= 1.5, `steps ${got.length} vs ${(pl.stride / Math.PI).toFixed(1)}`); ok(got.every(([k]) => k === 'step'), 'concrete');
    const still = new CharacterController(W()), g2 = []; run(still, 1, () => { f.update(still, (k) => g2.push(k)); return cmd(); }); ok(g2.length === 0, 'silent when still');
    const cr = new CharacterController(W()), g3 = []; run(cr, 2, (i) => { f.update(cr, (k, v) => g3.push([k, v])); return cmd({ moveY: 1, crouch: i === 0 }); });
    ok(g3.length > 1 && g3.every(([k, v]) => k === 'stepSoft' && v < 0.5), 'crouch steps are soft');
  });
  test('camera: tps collision pulls in, eases back out', () => {
    const t = { x: 0, y: 0, z: 0, eye: 1.65 };
    const rig = new CameraRig(W([[-5, 0, 1.0, 5, 4, 1.5]])); rig.toggleMode();
    for (let i = 0; i < 30; i++) rig.update(1 / 60, t, idle); ok(rig.pose.z < 1.0, 'in front of wall: ' + rig.pose.z);
    const open = new CameraRig(W()); open.toggleMode(); for (let i = 0; i < 30; i++) open.update(1 / 60, t, idle);
    near(open.pose.z, CONFIG.camera.tps.distance, 0.1, 'full distance in the open');
    rig.world = W(); for (let i = 0; i < 5; i++) rig.update(1 / 60, t, idle); ok(rig.pose.z < CONFIG.camera.tps.distance - 0.5, 'eases out slowly');
    for (let i = 0; i < 300; i++) rig.update(1 / 60, t, idle); near(rig.pose.z, CONFIG.camera.tps.distance, 0.1, 'back to full distance');
  });
}

variant = 'pure';
test('camera: pitch clamp, fov sprint, shake decay, landing dip settles', () => {
  const rig = new CameraRig(new World()); rig.look(0, 100); ok(rig.pitch >= CONFIG.camera.pitchMin, 'pitch clamp');
  const t = { x: 0, y: 0, z: 0, eye: 1.65 };
  for (let i = 0; i < 120; i++) rig.update(1 / 60, t, { speed: 5, sprinting: true, crouching: false, grounded: true, stride: i });
  ok(rig.pose.fov > CONFIG.camera.fov + 8, 'fov ' + rig.pose.fov);
  rig.onLand(14); rig.addTrauma(1); let minY = 9; for (let i = 0; i < 90; i++) { rig.update(1 / 60, t, idle); minY = Math.min(minY, rig.pose.y); }
  ok(minY < 1.65 - 0.05, 'dip visible ' + minY); ok(rig.trauma === 0, 'trauma decayed');
  for (let i = 0; i < 120; i++) rig.update(1 / 60, t, idle);
  near(rig.pose.y, 1.65, 0.002, 'dip settled'); near(rig.pose.roll, 0, 1e-9, 'shake gone');
});
test('locomotion picks the right clip and time scale', () => {
  const L = new Locomotion(), m = { speed: 0, grounded: true, crouching: false, firing: false, dead: false };
  ok(L.update(0.016, m).clip === 'Idle', 'idle');
  m.speed = P.walk; const w = L.update(0.016, m); ok(w.clip === 'Walk' && w.timeScale > 1 && w.timeScale <= 1.7, 'walk ' + w.timeScale);
  m.speed = P.sprint; const r = L.update(0.016, m); ok(r.clip === 'Run_Gun' && r.timeScale >= 0.8 && r.timeScale <= 1.4, 'run');
  m.firing = true; ok(L.update(0.016, m).clip === 'Run_Shoot', 'run shoot'); m.firing = false;
  m.speed = 0; m.crouching = true; ok(L.update(0.016, m).clip === 'Duck', 'duck'); m.crouching = false;
  m.grounded = false; ok(L.update(0.016, m).clip === 'Jump', 'jump'); for (let i = 0; i < 20; i++) L.update(0.016, m); ok(L.update(0.016, m).clip === 'Jump_Idle', 'air loop');
  m.grounded = true; ok(L.update(0.016, m).clip === 'Jump_Land', 'land'); for (let i = 0; i < 30; i++) L.update(0.016, m); ok(L.update(0.016, m).clip === 'Idle', 'back to idle');
  m.dead = true; ok(L.update(0.016, m).clip === 'Death', 'death');
});
test('real map: spawns, grounded on a pad, crosses arena, climbs stairs, ray downrange', () => {
  const d = JSON.parse(readFileSync(new URL('../assets/maps/tdm_map.collision.json', import.meta.url)));
  const w = MeshWorld.fromData(d); ok(w.count === 1284 && d.spawns.length === 10, 'data');
  const sp = d.spawns[2], pl = new CharacterController(w, { x: sp.x, y: sp.y, z: sp.z });
  run(pl, 0.5, cmd()); ok(pl.grounded && Math.abs(pl.y - sp.y) < 0.02, 'grounded on pad ' + pl.y);
  run(pl, 40, cmd({ moveY: 1, yaw: Math.PI })); ok(pl.z > 39.5 && pl.z < 39.7, 'crossed the arena (under the bridge), stopped by the far wall: z=' + pl.z);
  const c = new CharacterController(w, { x: -19, y: 0, z: 0 }); run(c, 9, cmd({ moveY: 1, yaw: -Math.PI / 2 }));
  ok(c.grounded && c.y > 3.9, 'climbs the stairs to the central platform: y=' + c.y);
  const r = w.raycast(sp.x, 1.6, sp.z, 0, 0, 1, 100); ok(r !== null && r > 10, 'ray hits something downrange');
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
