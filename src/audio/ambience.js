// 環境音：瀑布轟鳴、河水潺潺、海浪、風、雨、夜裡的蟲鳴，以及白天零星的鳥叫。每種是一段預先算好、可以無縫循環的聲音，
// 一直在播，只依玩家離聲源的距離調整音量（setLevels）。

// 一段 seconds 秒的循環聲音：fill(out, sr) 寫入比 seconds 多一點的樣本，
// 多出來的尾巴交叉淡入到開頭，接縫就聽不出來
function makeLoop(ctx, seconds, fill) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.5);
  const tmp = new Float32Array(n + fade);
  fill(tmp, sr);
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  for (let i = 0; i < n; i++) out[i] = tmp[i];
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = tmp[i] * Math.sqrt(t) + tmp[n + i] * Math.sqrt(1 - t);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] *= 0.9 / peak;
  return buf;
}

// 一階低通／高通濾波的係數
const lpA = (f, sr) => 1 - Math.exp((-2 * Math.PI * f) / sr);

// 瀑布：厚重的低頻轟鳴＋中高頻的水沫嘩嘩聲，音量有緩慢的起伏
function fillFalls(out, sr) {
  let l1 = 0, l2 = 0, h = 0, hPrev = 0, m = 0;
  const a1 = lpA(380, sr), a2 = lpA(380, sr), am = lpA(2500, sr);
  const hp = Math.exp((-2 * Math.PI * 1200) / sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const w = Math.random() * 2 - 1;
    l1 += a1 * (w - l1);
    l2 += a2 * (l1 - l2);
    m += am * (w - m);
    h = hp * (h + m - hPrev);
    hPrev = m;
    const swell = 1 + 0.12 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.1 + 1);
    out[i] = (l2 * 3.2 + h * 0.5) * swell;
  }
}

// 河水：輕柔的流水沙沙聲＋很多小氣泡的「啵啵」聲（潺潺的感覺）
function fillRiver(out, sr) {
  let l = 0, h = 0, prev = 0;
  const al = lpA(2200, sr), hp = Math.exp((-2 * Math.PI * 500) / sr);
  for (let i = 0; i < out.length; i++) {
    const w = Math.random() * 2 - 1;
    l += al * (w - l);
    h = hp * (h + l - prev);
    prev = l;
    out[i] = h * 0.25 * (0.8 + 0.2 * Math.sin((i / sr) * 2.1));
  }
  const bubbles = Math.floor((out.length / sr) * 45);
  for (let b = 0; b < bubbles; b++) {
    const start = Math.floor(Math.random() * (out.length - sr * 0.1));
    const f0 = 600 + Math.pow(Math.random(), 1.5) * 2200;
    const damp = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
    const amp = (0.04 + Math.random() * 0.1) * Math.sqrt(900 / f0);
    const dur = Math.min(out.length - start, Math.floor((5 / damp) * sr));
    let phase = Math.random() * 6.28;
    for (let i = 0; i < dur; i++) {
      const t = i / sr;
      phase += (2 * Math.PI * f0 * (1 + 0.15 * damp * t)) / sr;
      out[start + i] += Math.sin(phase) * Math.exp(-damp * t) * (1 - Math.exp(-t / 0.002)) * amp;
    }
  }
}

// 海浪：一道浪「嘩——」地湧上來，再「沙沙」地退下去，約七秒一次
function fillSea(out, sr) {
  let l = 0, l2 = 0;
  const period = 7;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const ph = (t % period) / period;
    // 湧上（快）＋退下（慢）的包絡
    const env = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) ** 2 : Math.exp(-(ph - 0.3) * 4.5);
    const cutoff = 300 + 2200 * env;
    const a = lpA(cutoff, sr);
    const w = Math.random() * 2 - 1;
    l += a * (w - l);
    l2 += a * (l - l2);
    out[i] = l2 * (0.25 + env) + w * 0.015 * env;
  }
}

// 風：低沉的呼呼聲，隨陣風起伏，偶爾帶一點高處的呼嘯
function fillWind(out, sr) {
  let b = 0, b2 = 0, lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const gust = 0.45 + 0.35 * Math.sin(t * 0.7) + 0.2 * Math.sin(t * 1.9 + 2);
    // 共振頻率隨陣風飄動的帶通（狀態變數濾波器）
    const f = 2 * Math.sin((Math.PI * (250 + 450 * gust)) / sr);
    const w = Math.random() * 2 - 1;
    lp += f * b;
    const hp = w - lp - 0.4 * b;
    b += f * hp;
    b2 += lpA(180, sr) * (w - b2);
    out[i] = (b * 0.5 + b2 * 2) * gust * gust;
  }
}

