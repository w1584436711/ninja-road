import * as THREE from 'three';
import { mulberry32, lerpAngle, clamp } from '../core/math.js';
import { createNameplate } from '../core/textures.js';
import { createCharacter, animateCharacter } from '../player/character.js';
import { getTerrainHeight, VILLAGE_RADIUS } from '../world/terrain.js';
import { THEME } from '../data/theme.js';

// role 對應 data/theme.js 的 npcs 名稱
const TYPES = [
  { role: 'villager', color: '#ffffff', look: { jacket: 0x7c9a62, pants: 0x4b4b55, shoulders: 0x5c7448, hair: 0x3b2a1e, spiky: false, band: false } },
  { role: 'chunin', color: '#9fe39a', look: { jacket: 0x2a3550, pants: 0x2a3550, shoulders: 0x2a3550, vest: 0x4f6b3a, hair: 0x222222, spiky: false } },
  { role: 'student', color: '#ffffff', look: { jacket: 0x3a74c4, pants: 0xd8d8d8, shoulders: 0x2c5a9a, hair: 0x6b3d1f, spiky: false } },
  { role: 'shopOwner', color: '#ffd27a', look: { jacket: 0xf2f2f2, pants: 0x3a3a3a, shoulders: 0xf2f2f2, hair: 0x555555, spiky: false, band: false } },
  { role: 'villager', color: '#ffffff', look: { jacket: 0xc76b8a, pants: 0x5a3a4a, shoulders: 0xa04e6c, hair: 0xe0a0b0, spiky: false, band: false } },
];

// 在村子裡閒逛的 NPC
export class Villagers {
  constructor(scene, world, count = 14) {
    this.world = world;
    this.rng = mulberry32(99);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const type = TYPES[i % TYPES.length];
      const model = createCharacter(type.look);
      const tag = createNameplate(THEME.npcs[type.role], type.color);
      tag.position.y = 2.4;
      model.root.add(tag);
      scene.add(model.root);
      const pos = this.randomPoint();
      this.list.push({ name: THEME.npcs[type.role], model, pos, target: this.randomPoint(), facing: 0, wait: 0, timer: 0, phase: 0, time: Math.random() * 10, speed: 1.8 + this.rng() * 1.2 });
    }
  }

  randomPoint() {
    for (;;) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * (VILLAGE_RADIUS - 15);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -100 && !this.world.insideAnyBox(x, z, 1)) return new THREE.Vector3(x, getTerrainHeight(x, z), z);
    }
  }

  update(dt) {
    for (const n of this.list) {
      n.time += dt;
      n.timer += dt;
      let moving = false;
      if (n.wait > 0) {
        n.wait -= dt;
      } else {
        const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1 || n.timer > 15) {
          n.target = this.randomPoint();
          n.timer = 0;
          if (this.rng() < 0.4) n.wait = 2 + this.rng() * 4;
        } else {
          n.pos.x += (dx / d) * n.speed * dt;
          n.pos.z += (dz / d) * n.speed * dt;
          n.facing = lerpAngle(n.facing, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
          moving = true;
        }
      }
      n.pos.y = getTerrainHeight(n.pos.x, n.pos.z);
      this.world.resolve(n.pos, 0.4);
      n.model.root.position.copy(n.pos);
      n.model.root.rotation.y = n.facing;
      n.phase += dt * (moving ? n.speed * 0.9 : 0);
      animateCharacter(n.model, { phase: n.phase, move: moving ? clamp(n.speed / 4, 0, 1) : 0, time: n.time }, dt);
    }
  }
}
