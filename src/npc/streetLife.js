import * as THREE from 'three';
import { mulberry32, lerp, lerpAngle } from '../core/math.js';
import { mergeByMaterial } from '../core/merge.js';
import { toonMaterial, toonify } from '../render/toon.js';
import { createWolf, animateWolf } from '../combat/wolf.js';
import { getTerrainHeight, VILLAGE_RADIUS } from '../world/terrain.js';

// 村子裡的街頭生活：閒晃的貓狗、廣場上啄食的麻雀、屋頂和院子裡晾的衣服。
// 都只是裝飾，不能攻擊；貓被嚇到會跑開，狗會跟著你走一段路，麻雀靠近就飛走。

const ROAD_LEN = VILLAGE_RADIUS - 12;

// ---------- 貓 ----------
function createCat(color, belly = color) {
  const fur = new THREE.MeshStandardMaterial({ color });
  const light = new THREE.MeshStandardMaterial({ color: belly });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e });
  const eye = new THREE.MeshBasicMaterial({ color: 0x9adf5a });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.24;
  root.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.1, 0.26, 4, 10).rotateX(Math.PI / 2), fur));
  const chest = mesh(new THREE.SphereGeometry(0.085, 10, 8), light, 0, -0.03, 0.12);
  chest.scale.set(1, 1, 0.8);
  body.add(chest);

  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.24);
  body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.095, 12, 10), fur);
  skull.scale.set(1.1, 0.95, 1);
  head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), light, 0, -0.03, 0.07)); // 口鼻
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur, sx * 0.055, 0.09, -0.01);
    ear.rotation.z = -sx * 0.25;
    head.add(ear);
    head.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), eye, sx * 0.04, 0.015, 0.08));
  }
  head.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), dark, 0, -0.01, 0.105)); // 鼻

  const legGeo = new THREE.CapsuleGeometry(0.025, 0.14, 3, 6);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.055, 0.2, sz * 0.14);
    g.add(mesh(legGeo, sz > 0 ? light : fur, 0, -0.1, 0));
    root.add(g);
    return g;
  });

  // 尾巴：兩節，走路時翹高、坐著時捲在地上
  const tail = new THREE.Group();
  tail.position.set(0, 0.04, -0.2);
  body.add(tail);
  const seg = new THREE.CapsuleGeometry(0.022, 0.14, 3, 6).translate(0, 0.08, 0);
  tail.add(mesh(seg, fur));
  const tail2 = new THREE.Group();
  tail2.position.y = 0.16;
  tail.add(tail2);
  tail2.add(mesh(seg, fur));

  for (const g of [body, head, ...legs, tail, tail2]) mergeByMaterial(g);
  return { root, body, head, legs, tail, tail2 };
}

// pose：'walk' | 'sit' | 'sleep'
function animateCat(c, s, dt) {
  const k = 1 - Math.exp(-10 * dt);
  const a = Math.sin(s.phase);
  const amp = s.move * 0.8;
  const sit = s.pose === 'sit' ? 1 : 0, sleep = s.pose === 'sleep' ? 1 : 0;
  c.legs[0].rotation.x = lerp(c.legs[0].rotation.x, a * amp - sleep * 1.3, k);
  c.legs[3].rotation.x = lerp(c.legs[3].rotation.x, a * amp + sit * 1.2 + sleep * 1.3, k);
  c.legs[1].rotation.x = lerp(c.legs[1].rotation.x, -a * amp - sleep * 1.3, k);
  c.legs[2].rotation.x = lerp(c.legs[2].rotation.x, -a * amp + sit * 1.2 + sleep * 1.3, k);
  // 坐：身體往後仰、屁股貼地；睡：整個趴下
  c.body.rotation.x = lerp(c.body.rotation.x, -sit * 0.55, k);
  c.body.position.y = lerp(c.body.position.y, 0.24 - sit * 0.06 - sleep * 0.15 + Math.abs(a) * 0.015 * s.move, k);
  c.body.position.z = lerp(c.body.position.z, -sit * 0.06, k);
  c.head.rotation.x = lerp(c.head.rotation.x, sit * 0.5 + sleep * 0.25 + (s.lookUp ?? 0), k);
  c.head.rotation.y = lerp(c.head.rotation.y, s.headYaw ?? 0, k);
  const up = s.move > 0.2 ? 1 : 0;
  c.tail.rotation.x = lerp(c.tail.rotation.x, up ? -0.35 : -1.45 + sit * 0.1, k);
  c.tail2.rotation.x = lerp(c.tail2.rotation.x, up ? 0.6 : 0.3, k);
  c.tail.rotation.z = Math.sin(s.time * 1.7) * (sleep ? 0.05 : 0.2);
}

