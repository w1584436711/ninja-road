import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { toonMaterial } from '../render/toon.js';
import { addWind } from '../render/wind.js';
import {
  getTerrainHeight, forestDensity, riverX, nearRoad, HALF, VILLAGE_RADIUS, FALLS_Z, SPRING_Z,
} from './terrain.js';

const LEAF_COLORS = [0x3f7f34, 0x4b8f3a, 0x356d2c, 0x5c9a40, 0x2f6328];
// 樹、灌木、岩石依位置分到 200 公尺見方的格子，每格各自一組 InstancedMesh：
// 看不到的格子（鏡頭背後、霧外）整格跳過，不必每幀畫全世界的樹
const CELL = 200;
const CELLS = (HALF * 2) / CELL;

function slopeAt(x, z, h) {
  return Math.abs(getTerrainHeight(x + 2, z) - h) + Math.abs(getTerrainHeight(x, z + 2) - h);
}

// 不長東西的地方：村子、道路、首領岩、高原的溪
function blocked(x, z, margin) {
  if (Math.hypot(x, z) < VILLAGE_RADIUS + margin) return true;
  if (nearRoad(x, z, margin)) return true;
  if (z < -115 && z > -240 && Math.abs(x) < 110) return true;
  if (z < FALLS_Z + 10 && z > SPRING_Z - 10 && Math.abs(x - riverX(z)) < 7) return true;
  return false;
}

// 高原（高度 42 以上、北方）也長樹；其他地方太高就不長
const tooHigh = (z, h, limit) => h > (z < -480 ? 60 : limit);

const cellOf = (x, z) => Math.min(CELLS - 1, Math.floor((x + HALF) / CELL)) * CELLS + Math.min(CELLS - 1, Math.floor((z + HALF) / CELL));

function byCell(items) {
  const cells = Array.from({ length: CELLS * CELLS }, () => []);
  for (const it of items) cells[cellOf(it.x, it.z)].push(it);
  return cells;
}

export class Nature {
  constructor(world) {
    this.group = new THREE.Group();
    this.cells = Array.from({ length: CELLS * CELLS }, (_, k) => ({
      meshes: [],
      cx: -HALF + (Math.floor(k / CELLS) + 0.5) * CELL,
      cz: -HALF + ((k % CELLS) + 0.5) * CELL,
    }));
    const rng = mulberry32(1234);
    const rand = () => (rng() * 2 - 1) * (HALF - 15);

    // ---------- 樹 ----------
    const trees = [];
    for (let tries = 0; trees.length < 5200 && tries < 120000; tries++) {
      const x = rand(), z = rand();
      if (blocked(x, z, 10)) continue;
      const h = getTerrainHeight(x, z);
      if (h < 1.2 || tooHigh(z, h, 42)) continue;
      const dens = forestDensity(x, z);
      if (rng() > 0.12 + 0.88 * dens) continue;
      if (slopeAt(x, z, h) > 3) continue;
      const giant = dens > 0.7 && rng() < (x < -450 ? 0.3 : 0.12); // 古樹之森的巨木特別多
      const s = giant ? 2.4 + rng() * 1.2 : 0.8 + rng() * 0.7;
      trees.push({ x, z, y: h, s });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 8);
    trunkGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunkMat = toonMaterial({ color: 0x6b4a2f });
    const leafMat = addWind(toonMaterial({ color: 0xffffff }), { strength: 0.12, mode: 'canopy' });
    const BLOBS = 4; // 每棵樹的樹冠由幾團葉子組成

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    byCell(trees).forEach((list, k) => {
      if (!list.length) return;
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, list.length * BLOBS);
      list.forEach((t, i) => {
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
            const s = 1.5 + rng() * 0.7;
            sc.set(s * t.s, s * 0.85 * t.s, s * t.s);
          }
          m.compose(p, q, sc);
          leaves.setMatrixAt(i * BLOBS + b, m);
          leaves.setColorAt(i * BLOBS + b, col.setHex(base).offsetHSL(0, 0, (p.y - t.y - th) / t.s * 0.025));
        }
        world.addCircle(t.x, t.z, 0.45 * t.s + 0.05);
      });
      trunks.castShadow = leaves.castShadow = true;
      trunks.receiveShadow = leaves.receiveShadow = true;
      this.addToCell(k, trunks, leaves);
    });

    // ---------- 灌木 ----------
    const bushes = [];
    for (let tries = 0; bushes.length < 2600 && tries < 60000; tries++) {
      const x = rand(), z = rand();
      if (blocked(x, z, 4)) continue;
      const h = getTerrainHeight(x, z);
      if (h < 1 || tooHigh(z, h, 38)) continue;
      if (rng() > 0.25 + 0.75 * forestDensity(x, z)) continue;
      bushes.push({ x, z, y: h, s: 0.6 + rng() * 0.9 });
    }
    const bushMat = addWind(toonMaterial({ color: 0xffffff }), { strength: 0.05, mode: 'canopy' });
    byCell(bushes).forEach((list, k) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(leafGeo, bushMat, list.length);
      list.forEach((b, i) => {
        q.setFromEuler(e.set(0, rng() * 6, 0));
        m.compose(p.set(b.x, b.y + b.s * 0.35, b.z), q, sc.set(b.s * 1.3, b.s * 0.85, b.s * 1.2));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setHex(LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)]).offsetHSL(0, 0.05, 0.03));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      this.addToCell(k, mesh);
    });

    // ---------- 岩石（峽谷與高原多一點） ----------
    const rocks = [];
    for (let tries = 0; rocks.length < 800 && tries < 30000; tries++) {
      const x = rand(), z = rand();
      if (blocked(x, z, 6)) continue;
      const h = getTerrainHeight(x, z);
      if (h < -1) continue;
      const rocky = z < -230 && Math.abs(x - riverX(z)) < 60;
      if (!rocky && rng() < 0.4) continue;
      rocks.push({ x, z, y: h, sx: 0.8 + rng() * 2.4, sy: 0.6 + rng() * 1.6, sz: 0.8 + rng() * 2.4 });
    }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    byCell(rocks).forEach((list, k) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(rockGeo, rockMat, list.length);
      list.forEach((r, i) => {
        q.setFromEuler(e.set(rng(), rng() * 6, rng()));
        m.compose(p.set(r.x, r.y + r.sy * 0.35, r.z), q, sc.set(r.sx, r.sy, r.sz));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setHSL(0.08, 0.08, 0.42 + rng() * 0.15));
        world.addCircle(r.x, r.z, Math.min(r.sx, r.sz) * 0.85, r.y + r.sy * 1.1);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      this.addToCell(k, mesh);
    });
  }

  addToCell(k, ...meshes) {
    for (const mesh of meshes) {
      mesh.computeBoundingSphere(); // 只包住這一格的樹，鏡頭看不到時自動跳過
      this.cells[k].meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  // 霧外的格子不畫
  update(camPos, far) {
    for (const c of this.cells) {
      const dx = Math.max(0, Math.abs(camPos.x - c.cx) - CELL / 2);
      const dz = Math.max(0, Math.abs(camPos.z - c.cz) - CELL / 2);
      const visible = Math.hypot(dx, dz) < far;
      for (const mesh of c.meshes) mesh.visible = visible;
    }
  }
}
