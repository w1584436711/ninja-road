// 背景音樂：即時合成的和風小曲（不需要音檔）。
// 樂器：琴（Karplus-Strong 撥弦，預先算好每個音）、尺八風的笛（正弦波＋氣聲＋顫音）、
// 低音持續音、太鼓。依情境切換曲子：村子白天、夜晚、野外、戰鬥、頭目戰。
// 旋律用固定種子產生，樂句照 A A B A 的結構重複，聽起來才像一首曲子而不是亂彈。
import { mulberry32 } from '../core/math.js';

const midiHz = m => 440 * 2 ** ((m - 69) / 12);

// 撥弦聲：Karplus-Strong。bright 越高越亮，decay 越接近 1 餘音越長
function pluck(ctx, midi, { bright = 0.5, decay = 0.996, len = 2.2 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * len);
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const period = sr / midiHz(midi);
  const p = Math.max(2, Math.round(period));
  const ring = new Float32Array(p);
  // 起始的雜訊先低通一下，撥弦點不會太刺耳
  let lp = 0;
  for (let i = 0; i < p; i++) {
    lp += (0.25 + bright * 0.7) * (Math.random() * 2 - 1 - lp);
    ring[i] = lp;
  }
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const cur = ring[idx];
    const next = ring[(idx + 1) % p];
    const v = decay * (cur * 0.5 + next * 0.5);
    ring[idx] = v;
    out[i] = cur;
    idx = (idx + 1) % p;
  }
  // 起音稍微圓一點、尾巴淡出
  const fade = Math.floor(sr * 0.25);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) {
    out[i] *= (0.8 / peak) * Math.min(1, i / 40);
    if (i > n - fade) out[i] *= (n - i) / fade;
  }
  return buf;
}

// 一小節八個八分音符；rhythm 是每個音佔幾個八分音符（加起來 8）
const RHYTHMS = [
  [4, 2, 2], [2, 2, 4], [3, 1, 4], [8], [2, 2, 2, 2], [6, 2], [2, 6], [4, 4], [3, 3, 2], [1, 1, 2, 4],
];

// 曲子定義：scale 用半音（相對 root），chords 是每小節的和弦根音（音階的第幾音）
const TRACKS = {
  // 村子白天：明亮的五聲音階，笛子主旋律＋琴分解和弦
  day: {
    root: 62, scale: [0, 2, 4, 7, 9], tempo: 84, seed: 11,
    chords: [0, 3, 4, 0, 0, 3, 1, 4], lead: 'flute', leadOct: 12, density: 0.75,
    accomp: 'arp', drum: null, drone: false, gain: 0.8,
  },
  // 夜晚：都節音階、慢，琴的旋律稀疏，底下一個長音
  night: {
    root: 64, scale: [0, 1, 5, 7, 8], tempo: 60, seed: 23,
    chords: [0, 0, 2, 3, 0, 2, 3, 0], lead: 'koto', leadOct: 12, density: 0.45,
    accomp: 'sparse', drum: null, drone: true, gain: 0.8,
  },
  // 野外：小調五聲，帶一點冒險感，輕輕的太鼓
  wild: {
    root: 57, scale: [0, 3, 5, 7, 10], tempo: 92, seed: 37,
    chords: [0, 0, 3, 2, 0, 0, 3, 4], lead: 'flute', leadOct: 12, density: 0.6,
    accomp: 'ostinato', drum: 'soft', drone: true, gain: 0.55,
  },
  // 戰鬥：快、琴的十六分音符反覆＋太鼓
  battle: {
    root: 62, scale: [0, 1, 5, 7, 8], tempo: 138, seed: 51,
    chords: [0, 0, 3, 2, 0, 0, 4, 3], lead: 'flute', leadOct: 12, density: 0.7,
    accomp: 'drive', drum: 'battle', drone: true, gain: 0.5,
  },
  // 頭目戰：更低更重
  boss: {
    root: 57, scale: [0, 1, 5, 6, 10], tempo: 120, seed: 77,
    chords: [0, 0, 1, 0, 0, 0, 3, 4], lead: 'flute', leadOct: 12, density: 0.8,
    accomp: 'drive', drum: 'boss', drone: true, gain: 0.55,
  },
};

