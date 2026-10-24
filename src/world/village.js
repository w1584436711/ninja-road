import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { textTexture } from '../core/textures.js';
import { getTerrainHeight, VILLAGE_RADIUS } from './terrain.js';
import { THEME } from '../data/theme.js';

const WALL_COLORS = [0xf3ead8, 0xe8dcc2, 0xf6f1e7, 0xdccfb4, 0xeadfc8];
const ROOF_COLORS = [0xc0462f, 0x3d6fa8, 0x5a8f4e, 0xd98a2b, 0x8b5a3c, 0xb8603a];

export const TOWER_POS = { x: 0, z: -85, r: 11 };
export const GATE_Z = VILLAGE_RADIUS - 8;

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  return matCache.get(key);
}

function box(w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 單位正方形底的四角錐（屋頂用）
const pyramidGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
pyramidGeo.rotateY(Math.PI / 4);
pyramidGeo.translate(0, 0.5, 0);

function groundBase(x, z, w, d) {
  return Math.min(
    getTerrainHeight(x - w / 2, z - d / 2), getTerrainHeight(x + w / 2, z - d / 2),
    getTerrainHeight(x - w / 2, z + d / 2), getTerrainHeight(x + w / 2, z + d / 2),
  );
}

function createHouse(group, world, rng, x, z, w, d) {
  const base = groundBase(x, z, w, d);
  const h = 3.5 + rng() * 3;
  const wall = WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)];
  const roof = ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)];

  // 牆體往下埋 2m，避免斜坡露出縫隙
  group.add(box(w, h + 2, d, wall, x, base + h / 2 - 1, z));

  let top;
  if (rng() < 0.45) {
    // 平屋頂（可以站上去）+ 水塔
    group.add(box(w + 0.4, 0.4, d + 0.4, roof, x, base + h + 0.2, z));
    top = base + h + 0.4;
    if (rng() < 0.5) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12), mat(0x7a8a9a, { metalness: 0.3 }));
      tank.position.set(x + (rng() - 0.5) * (w - 2.5), top + 1.4, z + (rng() - 0.5) * (d - 2.5));
      tank.castShadow = true;
      group.add(tank);
      world.addCircle(tank.position.x, tank.position.z, 0.9, top + 2.2, top);
    }
  } else {
    const roofH = 1.4 + rng() * 1.2;
    const r = new THREE.Mesh(pyramidGeo, mat(roof));
    r.scale.set(w + 0.8, roofH, d + 0.8);
    r.position.set(x, base + h, z);
    r.castShadow = true;
    group.add(r);
    top = base + h + roofH * 0.45;
  }
  world.addBox(x, z, w, d, top);

  // 門和窗：朝向最近的道路
  const towardX = Math.abs(x) < Math.abs(z);
  const sx = towardX ? -Math.sign(x) || 1 : 0;
  const sz = towardX ? 0 : -Math.sign(z) || 1;
  const fx = x + sx * (w / 2 + 0.03), fz = z + sz * (d / 2 + 0.03);
  const doorW = towardX ? 0.1 : 1.4, doorD = towardX ? 1.4 : 0.1;
  group.add(box(doorW, 2.2, doorD, 0x5a3b26, fx, base + 1.1, fz));
  for (const off of [-1, 1]) {
    const wx = towardX ? fx : fx + off * (w / 4 + 0.6);
    const wz = towardX ? fz + off * (d / 4 + 0.6) : fz;
    const win = box(towardX ? 0.1 : 1.1, 0.9, towardX ? 1.1 : 0.1, 0x9fd2ee, wx, base + h * 0.62, wz, { roughness: 0.2 });
    win.userData.glow = 'window'; // 夜裡亮燈
    group.add(win);
  }
}

function createTower(group, world) {
  const { x, z, r } = TOWER_POS;
  const base = getTerrainHeight(x, z) - 1;
  const h = 17;
  const c = THEME.colors;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat(c.tower));
  body.position.set(x, base + h / 2, z);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 1.3, 32), mat(c.towerBand, { emissive: 0x000000 }));
  band.userData.glow = 'window';
  band.position.set(x, base + h * 0.6, z);
  group.add(band);

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.2, r + 1.6, 1.6, 32), mat(c.towerRoof));
  roof.position.set(x, base + h + 0.8, z);
  roof.castShadow = true;
  group.add(roof);

  // 首領塔的圓形招牌
  const sign = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    new THREE.MeshStandardMaterial({ map: textTexture(THEME.signs.tower, { bg: '#f6efe0', fg: '#b3261e', circle: true }), roughness: 0.6 }),
  );
  sign.position.set(x, base + h * 0.8, z + r + 0.08);
  group.add(sign);

  world.addCircle(x, z, r + 1.2, base + h + 1.6);
}