// ---------- 麻雀 ----------
const BIRD_SPOTS = [[6, 9], [-10, -7], [12, -12], [-3, 46], [44, 2], [-48, -2], [2, -50]];

export class StreetLife {
  constructor(scene, world, houses, sfx) {
    this.world = world;
    this.sfx = sfx;
    this.rng = mulberry32(777);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.createAnimals();
    this.createBirds();
    this.createLaundry(houses);
    toonify(this.group);
  }

  // 村子裡隨機一個能走的點：多半在街上
  randomPoint(near, radius = 30) {
    for (let i = 0; i < 40; i++) {
      let x, z;
      if (near) {
        const a = this.rng() * Math.PI * 2, r = 4 + this.rng() * radius;
        x = near.x + Math.cos(a) * r;
        z = near.z + Math.sin(a) * r;
      } else if (this.rng() < 0.7) {
        const t = (this.rng() * 2 - 1) * ROAD_LEN;
        const side = (this.rng() * 2 - 1) * 5;
        [x, z] = this.rng() < 0.5 ? [t, side] : [side, t];
      } else {
        const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * (VILLAGE_RADIUS - 15);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (Math.hypot(x, z) < VILLAGE_RADIUS - 12 && z > -66 && !this.world.insideAnyBox(x, z, 0.8)) {
        return new THREE.Vector3(x, getTerrainHeight(x, z), z);
      }
    }
    return new THREE.Vector3(0, getTerrainHeight(0, 6), 6);
  }

  createAnimals() {
    this.animals = [];
    const dogs = [[0xc8823a, 'dog'], [0xe8e2d8, 'dog'], [0x2a2624, 'dog']];
    const cats = [[0xe09a4a, 0xf6e6cc], [0x8a8a90, 0xd8d8dc], [0x222226, 0x222226], [0xf0ece4, 0xf0ece4], [0xb07a4a, 0xe8d8c0]];
    for (const [color] of dogs) {
      const m = createWolf(color);
      // 狗：小一點、黑眼睛、尾巴翹起來
      m.root.traverse(o => { if (o.isMesh && o.material.isMeshBasicMaterial) o.material = new THREE.MeshBasicMaterial({ color: 0x1a120a }); });
      m.root.scale.setScalar(0.55);
      m.tail.rotation.x = 0.6;
      m.root.traverse(o => { if (o.children.filter(ch => ch.isMesh).length > 1) mergeByMaterial(o); });
      this.addAnimal('dog', m, 1.5);
    }
    for (const [color, belly] of cats) this.addAnimal('cat', createCat(color, belly), 0.8);
  }

  addAnimal(kind, model, speed) {
    const pos = this.randomPoint();
    this.group.add(model.root);
    this.animals.push({
      kind, model, pos, speed, facing: this.rng() * 6, cur: 0, phase: 0, time: this.rng() * 10,
      state: 'idle', timer: this.rng() * 5, target: pos.clone(), pose: 'sit', cooldown: 0, meowCd: 0,
    });
  }

  updateAnimals(dt, player, camPos) {
    const pp = player.pos;
    const pSpeed = Math.hypot(player.vel?.x ?? 0, player.vel?.z ?? 0);
    for (const a of this.animals) {
      a.time += dt;
      a.timer -= dt;
      a.cooldown -= dt;
      a.meowCd -= dt;
      const dx = pp.x - a.pos.x, dz = pp.z - a.pos.z;
      const dPlayer = Math.hypot(dx, dz);
      const visible = a.pos.distanceToSquared(camPos) < 70 * 70;
      a.model.root.visible = visible;
      if (dPlayer > 120) continue;

      // 對玩家的反應
      if (a.kind === 'cat' && dPlayer < 2.6 && pSpeed > 4 && a.state !== 'flee') {
        a.state = 'flee';
        a.timer = 2 + this.rng();
        a.target = this.randomPoint(a.pos, 12);
      } else if (a.kind === 'dog' && dPlayer < 7 && a.cooldown <= 0 && a.state !== 'follow') {
        a.state = 'follow';
        a.timer = 10 + this.rng() * 8;
      }
      if (a.kind === 'cat' && dPlayer < 3.5 && a.state !== 'flee' && a.meowCd <= 0 && this.rng() < dt * 0.5) {
        a.meowCd = 10;
        this.sfx?.play('meow', Math.max(0, 1 - dPlayer / 12));
      }

      let want = 0, speed = a.speed;
      a.headYaw = 0;
      switch (a.state) {
        case 'idle':
          if (a.timer <= 0) {
            a.state = 'walk';
            a.target = this.randomPoint(this.rng() < 0.5 ? null : a.pos, 25);
            a.timer = 30;
          }
          // 玩家在附近時轉頭看
          if (dPlayer < 6) a.headYaw = Math.max(-0.9, Math.min(0.9, ((Math.atan2(dx, dz) - a.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
          break;
        case 'walk':
        case 'flee': {
          if (a.state === 'flee') speed = 4.2;
          const tx = a.target.x - a.pos.x, tz = a.target.z - a.pos.z;
          if (Math.hypot(tx, tz) < 0.8 || a.timer <= 0) {
            a.state = 'idle';
            const sleepy = a.kind === 'cat' && this.rng() < 0.4;
            a.pose = sleepy ? 'sleep' : 'sit';
            a.timer = sleepy ? 20 + this.rng() * 30 : 3 + this.rng() * 8;
          } else {
            want = speed;
            a.facing = lerpAngle(a.facing, Math.atan2(tx, tz), 1 - Math.exp(-6 * dt));
          }
          break;
        }
        case 'follow': {
          // 跟在玩家旁邊 2 公尺左右；玩家跑太快或時間到就不跟了
          if (a.timer <= 0 || dPlayer > 25) {
            a.state = 'idle';
            a.pose = 'sit';
            a.timer = 2 + this.rng() * 3;
            a.cooldown = 40;
            break;
          }
          if (dPlayer > 2.2) {
            want = Math.min(5, a.speed + (dPlayer - 2.2) * 1.5);
            a.facing = lerpAngle(a.facing, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
          } else {
            a.facing = lerpAngle(a.facing, Math.atan2(dx, dz), 1 - Math.exp(-3 * dt));
          }
          break;
        }
      }
      if (want > 0) a.pose = 'walk';
      a.cur = lerp(a.cur, want, 1 - Math.exp(-(want > a.cur ? 5 : 7) * dt));
      a.pos.x += Math.sin(a.facing) * a.cur * dt;
      a.pos.z += Math.cos(a.facing) * a.cur * dt;
      this.world.resolve(a.pos, a.kind === 'dog' ? 0.3 : 0.2);
      // 不要跑出村子
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r > VILLAGE_RADIUS - 10) a.pos.multiplyScalar((VILLAGE_RADIUS - 10) / r);
      a.pos.y = getTerrainHeight(a.pos.x, a.pos.z);
      if (!visible) continue;
      a.model.root.position.copy(a.pos);
      a.model.root.rotation.y = a.facing;
      const stride = a.kind === 'dog' ? 0.55 : 0.32;
      a.phase += (a.cur / stride) * dt * Math.PI;
      const move = Math.min(1, a.cur / (a.kind === 'dog' ? 2.5 : 1.5));
      if (a.kind === 'dog') {
        animateWolf(a.model, { phase: a.phase, move, time: a.time * (a.state === 'follow' ? 3 : 1) }, dt);
        // 坐下：後腳收起來、身體往後仰
        const sit = a.pose === 'sit' && a.cur < 0.2 ? 1 : 0;
        a.model.body.rotation.x = lerp(a.model.body.rotation.x, -sit * 0.45, 1 - Math.exp(-8 * dt));
        a.model.body.position.y -= sit * 0.12;
        a.model.head.rotation.y = lerp(a.model.head.rotation.y, a.headYaw, 1 - Math.exp(-6 * dt));
      } else {
        animateCat(a.model, { phase: a.phase, move, pose: a.pose, time: a.time, headYaw: a.headYaw }, dt);
      }
    }
  }

  // ---------- 麻雀 ----------
  createBirds() {
    const n = BIRD_SPOTS.length * 6;
    const parts = [
      new THREE.SphereGeometry(0.06, 8, 6).scale(0.9, 0.85, 1.3),
      new THREE.SphereGeometry(0.042, 8, 6).translate(0, 0.045, 0.07),
      new THREE.BoxGeometry(0.05, 0.012, 0.08).translate(0, 0.02, -0.1),
    ];
    const bodyGeo = mergeGeo(parts);
    const wingGeo = new THREE.BoxGeometry(0.09, 0.01, 0.065).translate(0.045, 0, 0);
    this.birdBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a48 }), n);
    this.birdWing = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0x5a4430 }), n * 2);
    for (const m of [this.birdBody, this.birdWing]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.birds = [];
    this.flocks = BIRD_SPOTS.map(([x, z], i) => ({ x, z, scared: 0, idx: i }));
    for (let i = 0; i < n; i++) {
      const flock = this.flocks[Math.floor(i / 6)];
      const b = {
        flock, pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: this.rng() * 6,
        state: 'ground', timer: this.rng() * 2, hop: 0, flap: this.rng() * 6, peck: 0,
      };
      this.placeOnGround(b, flock);
      this.birds.push(b);
    }
    this.dummy = new THREE.Object3D();
  }

