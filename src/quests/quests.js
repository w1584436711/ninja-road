import { THEME } from '../data/theme.js';
import { ITEMS } from '../progress/items.js';

// 任務表。goals 的 type：kill 討伐／hit 攻擊木樁／visit 到達區域（getAreaKey 的代號）／talk 對話
// requires：要先完成的任務；repeatable：完成後可以再接
export const QUESTS = [
  { id: 'train', rank: 'D', level: 1, title: '修行的成果', desc: '到大門外的訓練木樁，打出 20 次攻擊，熟悉體術與苦無。',
    goals: [{ type: 'hit', target: 'dummy', count: 20 }], reward: { exp: 25, gold: 20, items: { potion: 2 } } },
  { id: 'river', rank: 'D', level: 1, title: '巡視白鷺川', desc: '到村子東邊的白鷺川看看水位是否正常。',
    goals: [{ type: 'visit', area: 'river' }], reward: { exp: 30, gold: 20 } },
  { id: 'wolves', rank: 'D', level: 1, title: '驅逐野狼', desc: '西邊幽冥森林的野狼經常跑到村子附近，討伐 5 隻。', repeatable: true,
    goals: [{ type: 'kill', target: 'wolf', count: 5 }], reward: { exp: 60, gold: 40 } },
  { id: 'delivery', rank: 'D', level: 2, title: '拉麵外送', desc: '鈴屋老闆請你把拉麵送給在南方道路歇腳的旅人。',
    goals: [{ type: 'talk', npc: 'traveler' }], reward: { exp: 50, gold: 35 } },
  { id: 'bandits', rank: 'C', level: 4, requires: 'wolves', title: '山賊討伐', desc: '南方道路的山賊不斷搶劫商隊，擊敗 6 名山賊。', repeatable: true,
    goals: [{ type: 'kill', target: 'bandit', count: 6 }], reward: { exp: 180, gold: 120 } },
  { id: 'wolfking', rank: 'C', level: 5, requires: 'wolves', title: '森林之王', desc: '幽冥森林最深處出現了體型巨大的狼王，會嚎叫召來狼群。',
    goals: [{ type: 'kill', target: 'wolfking', count: 1 }], reward: { exp: 260, gold: 150, items: { pill: 2 }, gear: 'fang' } },
  { id: 'rogues', rank: 'B', level: 7, requires: 'bandits', title: '流浪忍者的情報', desc: '有流浪忍者在村子周圍刺探，擊敗 3 名，查出他們的目的。', repeatable: true,
    goals: [{ type: 'kill', target: 'rogue', count: 3 }], reward: { exp: 420, gold: 260 } },
  { id: 'crow', rank: 'A', level: 10, requires: 'rogues', title: '黑鴉', leaderOnly: true,
    desc: '叛忍「黑鴉」偷走了村子的禁術卷軸，藏身在北方蒼龍峽的入口。打倒他，取回卷軸。',
    goals: [{ type: 'kill', target: 'crow', count: 1 }], reward: { exp: 1200, gold: 600, gear: 'feather' } },

  // ---------- 山脈外的地區 ----------
  { id: 'coast', rank: 'C', level: 5, requires: 'bandits', title: '海岸的海賊', desc: '沿著南方道路走到底就是潮見海岸，那裡的海賊會搶漁村的貨，擊敗 4 名。', repeatable: true,
    goals: [{ type: 'kill', target: 'pirate', count: 4 }], reward: { exp: 240, gold: 150 } },
  { id: 'falls', rank: 'C', level: 6, title: '霧鳴瀑布的傳說', desc: '沿白鷺川往上游，穿過蒼龍峽，據說盡頭有一座終年霧氣瀰漫的大瀑布。去親眼看看。',
    goals: [{ type: 'visit', area: 'canyon' }, { type: 'visit', area: 'falls' }], reward: { exp: 300, gold: 120, items: { pill: 2 } } },
  { id: 'cliff', rank: 'B', level: 8, requires: 'falls', title: '峽谷的崖山賊', desc: '蒼龍峽的崖山賊會從遠處丟苦無，近身又揮大刀。擊敗 5 名，讓通往瀑布的路安全一點。', repeatable: true,
    goals: [{ type: 'kill', target: 'cliffBandit', count: 5 }], reward: { exp: 560, gold: 300 } },
  { id: 'direwolves', rank: 'B', level: 10, requires: 'wolfking', title: '古樹之森的魔狼', desc: '穿過西邊的山口，古樹之森裡住著比狼王手下更凶的魔狼群。討伐 6 隻。', repeatable: true,
    goals: [{ type: 'kill', target: 'direWolf', count: 6 }], reward: { exp: 820, gold: 380 } },
];

