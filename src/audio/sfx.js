// 用 Web Audio 即時合成的音效（不需要音檔）：腳步聲依地面材質不同，以及落地、水花。
// 瀏覽器規定要使用者操作後才能出聲，所以在按下「開始」時呼叫 unlock()。
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
// 發出很短的音、音高邊響邊往上飄（氣泡越小音越高、消失越快）。再疊上腳踩下去的
// 低沉「噗」和濺起的細碎水沫。
function makeSplash(ctx, big) {
  const sr = ctx.sampleRate;
  const len = big ? 0.75 : 0.42;
  const n = Math.floor(sr * len);
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const rnd = Math.random;

  // 1. 踩水的「噗」：低通雜訊，濾波頻率先高後低，起音約 10 毫秒（不會像敲擊）
  let lp1 = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / (big ? 0.11 : 0.06));
    const fc = 250 + (big ? 1100 : 1500) * Math.exp(-t / 0.04);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    lp1 += a * (rnd() * 2 - 1 - lp1);
    lp2 += a * (lp1 - lp2);
    out[i] += lp2 * env * 1.6;
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
    const f0 = 700 + Math.pow(rnd(), 1.6) * 3800;
    const damp = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5); // 氣泡的衰減率（每秒）
    const rise = 0.1 + rnd() * 0.15; // 音高上飄的程度
    const amp = (0.04 + rnd() * 0.08) * Math.exp(-t0 / 0.18) * (900 / f0) ** 0.5;
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
      // 一秒的白噪音，所有聲音都從這裡取片段
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const c = this.ctx;
      this.splashes = {
        small: Array.from({ length: 6 }, () => makeSplash(c, false)),
        big: Array.from({ length: 3 }, () => makeSplash(c, true)),
      };
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

  // 水花：開始時預先算好幾段不同的水花聲（makeSplash），每一步隨機挑一段播放
  splash(vol, big = false) {
    const c = this.ctx;
    const list = big ? this.splashes.big : this.splashes.small;
    const src = c.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const g = c.createGain();
    g.gain.value = 0.8 * vol;
    src.connect(g).connect(this.master);
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
