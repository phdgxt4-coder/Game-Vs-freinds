/** Device-agnostic input snapshot. Producers (touch/keyboard) write; the game loop reads and consumes edges. */
export class InputState {
  constructor() {
    this.touch = { x: 0, y: 0, sprint: false };
    this.keys = { x: 0, y: 0, sprint: false };
    this.lookX = 0; this.lookY = 0;
    this._jump = false; this._crouch = false; this._cam = false;
  }
  get moveX() { return this.touch.x || this.keys.x; }
  get moveY() { return this.touch.y || this.keys.y; }
  get sprint() { return this.touch.sprint || this.keys.sprint; }
  addLook(dx, dy) { this.lookX += dx; this.lookY += dy; }
  takeLook(out) { out.x = this.lookX; out.y = this.lookY; this.lookX = this.lookY = 0; return out; }
  queueJump() { this._jump = true; }
  queueCrouch() { this._crouch = true; }
  queueCamToggle() { this._cam = true; }
  takeJump() { const v = this._jump; this._jump = false; return v; }
  takeCrouch() { const v = this._crouch; this._crouch = false; return v; }
  takeCamToggle() { const v = this._cam; this._cam = false; return v; }
}
