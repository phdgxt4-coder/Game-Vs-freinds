// Single source of truth for all tunables. Units: meters, seconds, radians.
export const CONFIG = Object.freeze({
  loop: Object.freeze({ step: 1 / 60, maxFrame: 0.25, maxSteps: 5 }),
  player: Object.freeze({
    radius: 0.4, heightStand: 1.8, heightCrouch: 1.15, eyeStand: 1.65, eyeCrouch: 1.05,
    stepHeight: 0.4, stepSmooth: 16,
    walk: 3.0, sprint: 5.2, crouch: 1.6, sprintMinForward: 0.5,
    accelGround: 30, decelGround: 28, accelAir: 7, decelAir: 1.2,
    gravity: 22, jump: 7.0, coyote: 0.1, jumpBuffer: 0.12, airStep: 0.05, stepWalk: 0.95, stepRun: 1.6,
  }),
  camera: Object.freeze({
    fov: 72, fovSprint: 83, fovCrouch: 69, fovDamp: 8, near: 0.1, far: 260,
    pitchMin: -1.35, pitchMax: 1.35,
    tps: Object.freeze({ distance: 3.4, shoulder: 0.55, followDamp: 14, margin: 0.3, minDist: 0.5, pullIn: 90, pushOut: 3.5 }),
    shake: Object.freeze({ decay: 1.6, angle: 0.05, offset: 0.1, freq: 24 }),
    bob: Object.freeze({ x: 0.02, y: 0.035, damp: 8 }),
    dipK: 180, dipC: 20, landDip: 0.12,
  }),
  input: Object.freeze({
    stickRadius: 70, stickReach: 1.6, deadzone: 0.12, curve: 1.35, sprintOn: 1.25, sprintOff: 1.08, // sprint = pull the thumb past the ring
    lookSens: 0.0032, mouseSens: 0.0022,
  }),
  character: Object.freeze({
    model: './assets/characters/hazmat.glb', weapon: 'AK', yawOffset: Math.PI, // model faces +Z, game forward is -Z
    fade: 0.18, walkRef: 1.9, runRef: 4.6, runFrom: 3.8,
    aim: Object.freeze({ Abdomen: 0.2, Torso: 0.45, Head: 0.25 }), // share of camera pitch applied per bone
  }),
});