// 雨：密集的細碎雨聲＋偶爾大一點的水滴
function fillRain(out, sr) {
  let l = 0, h = 0, prev = 0;
  const al = lpA(6000, sr), hp = Math.exp((-2 * Math.PI * 1500) / sr);
  for (let i = 0; i < out.length; i++) {
    const w = Math.random() * 2 - 1;
    l += al * (w - l);
    h = hp * (h + l - prev);
    prev = l;
    out[i] = h * 0.35;
  }
  const drops = Math.floor((out.length / sr) * 120);
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(Math.random() * (out.length - sr * 0.05));
    const f0 = 2000 + Math.random() * 3000;
    const damp = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
    const amp = 0.03 + Math.random() * 0.08;
    const dur = Math.floor((4 / damp) * sr);
    let phase = 0;
    for (let i = 0; i < dur && start + i < out.length; i++) {
      const t = i / sr;
      phase += (2 * Math.PI * f0 * (1 + 0.1 * damp * t)) / sr;
      out[start + i] += Math.sin(phase) * Math.exp(-damp * t) * amp;
    }
  }
}

// 蟲鳴：幾隻蟋蟀，各自用不同的音高「唧唧唧」地叫
function fillCrickets(out, sr) {
  for (let k = 0; k < 4; k++) {
    const f = 3800 + Math.random() * 1400;
    const pulse = 0.018, gap = 0.045 + Math.random() * 0.02; // 每一聲「唧」
    const pulses = 3 + Math.floor(Math.random() * 3);
    const period = 0.6 + Math.random() * 0.6; // 每組的間隔
    const amp = 0.25 + Math.random() * 0.25;
    const offset = Math.random() * period;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr + offset;
      const inGroup = t % period;
      const pIdx = Math.floor(inGroup / gap);
      if (pIdx >= pulses) continue;
      const tp = inGroup - pIdx * gap;
      if (tp > pulse) continue;
      const env = Math.sin((tp / pulse) * Math.PI);
      out[i] += Math.sin(2 * Math.PI * f * t) * env * amp;
    }
  }
}

const LOOPS = {
  falls: [6, fillFalls], river: [5, fillRiver], sea: [14, fillSea],
  wind: [12, fillWind], rain: [6, fillRain], crickets: [7, fillCrickets],
};
// 各環境音最大時的音量
const VOLUME = { falls: 0.9, river: 0.45, sea: 0.7, wind: 0.5, rain: 0.55, crickets: 0.12 };

// 幾種鳥叫：[起始頻率, 結束頻率, 長度, 之後的空檔]
const BIRDS = [
  // 「啾啾」：短促上揚
  { notes: [[3200, 4400, 0.05, 0.06]], reps: [2, 5], pause: 0.04 },
  // 「啾——咿」：一長一短往下滑
  { notes: [[4200, 2800, 0.16, 0.05], [3600, 3900, 0.06, 0.0]], reps: [1, 2], pause: 0.5 },
  // 「嘰哩嘰哩」：快速顫音
  { notes: [[5200, 4300, 0.025, 0.015], [4400, 5000, 0.025, 0.015]], reps: [4, 8], pause: 0 },
  // 遠處的「咕—咕—」：低而柔
  { notes: [[1100, 950, 0.22, 0.12], [1000, 900, 0.3, 0.0]], reps: [1, 2], pause: 0.8 },
];

export class Ambience {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.gains = {};
    this.levels = {};
    // 每一幀只算一段循環聲音，開始遊戲時才不會卡一下
    this.pending = Object.entries(LOOPS);
  }

  buildNext() {
    const [name, [sec, fill]] = this.pending.shift();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = makeLoop(ctx, sec, fill);
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(this.dest);
    src.start(ctx.currentTime, Math.random() * sec);
    this.gains[name] = g;
    g.gain.setTargetAtTime((this.levels[name] ?? 0) * VOLUME[name], ctx.currentTime, 0.6);
  }

  // levels：{ falls, river, sea, wind, rain, crickets, birds }，0..1；音量平滑變化
  setLevels(levels) {
    this.levels = levels;
    const now = this.ctx.currentTime;
    for (const [name, g] of Object.entries(this.gains)) {
      g.gain.setTargetAtTime((levels[name] ?? 0) * VOLUME[name], now, 0.6);
    }
    this.birds = levels.birds ?? 0;
  }

  // 每一幀呼叫：白天偶爾有一隻鳥叫一串
  tick(dt) {
    if (this.pending.length) this.buildNext();
    if (this.birds <= 0.02) return;
    this.birdTimer = (this.birdTimer ?? 2) - dt * this.birds;
    if (this.birdTimer > 0) return;
    this.birdTimer = 1.5 + Math.random() * 5;
    this.chirp(BIRDS[Math.floor(Math.random() * BIRDS.length)], 0.3 + Math.random() * 0.7);
  }

  chirp(song, vol) {
    const c = this.ctx;
    const pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = c.createGain();
    out.gain.value = 0.05 * vol;
    out.connect(pan).connect(this.dest);
    let at = c.currentTime + 0.05;
    const reps = song.reps[0] + Math.floor(Math.random() * (song.reps[1] - song.reps[0] + 1));
    const pitch = 0.92 + Math.random() * 0.16;
    for (let r = 0; r < reps; r++) {
      for (const [f0, f1, len, gap] of song.notes) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0 * pitch, at);
        o.frequency.exponentialRampToValueAtTime(f1 * pitch, at + len);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(1, at + Math.min(0.012, len / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + len + 0.02);
        at += len + gap;
      }
      at += song.pause;
    }
    setTimeout(() => out.disconnect(), (at - c.currentTime + 0.5) * 1000);
  }
}