  placeOnGround(b, flock) {
    const a = this.rng() * Math.PI * 2, r = this.rng() * 2.5;
    b.pos.set(flock.x + Math.cos(a) * r, 0, flock.z + Math.sin(a) * r);
    b.pos.y = getTerrainHeight(b.pos.x, b.pos.z);
  }

  updateBirds(dt, player, camPos) {
    const pp = player.pos;
    const pSpeed = Math.hypot(player.vel?.x ?? 0, player.vel?.z ?? 0);
    const near = Math.hypot(camPos.x, camPos.z) < VILLAGE_RADIUS + 60;
    this.birdBody.visible = this.birdWing.visible = near;
    if (!near) return;
    // 玩家靠近（跑步時更遠就會嚇到）→ 整群飛走
    for (const f of this.flocks) {
      const d = Math.hypot(pp.x - f.x, pp.z - f.z);
      if (d < (pSpeed > 4 ? 7 : 4) && f.scared <= 0) {
        f.scared = 1;
        this.sfx?.play('flutter', Math.max(0, 1 - d / 20));
        for (const b of this.birds) {
          if (b.flock !== f || b.state !== 'ground') continue;
          b.state = 'fly';
          const away = Math.atan2(b.pos.x - pp.x, b.pos.z - pp.z) + (this.rng() - 0.5) * 1.2;
          b.vel.set(Math.sin(away) * 5, 4 + this.rng() * 2, Math.cos(away) * 5);
          b.timer = 2.5 + this.rng() * 2;
        }
      }
    }
    const d = this.dummy;
    let wi = 0;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.timer -= dt;
      let wingAngle = 0.1;
      if (b.state === 'ground') {
        // 跳兩下、啄一下地面、轉個方向
        if (b.timer <= 0) {
          const r = this.rng();
          if (r < 0.4) { b.hop = 0.25; b.facing += (this.rng() - 0.5) * 1.5; } else if (r < 0.8) b.peck = 0.3;
          else b.facing += (this.rng() - 0.5) * 3;
          b.timer = 0.3 + this.rng() * 1.2;
        }
        if (b.hop > 0) {
          b.hop -= dt;
          b.pos.x += Math.sin(b.facing) * dt * 0.8;
          b.pos.z += Math.cos(b.facing) * dt * 0.8;
        }
        b.peck = Math.max(0, b.peck - dt);
        const ground = getTerrainHeight(b.pos.x, b.pos.z);
        b.pos.y = ground + (b.hop > 0 ? Math.sin((b.hop / 0.25) * Math.PI) * 0.06 : 0);
      } else if (b.state === 'fly') {
        b.flap += dt * 30;
        wingAngle = Math.sin(b.flap) * 1.1;
        b.vel.y -= dt * 2;
        b.pos.addScaledVector(b.vel, dt);
        b.facing = Math.atan2(b.vel.x, b.vel.z);
        if (b.timer <= 0) {
          // 飛到另一個地方降落
          const next = this.flocks[(b.flock.idx + 1 + Math.floor(this.rng() * 2)) % this.flocks.length];
          b.flock = next;
          b.state = 'land';
          b.land = new THREE.Vector3(next.x + (this.rng() - 0.5) * 5, 0, next.z + (this.rng() - 0.5) * 5);
          b.land.y = getTerrainHeight(b.land.x, b.land.z);
        }
      } else {
        // 滑翔降落
        b.flap += dt * 18;
        wingAngle = Math.sin(b.flap) * 0.6;
        const to = b.land.clone().sub(b.pos);
        const dist = to.length();
        if (dist < 0.3) {
          b.state = 'ground';
          b.pos.copy(b.land);
          b.timer = this.rng();
        } else {
          b.vel.lerp(to.multiplyScalar(Math.min(9, dist * 1.5) / dist), 1 - Math.exp(-3 * dt));
          b.pos.addScaledVector(b.vel, dt);
          b.facing = Math.atan2(b.vel.x, b.vel.z);
        }
      }
      d.position.copy(b.pos);
      d.position.y += 0.05;
      d.rotation.set(b.peck > 0 ? 0.6 : b.state === 'ground' ? 0 : -0.15, b.facing, 0, 'YXZ');
      d.scale.setScalar(1);
      d.updateMatrix();
      this.birdBody.setMatrixAt(i, d.matrix);
      for (const side of [-1, 1]) {
        d.position.copy(b.pos);
        d.position.y += 0.07;
        d.rotation.set(0, b.facing + (side < 0 ? Math.PI : 0), side * wingAngle, 'YXZ');
        // 收起來時翅膀貼在身體兩側
        d.scale.set(b.state === 'ground' ? 0.7 : 1, 1, 1);
        d.updateMatrix();
        this.birdWing.setMatrixAt(wi++, d.matrix);
      }
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
    this.birdWing.instanceMatrix.needsUpdate = true;
    // 每群鳥都飛走之後過一陣子才能再被嚇
    for (const f of this.flocks) if (f.scared > 0 && !this.birds.some(b => b.flock === f && b.state !== 'ground')) f.scared -= dt * 0.2;
  }

