import * as THREE from 'three';
import { mulberry32, lerpAngle, lerp } from '../core/math.js';
import { createNameplate } from '../core/textures.js';
import { createCharacter, animateCharacter, advancePhase } from '../player/character.js';
import { toonify } from '../render/toon.js';
import { getTerrainHeight, VILLAGE_RADIUS } from '../world/terrain.js';
import { THEME } from '../data/theme.js';

// role 對應 data/theme.js 的 npcs 名稱。child：小孩（縮小、用跑的）
const TYPES = [
  { role: 'villager', color: '#ffffff', look: { jacket: 0x7c9a62, pants: 0x4b4b55, shoulders: 0x5c7448, hair: 0x3b2a1e, spiky: false, band: false } },
  { role: 'chunin', color: '#9fe39a', look: { jacket: 0x2a3550, pants: 0x2a3550, shoulders: 0x2a3550, vest: 0x4f6b3a, hair: 0x222222, spiky: false } },
  { role: 'student', color: '#ffffff', look: { jacket: 0x3a74c4, pants: 0xd8d8d8, shoulders: 0x2c5a9a, hair: 0x6b3d1f, spiky: false } },
  { role: 'shopOwner', color: '#ffd27a', look: { jacket: 0xf2f2f2, pants: 0x3a3a3a, shoulders: 0xf2f2f2, hair: 0x555555, spiky: false, band: false } },
  { role: 'villager', color: '#ffffff', look: { jacket: 0xc76b8a, pants: 0x5a3a4a, shoulders: 0xa04e6c, hair: 0xe0a0b0, spiky: false, band: false } },
  { role: 'villager', color: '#ffffff', look: { jacket: 0x8a6a4a, pants: 0x3a3028, shoulders: 0x6a4a32, hair: 0x9a9a9a, spiky: false, band: false, hat: 0xc8a868 } },
  { role: 'child', color: '#ffffff', child: true, look: { jacket: 0xe8a838, pants: 0x3a5a8a, shoulders: 0xc88828, hair: 0x2a1d14, spiky: true, band: false } },
  { role: 'child', color: '#ffffff', child: true, look: { jacket: 0xd85a7a, pants: 0x5a3a4a, shoulders: 0xb8486a, hair: 0x4a2a1a, spiky: false, band: false } },
];

const ROAD_LEN = VILLAGE_RADIUS - 12;

// 在村子裡閒逛的 NPC：大多沿著街道走，偶爾停下來
export class Villagers {
  constructor(scene, world, count = 24) {
    this.world = world;
    this.rng = mulberry32(99);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const type = TYPES[i % TYPES.length];
      const scale = type.child ? 0.68 : 0.95 + this.rng() * 0.1;
      const model = createCharacter(type.look);
      model.root.scale.setScalar(scale);
      toonify(model.root);
      const tag = createNameplate(THEME.npcs[type.role], type.color);
      tag.position.y = 2.4;
      tag.scale.divideScalar(scale); // 名牌不跟著縮小
      model.root.add(tag);
      scene.add(model.root);
      const pos = this.randomPoint();
      this.list.push({
        name: THEME.npcs[type.role], model, pos, scale,
        target: this.randomPoint(), facing: this.rng() * 6, wait: this.rng() * 3, timer: 0, phase: 0, time: Math.random() * 10,
        // 大人散步 1.2–1.8 m/s；小孩跑來跑去
        speed: type.child ? 3.2 + this.rng() * 1.2 : 1.2 + this.rng() * 0.6, cur: 0,
      });
    }
  }

  // 七成走在街上（含廣場），三成在住宅之間
  randomPoint() {
    for (;;) {
      let x, z;
      if (this.rng() < 0.7) {
        const t = (this.rng() * 2 - 1) * ROAD_LEN;
        const side = (this.rng() * 2 - 1) * 4.6;
        [x, z] = this.rng() < 0.5 ? [t, side] : [side, t];
      } else {
        const a = this.rng() * Math.PI * 2;
        const r = Math.sqrt(this.rng()) * (VILLAGE_RADIUS - 15);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (z > -66 && !this.world.insideAnyBox(x, z, 1)) return new THREE.Vector3(x, getTerrainHeight(x, z), z);
    }
  }

  update(dt) {
    for (const n of this.list) {
      n.time += dt;
      n.timer += dt;
      let want = 0;
      if (n.wait > 0) {
        n.wait -= dt;
      } else {
        const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1 || n.timer > 25) {
          n.target = this.randomPoint();
          n.timer = 0;
          if (this.rng() < 0.45) n.wait = 2 + this.rng() * 5;
        } else {
          want = n.speed;
          n.facing = lerpAngle(n.facing, Math.atan2(dx, dz), 1 - Math.exp(-5 * dt));
        }
      }
      // 起步、停下都有一點慣性
      n.cur = lerp(n.cur, want, 1 - Math.exp(-(want > n.cur ? 4 : 6) * dt));
      n.pos.x += Math.sin(n.facing) * n.cur * dt;
      n.pos.z += Math.cos(n.facing) * n.cur * dt;
      n.pos.y = getTerrainHeight(n.pos.x, n.pos.z);
      this.world.resolve(n.pos, 0.4);
      n.model.root.position.copy(n.pos);
      n.model.root.rotation.y = n.facing;
      n.phase = advancePhase(n.phase, n.cur, dt, n.scale);
      animateCharacter(n.model, { phase: n.phase, speed: n.cur / n.scale, time: n.time }, dt);
    }
  }
}
