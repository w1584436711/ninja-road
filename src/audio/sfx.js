// 用 Web Audio 即時合成的音效（不需要音檔）：腳步聲依地面材質不同，以及落地、水花。
// 瀏覽器規定要使用者操作後才能出聲，所以在按下「開始」時呼叫 unlock()。
import { SOUNDS } from './sounds.js';
import { Ambience } from './ambience.js';

const STORAGE_KEY = 'ninja-road.sound';

// 各種地面的腳步聲：雜訊經過濾波（決定質感）＋低頻悶響（決定重量）
const SURFACES = {
  stone: { filter: 'bandpass', freq: 2600, q: 1.4, len: 0.05, gain: 0.5, thump: 110, thumpGain: 0.35 },
  dirt: { filter: 'bandpass', freq: 1100, q: 0.9, len: 0.09, gain: 0.55, thump: 80, thumpGain: 0.25, crunch: true },
  grass: { filter: 'highpass', freq: 1800, q: 0.7, len: 0.11, gain: 0.32, thump: 70, thumpGain: 0.15 },
  sand: { filter: 'lowpass', freq: 1400, q: 0.7, len: 0.12, gain: 0.4, thump: 60, thumpGain: 0.15 },
  wood: { filter: 'bandpass', freq: 700, q: 1.2, len: 0.06, gain: 0.35, thump: 150, thumpGain: 0.5 },
  // 水面另外用 splash() 合成
};

