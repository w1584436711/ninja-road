import { ITEMS } from './items.js';
import { JUTSU } from '../combat/jutsu.js';
import { THEME } from '../data/theme.js';

const SAVE_KEY = 'ninja-road.save.v1';

export const STATS = {
  vit: { name: '體力', desc: v => `HP 上限 +${v * 12}` },
  chk: { name: '查克拉', desc: v => `查克拉上限 +${v * 10}、回復 +${v * 10}%` },
  str: { name: '體術', desc: v => `體術與苦無傷害 +${v * 8}%` },
  nin: { name: '忍術', desc: v => `忍術傷害 +${v * 8}%` },
  agi: { name: '敏捷', desc: v => `移動速度 +${v * 3}%` },
};

export const POINTS_PER_LEVEL = 3;
export const SECOND_NATURE_LEVEL = 12;
export const FIRST_NATURE_LEVEL = 3;

export const expToNext = level => Math.round(30 * level ** 1.5);

function defaults() {
  return {
    level: 1, exp: 0, points: 0, jp: 0,
    stats: { vit: 0, chk: 0, str: 0, nin: 0, agi: 0 },
    natures: [], known: ['clone'], mastery: {},
    gold: 50, items: { potion: 2, pill: 1 }, owned: [],
    equip: { weapon: null, armor: null, accessory: null },
    quests: { active: {}, done: [] }, flags: {},
    pos: null, hour: null,
  };
}

// 等級、能力值、忍術、金錢、道具與裝備。所有變動都會自動存檔。
export class Progression {
  constructor(player) {
    this.player = player;
    this.onLevelUp = () => {};
    this.onChange = () => {};
    Object.assign(this, defaults());
    this.load();
    this.apply();
  }

  get rank() {
    let name = THEME.ranks[0].name;
    for (const r of THEME.ranks) if (this.level >= r.level) name = r.name;
    return name;
  }

  get expNeeded() { return expToNext(this.level); }

  // 依能力值與裝備計算玩家的各項數值
  apply() {
    const p = this.player, s = this.stats;
    const eq = slot => (this.equip[slot] ? ITEMS[this.equip[slot]] : null);
    const acc = eq('accessory');
    p.maxHp = 100 + s.vit * 12 + (this.level - 1) * 8;
    p.maxChakra = 100 + s.chk * 10 + (this.level - 1) * 5 + (acc?.chakra ?? 0);
    p.chakraRegenMul = (1 + s.chk * 0.1) * (acc?.regen ?? 1);
    p.meleeMul = (1 + s.str * 0.08) * (eq('weapon')?.mul ?? 1);
    p.defMul = eq('armor')?.def ?? 1;
    p.moveMul = 1 + s.agi * 0.03;
    p.hp = Math.min(p.hp, p.maxHp);
    p.chakra = Math.min(p.chakra, p.maxChakra);
    this.onChange();
  }

  // 敵人等級比自己低太多時，經驗值打折
  gainExp(base, enemyLevel) {
    const n = Math.max(1, Math.round(base * Math.min(1, Math.max(0.2, 1 - (this.level - enemyLevel - 2) * 0.15))));
    this.exp += n;
    while (this.exp >= this.expNeeded) {
      this.exp -= this.expNeeded;
      this.levelUp();
    }
    this.onChange();
    return n;
  }

  levelUp() {
    const oldRank = this.rank;
    this.level++;
    this.points += POINTS_PER_LEVEL;
    this.jp += 1;
    this.apply();
    this.player.hp = this.player.maxHp;
    this.player.chakra = this.player.maxChakra;
    this.onLevelUp(this.level, this.rank !== oldRank ? this.rank : null, this.canChooseNature());
    this.save();
  }

  addGold(n) {
    this.gold += n;
    this.onChange();
  }

  allocate(stat) {
    if (this.points <= 0 || !(stat in this.stats)) return;
    this.stats[stat]++;
    this.points--;
    this.apply();
    this.save();
  }

  canChooseNature() {
    return (this.level >= FIRST_NATURE_LEVEL && this.natures.length === 0)
      || (this.level >= SECOND_NATURE_LEVEL && this.natures.length === 1);
  }