function createGate(group, world) {
  const z = GATE_Z;
  const base = getTerrainHeight(0, z) - 1;
  const ph = 14;
  const c = THEME.colors;
  // 鳥居式大門：兩根圓柱、上方笠木（兩端上翹）與下方貫木
  for (const sx of [-7, 7]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, ph, 16), mat(c.gate));
    pillar.position.set(sx, base + ph / 2, z);
    pillar.castShadow = true;
    group.add(pillar);
    world.addCircle(sx, z, 0.95, base + ph);
  }
  group.add(box(17, 0.9, 1.2, c.gate, 0, base + ph - 2.4, z)); // 貫木
  group.add(box(19, 1.0, 2.0, c.gate, 0, base + ph + 0.3, z));
  group.add(box(22, 0.8, 2.6, c.gateBeam, 0, base + ph + 1.2, z)); // 笠木
  for (const sx of [-1, 1]) {
    const tip = box(2.4, 0.8, 2.6, c.gateBeam, sx * 11.6, base + ph + 1.45, z);
    tip.rotation.z = sx * 0.22;
    group.add(tip);
  }
  world.addBox(0, z, 22, 2.6, base + ph + 1.6, base + ph - 0.2);

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.0),
    new THREE.MeshStandardMaterial({
      map: textTexture(THEME.signs.gate.split('').join('\n'), { width: 192, height: 256, bg: '#1d1a18', fg: '#f2d27a', font: 'bold 80px "Microsoft JhengHei", sans-serif' }),
    }),
  );
  plate.position.set(0, base + ph - 1.2, z + 0.65);
  group.add(plate);
}

function createLanterns(group) {
  for (let i = -5; i <= 5; i++) {
    if (Math.abs(i) < 2) continue;
    for (const side of [-1, 1]) {
      const z = i * 15, x = side * 5;
      const y = getTerrainHeight(x, z);
      group.add(box(0.2, 3, 0.2, 0x4a3324, x, y + 1.5, z));
      const lamp = box(0.6, 0.8, 0.6, 0xffb070, x, y + 3.2, z, { emissive: 0xff8a3a, emissiveIntensity: 2.5 });
      lamp.userData.glow = 'lantern';
      group.add(lamp);
    }
  }
}

// 村子外圍的木柵欄（大門處留缺口）。柵欄柱有碰撞，但矮到可以跳過去。
function createFence(group, world) {
  const R = VILLAGE_RADIUS + 3;
  const step = 2.4;
  const n = Math.floor((Math.PI * 2 * R) / step);
  const posts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (z > 0 && Math.abs(x) < 12) continue; // 大門
    if (z < -100) continue; // 懸崖那側不用
    posts.push({ x, z, a, y: getTerrainHeight(x, z) });
  }
  const postGeo = new THREE.BoxGeometry(0.25, 1.6, 0.25).translate(0, 0.8, 0);
  const railGeo = new THREE.BoxGeometry(step + 0.1, 0.14, 0.1);
  const wood = mat(0x8a6240);
  const postMesh = new THREE.InstancedMesh(postGeo, wood, posts.length);
  const railMesh = new THREE.InstancedMesh(railGeo, wood, posts.length * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  posts.forEach((pt, i) => {
    postMesh.setMatrixAt(i, m.compose(p.set(pt.x, pt.y - 0.2, pt.z), q.identity(), s));
    world.addCircle(pt.x, pt.z, 0.9, pt.y + 1.4);
    // 橫桿連到下一根柱子
    const a2 = pt.a + step / R / 2;
    q.setFromAxisAngle(up, -a2 + Math.PI / 2);
    for (const [k, hgt] of [[0, 0.6], [1, 1.15]]) {
      railMesh.setMatrixAt(i * 2 + k, m.compose(p.set(Math.cos(a2) * R, pt.y + hgt, Math.sin(a2) * R), q, s));
    }
  });
  postMesh.castShadow = railMesh.castShadow = true;
  group.add(postMesh, railMesh);
}