  // ---------- 晾衣服 ----------
  createLaundry(houses) {
    const rng = mulberry32(4242);
    const lines = [];
    for (const h of houses) {
      if (!h.front || rng() > 0.4) continue;
      const { nx, nz } = h.front;
      const tx = nz !== 0 ? 1 : 0, tz = nz !== 0 ? 0 : 1;
      const halfN = nx !== 0 ? h.w / 2 : h.d / 2, halfT = nx !== 0 ? h.d / 2 : h.w / 2;
      if (h.flat && rng() < 0.6) {
        // 平屋頂上：一條跨屋頂的晾衣繩
        const y = h.top + 1.5;
        const off = (rng() - 0.5) * halfN;
        lines.push({
          a: new THREE.Vector3(h.x - tx * (halfT - 0.8) + nx * off, y, h.z - tz * (halfT - 0.8) + nz * off),
          b: new THREE.Vector3(h.x + tx * (halfT - 0.8) + nx * off, y, h.z + tz * (halfT - 0.8) + nz * off),
          ground: h.top,
        });
      } else {
        // 房子側邊的院子：繩子和門面垂直
        const side = rng() < 0.5 ? -1 : 1;
        const sx = h.x + tx * side * (halfT + 1.3), sz = h.z + tz * side * (halfT + 1.3);
        const ax = sx - nx * (halfN - 1), az = sz - nz * (halfN - 1);
        const bx = sx + nx * (halfN - 1.5), bz = sz + nz * (halfN - 1.5);
        if (this.world.insideAnyBox(ax, az, 0.6) || this.world.insideAnyBox(bx, bz, 0.6)) continue;
        const ga = getTerrainHeight(ax, az), gb = getTerrainHeight(bx, bz);
        lines.push({ a: new THREE.Vector3(ax, ga + 2.1, az), b: new THREE.Vector3(bx, gb + 2.1, bz), ground: Math.min(ga, gb) });
      }
    }

    // 竿子（實例化）、繩子（一條線段集合）、衣服（實例化的平面，各自一個顏色）
    const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 1, 6).translate(0, 0.5, 0);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x6a4a32 }), lines.length * 2);
    const ropePts = [];
    const COLORS = [0xffffff, 0xf2efe6, 0x8fb8e8, 0xe88f8f, 0xf2d27a, 0x9ad8a8, 0x6a7ab8, 0xd8a8e8, 0xf0a060];
    this.clothes = [];
    const d = new THREE.Object3D();
    lines.forEach((l, i) => {
      for (const [j, p] of [[0, l.a], [1, l.b]]) {
        d.position.set(p.x, l.ground, p.z);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, p.y - l.ground + 0.1, 1);
        d.updateMatrix();
        posts.setMatrixAt(i * 2 + j, d.matrix);
      }
      ropePts.push(l.a, l.b);
      const len = l.a.distanceTo(l.b);
      const yaw = Math.atan2(l.b.x - l.a.x, l.b.z - l.a.z) - Math.PI / 2;
      let u = 0.4 + rng() * 0.3;
      while (u < len - 0.4) {
        const w = 0.35 + rng() * 0.4, h = 0.4 + rng() * 0.4;
        if (u + w > len - 0.2) break;
        const t = (u + w / 2) / len;
        const pos = l.a.clone().lerp(l.b, t);
        pos.y -= Math.sin(t * Math.PI) * 0.12; // 繩子中間下垂
        this.clothes.push({ pos, yaw, w, h, color: COLORS[Math.floor(rng() * COLORS.length)], phase: rng() * 6 });
        u += w + 0.08 + rng() * 0.3;
      }
    });
    posts.castShadow = true;
    this.group.add(posts);
    const rope = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropePts), new THREE.LineBasicMaterial({ color: 0x3a3028 }));
    this.group.add(rope);

    const clothGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
    this.cloth = new THREE.InstancedMesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }), this.clothes.length);
    this.cloth.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cloth.castShadow = true;
    const col = new THREE.Color();
    this.clothes.forEach((c, i) => this.cloth.setColorAt(i, col.setHex(c.color)));
    this.group.add(this.cloth);
    this.clothQ = new THREE.Quaternion();
    this.clothSwing = new THREE.Quaternion();
    this.lineCount = lines.length;
  }

  updateLaundry(camPos, windStrength) {
    const near = Math.hypot(camPos.x, camPos.z) < VILLAGE_RADIUS + 80;
    this.cloth.visible = near;
    if (!near) return;
    const d = this.dummy;
    const t = this.time;
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    this.clothes.forEach((c, i) => {
      // 被風吹得往外飄，再一陣一陣地擺動
      const gust = 0.5 + 0.5 * Math.sin(t * 0.6 + c.pos.x * 0.05);
      const angle = windStrength * (0.25 + 0.3 * gust) + Math.sin(t * 2.3 + c.phase) * (0.08 + 0.12 * windStrength * gust);
      this.clothQ.setFromAxisAngle(Y, c.yaw);
      this.clothSwing.setFromAxisAngle(X, angle);
      d.quaternion.copy(this.clothQ).multiply(this.clothSwing);
      d.position.copy(c.pos);
      d.scale.set(c.w, c.h, 1);
      d.updateMatrix();
      this.cloth.setMatrixAt(i, d.matrix);
    });
    this.cloth.instanceMatrix.needsUpdate = true;
  }

  update(dt, player, camPos, wind = 0.5) {
    this.time += dt;
    this.updateAnimals(dt, player, camPos);
    this.updateBirds(dt, player, camPos);
    this.updateLaundry(camPos, wind);
  }
}

function mergeGeo(geos) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  for (const geo of geos) g.add(new THREE.Mesh(geo, mat));
  mergeByMaterial(g);
  return g.children[0].geometry;
}
