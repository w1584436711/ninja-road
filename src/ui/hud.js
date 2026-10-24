import { getAreaKey } from '../world/terrain.js';
import { THEME } from '../data/theme.js';

export class HUD {
  constructor(minimap) {
    const $ = id => document.getElementById(id);
    this.minimap = minimap;
    this.el = {
      hpFill: $('hpFill'), hpText: $('hpText'), ckFill: $('ckFill'), ckText: $('ckText'),
      coords: $('coords'), areaLabel: $('areaLabel'), area: $('area'), toast: $('toast'), clock: $('clock'),
    };
    // 同一技能可能同時有技能列格子與觸控按鈕
    this.slots = {};
    document.querySelectorAll('[data-skill]').forEach(s => {
      (this.slots[s.dataset.skill] ??= []).push(s);
    });
    this.currentArea = null;
    this.areaTimer = 0;
    this.toastTimer = 0;
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastTimer = 1.6;
  }

  update(dt, player, sky) {
    const e = this.el;
    const icon = sky.weatherName === 'rain' ? '☂' : sky.weatherName === 'cloudy' ? '☁' : sky.isNight ? '☾' : '☀';
    const clock = `${icon} ${sky.clockText()}　${sky.weather.label}`;
    if (e.clock.textContent !== clock) e.clock.textContent = clock;
    e.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
    e.hpText.textContent = `HP ${Math.ceil(player.hp)} / ${player.maxHp}`;
    e.ckFill.style.width = `${(player.chakra / player.maxChakra) * 100}%`;
    e.ckText.textContent = `查克拉 ${Math.floor(player.chakra)} / ${player.maxChakra}`;
    e.coords.textContent = `X ${player.pos.x.toFixed(0)}  Z ${player.pos.z.toFixed(0)}`;

    const areaKey = getAreaKey(player.pos.x, player.pos.z);
    if (areaKey !== this.currentArea) {
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

    const set = (skill, cls, on) => this.slots[skill]?.forEach(s => s.classList.toggle(cls, on));
    set('jump', 'off', player.chakra < 10 && !player.onGround);
    set('dash', 'off', player.chakra < 15 || player.dashCd > 0);
    set('dash', 'active', player.dashTime > 0);
    set('charge', 'active', player.charging);

    this.minimap.draw(player);
  }
}
