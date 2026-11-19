/** Web Audio wrapper: decodes sound banks once, plays random variants with slight pitch variation. Must be unlocked by a user gesture. */
export class AudioManager {
  constructor() { this.ctx = null; this.master = null; this.banks = new Map(); this.last = new Map(); this.muted = false; this.volume = 0.9; }
  /** Call from a pointer/key event handler. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); this._apply();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    return true;
  }
  _apply() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
  setVolume(v) { this.volume = v; this._apply(); }
  setMuted(m) { this.muted = m; this._apply(); }
  /** @param {Record<string,string[]>} manifest name -> urls. Needs unlock() first; failures degrade to silence for that bank. */
  async load(manifest) {
    await Promise.all(Object.entries(manifest).map(async ([name, urls]) => {
      const bufs = await Promise.all(urls.map(async (u) => {
        try { return await this.ctx.decodeAudioData(await (await fetch(u)).arrayBuffer()); } catch { return null; }
      }));
      this.banks.set(name, bufs.filter(Boolean));
    }));
  }
  play(name, { volume = 1, rate = 1, jitter = 0.06 } = {}) {
    const bank = this.banks.get(name);
    if (!this.ctx || !bank || !bank.length || this.ctx.state !== 'running') return;
    let i = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && i === this.last.get(name)) i = (i + 1) % bank.length; // never the same take twice in a row
    this.last.set(name, i);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = bank[i]; src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * jitter); g.gain.value = volume;
    src.connect(g); g.connect(this.master); src.start();
  }
}
