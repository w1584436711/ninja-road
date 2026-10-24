import { THEME } from '../data/theme.js';
import { STATS, FIRST_NATURE_LEVEL, SECOND_NATURE_LEVEL } from '../progress/progression.js';
import { ITEMS, SHOP_STOCK, SLOT_NAMES } from '../progress/items.js';
import { JUTSU, jutsuName, sealText, NATURE_COLORS, NATURE_DESC } from '../combat/jutsu.js';
import { QUESTS, goalText, rewardText } from '../quests/quests.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

// 角色選單（能力／忍術／道具／系統）與商店。開啟時遊戲暫停。
export class Menu {
  constructor(progress, player, hud) {
    this.prog = progress;
    this.player = player;
    this.hud = hud;
    this.root = document.getElementById('menu');
    this.body = document.getElementById('menuBody');
    this.title = document.getElementById('menuTitle');
    this.tabsEl = document.getElementById('menuTabs');
    this.mode = null; // 'menu' | 'shop'
    this.tab = 'status';
    this.wipeArmed = false;
    this.onClose = () => {};

    this.tabsEl.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) this.show(b.dataset.tab);
    });
    document.getElementById('menuClose').addEventListener('click', () => this.close());
    this.body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) this.act(b.dataset.act, b.dataset.arg);
    });
    // 選單內按 Tab / Esc 關閉
    addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || (e.code === 'Tab' && this.mode === 'menu')) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen() { return this.mode !== null; }

  open(tab = this.tab) {
    this.mode = 'menu';
    this.root.classList.remove('hidden');
    this.tabsEl.classList.remove('hidden');
    this.show(tab);
  }

  openBoard() {
    this.mode = 'board';
    this.root.classList.remove('hidden');
    this.tabsEl.classList.add('hidden');
    this.render();
  }

  openShop() {
    this.mode = 'shop';
    this.root.classList.remove('hidden');
    this.tabsEl.classList.add('hidden');
    this.render();
  }

  close() {
    this.mode = null;
    this.wipeArmed = false;
    this.root.classList.add('hidden');
    this.onClose();
  }

  show(tab) {
    this.tab = tab;
    this.wipeArmed = false;
    this.tabsEl.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    this.render();
  }

  act(action, arg) {
    const p = this.prog;
    switch (action) {
      case 'stat': p.allocate(arg); break;
      case 'nature': p.chooseNature(arg); break;
      case 'learn': p.learn(arg); this.hud.refreshJutsu(); break;
      case 'use': this.hud.toast(p.useItem(arg)); break;
      case 'equip': p.toggleEquip(arg); break;
      case 'buy':
        if (p.buy(arg)) this.hud.toast(`買了${ITEMS[arg].name}`);
        break;
      case 'accept': this.quests.accept(arg); break;
      case 'turnin': this.quests.turnIn(arg); break;
      case 'abandon': this.quests.abandon(arg); break;
      case 'wipe':
        if (!this.wipeArmed) {
          this.wipeArmed = true;
        } else {
          p.wipe();
          this.hud.refreshJutsu();
          this.hud.toast('進度已重設');
          this.wipeArmed = false;
        }
        break;
    }
    this.render();
  }

  render() {
    if (!this.isOpen) return;
    if (this.mode === 'shop') {
      this.title.textContent = `${THEME.signs.toolshop}店`;
      this.body.innerHTML = this.shopHtml();
      return;
    }
    if (this.mode === 'board') {
      this.title.textContent = '任務板';
      this.body.innerHTML = this.boardHtml();
      return;
    }
    this.title.textContent = `${THEME.player.name}　${this.prog.rank} Lv.${this.prog.level}`;
    this.body.innerHTML = {
      status: this.statusHtml, jutsu: this.jutsuHtml, quests: this.questsHtml, items: this.itemsHtml, system: this.systemHtml,
    }[this.tab].call(this);
  }

  questCard(q, button) {
    const ql = this.quests;
    const prog = ql.state.active[q.id];
    const goals = q.goals.map((g, i) => goalText(g, prog ? prog[i] : 0)).join('　');
    return `
      <div class="qcard">
        <div class="jtop"><span class="qrank r${q.rank}">${q.rank}</span><b>${esc(q.title)}</b><span class="jlv">Lv.${q.level}${q.repeatable ? '・可重複' : ''}</span></div>
        <div class="jdesc">${esc(q.desc)}</div>
        <div class="qgoal">${esc(goals)}</div>
        <div class="qreward">報酬：${esc(rewardText(q.reward))}</div>
        <div class="jact">${button}</div>
      </div>`;
  }

  boardHtml() {
    const ql = this.quests;
    const groups = { complete: [], active: [], available: [], locked: [] };
    for (const q of QUESTS) {
      const st = ql.status(q.id);
      if (st === 'done') continue;
      if (st === 'complete') {
        groups.complete.push(this.questCard(q, q.leaderOnly
          ? `<button class="mbtn" disabled>向${THEME.npcs.leader}回報</button>`
          : `<button class="mbtn" data-act="turnin" data-arg="${q.id}">回報，領取報酬</button>`));
      } else if (st === 'active') {
        groups.active.push(this.questCard(q, `<button class="mbtn ghost" data-act="abandon" data-arg="${q.id}">放棄</button>`));
      } else if (st === 'available' && !q.leaderOnly) {
        groups.available.push(this.questCard(q, `<button class="mbtn" data-act="accept" data-arg="${q.id}">接下任務</button>`));
      } else {
        const why = st === 'available' ? `向${THEME.npcs.leader}詢問` : st;
        groups.locked.push(this.questCard(q, `<button class="mbtn" disabled>${esc(why)}</button>`));
      }
    }
    const sec = (title, list) => (list.length ? `<div class="mhead">${title}</div><div class="jgrid">${list.join('')}</div>` : '');
    const doneCount = ql.state.done.length;
    return `
      <p class="mnote">一次最多進行 3 個任務。完成目標後回到這裡回報。已完成 ${doneCount} 個任務。</p>
      ${sec('可以回報', groups.complete)}${sec('進行中', groups.active)}${sec('可以接', groups.available)}${sec('尚未開放', groups.locked)}`;
  }

  questsHtml() {
    const ql = this.quests;
    const active = QUESTS.filter(q => ql.isActive(q.id)).map(q => this.questCard(q,
      ql.isComplete(q.id) ? '<span class="mastery">目標達成，回去回報</span>' : `<button class="mbtn ghost" data-act="abandon" data-arg="${q.id}">放棄</button>`));
    return active.length
      ? `<div class="jgrid">${active.join('')}</div>`
      : '<p class="mnote">目前沒有進行中的任務。到首領塔前的任務板接任務吧。</p>';
  }

  statusHtml() {
    const p = this.prog, pl = this.player;
    const rows = Object.entries(STATS).map(([k, s]) => `
      <div class="stat-row">
        <div class="stat-name">${s.name}<b>${p.stats[k]}</b></div>
        <div class="stat-desc">${esc(s.desc(p.stats[k]))}</div>
        <button class="mbtn plus" data-act="stat" data-arg="${k}" ${p.points > 0 ? '' : 'disabled'} aria-label="${s.name} +1">＋</button>
      </div>`).join('');
    const pct = v => `${Math.round((v - 1) * 100)}%`;
    return `
      <div class="exp-line">EXP ${p.exp} / ${p.expNeeded}<div class="bar xp"><div class="fill" style="width:${(p.exp / p.expNeeded) * 100}%"></div></div></div>
      <div class="pill-row">
        <span class="pill">能力點 <b>${p.points}</b></span>
        <span class="pill">忍術點 <b>${p.jp}</b></span>
        <span class="pill gold">${p.gold} 兩</span>
      </div>
      ${rows}
      <div class="derived">
        <span>HP ${pl.maxHp}</span><span>查克拉 ${pl.maxChakra}</span>
        <span>體術 +${pct(pl.meleeMul)}</span><span>忍術 +${Math.round(p.stats.nin * 8)}%</span>
        <span>速度 +${pct(pl.moveMul)}</span><span>減傷 ${Math.round((1 - pl.defMul) * 100)}%</span>
      </div>
      <p class="mnote">每升一級獲得 3 能力點、1 忍術點。</p>`;
  }

  jutsuHtml() {
    const p = this.prog;
    let natureBlock = '';
    if (p.canChooseNature()) {
      const opts = Object.keys(THEME.natures).filter(n => !p.natures.includes(n)).map(n => `
        <button class="nature-btn" style="--nc:${NATURE_COLORS[n]}" data-act="nature" data-arg="${n}">
          <b>${THEME.natures[n]}</b><small>${NATURE_DESC[n]}</small>
        </button>`).join('');
      natureBlock = `<div class="nature-pick"><div class="mhead">選擇${p.natures.length ? '第二個' : ''}查克拉屬性</div><div class="nature-grid">${opts}</div></div>`;
    }
    const natureLine = p.natures.length
      ? p.natures.map(n => `<span class="ntag" style="--nc:${NATURE_COLORS[n]}">${THEME.natures[n]}</span>`).join('')
      : `<span class="mnote">Lv.${FIRST_NATURE_LEVEL} 可以選擇第一個屬性</span>`;
    const second = p.natures.length === 1 ? `<span class="mnote">（Lv.${SECOND_NATURE_LEVEL} 可選第二屬性）</span>` : '';

    const cards = JUTSU.map(def => {
      const block = p.learnBlock(def);
      const known = p.knows(def.key);
      const tag = def.nature ? `<span class="ntag" style="--nc:${NATURE_COLORS[def.nature]}">${THEME.natures[def.nature]}</span>` : '<span class="ntag">無</span>';
      const btn = known
        ? `<span class="mastery" title="熟練度">${stars(p.masteryLevel(def.key))}</span>`
        : `<button class="mbtn" data-act="learn" data-arg="${def.key}" ${block ? 'disabled' : ''}>${block ? esc(block) : `習得（${def.jp} 點）`}</button>`;
      return `
        <div class="jcard ${known ? 'known' : ''}">
          <div class="jtop">${tag}<b>${esc(jutsuName(def))}</b><span class="jlv">Lv.${def.level}</span></div>
          <div class="jseal">${esc(sealText(def))}　<span class="cost">查克拉 ${p.jutsuCost(def)}</span></div>
          <div class="jdesc">${esc(def.desc)}</div>
          <div class="jact">${btn}</div>
        </div>`;
    }).join('');
    return `
      ${natureBlock}
      <div class="pill-row"><span>屬性：</span>${natureLine}${second}<span class="pill">忍術點 <b>${p.jp}</b></span></div>
      <p class="mnote">鍵盤 1–4 或手機下方按鈕依序結印：${THEME.seals.map((s, i) => `${i + 1} ${s}`).join('　')}。同一招每用 10 次熟練度升一星（傷害 +6%、耗費 -4%）。</p>
      <div class="jgrid">${cards}</div>`;
  }

  itemsHtml() {
    const p = this.prog;
    const cons = Object.entries(ITEMS).filter(([, it]) => it.type === 'consumable').map(([id, it]) => `
      <div class="irow"><div><b>${it.name}</b> ×${p.items[id] ?? 0}<small>${it.desc}</small></div>
      <button class="mbtn" data-act="use" data-arg="${id}" ${(p.items[id] ?? 0) > 0 ? '' : 'disabled'}>使用</button></div>`).join('');
    const gear = p.owned.length ? p.owned.map(id => {
      const it = ITEMS[id];
      const on = p.equip[it.type] === id;
      return `<div class="irow ${on ? 'equipped' : ''}"><div><b>${it.name}</b><span class="slot-tag">${SLOT_NAMES[it.type]}</span><small>${it.desc}</small></div>
        <button class="mbtn" data-act="equip" data-arg="${id}">${on ? '卸下' : '裝備'}</button></div>`;
    }).join('') : '<p class="mnote">還沒有裝備，可以到廣場東側的忍具店購買。</p>';
    return `
      <div class="pill-row"><span class="pill gold">${p.gold} 兩</span></div>
      <div class="mhead">消耗品（電腦按 5、6 快速使用）</div>${cons}
      <div class="mhead">裝備</div>${gear}`;
  }

  systemHtml() {
    return `
      <p class="mnote">進度會自動存在這台裝置的瀏覽器裡（每 15 秒，以及升級、購買時）。換手機或清除瀏覽器資料後，進度不會保留。</p>
      <button class="mbtn danger" data-act="wipe">${this.wipeArmed ? '確定要刪除所有進度？再按一次' : '重新開始（刪除進度）'}</button>`;
  }

  shopHtml() {
    const p = this.prog;
    const rows = SHOP_STOCK.map(id => {
      const it = ITEMS[id];
      const block = p.buyBlock(id);
      const have = it.type === 'consumable' ? `持有 ${p.items[id] ?? 0}` : SLOT_NAMES[it.type];
      return `<div class="irow"><div><b>${it.name}</b><span class="slot-tag">${have}</span><small>${it.desc}</small></div>
        <button class="mbtn" data-act="buy" data-arg="${id}" ${block ? 'disabled' : ''}>${block ? esc(block) : `${it.price} 兩`}</button></div>`;
    }).join('');
    return `<div class="pill-row"><span class="pill gold">持有 ${p.gold} 兩</span></div>${rows}
      <p class="mnote">買到的裝備要在選單「道具」裡裝備才有效果。</p>`;
  }
}
