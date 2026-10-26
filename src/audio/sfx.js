// 用 Web Audio 即時合成的音效（不需要音檔）：腳步聲依地面材質不同，以及落地、水花。
// 瀏覽器規定要使用者操作後才能出聲，所以在按下「開始」時呼叫 unlock()。
const STORAGE_KEY = 'naruto-world.sound';

// 各種地面的腳步聲：雜訊經過濾波（決定質感）＋低頻悶響（決定重量）
const SURFACES = {
  stone: { filter: 'bandpass', freq: 2600, q: 1.4, len: 0.05, gain: 0.5, thump: 110, thumpGain: 0.35 },
  dirt: { filter: 'bandpass', freq: 1100, q: 0.9, len: 0.09, gain: 0.55, thump: 80, thumpGain: 0.25, crunch: true },
  grass: { filter: 'highpass', freq: 1800, q: 0.7, len: 0.11, gain: 0.32, thump: 70, thumpGain: 0.15 },
  sand: { filter: 'lowpass', freq: 1400, q: 0.7, len: 0.12, gain: 0.4, thump: 60, thumpGain: 0.15 },
  wood: { filter: 'bandpass', freq: 700, q: 1.2, len: 0.06, gain: 0.35, thump: 150, thumpGain: 0.5 },
  water: { filter: 'lowpass', freq: 2200, q: 0.8, len: 0.16, gain: 0.45, thump: 0, thumpGain: 0, splash: true },
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try { this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* 用預設值 */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // 一秒的白噪音，所有聲音都從這裡取片段
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    this.ctx.resume?.();
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch { /* 忽略 */ }
    return this.enabled;
  }

  get ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  burst({ filter, freq, q, len, gain }, at, vol) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq * (0.85 + Math.random() * 0.3);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, at + len);
    src.connect(f).connect(g).connect(this.master);
    src.start(at, Math.random() * 0.8, len + 0.05);
  }

  thump(freq, gain, at, len = 0.08) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.4, at);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, at + len);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + len);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  // speed：公尺/秒，跑越快踩越重
  step(surface, speed) {
    if (!this.ready) return;
    const s = SURFACES[surface] ?? SURFACES.grass;
    const vol = Math.min(1, 0.35 + speed / 12) * (0.85 + Math.random() * 0.3);
    const at = this.ctx.currentTime;
    this.burst(s, at, vol);
    if (s.crunch) this.burst({ ...s, freq: s.freq * 2.2, len: s.len * 0.6, gain: s.gain * 0.5 }, at + 0.025, vol);
    if (s.thump) this.thump(s.thump, s.thumpGain * vol, at);
  }

  land(surface, impact) {
    if (!this.ready) return;
    const s = SURFACES[surface] ?? SURFACES.grass;
    const vol = Math.min(1.4, impact / 12);
    const at = this.ctx.currentTime;
    this.burst({ ...s, len: s.len * 2.2 }, at, vol);
    if (s.thump || surface !== 'water') this.thump(s.thump || 70, 0.6 * vol, at, 0.14);
  }
}