// 沿主要道路的電線桿與下垂的電線
function createPowerLines(group) {
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 4, 0);
  const armGeo = new THREE.BoxGeometry(1.6, 0.12, 0.12);
  const wood = mat(0x5e4630);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
  const lines = [];
  for (const axis of ['x', 'z']) {
    let prev = null;
    for (let t = -90; t <= 90; t += 18) {
      if (Math.abs(t) < 20) { prev = null; continue; } // 廣場
      const x = axis === 'x' ? t : 5.6, z = axis === 'x' ? 5.6 : t;
      if (axis === 'z' && z < -60) continue; // 首領塔前
      const y = getTerrainHeight(x, z);
      const pole = new THREE.Mesh(poleGeo, wood);
      pole.position.set(x, y, z);
      pole.castShadow = true;
      const arm = new THREE.Mesh(armGeo, wood);
      arm.position.set(x, y + 7.4, z);
      arm.rotation.y = axis === 'x' ? Math.PI / 2 : 0;
      group.add(pole, arm);
      const tops = [-0.7, 0.7].map(o => new THREE.Vector3(axis === 'x' ? x : x + o, y + 7.5, axis === 'x' ? z + o : z));
      if (prev) lines.push([prev[0], tops[0]], [prev[1], tops[1]]);
      prev = tops;
    }
  }
  for (const [a, b] of lines) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const pnt = a.clone().lerp(b, t);
      pnt.y -= Math.sin(t * Math.PI) * 0.9;
      pts.push(pnt);
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
}

// 拉麵攤：櫃台、屋簷、布簾和高腳椅
const RAMEN = { x: -12, z: 20, w: 7, d: 4 };
function createRamenShop(group, world) {
  const { x, z, w, d } = RAMEN;
  const base = getTerrainHeight(x, z);
  group.add(box(w, 3, d, 0xe9dcc0, x, base + 1.5, z - 0.6));
  group.add(box(w, 1.1, 0.6, 0x9c6b3e, x, base + 0.55, z + 1.6)); // 櫃台
  group.add(box(w + 0.6, 0.15, 0.9, 0x7a4f2e, x, base + 1.15, z + 1.7));
  const roof = box(w + 1.2, 0.25, d + 1.4, 0xc0462f, x, base + 3.3, z + 0.2);
  roof.rotation.x = -0.12;
  group.add(roof);
  // 布簾
  const tex = textTexture(THEME.signs.shop, { width: 512, height: 160, bg: '#f4efe4', fg: '#b3261e', font: 'bold 110px "Microsoft JhengHei", sans-serif' });
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 0.9), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  noren.position.set(x, base + 2.6, z + 2.75);
  group.add(noren);
  for (let i = 0; i < 4; i++) {
    const sx = x - 2.4 + i * 1.6;
    group.add(box(0.12, 0.8, 0.12, 0x4a3324, sx, base + 0.4, z + 2.6));
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), mat(0xc0462f));
    seat.position.set(sx, base + 0.85, z + 2.6);
    group.add(seat);
  }
  world.addBox(x, z - 0.6, w, d, base + 3.4);
  world.addBox(x, z + 1.6, w, 0.6, base + 1.25);
}

export function createVillage(world) {
  const group = new THREE.Group();
  const rng = mulberry32(2024);
  const houses = [];

  for (let gx = -96; gx <= 96; gx += 16) {
    for (let gz = -96; gz <= 96; gz += 16) {
      const x = gx + (rng() - 0.5) * 3;
      const z = gz + (rng() - 0.5) * 3;
      const w = 7 + rng() * 3.5;
      const d = 7 + rng() * 3.5;
      const skip = rng() < 0.15;
      if (skip) continue;
      if (Math.abs(x) < w / 2 + 6 || Math.abs(z) < d / 2 + 6) continue; // 道路
      if (Math.hypot(x, z) < 30) continue; // 廣場
      if (Math.hypot(x - TOWER_POS.x, z - TOWER_POS.z) < 26) continue;
      if (Math.hypot(x, z) > VILLAGE_RADIUS - 14) continue;
      if (z < -112) continue; // 懸崖
      createHouse(group, world, rng, x, z, w, d);
      houses.push({ x, z, w, d });
    }
  }

  createTower(group, world);
  createGate(group, world);
  createLanterns(group);
  createFence(group, world);
  createPowerLines(group);
  createRamenShop(group, world);
  houses.push({ x: RAMEN.x, z: RAMEN.z, w: RAMEN.w, d: RAMEN.d + 1 });
  return { group, houses };
}
