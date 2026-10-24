import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { toonMaterial } from '../render/toon.js';
import { addWind } from '../render/wind.js';
import { getTerrainHeight, forestDensity, HALF, VILLAGE_RADIUS } from './terrain.js';

const LEAF_COLORS = [0x3f7f34, 0x4b8f3a, 0x356d2c, 0x5c9a40, 0x2f6328];

function slopeAt(x, z, h) {
  return Math.abs(getTerrainHeight(x + 2, z) - h) + Math.abs(getTerrainHeight(x, z + 2) - h);
}

export function createNature(world) {
  const group = new THREE.Group();
  const rng = mulberry32(1234);

  // ---------- 樹 ----------
  const trees = [];
  for (let tries = 0; trees.length < 1800 && tries < 40000; tries++) {
    const x = (rng() * 2 - 1) * (HALF - 15);
    const z = (rng() * 2 - 1) * (HALF - 15);
    if (Math.hypot(x, z) < VILLAGE_RADIUS + 10) continue;
    if (Math.abs(x) < 8 && z > 0 && z < 260) continue; // 道路
    if (z < -115 && Math.abs(x) < 110) continue; // 首領岩
    const h = getTerrainHeight(x, z);
    if (h < 1.2 || h > 42) continue;
    const dens = forestDensity(x, z);
    if (rng() > 0.12 + 0.88 * dens) continue;
    if (slopeAt(x, z, h) > 3) continue;
    const giant = dens > 0.7 && rng() < 0.12;
    const s = giant ? 2.4 + rng() * 1.2 : 0.8 + rng() * 0.7;
    trees.push({ x, z, y: h, s });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 8);
  trunkGeo.translate(0, 0.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const BLOBS = 4; // 每棵樹的樹冠由幾團葉子組成
  const trunks = new THREE.InstancedMesh(trunkGeo, toonMaterial({ color: 0x6b4a2f }), trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, addWind(toonMaterial({ color: 0xffffff }), { strength: 0.12, mode: 'canopy' }), trees.length * BLOBS);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  trees.forEach((t, i) => {
    const th = 6 * t.s;
    m.compose(p.set(t.x, t.y - 0.3, t.z), q.identity(), sc.set(t.s, th, t.s));
    trunks.setMatrixAt(i, m);

    // 主樹冠一團，周圍再三團小的，越上面越亮
    const base = LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)];
    for (let b = 0; b < BLOBS; b++) {
      e.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
      q.setFromEuler(e);
      if (b === 0) {
        p.set(t.x, t.y + th + 0.6 * t.s, t.z);
        sc.set(3.0 * t.s, 2.4 * t.s, 3.0 * t.s);
      } else {
        const a = (b / (BLOBS - 1)) * Math.PI * 2 + rng();
        const rr = (1.4 + rng() * 0.6) * t.s;
        p.set(t.x + Math.cos(a) * rr, t.y + th + (0.4 + rng() * 2.0) * t.s, t.z + Math.sin(a) * rr);
        const k = 1.5 + rng() * 0.7;
        sc.set(k * t.s, k * 0.85 * t.s, k * t.s);
      }
      m.compose(p, q, sc);
      leaves.setMatrixAt(i * BLOBS + b, m);
      leaves.setColorAt(i * BLOBS + b, col.setHex(base).offsetHSL(0, 0, (p.y - t.y - th) / t.s * 0.025));
    }

    world.addCircle(t.x, t.z, 0.45 * t.s + 0.05);
  });
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  group.add(trunks, leaves);

  // ---------- 灌木 ----------
  const bushes = [];
  for (let tries = 0; bushes.length < 900 && tries < 20000; tries++) {
    const x = (rng() * 2 - 1) * (HALF - 15);
    const z = (rng() * 2 - 1) * (HALF - 15);
    const d = Math.hypot(x, z);
    if (d < VILLAGE_RADIUS + 4 || (Math.abs(x) < 6 && z > 0 && z < 260)) continue;
    const h = getTerrainHeight(x, z);
    if (h < 1 || h > 38) continue;
    if (rng() > 0.25 + 0.75 * forestDensity(x, z)) continue;
    bushes.push({ x, z, y: h, s: 0.6 + rng() * 0.9 });
  }
  const bushMesh = new THREE.InstancedMesh(leafGeo, addWind(toonMaterial({ color: 0xffffff }), { strength: 0.05, mode: 'canopy' }), bushes.length);
  bushes.forEach((b, i) => {
    q.setFromEuler(e.set(0, rng() * 6, 0));
    m.compose(p.set(b.x, b.y + b.s * 0.35, b.z), q, sc.set(b.s * 1.3, b.s * 0.85, b.s * 1.2));
    bushMesh.setMatrixAt(i, m);
    bushMesh.setColorAt(i, col.setHex(LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)]).offsetHSL(0, 0.05, 0.03));
  });
  bushMesh.castShadow = bushMesh.receiveShadow = true;
  group.add(bushMesh);

  // ---------- 岩石 ----------
  const rocks = [];
  for (let tries = 0; rocks.length < 240 && tries < 8000; tries++) {
    const x = (rng() * 2 - 1) * (HALF - 15);
    const z = (rng() * 2 - 1) * (HALF - 15);
    if (Math.hypot(x, z) < VILLAGE_RADIUS + 6) continue;
    const h = getTerrainHeight(x, z);
    if (h < -1) continue;
    rocks.push({ x, z, y: h, sx: 0.8 + rng() * 2.4, sy: 0.6 + rng() * 1.6, sz: 0.8 + rng() * 2.4 });
  }
  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
    rocks.length,
  );
  rocks.forEach((r, i) => {
    q.setFromEuler(e.set(rng(), rng() * 6, rng()));
    m.compose(p.set(r.x, r.y + r.sy * 0.35, r.z), q, sc.set(r.sx, r.sy, r.sz));
    rockMesh.setMatrixAt(i, m);
    rockMesh.setColorAt(i, col.setHSL(0.08, 0.08, 0.42 + rng() * 0.15));
    world.addCircle(r.x, r.z, Math.min(r.sx, r.sz) * 0.85, r.y + r.sy * 1.1);
  });
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  group.add(rockMesh);

  return group;
}
