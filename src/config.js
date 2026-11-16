// Single source of truth for all tunables. Units: meters, seconds, radians.
export const CONFIG = Object.freeze({
  loop: Object.freeze({ step: 1 / 60, maxFrame: 0.25, maxSteps: 5 }),
  player: Object.freeze({
    radius: 0.4, heightStand: 1.8, heightCrouch: 1.15, eyeStand: 1.65, eyeCrouch: 1.05,
    stepHeight: 0.4, stepSmooth: 16,
    walk: 4.2, sprint: 7.2, crouch: 2.0, sprintMinForward: 0.5,
    accelGround: 42, decelGround: 36, accelAir: 9, decelAir: 1.2,
    gravity: 22, jump: 7.0, coyote: 0.1, jumpBuffer: 0.12, strideRate: 1.6,
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
    stickRadius: 56, deadzone: 0.12, curve: 1.35, sprintOn: 0.9, sprintOff: 0.78,
    lookSens: 0.0042, mouseSens: 0.0022,
  }),
});