  chooseNature(n) {
    if (!this.canChooseNature() || this.natures.includes(n)) return;
    this.natures.push(n);
    this.save();
    this.onChange();
  }

  knows(key) { return this.known.includes(key); }

  // 回傳 null 表示可以學；否則回傳原因
  learnBlock(def) {
    if (this.knows(def.key)) return '已習得';
    if (def.nature && !this.natures.includes(def.nature)) return `需要${THEME.natures[def.nature]}屬性`;
    if (this.level < def.level) return `需要 Lv.${def.level}`;
    if (this.jp < def.jp) return `需要 ${def.jp} 忍術點`;
    return null;
  }

  learn(key) {
    const def = JUTSU.find(j => j.key === key);
    if (!def || this.learnBlock(def)) return;
    this.jp -= def.jp;
    this.known.push(key);
    this.save();
    this.onChange();
  }

  masteryLevel(key) { return Math.min(5, Math.floor((this.mastery[key] ?? 0) / 10)); }

  recordCast(key) {
    const before = this.masteryLevel(key);
    this.mastery[key] = (this.mastery[key] ?? 0) + 1;
    return this.masteryLevel(key) > before;
  }

  jutsuMul(key) { return (1 + this.stats.nin * 0.08) * (1 + this.masteryLevel(key) * 0.06); }
  jutsuCost(def) { return Math.round(def.cost * (1 - this.masteryLevel(def.key) * 0.04)); }

  // 回傳要顯示的訊息
  useItem(id) {
    const it = ITEMS[id];
    if (!it || !(this.items[id] > 0)) return `沒有${it?.name ?? '道具'}了`;
    const p = this.player;
    if (it.hp && p.hp >= p.maxHp) return 'HP 已經是滿的';
    if (it.chakra && p.chakra >= p.maxChakra) return '查克拉已經是滿的';
    if (it.hp) p.hp = Math.min(p.maxHp, p.hp + it.hp);
    if (it.chakra) p.chakra = Math.min(p.maxChakra, p.chakra + it.chakra);
    this.items[id]--;
    this.save();
    this.onChange();
    return `使用了${it.name}`;
  }

  buyBlock(id) {
    const it = ITEMS[id];
    if (it.type !== 'consumable' && this.owned.includes(id)) return '已擁有';
    if (it.level && this.level < it.level) return `需要 Lv.${it.level}`;
    if (this.gold < it.price) return '錢不夠';
    return null;
  }

  buy(id) {
    if (this.buyBlock(id)) return false;
    const it = ITEMS[id];
    this.gold -= it.price;
    if (it.type === 'consumable') this.items[id] = (this.items[id] ?? 0) + 1;
    else this.owned.push(id);
    this.save();
    this.onChange();
    return true;
  }

  toggleEquip(id) {
    const slot = ITEMS[id]?.type;
    if (!slot || !(slot in this.equip) || !this.owned.includes(id)) return;
    this.equip[slot] = this.equip[slot] === id ? null : id;
    this.apply();
    this.save();
  }

  pay(n) {
    if (this.gold < n) return false;
    this.gold -= n;
    this.save();
    this.onChange();
    return true;
  }

  save(hour) {
    if (hour !== undefined) this.hour = hour;
    this.pos = [Math.round(this.player.pos.x * 10) / 10, Math.round(this.player.pos.z * 10) / 10];
    const data = {};
    for (const k of Object.keys(defaults())) data[k] = this[k];
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* 無法存檔時照常遊戲 */ }
  }

  load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* 沒有或損壞的存檔 */ }
    if (!data || typeof data !== 'object') return;
    const d = defaults();
    for (const k of Object.keys(d)) {
      if (data[k] === undefined) continue;
      this[k] = typeof d[k] === 'object' && d[k] && !Array.isArray(d[k]) ? { ...d[k], ...data[k] } : data[k];
    }
    // 忍術表改版時，移除已不存在的招式
    this.known = this.known.filter(k => JUTSU.some(j => j.key === k));
    if (!this.known.includes('clone')) this.known.unshift('clone');
  }

  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* 忽略 */ }
    Object.assign(this, defaults());
    this.player.hp = this.player.chakra = 100;
    this.apply();
  }
}
