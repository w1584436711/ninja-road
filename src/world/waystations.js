import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';
import { THEME } from '../data/theme.js';
import { getTerrainHeight, riverX } from './terrain.js';

// 驛站：走到旁邊就「發現」；在任何一座發現過的驛站，都能傳送到其他發現過的驛站。
// area 是區域代號，名稱用 THEME.areas 的地名
export const WAYSTATIONS = [
  { key: 'village', area: 'village', x: 18, z: 113 },
  { key: 'canyon', area: 'canyon', x: riverX(-280) - 24, z: -280 },
  { key: 'falls', area: 'falls', x: riverX(-525) + 24, z: -525 },
  { key: 'highlands', area: 'highlands', x: riverX(-680) + 14, z: -680 },
  { key: 'coast', area: 'coast', x: 14, z: 612 },
  { key: 'westwood', area: 'westwood', x: -470, z: 20 },
  { key: 'eastplain', area: 'eastplain', x: 470, z: 110 },
];

export const waystationName = w => `${THEME.areas[w.area].name}驛站`;

const DISCOVER_RANGE = 9;

export class Waystations {
  constructor(scene, world) {
    const stone = toonMaterial({ color: 0x9a9488 });
    const roof = toonMaterial({ color: 0x3a4a5a });
    const wood = toonMaterial({ color: 0x6b4a2f });
    const lamp = toonMaterial({ color: 0xffd27a, emissive: 0x000000 });
    this.crystalOn = new THREE.MeshBasicMaterial({ color: 0x6fe0ff });
    this.crystalOff = new THREE.MeshBasicMaterial({ color: 0x6a7480 });
    const geo = {
      base: new THREE.BoxGeometry(1.8, 0.4, 1.8),
      pillar: new THREE.CylinderGeometry(0.32, 0.4, 1.7, 8),
      roof: new THREE.ConeGeometry(0.95, 0.7, 4).rotateY(Math.PI / 4),
      lamp: new THREE.BoxGeometry(0.42, 0.4, 0.42),
      post: new THREE.BoxGeometry(0.12, 1.6, 0.12),
      sign: new THREE.BoxGeometry(0.9, 0.36, 0.06),
      crystal: new THREE.OctahedronGeometry(0.28, 0),
    };
    this.list = WAYSTATIONS.map(w => {
      const y = getTerrainHeight(w.x, w.z);
      const g = new THREE.Group();
      g.position.set(w.x, y, w.z);
      const add = (gm, mat, px, py, pz) => {
        const m = new THREE.Mesh(gm, mat);
        m.position.set(px, py, pz);
        m.castShadow = true;
        g.add(m);
        return m;
      };
      add(geo.base, stone, 0, 0.1, 0);
      add(geo.pillar, stone, 0, 1.15, 0);
      add(geo.lamp, lamp, 0, 2.1, 0).userData.glow = 'lantern';
      add(geo.roof, roof, 0, 2.6, 0);
      add(geo.post, wood, 1.3, 0.8, 0.4);
      add(geo.sign, wood, 1.3, 1.4, 0.4);
      const crystal = add(geo.crystal, this.crystalOff, 0, 3.4, 0);
      crystal.castShadow = false;
      scene.add(g);
      world.addCircle(w.x, w.z, 0.9);
      return { ...w, y, group: g, crystal };
    });
    this.time = 0;
  }

  // found：已發現的驛站代號（存在 progress.flags.waystations）
  update(dt, found) {
    this.time += dt;
    for (const s of this.list) {
      const on = found.includes(s.key);
      s.crystal.material = on ? this.crystalOn : this.crystalOff;
      s.crystal.rotation.y = this.time * (on ? 1.5 : 0.4);
      s.crystal.position.y = 3.4 + Math.sin(this.time * 2 + s.x) * (on ? 0.12 : 0.04);
    }
  }

  // 玩家旁邊尚未發現的驛站
  newlyFound(pos, found) {
    return this.list.find(s => !found.includes(s.key) && Math.hypot(pos.x - s.x, pos.z - s.z) < DISCOVER_RANGE);
  }
}
