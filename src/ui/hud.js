import { getAreaKey } from '../world/terrain.js';
import { THEME } from '../data/theme.js';
import { JUTSU, jutsuName, sealText } from '../combat/jutsu.js';

export class HUD {
  constructor(minimap, progress) {
    const $ = id => document.getElementById(id);
    this.minimap = minimap;
    this.prog = progress;
    this.el = {
      hpFill: $('hpFill'), hpText: $('hpText'), ckFill: $('ckFill'), ckText: $('ckText'),
      coords: $('coords'), areaLabel: $('areaLabel'), area: $('area'), toast: $('toast'), clock: $('clock'),
      targetFrame: $('targetFrame'), targetName: $('targetName'), targetFill: $('targetFill'),
      sealBar: $('sealBar'), jutsuCall: $('jutsuCall'), hurtFlash: $('hurtFlash'), death: $('death'),
      plv: $('plv'), xpFill: $('xpFill'), gold: $('gold'), levelCall: $('levelCall'),
      potion: document.querySelectorAll('[data-count="potion"]'), pill: document.querySelectorAll('[data-count="pill"]'),
    };
    this.levelTimer = 0;
    // 同一技能可能同時有技能列格子與觸控按鈕
    this.slots = {};
    document.querySelectorAll('[data-skill]').forEach(s => {
      (this.slots[s.dataset.skill] ??= []).push(s);
    });
    this.currentArea = null;
    this.areaTimer = 0;
    this.toastTimer = 0;
    this.callTimer = 0;
    this.sealKey = '';
    this.refreshJutsu();
  }

  // 已習得的忍術一覽：桌機右下角面板與開始畫面
  refreshJutsu() {
    const known = JUTSU.filter(j => this.prog.knows(j.key));
    const rows = known.map(j => `<div><b>${jutsuName(j)}</b>　${sealText(j)}　<span class="cost">查克拉 ${this.prog.jutsuCost(j)}</span></div>`).join('');
    const more = '<div class="jp-more">升級後在選單（Tab）學習更多忍術</div>';
    document.querySelector('#jutsuPanel .jp-seals').textContent = THEME.seals.map((s, i) => `${i + 1} ${s}`).join('　');
    document.querySelector('#jutsuPanel .jp-list').innerHTML = rows + more;
    document.getElementById('jutsuRef').innerHTML = rows;
    this.sealKey = null; // 強制重畫結印提示
  }

  levelUp(level, newRank, canPickNature) {
    const el = this.el.levelCall;
    el.replaceChildren();
    const big = document.createElement('div');
    big.textContent = newRank ? `晉升${newRank}！` : 'LEVEL UP!';
    const small = document.createElement('small');
    small.textContent = `Lv.${level}　能力點 +3　忍術點 +1${canPickNature ? '　可以選擇查克拉屬性了！' : ''}`;
    el.append(big, small);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.levelTimer = 3;
    // 同一時間只顯示一個大標題，避免重疊
    this.el.area.classList.remove('show');
    this.areaTimer = 0;
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastTimer = 1.6;
  }

  jutsuCall(name) {
    const el = this.el.jutsuCall;
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth; // 重新觸發動畫
    el.classList.add('show');
    this.callTimer = 1.2;
  }

  flashHurt() {
    const el = this.el.hurtFlash;
    el.classList.add('show');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('show')));
  }

  showDeath(on) {
    this.el.death.classList.toggle('show', on);
  }

  update(dt, player, sky, combat) {
    const e = this.el;
    const icon = sky.weatherName === 'rain' ? '☂' : sky.weatherName === 'cloudy' ? '☁' : sky.isNight ? '☾' : '☀';
    const clock = `${icon} ${sky.clockText()}　${sky.weather.label}`;
    if (e.clock.textContent !== clock) e.clock.textContent = clock;

    e.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
    e.hpText.textContent = `HP ${Math.ceil(player.hp)} / ${player.maxHp}`;
    e.ckFill.style.width = `${(player.chakra / player.maxChakra) * 100}%`;
    e.ckText.textContent = `查克拉 ${Math.floor(player.chakra)} / ${player.maxChakra}`;
    e.coords.textContent = `X ${player.pos.x.toFixed(0)}  Z ${player.pos.z.toFixed(0)}`;
    const pr = this.prog;
    const lv = `${pr.rank} Lv.${pr.level}${pr.points ? ' ●' : ''}`;
    if (e.plv.textContent !== lv) e.plv.textContent = lv;
    e.xpFill.style.width = `${(pr.exp / pr.expNeeded) * 100}%`;
    const gold = `${pr.gold} 兩`;
    if (e.gold.textContent !== gold) e.gold.textContent = gold;
    for (const id of ['potion', 'pill']) e[id].forEach(el => { el.textContent = pr.items[id] ?? 0; });
    if (this.levelTimer > 0 && (this.levelTimer -= dt) <= 0) e.levelCall.classList.remove('show');

    const areaKey = getAreaKey(player.pos.x, player.pos.z);
    if (areaKey !== this.currentArea && this.levelTimer <= 0) {
      this.currentArea = areaKey;
      const area = THEME.areas[areaKey];
      e.areaLabel.textContent = area.name;
      e.area.textContent = area.name;
      const sub = document.createElement('small');
      sub.textContent = area.sub;
      e.area.append(sub);
      e.area.classList.add('show');
      this.areaTimer = 3;
    }
    if (this.areaTimer > 0 && (this.areaTimer -= dt) <= 0) e.area.classList.remove('show');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) e.toast.classList.remove('show');
    if (this.callTimer > 0 && (this.callTimer -= dt) <= 0) e.jutsuCall.classList.remove('show');

    // ---------- 戰鬥 ----------
    const pc = combat.pc;
    const info = combat.targetInfo;
    e.targetFrame.classList.toggle('hidden', !info);
    if (info) {
      if (e.targetName.textContent !== info.name) e.targetName.textContent = info.name;
      e.targetFill.style.width = `${info.frac * 100}%`;
    }

    // 結印列：已按的印＋還能接成哪些忍術
    const key = pc.seals.join(',');
    if (key !== this.sealKey) {
      this.sealKey = key;
      e.sealBar.replaceChildren();
      if (pc.seals.length) {
        const seq = document.createElement('div');
        seq.className = 'seq';
        for (const s of pc.seals) {
          const span = document.createElement('span');
          span.textContent = THEME.seals[s];
          seq.append(span);
        }
        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = JUTSU.filter(j => this.prog.knows(j.key) && j.seals.join(',').startsWith(key))
          .map(j => `${j.seals.map(s => THEME.seals[s]).join('→')} ${jutsuName(j)}`).join('　');
        e.sealBar.append(seq, hint);
      }
    }

    const set = (skill, cls, on) => this.slots[skill]?.forEach(s => s.classList.toggle(cls, on));
    set('jump', 'off', player.chakra < 10 && !player.onGround);
    set('dash', 'off', player.chakra < 15 || player.dashCd > 0);
    set('dash', 'active', player.dashTime > 0);
    set('charge', 'active', player.charging);
    set('kunai', 'off', pc.kunaiCd > 0);
    set('sub', 'off', player.chakra < 20 || pc.subCd > 0);
    set('lock', 'active', !!pc.lock);
    set('attack', 'active', !!pc.action && pc.action.combo !== undefined);

    this.minimap.draw(player, combat);
  }
}
