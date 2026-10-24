import * as THREE from 'three';
import { getTerrainHeight, terrainColor, WORLD_SIZE, HALF } from '../world/terrain.js';
import { TOWER_POS } from '../world/village.js';

const RES = 400; // 地圖底圖解析度（像素）
const VIEW = 220; // 小地圖顯示範圍（公尺）

export class Minimap {
  constructor(canvas, houses) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = RES;
    const g = this.base.getContext('2d');
    const img = g.createImageData(RES, RES);
    const c = new THREE.Color();
    const cell = WORLD_SIZE / RES;
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const x = -HALF + (i + 0.5) * cell, z = -HALF + (j + 0.5) * cell;
        const h = getTerrainHeight(x, z);
        const slope = Math.min(1, Math.abs(getTerrainHeight(x + cell, z) - h) / cell);
        if (h < 0) c.setHex(0x2f8fd0).lerp(new THREE.Color(0x1a5c94), Math.min(1, -h / 4));
        else terrainColor(x, z, h, slope * 0.6, c);
        const k = (j * RES + i) * 4;
        img.data[k] = c.r * 255;
        img.data[k + 1] = c.g * 255;
        img.data[k + 2] = c.b * 255;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    const s = RES / WORLD_SIZE;
    g.fillStyle = '#7a4a34';
    for (const hs of houses) g.fillRect((hs.x - hs.w / 2 + HALF) * s, (hs.z - hs.d / 2 + HALF) * s, hs.w * s, hs.d * s);
    g.fillStyle = '#c4502f';
    g.beginPath();
    g.arc((TOWER_POS.x + HALF) * s, (TOWER_POS.z + HALF) * s, TOWER_POS.r * s, 0, Math.PI * 2);
    g.fill();
  }

  draw(player) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const s = RES / WORLD_SIZE;
    const src = VIEW * s;
    ctx.fillStyle = '#0d1320';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.base, (player.pos.x + HALF) * s - src / 2, (player.pos.z + HALF) * s - src / 2, src, src, 0, 0, W, H);

    // 玩家箭頭（地圖北方朝上，-Z 為北）
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI - player.facing);
    ctx.fillStyle = '#ffd27a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 16);
  }
}
