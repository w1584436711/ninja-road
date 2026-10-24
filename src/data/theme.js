// 世界觀設定：所有地名、角色名、招牌文字與主角外觀都集中在這裡。
// 想在本機換成自己的版本，複製本檔為 theme.local.js 修改即可（該檔不會上傳到 Git）。
export const THEME = {
  title: '忍者之路',
  subtitle: '原創忍者 3D 開放世界',

  player: {
    name: '天宮 翔',
    rank: '下忍',
    look: {
      skin: 0xf3cba5, jacket: 0x2b4c7e, pants: 0x2a2f3a, shoulders: 0x1a1f2e,
      hair: 0x3a2418, eyes: 0xc98a2b, sandals: 0x1d1d22,
      spiky: true, band: true, whiskers: false, scarf: 0xc8323c,
    },
  },

  // getAreaName() 回傳的代號 → 顯示名稱與副標
  areas: {
    village: { name: '風鈴之里', sub: 'Kazesuzu Village' },
    rock: { name: '天守岩', sub: 'Tenshu Rock' },
    river: { name: '白鷺川', sub: 'Shirasagi River' },
    forest: { name: '幽冥森林', sub: 'Forest of Shadows' },
    outskirts: { name: '蒼穹之國・郊外', sub: 'Land of Azure Sky' },
    mountains: { name: '蒼穹之國・山岳地帶', sub: 'Mountains' },
  },

  signs: { tower: '風', gate: '風鈴', shop: '鈴屋' },
  colors: { tower: 0x2f6f8f, towerRoof: 0x1d4560, towerBand: 0x22303a, gate: 0xc0392b, gateBeam: 0x2a2626 },

  npcs: { villager: '風鈴村民', chunin: '風鈴中忍', student: '忍術學堂學生', shopOwner: '鈴屋老闆' },

  skills: {
    jump: '二段跳', dash: '迅影步', dashShort: '迅', charge: '聚集查克拉',
    attack: '體術', kunai: '苦無', sub: '替身術', lock: '鎖定',
  },

  // 忍術與結印（印的順序在 combat/jutsu.js）
  jutsu: { fireball: '爆炎球', clone: '分身術', wind: '裂風刃' },
  seals: ['寅', '巳', '未', '辰'],

  enemies: { wolf: '野狼', bandit: '山賊', rogue: '流浪忍者', dummy: '訓練木樁' },
};

function merge(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') merge(target[k], v);
    else target[k] = v;
  }
}

// 只在本機伺服器（http）上嘗試載入 theme.local.js；線上版一律用原創設定。
// 本機網址加上 ?original 可以暫時看原創版。
export async function loadLocalTheme() {
  if (location.protocol !== 'http:' || new URLSearchParams(location.search).has('original')) return;
  try {
    const mod = await import('./theme.local.js');
    merge(THEME, mod.default);
  } catch {
    /* 沒有本機設定檔就用預設 */
  }
}

// 把 HTML 裡 data-t="player.name" 這類標記換成設定裡的文字
export function applyThemeText(root = document) {
  root.querySelectorAll('[data-t]').forEach(el => {
    const value = el.dataset.t.split('.').reduce((o, k) => o?.[k], THEME);
    if (typeof value === 'string') el.textContent = value;
  });
}