// 依 A A B A 產生 16 小節的旋律：[{ step, len, midi }]，step 以八分音符計
function compose(t) {
  const notes = [];
  const scaleNote = deg => {
    const n = t.scale.length;
    const oct = Math.floor(deg / n);
    return t.root + t.leadOct + oct * 12 + t.scale[((deg % n) + n) % n];
  };
  const phrase = (seed, endOnRoot) => {
    const rng = mulberry32(seed);
    const out = [];
    let deg = 2 + Math.floor(rng() * 3);
    for (let bar = 0; bar < 4; bar++) {
      const chord = t.chords[bar % t.chords.length];
      let rhythm = RHYTHMS[Math.floor(rng() * RHYTHMS.length)];
      if (bar === 3) rhythm = rng() < 0.5 ? [2, 6] : [4, 4]; // 樂句結尾拉長
      let step = bar * 8;
      rhythm.forEach((len, i) => {
        if (i === 0) {
          // 小節的第一個音落在和弦音附近
          const target = chord + (deg > chord + 3 ? 5 : 0);
          deg = Math.abs(target - deg) <= 2 ? target : deg + Math.sign(target - deg);
        } else {
          const r = rng();
          deg += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.94 ? -2 : 0;
        }
        deg = Math.max(-1, Math.min(8, deg));
        if (bar === 3 && i === rhythm.length - 1 && endOnRoot) deg = deg > 3 ? 5 : 0;
        // density 低的曲子會留空拍
        const rest = i > 0 && rng() > t.density;
        if (!rest) out.push({ step, len, midi: scaleNote(deg) });
        step += len;
      });
    }
    return out;
  };
  const A = phrase(t.seed, false), A2 = phrase(t.seed, true), B = phrase(t.seed + 100, false);
  [A, A2, B, A2].forEach((p, i) => p.forEach(n => notes.push({ ...n, step: n.step + i * 32 })));
  return notes;
}

