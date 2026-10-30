// 戰鬥與介面音效的配方。每個配方用 Sfx 的兩種基本聲音組合：
//   s.noise({ filter, f0, f1, q, attack, decay, gain, delay })  濾波雜訊（風、爆炸、打擊）
//   s.tone({ type, f0, f1, attack, decay, gain, vib, delay })     音調（金屬、鈴聲、嚎叫）
// 播放：sfx.play('名稱', 音量)；戰鬥中用 combat.sound(名稱, 位置) 會自動依距離調小聲。
const r = (a, b) => a + Math.random() * (b - a);

export const SOUNDS = {
  // ---------- 體術 ----------
  // 揮拳的破風聲
  swing: s => s.noise({ filter: 'bandpass', f0: r(500, 700), f1: r(2000, 2600), q: 1.4, attack: 0.04, decay: 0.12, gain: 1.3 }),
  // 迴旋踢：比較長、比較低的破風
  swingHeavy: s => s.noise({ filter: 'bandpass', f0: 350, f1: 1600, q: 1.2, attack: 0.07, decay: 0.2, gain: 1.5 }),
  // 打中：短促的「啪」＋身體的悶響
  hit: s => {
    s.noise({ filter: 'lowpass', f0: 3500, f1: 600, q: 0.8, attack: 0.002, decay: 0.07, gain: 0.55 });
    s.tone({ f0: r(150, 180), f1: 70, attack: 0.002, decay: 0.1, gain: 0.5 });
  },
  hitHeavy: s => {
    s.noise({ filter: 'lowpass', f0: 3000, f1: 300, q: 0.8, attack: 0.002, decay: 0.16, gain: 0.55 });
    s.tone({ f0: 130, f1: 45, attack: 0.002, decay: 0.2, gain: 0.55 });
    s.noise({ filter: 'highpass', f0: 4000, attack: 0.002, decay: 0.05, gain: 0.2 });
  },
  // 主角被打
  hurt: s => {
    s.noise({ filter: 'lowpass', f0: 2000, f1: 400, attack: 0.002, decay: 0.12, gain: 0.6 });
    s.tone({ f0: 110, f1: 50, attack: 0.002, decay: 0.18, gain: 0.7 });
  },

  // ---------- 苦無 ----------
  throw: s => s.noise({ filter: 'highpass', f0: 1800, f1: 5000, q: 0.9, attack: 0.02, decay: 0.1, gain: 0.25 }),
  // 插進地面或木頭：金屬的「叮」
  clink: s => {
    const f = r(2400, 2900);
    s.tone({ f0: f, attack: 0.001, decay: 0.18, gain: 0.08 });
    s.tone({ f0: f * 1.51, attack: 0.001, decay: 0.12, gain: 0.05 });
    s.noise({ filter: 'highpass', f0: 5000, attack: 0.001, decay: 0.03, gain: 0.15 });
  },

  // ---------- 忍術 ----------
  // 結印：手指交扣的輕響
  seal: s => {
    s.noise({ filter: 'bandpass', f0: 2600, q: 2, attack: 0.001, decay: 0.035, gain: 0.3 });
    s.tone({ f0: r(880, 960), attack: 0.001, decay: 0.06, gain: 0.06 });
  },
  // 結印成功、發動忍術：往上揚的鈴聲＋查克拉湧起
  cast: s => {
    s.tone({ type: 'triangle', f0: 660, f1: 1320, attack: 0.01, decay: 0.3, gain: 0.2 });
    s.tone({ type: 'triangle', f0: 990, f1: 1980, attack: 0.01, decay: 0.25, gain: 0.1, delay: 0.04 });
    s.noise({ filter: 'bandpass', f0: 400, f1: 3000, q: 1, attack: 0.12, decay: 0.15, gain: 0.7 });
  },
  // 失敗（結錯印、查克拉不足）
  fail: s => s.tone({ type: 'triangle', f0: 260, f1: 180, attack: 0.005, decay: 0.18, gain: 0.12 }),
  // 白煙（替身術、分身出現或消失）
  poof: s => {
    s.noise({ filter: 'lowpass', f0: 2400, f1: 300, q: 0.7, attack: 0.01, decay: 0.3, gain: 0.45 });
    s.noise({ filter: 'highpass', f0: 3000, attack: 0.005, decay: 0.08, gain: 0.12 });
  },
  // 火球發射：呼嘯的火焰
  fire: s => {
    s.noise({ filter: 'lowpass', f0: 500, f1: 1800, q: 1.5, attack: 0.05, decay: 0.35, gain: 1.3 });
    s.noise({ filter: 'bandpass', f0: 3000, q: 0.8, attack: 0.02, decay: 0.3, gain: 0.35 }); // 劈啪
  },
  // 爆炸：低沉的轟＋碎裂聲＋長長的餘音
  explosion: s => {
    s.noise({ filter: 'lowpass', f0: 1600, f1: 120, q: 0.7, attack: 0.004, decay: 0.9, gain: 0.9 });
    s.tone({ f0: 90, f1: 32, attack: 0.004, decay: 0.6, gain: 0.8 });
    s.noise({ filter: 'highpass', f0: 2500, attack: 0.002, decay: 0.12, gain: 0.25 });
  },
  // 雷光槍：電流的「滋——」
  zap: s => {
    s.tone({ type: 'sawtooth', f0: 1400, f1: 300, attack: 0.003, decay: 0.25, gain: 0.08, vib: 0.3, vibRate: 60 });
    s.noise({ filter: 'highpass', f0: 3500, attack: 0.003, decay: 0.2, gain: 0.3 });
  },
  // 落雷：清脆的劈裂聲，接著隆隆雷鳴
  thunder: s => {
    s.noise({ filter: 'highpass', f0: 1500, attack: 0.001, decay: 0.12, gain: 0.8 });
    s.noise({ filter: 'lowpass', f0: 700, f1: 90, attack: 0.03, decay: 1.4, gain: 0.8, delay: 0.04 });
    s.tone({ f0: 60, f1: 35, attack: 0.05, decay: 1.0, gain: 0.5, delay: 0.04 });
  },
  // 水遁：水柱湧出
  water: s => {
    s.splash(1, true);
    s.noise({ filter: 'bandpass', f0: 600, f1: 1800, q: 0.8, attack: 0.06, decay: 0.3, gain: 0.3 });
  },
  // 東西掉進水裡
  plop: s => s.splash(0.5),
  // 風遁：一陣強風
  wind: s => {
    s.noise({ filter: 'bandpass', f0: 300, f1: 1400, q: 2.5, attack: 0.12, decay: 0.45, gain: 2.6 });
    s.noise({ filter: 'bandpass', f0: 2500, f1: 900, q: 3, attack: 0.08, decay: 0.4, gain: 0.8 });
  },
  // 土遁：岩石碎裂、地面隆起
  rock: s => {
    s.noise({ filter: 'lowpass', f0: 900, f1: 150, q: 0.8, attack: 0.01, decay: 0.5, gain: 0.8 });
    for (let i = 0; i < 5; i++) {
      s.noise({ filter: 'bandpass', f0: r(800, 2500), q: 3, attack: 0.002, decay: r(0.03, 0.07), gain: 0.35, delay: r(0, 0.25) });
    }
    s.tone({ f0: 70, f1: 40, attack: 0.01, decay: 0.4, gain: 0.6 });
  },

  // ---------- 敵人 ----------
  // 狼王嚎叫
  howl: s => {
    s.tone({ type: 'sawtooth', f0: 280, f1: 520, attack: 0.25, decay: 1.1, gain: 0.15, vib: 0.03, vibRate: 6 });
    s.tone({ f0: 560, f1: 1040, attack: 0.25, decay: 1.1, gain: 0.25, vib: 0.03, vibRate: 6 });
  },
  // 敵人倒下
  down: s => {
    s.noise({ filter: 'lowpass', f0: 800, f1: 200, attack: 0.01, decay: 0.25, gain: 0.5 });
    s.tone({ f0: 90, f1: 45, attack: 0.01, decay: 0.25, gain: 0.5 });
  },

  // ---------- 獎勵 ----------
  coin: s => {
    s.tone({ f0: 1760, attack: 0.002, decay: 0.08, gain: 0.08 });
    s.tone({ f0: 2640, attack: 0.002, decay: 0.25, gain: 0.08, delay: 0.07 });
  },
  levelUp: s => {
    [523, 659, 784, 1047].forEach((f, i) => s.tone({ type: 'triangle', f0: f, attack: 0.01, decay: i === 3 ? 0.7 : 0.18, gain: 0.14, delay: i * 0.09 }));
    s.tone({ f0: 2093, attack: 0.01, decay: 0.8, gain: 0.04, delay: 0.27 });
  },
};