export const MAX_ACTIVE = 3;

export function goalText(g, n = 0) {
  if (g.type === 'kill') return `擊敗${THEME.enemies[g.target]} ${n}/${g.count}`;
  if (g.type === 'hit') return `攻擊木樁 ${n}/${g.count}`;
  if (g.type === 'visit') return `前往${THEME.areas[g.area].name}${n ? ' ✓' : ''}`;
  if (g.type === 'talk') return `和${THEME.npcs[g.npc]}說話${n ? ' ✓' : ''}`;
  return '';
}

export function rewardText(r) {
  const parts = [`${r.exp} EXP`, `${r.gold} 兩`];
  for (const [id, n] of Object.entries(r.items ?? {})) parts.push(`${ITEMS[id].name}×${n}`);
  if (r.gear) parts.push(ITEMS[r.gear].name);
  return parts.join('、');
}

// 任務進度存在 progress.quests：{ active: { id: [各目標進度] }, done: [id] }
export class QuestLog {
  constructor(progress) {
    this.prog = progress;
    this.onNotice = () => {};
  }

  get state() { return this.prog.quests; }

  get(id) { return QUESTS.find(q => q.id === id); }

  isDone(id) { return this.state.done.includes(id); }

  isActive(id) { return id in this.state.active; }

  isComplete(id) {
    const q = this.get(id), prog = this.state.active[id];
    return !!prog && q.goals.every((g, i) => prog[i] >= (g.count ?? 1));
  }

  // 'complete' 可回報／'active' 進行中／'available' 可接／'done' 已完成／其他字串＝無法接的原因
  status(id) {
    const q = this.get(id);
    if (this.isActive(id)) return this.isComplete(id) ? 'complete' : 'active';
    if (this.isDone(id) && !q.repeatable) return 'done';
    if (q.requires && !this.isDone(q.requires)) return `需要先完成「${this.get(q.requires).title}」`;
    if (this.prog.level < q.level) return `需要 Lv.${q.level}`;
    return 'available';
  }

  accept(id) {
    if (this.status(id) !== 'available') return false;
    if (Object.keys(this.state.active).length >= MAX_ACTIVE) {
      this.onNotice(`最多同時進行 ${MAX_ACTIVE} 個任務`);
      return false;
    }
    this.state.active[id] = this.get(id).goals.map(() => 0);
    this.onNotice(`接下任務「${this.get(id).title}」`);
    this.prog.save();
    return true;
  }

  abandon(id) {
    delete this.state.active[id];
    this.prog.save();
  }

  turnIn(id) {
    if (!this.isComplete(id)) return false;
    const q = this.get(id), r = q.reward;
    delete this.state.active[id];
    if (!this.isDone(id)) this.state.done.push(id);
    const p = this.prog;
    p.gainExp(r.exp, 999);
    p.addGold(r.gold);
    for (const [item, n] of Object.entries(r.items ?? {})) p.items[item] = (p.items[item] ?? 0) + n;
    if (r.gear && !p.owned.includes(r.gear)) p.owned.push(r.gear);
    this.onNotice(`任務完成！獲得 ${rewardText(r)}`);
    p.save();
    return true;
  }

  // 遊戲事件：{ type: 'kill', target } / { type: 'hit', target } / { type: 'visit', area } / { type: 'talk', npc }
  event(e) {
    for (const [id, prog] of Object.entries(this.state.active)) {
      const q = this.get(id);
      if (!q) continue;
      const wasComplete = this.isComplete(id);
      q.goals.forEach((g, i) => {
        if (g.type !== e.type) return;
        if ((g.target && g.target !== e.target) || (g.area && g.area !== e.area) || (g.npc && g.npc !== e.npc)) return;
        prog[i] = Math.min(g.count ?? 1, prog[i] + 1);
      });
      if (!wasComplete && this.isComplete(id)) {
        this.onNotice(`「${q.title}」目標達成！回${q.leaderOnly ? THEME.npcs.leader : '任務板'}回報`);
        this.prog.save();
      }
    }
  }

  // HUD 追蹤列表
  trackerLines() {
    return Object.entries(this.state.active).map(([id, prog]) => {
      const q = this.get(id);
      if (!q) return null;
      const done = this.isComplete(id);
      return { title: `${q.rank}・${q.title}`, text: done ? '完成！回去回報' : q.goals.map((g, i) => goalText(g, prog[i])).join('　'), done };
    }).filter(Boolean);
  }
}
