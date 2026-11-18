import { v3, q } from './math3.js';
import { SPEC } from './weaponSpec.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Skeleton description: parents precede children; offsets[k] is the local translation (root = absolute). */
export class RigData {
  constructor(names, parents, offsets) {
    this.names = names; this.parents = parents; this.offsets = offsets;
    this.index = Object.fromEntries(names.map((n, i) => [n, i]));
    this.bind = names.map(() => [0, 0, 0]);
    names.forEach((_, k) => { this.bind[k] = parents[k] < 0 ? offsets[k].slice() : v3.add(this.bind[parents[k]], offsets[k]); });
    const I = this.index, d = (a, b) => v3.len(v3.sub(this.bind[I[b]], this.bind[I[a]]));
    this.armLen = { L: [d('UpperArm_L', 'LowerArm_L'), d('LowerArm_L', 'Hand_L')], R: [d('UpperArm_R', 'LowerArm_R'), d('LowerArm_R', 'Hand_R')] };
  }
  static fromWorldJoints(names, parents, joints) {
    return new RigData(names, parents, joints.map((j, k) => (parents[k] < 0 ? j.slice() : v3.sub(j, joints[parents[k]]))));
  }
}

export function createPose(rig) {
  return { q: rig.names.map(() => [0, 0, 0, 1]), hips: [0, 0, 0], socketPos: [0, 0, 0], socketQuat: [0, 0, 0, 1] };
}

function forward(rig, Q, rootOffset, wp, wq) {
  for (let k = 0; k < rig.names.length; k++) {
    const p = rig.parents[k];
    if (p < 0) { wq[k] = Q[k]; wp[k] = v3.add(rig.offsets[k], rootOffset); }
    else { wq[k] = q.mul(wq[p], Q[k]); wp[k] = v3.add(wp[p], q.rotate(wq[p], rig.offsets[k])); }
  }
}

/** Analytic two-bone IK: elbow position for shoulder S, target T, bone lengths a,b and a pole hint. */
export function elbowPosition(S, T, a, b, pole) {
  const st = v3.sub(T, S);
  const d = clamp(v3.len(st), Math.abs(a - b) + 1e-4, a + b - 1e-4), dir = v3.norm(st);
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  let side = v3.sub(pole, v3.scale(dir, v3.dot(pole, dir)));
  side = v3.len(side) < 1e-6 ? [0, -1, 0] : v3.norm(side);
  return v3.add(S, v3.add(v3.scale(dir, a * cosA), v3.scale(side, a * sinA)));
}

/**
 * Procedural pose for the android: locomotion, crouch, jump, aim pitch, breathing, and a two-handed rifle hold via IK.
 * p: { phase, gait 0..1 (walk->run), move 0..1, crouch 0..1, air 0..1, pitch, time, mode 'body'|'view', sway [x,y] }.
 * Convention: +X rotation swings limbs forward (-Z) and raises the aim.
 */
export function solvePose(rig, p, out) {
  const I = rig.index, Q = out.q;
  for (let k = 0; k < Q.length; k++) { Q[k][0] = Q[k][1] = Q[k][2] = 0; Q[k][3] = 1; }
  const set = (name, x, y, z) => { const e = q.fromEuler(x, y, z); const t = Q[I[name]]; t[0] = e[0]; t[1] = e[1]; t[2] = e[2]; t[3] = e[3]; };
  const body = p.mode === 'body', mv = p.move, cr = p.crouch, air = p.air;
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  const breath = Math.sin(p.time * 1.7) * 0.012;
  const sway = p.sway || [0, 0];

  let pitch = body ? p.pitch : 0;
  const lean = -(0.05 + 0.14 * p.gait * mv + 0.32 * cr);
  if (body) {
    set('Hips', lean, 0, 0);
    set('Spine', 0.35 * pitch, -0.1 * s * mv, 0);
    set('Chest', 0.65 * pitch - lean + breath, -0.08 * s * mv, 0);
    // legs
    const A = lerp(0.42, 0.78, p.gait) * mv, K = lerp(0.55, 1.15, p.gait) * mv;
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const th = sg * A * s, kn = -K * Math.max(0, sg * c);
      const thC = lerp(lerp(th, 1.25, cr), lerp(0.55, 0.15, sg > 0 ? 0 : 1), air);
      const knC = lerp(lerp(kn, -2.3, cr), lerp(-1.0, -0.45, sg > 0 ? 0 : 1), air);
      set('UpperLeg_' + side, thC, 0, sg * -0.02);
      set('LowerLeg_' + side, knC, 0, 0);
      set('Foot_' + side, -(thC + knC) * (1 - 0.35 * air) - 0.1 * mv * Math.max(0, -sg * c), 0, 0);
    }
  }
  // keep the lowest foot planted: translate the hips instead of floating or sinking
  const wp = [], wq = [];
  forward(rig, Q, [0, 0, 0], wp, wq);
  let dy = 0;
  if (body) {
    const ankleBind = rig.bind[I.Foot_L][1];
    dy = ankleBind - Math.min(wp[I.Foot_L][1], wp[I.Foot_R][1]);
    dy = lerp(dy, Math.max(dy, 0) * 0, air); // airborne: no ground contact
  }
  out.hips[0] = 0; out.hips[1] = dy; out.hips[2] = 0;
  forward(rig, Q, out.hips, wp, wq);

  // weapon socket (chest space) with locomotion bob and look sway
  const base = SPEC.socket[p.mode];
  const bob = mv * (body ? 0.6 : 1);
  const sp = [base[0] + Math.cos(p.phase) * 0.008 * bob + sway[0] * 0.025, base[1] + Math.sin(p.phase * 2) * 0.012 * bob + sway[1] * 0.02 + breath * 0.5, base[2]];
  const sq = q.fromEuler(sway[1] * 0.05 + Math.sin(p.phase * 2) * 0.012 * bob, sway[0] * 0.06, Math.cos(p.phase) * 0.01 * bob);
  const chestQ = wq[I.Chest];
  out.socketPos = sp; out.socketQuat = sq;
  const sWorldQ = q.mul(chestQ, sq), sWorldP = v3.add(wp[I.Chest], q.rotate(chestQ, sp));

  // two-handed hold
  for (const side of ['L', 'R']) {
    const U = I['UpperArm_' + side], Lw = I['LowerArm_' + side], H = I['Hand_' + side];
    const S = wp[U], T = v3.add(sWorldP, q.rotate(sWorldQ, SPEC.grips[side]));
    const [a, b] = rig.armLen[side];
    const E = elbowPosition(S, T, a, b, q.rotate(chestQ, SPEC.pole[side]));
    const upWorld = q.fromTo(v3.norm(v3.sub(rig.bind[Lw], rig.bind[U])), v3.norm(v3.sub(E, S)));
    const lowDir = v3.norm(v3.sub(T, E));
    const lowWorld = q.fromTo(v3.norm(v3.sub(rig.bind[H], rig.bind[Lw])), lowDir);
    const he = SPEC.handEuler[side], handWorld = q.mul(sWorldQ, q.fromEuler(he[0], he[1], he[2]));
    Q[U] = q.mul(q.inv(chestQ), upWorld);
    Q[Lw] = q.mul(q.inv(upWorld), lowWorld);
    Q[H] = q.mul(q.inv(lowWorld), handWorld);
  }
  out.q = Q;
  return out;
}
