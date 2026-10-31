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

// 各人的作息：幾點回家、幾點出門（小時）。中忍晚上提著燈籠巡邏，不回家
const SCHEDULE = {
  villager: [20, 6.5], student: [19, 7], shopOwner: [21, 6], child: [18.5, 7.5], chunin: null,
};

// 在村子裡閒逛的 NPC：大多沿著街道走，偶爾停下來。依時間回家、出門
export class Villagers {
  constructor(scene, world, count = 24, houses = []) {
    this.world = world;
    this.rng = mulberry32(99);
    this.list = [];
    this.doors = houses.filter(h => h.front).map(h => {
      const { x, z, nx, nz } = h.front;
      return new THREE.Vector3(x + nx * 1.1, 0, z + nz * 1.1);
    });
    const lantern = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xff9a3a, emissiveIntensity: 1 });
    lantern.userData.glow = 'lantern';
    const lanternGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.24, 10);
    const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8);
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
      const schedule = type.role in SCHEDULE ? SCHEDULE[type.role] : SCHEDULE.villager;
      // 巡夜的人左手提燈籠（只在晚上看得到）
      let lamp = null;
      if (type.role === 'chunin') {
        lamp = new THREE.Group();
        lamp.position.y = -0.36;
        const body = new THREE.Mesh(lanternGeo, lantern);
        body.position.y = -0.14;
        body.userData.glow = 'lantern';
        const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x2a2018 }));
        cap.position.y = -0.01;
        lamp.add(body, cap);
        lamp.visible = false;
        model.elbowL.add(lamp);
      }
      this.list.push({
        name: THEME.npcs[type.role], model, pos, scale, schedule, lamp, home: this.doors.length ? this.doors[Math.floor(this.rng() * this.doors.length)] : null,
        // 傍晚各自隔幾分鐘才動身，不會整條街同時消失
        delay: this.rng() * 0.8, inside: false, goingHome: false,
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

  // 現在該不該在家（hour：0..24）
  shouldBeHome(n, hour) {
    if (!n.schedule || !n.home) return false;
    const [out, back] = [n.schedule[0] + n.delay, n.schedule[1] + n.delay];
    return hour >= out || hour < back;
  }

  update(dt, hour = 12) {
    const night = hour >= 19 || hour < 6;
    for (const n of this.list) {
      if (n.lamp) n.lamp.visible = night;
      const home = this.shouldBeHome(n, hour);
      if (n.inside) {
        if (home) continue;
        // 早上出門：從自家門口出來
        n.inside = false;
        n.goingHome = false;
        n.pos.set(n.home.x, getTerrainHeight(n.home.x, n.home.z), n.home.z);
        n.target = this.randomPoint();
        n.timer = 0;
        n.wait = 0;
        n.model.root.visible = true;
      }
      if (home && !n.goingHome) {
        n.goingHome = true;
        n.target = new THREE.Vector3(n.home.x, getTerrainHeight(n.home.x, n.home.z), n.home.z);
        n.wait = 0;
        n.timer = 0;
      }
      n.time += dt;
      n.timer += dt;
      let want = 0;
      if (n.wait > 0) {
        n.wait -= dt;
      } else {
        const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (n.goingHome && (d < 0.9 || n.timer > 90)) {
          // 進門
          n.inside = true;
          n.cur = 0;
          n.model.root.visible = false;
          continue;
        }
        if (!n.goingHome && (d < 1 || n.timer > 25)) {
          n.target = this.randomPoint();
          n.timer = 0;
          if (this.rng() < 0.45) n.wait = 2 + this.rng() * 5;
        } else {
          // 回家的路上走快一點
          want = n.goingHome ? n.speed * 1.25 : n.speed;
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
