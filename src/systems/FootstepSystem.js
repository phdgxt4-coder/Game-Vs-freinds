/** Emits a step whenever the controller's stride phase crosses a multiple of PI (one foot strike), with volume by gait. */
export class FootstepSystem {
  constructor() { this.phase = 0; }
  /** emit(kind 'step'|'stepSoft', volume) is called per foot strike. */
  update(m, emit) {
    const phase = Math.floor(m.stride / Math.PI);
    if (phase !== this.phase) {
      this.phase = phase;
      if (m.grounded && m.speed > 0.5) m.crouching ? emit('stepSoft', 0.35) : emit('step', m.sprinting ? 0.9 : 0.55);
    }
  }
}
