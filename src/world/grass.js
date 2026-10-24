import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { toonMaterial } from '../render/toon.js';
import { addWind } from '../render/wind.js';
import { getTerrainHeight, terrainColor, isRoad, VILLAGE_RADIUS, HALF } from './terrain.js';

const CHUNK = 16; // 每塊草地邊長（公尺）
const BUILDS_PER_FRAME = 1; // 一塊約 5–10ms，每幀只建一塊避免卡頓
const FLOWER_COLORS = [0xffffff, 0xffe066, 0xff9ec4, 0xc9a6ff, 0xff7a5c];

// 草葉：五個頂點的細長三角形，根部暗、尖端亮
function bladeGeometry() {
  const w = 0.06;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -w, 0, 0, w, 0, 0, -w * 0.6, 0.5, 0.04, w * 0.6, 0.5, 0.04, 0, 1, 0.12,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(15).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.5, 1], 1));
  const shade = [0.55, 0.55, 0.85, 0.85, 1.15];
  g.setAttribute('color', new THREE.Float32BufferAttribute(shade.flatMap(s => [s, s, s]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  return g;
}

// 只在玩家周圍生成草，走動時動態載入／卸載
export class Grass {
  constructor(scene, world, quality) {
    this.scene = scene;
    this.world = world;
    this.radius = quality.grassRadius;
    this.density = quality.grassDensity;
    this.chunks = new Map();
    if (!this.radius) return;

    this.bladeGeo = bladeGeometry();
    // 不寫入深度：草不會被後製描上黑邊，也就不會一片雜訊
    this.bladeMat = addWind(toonMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false }), { strength: 0.18 });
    this.flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
    this.flowerMat = addWind(toonMaterial({}), { strength: 0.08, mode: 'canopy' });
  }

  buildChunk(cx, cz) {
    const rng = mulberry32((cx * 73856093) ^ (cz * 19349663));
    const count = Math.floor(CHUNK * CHUNK * this.density);
    const blades = new THREE.InstancedMesh(this.bladeGeo, this.bladeMat, count);
    const flowers = new THREE.InstancedMesh(this.flowerGeo, this.flowerMat, Math.ceil(count * 0.015));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0, f = 0;

    for (let i = 0; i < count; i++) {
      const x = cx * CHUNK + rng() * CHUNK;
      const z = cz * CHUNK + rng() * CHUNK;
      const h = getTerrainHeight(x, z);
      if (h < 0.9 || h > 34 || isRoad(x, z)) continue;
      // 村子裡的草修剪過：較矮、較稀疏
      const inVillage = Math.hypot(x, z) < VILLAGE_RADIUS;
      if (inVillage && (rng() < 0.45 || this.world.insideAnyBox(x, z, 0.3))) continue;
      const tall = inVillage ? 0.4 : 1;
      terrainColor(x, z, h, 0, c).multiplyScalar(0.85 + rng() * 0.3);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      m.compose(p.set(x, h - 0.05, z), q, s.set(1 + rng() * 0.6, (0.35 + rng() * 0.45) * tall, 1));
      blades.setMatrixAt(n, m);
      blades.setColorAt(n, c);
      n++;
      if (f < flowers.count && rng() < 0.015) {
        m.compose(p.set(x + 0.1, h + 0.28 + rng() * 0.15, z), q, s.set(1, 0.7, 1));
        flowers.setMatrixAt(f, m);
        flowers.setColorAt(f, c.setHex(FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)]));
        f++;
      }
    }
    blades.count = n;
    flowers.count = f;
    blades.renderOrder = 1; // 在其他不透明物件之後畫，靠深度測試正確被遮擋
    blades.receiveShadow = flowers.receiveShadow = true;
    blades.computeBoundingSphere();
    flowers.computeBoundingSphere();
    this.scene.add(blades, flowers);
    return [blades, flowers];
  }

  update(pos) {
    if (!this.radius) return;
    const r = this.radius;
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    const span = Math.ceil(r / CHUNK);
    const needed = [];
    for (let cz = pcz - span; cz <= pcz + span; cz++) {
      for (let cx = pcx - span; cx <= pcx + span; cx++) {
        if (Math.abs(cx * CHUNK) > HALF || Math.abs(cz * CHUNK) > HALF) continue;
        const d = Math.hypot((cx + 0.5) * CHUNK - pos.x, (cz + 0.5) * CHUNK - pos.z);
        if (d < r && !this.chunks.has(`${cx},${cz}`)) needed.push([d, cx, cz]);
      }
    }
    needed.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of needed.slice(0, BUILDS_PER_FRAME)) {
      this.chunks.set(`${cx},${cz}`, { cx, cz, meshes: this.buildChunk(cx, cz) });
    }
    for (const [key, ch] of this.chunks) {
      const d = Math.hypot((ch.cx + 0.5) * CHUNK - pos.x, (ch.cz + 0.5) * CHUNK - pos.z);
      if (d > r + CHUNK * 1.5) {
        for (const mesh of ch.meshes) {
          this.scene.remove(mesh);
          mesh.dispose();
        }
        this.chunks.delete(key);
      }
    }
  }
}
