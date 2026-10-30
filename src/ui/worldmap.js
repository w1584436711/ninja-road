import { THEME } from '../data/theme.js';
import { WORLD_SIZE, HALF, riverX, FALLS_X, FALLS_Z } from '../world/terrain.js';

// 大地圖：整個世界的地形圖、各區域名稱、自己的位置與頭目。開著時遊戲暫停。
// 電腦按 M 開關，手機點右上角的小地圖。

// 區域名稱標在地圖上的位置
const LABELS = [
  ['village', 0, 8], ['rock', 0, -175], ['river', riverX(160) + 6, 160], ['forest', -190, 70],
  ['canyon', riverX(-420) + 70, -420], ['falls', FALLS_X, FALLS_Z + 45], ['highlands', -40, -660],
  ['coast', 0, 720], ['westwood', -640, 0], ['eastplain', 610, 20], ['mountains', -260, -300],
];

export class WorldMap {
  constructor(base) {
    this.base = base; // 小地圖的底圖（整個世界，canvas）
    this.el = document.createElement('div');
    this.el.id = 'worldmap';
    this.el.className = 'hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', '大地圖');
    this.canvas = document.createElement('canvas');
    const hint = document.createElement('div');
    hint.className = 'wm-hint';
    hint.textContent = document.body.classList.contains('touch') ? '點一下關閉' : '按 M 或點一下關閉';
    this.el.append(this.canvas, hint);
    document.body.append(this.el);
    this.open_ = false;
    this.onClose = () => {};
    this.el.addEventListener('click', () => this.close());
    addEventListener('keydown', e => {
      if (this.open_ && !e.repeat && ['KeyM', 'Escape', 'Tab'].includes(e.code)) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen() { return this.open_; }

  // stations：驛站列表；found：已發現的驛站代號
  open(player, enemies, stations = [], found = []) {
    this.open_ = true;
    this.el.classList.remove('hidden');
    this.draw(player, enemies, stations, found);
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.el.classList.add('hidden');
    this.onClose();
  }

  draw(player, enemies, stations, found) {
    const size = Math.floor(Math.min(innerWidth, innerHeight) * 0.92);
    const dpr = Math.min(devicePixelRatio, 2);
    const c = this.canvas;
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = `${size}px`;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0, size, size);
    const k = size / WORLD_SIZE;
    const px = x => (x + HALF) * k;

    // 區域名稱
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const font = Math.max(11, Math.round(size / 48));
    for (const [key, x, z] of LABELS) {
      const name = THEME.areas[key]?.name;
      if (!name) continue;
      g.font = `bold ${key === 'village' ? font + 3 : font}px "Noto Sans TC", sans-serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.75)';
      g.strokeText(name, px(x), px(z));
      g.fillStyle = key === 'village' ? '#ffd27a' : '#fff';
      g.fillText(name, px(x), px(z));
    }

    // 驛站：發現過的是水藍色菱形
    for (const s of stations) {
      const on = found.includes(s.key);
      g.save();
      g.translate(px(s.x), px(s.z));
      g.rotate(Math.PI / 4);
      g.fillStyle = on ? '#6fe0ff' : '#7a8490';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.fillRect(-5, -5, 10, 10);
      g.strokeRect(-5, -5, 10, 10);
      g.restore();
    }

    // 頭目
    for (const e of enemies) {
      if (!e.alive || !e.def.boss) continue;
      g.fillStyle = '#ffd23a';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px(e.pos.x), px(e.pos.z), 5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // 自己（箭頭）
    g.save();
    g.translate(px(player.pos.x), px(player.pos.z));
    g.rotate(Math.PI - player.facing);
    g.fillStyle = '#ff5a3a';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();

    // 圖例
    g.font = `${font - 1}px "Noto Sans TC", sans-serif`;
    g.textAlign = 'left';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,.75)';
    g.fillStyle = '#fff';
    const ly = size - font;
    g.strokeText('◆ 驛站（水藍色＝已發現）　● 頭目', font * 0.6, ly);
    g.fillText('◆ 驛站（水藍色＝已發現）　● 頭目', font * 0.6, ly);
    g.textAlign = 'center';

    g.font = `bold ${font + 2}px sans-serif`;
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.strokeText('N', size / 2, font);
    g.fillText('N', size / 2, font);
  }
}