export class Music {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.plucks = new Map();
    this.mood = null;
    this.track = null;
    this.bus = null;
    this.step = 0;
    this.next = 0;
    this.songs = {};
    for (const [k, t] of Object.entries(TRACKS)) this.songs[k] = { t, notes: compose(t) };
  }

  pluckBuf(midi, kind) {
    const key = `${kind}${midi}`;
    let b = this.plucks.get(key);
    if (!b) {
      b = kind === 'koto' ? pluck(this.ctx, midi, { bright: 0.55, decay: 0.997, len: 2.4 })
        : pluck(this.ctx, midi, { bright: 0.85, decay: 0.99, len: 0.9 }); // 三味線風：亮、短
      this.plucks.set(key, b);
    }
    return b;
  }

  // 換曲：舊的淡出，新的從下一拍淡入
  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    const c = this.ctx;
    const now = c.currentTime;
    if (this.bus) {
      const old = this.bus;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + 1.6);
      setTimeout(() => old.disconnect(), 2500);
    }
    this.track = mood ? this.songs[mood] : null;
    if (!this.track) { this.bus = null; return; }
    this.bus = c.createGain();
    this.bus.gain.setValueAtTime(0, now);
    this.bus.gain.linearRampToValueAtTime(this.track.t.gain, now + (mood === 'battle' || mood === 'boss' ? 0.6 : 2.5));
    this.bus.connect(this.dest);
    this.step = 0;
    this.next = now + 0.1;
    this.droneNode = null;
  }

  // 每一幀呼叫：把接下來 0.3 秒內的音排進去
  tick() {
    if (!this.track) return;
    const c = this.ctx;
    const now = c.currentTime;
    if (this.next < now - 0.2) this.next = now + 0.05; // 分頁在背景停過，接回來
    const { t, notes } = this.track;
    const eighth = 60 / t.tempo / 2;
    while (this.next < now + 0.3) {
      this.playStep(this.step, this.next, t, notes, eighth);
      this.step = (this.step + 1) % 128;
      this.next += eighth;
    }
  }

  playStep(step, at, t, notes, eighth) {
    const bar = Math.floor(step / 8) % t.chords.length;
    const beat = step % 8;
    const deg = t.chords[bar];
    const n = t.scale.length;
    const chordNote = (d, oct = 0) => t.root + oct * 12 + Math.floor(d / n) * 12 + t.scale[d % n];

    // 主旋律
    for (const note of notes) {
      if (note.step !== step) continue;
      const dur = note.len * eighth;
      if (t.lead === 'flute') this.flute(note.midi, at, dur);
      else this.pluckNote(note.midi, at, 'koto', 0.5);
    }

    // 伴奏
    const root = chordNote(deg, -1);
    if (t.accomp === 'arp') {
      const seq = [0, 2, 4, 2, 0, 2, 4, 2];
      if (beat % 2 === 0 || beat === 7) this.pluckNote(chordNote(deg + seq[beat], -1), at, 'koto', 0.22);
    } else if (t.accomp === 'sparse') {
      if (beat === 0) this.pluckNote(root, at, 'koto', 0.3);
      if (beat === 4 && bar % 2 === 1) this.pluckNote(chordNote(deg + 2, -1), at, 'koto', 0.2);
    } else if (t.accomp === 'ostinato') {
      const seq = [0, null, 2, 0, null, 2, 4, 2];
      if (seq[beat] !== null) this.pluckNote(chordNote(deg + seq[beat], -1), at, 'koto', 0.18);
    } else if (t.accomp === 'drive') {
      // 十六分音符：每個八分音符彈兩下
      const seq = [0, 0, 2, 0, 3, 0, 2, 1];
      this.pluckNote(chordNote(deg + seq[beat], -1), at, 'sami', 0.16);
      this.pluckNote(chordNote(deg, -1), at + eighth / 2, 'sami', 0.1);
    }

    // 低音持續音：每兩小節換一次
    if (t.drone && beat === 0 && bar % 2 === 0) this.drone(chordNote(deg, -2), at, eighth * 16);

    // 太鼓
    if (t.drum === 'soft' && (beat === 0 || (beat === 5 && bar % 2 === 1))) this.taiko(at, beat === 0 ? 0.35 : 0.22);
    if (t.drum === 'battle') {
      if (beat === 0 || beat === 3 || beat === 6) this.taiko(at, beat === 0 ? 0.7 : 0.45);
      if (beat === 4) this.rim(at, 0.25);
      if (bar === 7 && beat >= 4) this.taiko(at + eighth / 2, 0.4);
    }
    if (t.drum === 'boss') {
      if (beat === 0 || beat === 4) this.taiko(at, 0.85, 50);
      if (beat === 2 || beat === 6) this.taiko(at, 0.4);
      if (beat === 7) this.rim(at, 0.3);
    }
  }

  pluckNote(midi, at, kind, gain) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.pluckBuf(midi, kind);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.bus);
    src.start(at);
  }

  // 尺八風的笛：起音從稍低的音滑上來，拉長的音後半加上顫音，帶一點氣聲
  flute(midi, at, dur) {
    const c = this.ctx;
    const f = midiHz(midi);
    const len = Math.max(0.18, dur * 0.95);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.97, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.07);
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f * 2 * 0.97, at);
    o2.frequency.exponentialRampToValueAtTime(f * 2, at + 0.07);
    if (len > 0.5) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 5.2;
      lg.gain.setValueAtTime(0, at);
      lg.gain.linearRampToValueAtTime(0, at + len * 0.4);
      lg.gain.linearRampToValueAtTime(f * 0.012, at + len);
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + len + 0.1);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + 0.06);
    g.gain.setValueAtTime(0.16, at + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.12);
    const g2 = c.createGain();
    g2.gain.value = 0.12;
    o.connect(g);
    o2.connect(g2).connect(g);
    // 氣聲
    const ns = c.createBufferSource();
    ns.buffer = this.noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, at);
    ng.gain.exponentialRampToValueAtTime(0.18, at + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.03, at + 0.2);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.1);
    ns.connect(bp).connect(ng).connect(g);
    g.connect(this.bus);
    o.start(at); o2.start(at); ns.start(at, Math.random());
    o.stop(at + len + 0.2); o2.stop(at + len + 0.2); ns.stop(at + len + 0.2);
  }

  // 低音持續音：兩個略微走音的三角波，柔和地湧起、消散
  drone(midi, at, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.09, at + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, at + dur * 1.05);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.connect(g).connect(this.bus);
    for (const [ratio, det] of [[1, -4], [1, 4], [1.5, 0]]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midiHz(midi) * ratio;
      o.detune.value = det;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur * 1.1);
    }
  }

  // 太鼓：低沉、有餘韻的「咚——」（不是短促的悶響）
  taiko(at, gain, f = 62) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, at + 0.7);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain * 0.9, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
    o.connect(g).connect(this.bus);
    o.start(at);
    o.stop(at + 0.8);
    // 鼓皮的沙沙聲
    const ns = c.createBufferSource();
    ns.buffer = this.noise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = c.createGain();
    ng.gain.setValueAtTime(gain * 0.35, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    ns.connect(lp).connect(ng).connect(this.bus);
    ns.start(at, Math.random());
    ns.stop(at + 0.2);
  }

  // 鼓邊：短而高的「喀」
  rim(at, gain) {
    const c = this.ctx;
    const ns = c.createBufferSource();
    ns.buffer = this.noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    ns.connect(bp).connect(g).connect(this.bus);
    ns.start(at, Math.random());
    ns.stop(at + 0.08);
  }

  noise() {
    if (!this.noiseBuf) {
      const c = this.ctx;
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }
}