// 一段水花聲。真實的水聲主要來自水裡被打進去的無數小氣泡：每顆氣泡像小鈴一樣
// 發出很短的音、音高邊響邊往上飄（氣泡越小音越高、消失越快）。再疊上水被撥開的
// 「唰」和濺起的細碎水沫。
// 不要放低頻的短促悶響：那種聲音聽起來像敲桌子，不像水。
function makeSplash(ctx, big) {
  const sr = ctx.sampleRate;
  const len = big ? 0.75 : 0.42;
  const n = Math.floor(sr * len);
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const rnd = Math.random;

  // 1. 「唰」：去掉低頻的雜訊（約 900 Hz 以上），慢慢湧起、慢慢消散
  let lp = 0, hp1 = 0, prev1 = 0;
  const lpA = 1 - Math.exp((-2 * Math.PI * 5000) / sr);
  const hp1A = Math.exp((-2 * Math.PI * 900) / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += lpA * (rnd() * 2 - 1 - lp);
    hp1 = hp1A * (hp1 + lp - prev1);
    prev1 = lp;
    const env = (1 - Math.exp(-t / 0.025)) * Math.exp(-t / (big ? 0.16 : 0.09));
    out[i] += hp1 * env * 0.7;
  }

  // 2. 水沫：高頻雜訊切成很多細碎顆粒，密度隨時間變稀
  let prev = 0, hp = 0;
  const hpA = Math.exp((-2 * Math.PI * 2500) / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = rnd() * 2 - 1;
    hp = hpA * (hp + w - prev);
    prev = w;
    const env = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / (big ? 0.2 : 0.1));
    const grain = rnd() < 0.35 + 0.6 * Math.exp(-t / 0.05) ? 1 : 0.15;
    out[i] += hp * env * grain * 0.22;
  }

  // 3. 氣泡：大多集中在剛踩下去時，之後零星冒出
  const bubbles = big ? 90 : 40;
  for (let b = 0; b < bubbles; b++) {
    const t0 = 0.008 + Math.pow(rnd(), 2.2) * len * 0.75;
    const f0 = 1400 + Math.pow(rnd(), 1.4) * 3600; // 低於 1400 Hz 的氣泡聽起來像敲木頭
    const damp = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5); // 氣泡的衰減率（每秒）
    const rise = 0.1 + rnd() * 0.15; // 音高上飄的程度
    const amp = (0.03 + rnd() * 0.06) * Math.exp(-t0 / 0.18) * (1400 / f0) ** 0.5;
    const start = Math.floor(t0 * sr);
    const dur = Math.min(n - start, Math.floor((5 / damp) * sr));
    let phase = rnd() * Math.PI * 2;
    for (let i = 0; i < dur; i++) {
      const t = i / sr;
      const f = f0 * (1 + rise * damp * t);
      phase += (2 * Math.PI * f) / sr;
      const env = (1 - Math.exp(-t / 0.0015)) * Math.exp(-damp * t);
      out[start + i] += Math.sin(phase) * env * amp;
    }
  }

  // 正規化，尾端淡出避免截斷的雜音
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fade = Math.floor(sr * 0.03);
  for (let i = 0; i < n; i++) {
    out[i] *= 0.9 / peak;
    if (i > n - fade) out[i] *= (n - i) / fade;
  }
  return buf;
}

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
      // 兩秒的白噪音，所有聲音都從這裡取片段
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.out = this.master;
      this.lastPlayed = {};
      const c = this.ctx;
      this.splashes = {
        small: Array.from({ length: 6 }, () => makeSplash(c, false)),
        big: Array.from({ length: 3 }, () => makeSplash(c, true)),
      };
      this.ambience = new Ambience(c, this.master);
    }
    this.ctx.resume?.();
  }

  // 環境音音量（0..1）；關閉音效時全部靜音
  setAmbience(levels) {
    if (!this.ambience) return;
    this.ambience.setLevels(this.enabled ? levels : {});
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
    src.buffer = this.noiseBuf;
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

  // ---------- 給 sounds.js 組合音效用的兩種基本聲音 ----------
  // 濾波雜訊：f0 → f1 掃頻，attack 秒湧起、decay 秒消失；delay 延後幾秒再響
  noise({ delay = 0, filter = 'lowpass', f0, f1 = f0, q = 1, attack = 0.005, decay, gain }) {
    const c = this.ctx;
    const at = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    src.connect(f).connect(g).connect(this.out);
    const len = attack + decay + 0.05;
    src.start(at, Math.random() * Math.max(0, 2 - len), len);
  }

  // 音調：f0 → f1 滑音；vib 是顫音的幅度（相對音高）
  tone({ delay = 0, type = 'sine', f0, f1 = f0, attack = 0.005, decay, gain, vib = 0, vibRate = 7 }) {
    const c = this.ctx;
    const at = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
    if (vib) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = vibRate;
      lg.gain.value = f0 * vib;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + attack + decay + 0.05);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  }

  // 播放 sounds.js 裡的音效；vol 已含距離衰減
  play(name, vol = 1) {
    if (!this.ready || vol < 0.03) return;
    const recipe = SOUNDS[name];
    if (!recipe) return;
    // 同一種聲音太密集時（例如五發火球同時爆炸）只響一次
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed[name] ?? -1) < 0.04) return;
    this.lastPlayed[name] = now;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.master);
    this.out = g;
    recipe(this);
    this.out = this.master;
  }

  // 水花：開始時預先算好幾段不同的水花聲（makeSplash），每一步隨機挑一段播放
  splash(vol, big = false) {
    const c = this.ctx;
    const list = big ? this.splashes.big : this.splashes.small;
    const src = c.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const g = c.createGain();
    g.gain.value = 0.8 * vol;
    src.connect(g).connect(this.out);
    src.start();
  }

  // speed：公尺/秒，跑越快踩越重
  step(surface, speed) {
    if (!this.ready) return;
    const vol = Math.min(1, 0.35 + speed / 12) * (0.85 + Math.random() * 0.3);
    if (surface === 'water') {
      this.splash(vol);
      return;
    }
    const s = SURFACES[surface] ?? SURFACES.grass;
    const at = this.ctx.currentTime;
    this.burst(s, at, vol);
    if (s.crunch) this.burst({ ...s, freq: s.freq * 2.2, len: s.len * 0.6, gain: s.gain * 0.5 }, at + 0.025, vol);
    if (s.thump) this.thump(s.thump, s.thumpGain * vol, at);
  }

  land(surface, impact) {
    if (!this.ready) return;
    const vol = Math.min(1.4, impact / 12);
    if (surface === 'water') {
      this.splash(vol, true);
      return;
    }
    const s = SURFACES[surface] ?? SURFACES.grass;
    const at = this.ctx.currentTime;
    this.burst({ ...s, len: s.len * 2.2 }, at, vol);
    this.thump(s.thump || 70, 0.6 * vol, at, 0.14);
  }
}
