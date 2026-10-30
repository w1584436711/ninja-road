// 環境音：瀑布轟鳴、河水潺潺、海浪。每種是一段預先算好、可以無縫循環的聲音，
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

const LOOPS = { falls: [6, fillFalls], river: [5, fillRiver], sea: [14, fillSea] };
// 各環境音最大時的音量
const VOLUME = { falls: 0.9, river: 0.45, sea: 0.7 };

export class Ambience {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.gains = {};
    for (const [name, [sec, fill]] of Object.entries(LOOPS)) {
      const src = ctx.createBufferSource();
      src.buffer = makeLoop(ctx, sec, fill);
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(dest);
      src.start(ctx.currentTime, Math.random() * sec);
      this.gains[name] = g;
    }
  }

  // levels：{ falls, river, sea }，0..1；音量平滑變化
  setLevels(levels) {
    const now = this.ctx.currentTime;
    for (const [name, g] of Object.entries(this.gains)) {
      g.gain.setTargetAtTime((levels[name] ?? 0) * VOLUME[name], now, 0.25);
    }
  }
}

