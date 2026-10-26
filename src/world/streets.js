import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { mergeByMaterial } from '../core/merge.js';
import { toonMaterial } from '../render/toon.js';
import { addWind } from '../render/wind.js';
import { getTerrainHeight, VILLAGE_RADIUS } from './terrain.js';
import { STALLS, QUEST_BOARD, TOWER_POS } from './village.js';

// 村子的街景：石板路、路緣石、廣場、路邊雜物、燈籠串、櫻花與花瓣。
const ROAD_HALF = 3.5;
const PLAZA_R = 18;
const ROAD_END = VILLAGE_RADIUS - 1;
const TOWER_FRONT = TOWER_POS.z + TOWER_POS.r + 1.5;

// ---------- 石板貼圖（程序產生，可無縫重複） ----------
function cobbleTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6a6358';
  g.fillRect(0, 0, S, S);
  const rng = mulberry32(9);
  const rows = 8, rh = S / rows;
  const stone = (x, y, w, h, shade) => {
    for (const ox of [-S, 0, S]) {
      g.fillStyle = `rgb(${shade + 10},${shade + 2},${shade - 12})`;
      g.beginPath();
      g.roundRect(x + ox + 3, y + 3, w - 6, h - 6, 9);
      g.fill();
      // 上緣亮一點，像石頭的弧面
      g.fillStyle = 'rgba(255,255,255,.07)';
      g.fillRect(x + ox + 8, y + 6, w - 16, 4);
    }
  };
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.5 : 0;
    while (x < S) {
      const w = rh * (0.8 + rng() * 0.7);
      stone(x, r * rh, w, rh, 140 + rng() * 45);
      x += w;
    }
  }
  // 細小斑點
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${rng() * 0.12})`;
    g.fillRect(rng() * S, rng() * S, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 讓所有三角形朝上（PlaneGeometry 換軸後繞向可能反過來）
function faceUp(geo) {
  geo.computeVertexNormals();
  if (geo.attributes.normal.getY(0) < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

// 沿著 X 或 Z 軸的一段路面，貼合地形
function roadStrip(axis, from, to, lift) {
  const len = to - from;
  const geo = new THREE.PlaneGeometry(1, 1, Math.ceil(len / 2), 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const along = from + (pos.getX(i) + 0.5) * len;
    const across = pos.getY(i) * ROAD_HALF * 2;
    const x = axis === 'x' ? along : across;
    const z = axis === 'x' ? across : along;
    pos.setXYZ(i, x, getTerrainHeight(x, z) + lift, z);
    uv.setXY(i, x / 4, z / 4);
  }
  return faceUp(geo);
}

// ---------- 實例化道具：同一種零件全部畫成一次 ----------
class Props {
  constructor() {
    this.parts = new Map();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }

  part(key, geo, mat) {
    if (!this.parts.has(key)) this.parts.set(key, { geo, mat, items: [] });
    return this.parts.get(key);
  }

  // 放一個零件：位置、繞 Y 旋轉、縮放、顏色（可省略）
  add(key, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color) {
    this.parts.get(key).items.push({ x, y, z, ry, sx, sy, sz, color });
  }

  build(group) {
    const p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    for (const [key, part] of this.parts) {
      if (!part.items.length) continue;
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, part.items.length);
      part.items.forEach((it, i) => {
        this.q.setFromEuler(this.e.set(0, it.ry, 0));
        mesh.setMatrixAt(i, this.m.compose(p.set(it.x, it.y, it.z), this.q, s.set(it.sx, it.sy, it.sz)));
        if (it.color !== undefined) mesh.setColorAt(i, col.setHex(it.color));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      if (part.mat.userData.glow) mesh.userData.glow = part.mat.userData.glow;
      mesh.name = key;
      group.add(mesh);
    }
  }
}

const WOOD = 0x8a6240, STONE = 0x9a968c;
const PINKS = [0xf7b8cf, 0xf4a6c0, 0xfbd0de, 0xf9c4d6];
const FLOWERS = [0xff8fb0, 0xffd23a, 0xff5a4a, 0xffffff, 0xc49aff, 0x8fd3ff];

export class Streets {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.rng = mulberry32(314);
    this.taken = [];
    this.sakura = [];
    this.props = new Props();
    this.definePartTypes();

    // 先標記已經有東西的位置（路燈、電線桿、攤位、任務板、NPC）
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) >= 2) for (const s of [-5, 5]) this.take(s, i * 15, 0.8);
    }
    for (let t = -90; t <= 90; t += 18) {
      if (Math.abs(t) < 20) continue;
      this.take(t, 5.6, 0.8);
      if (t > -60) this.take(5.6, t, 0.8);
    }
    for (const s of STALLS) this.take(s.x, s.z + 3, 4);
    this.take(QUEST_BOARD.x, QUEST_BOARD.z + 1.5, 3);
    this.take(QUEST_BOARD.x + 5, QUEST_BOARD.z + 1, 2);

    this.buildRoads();
    this.buildPlaza();
    this.buildStreetLanterns();
    this.buildSidewalks();
    this.props.build(this.group);
    this.buildPetals();
    mergeByMaterial(this.group);
    scene.add(this.group);
  }

  take(x, z, r) { this.taken.push({ x, z, r }); }

  free(x, z, r) {
    if (this.world.insideAnyBox(x, z, r)) return false;
    return this.taken.every(t => Math.hypot(t.x - x, t.z - z) > t.r + r);
  }

  definePartTypes() {
    const P = this.props;
    const wood = toonMaterial({ color: WOOD });
    const stone = toonMaterial({ color: STONE });
    const white = toonMaterial({ color: 0xffffff }); // 用實例顏色上色
    const lampMat = toonMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: 0.5 });
    lampMat.userData.glow = 'lantern';
    const chochinMat = toonMaterial({ color: 0xff6a4a, emissive: 0xff3a1a, emissiveIntensity: 0.5 });
    chochinMat.userData.glow = 'lantern';
    const pyramid = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);

    P.part('barrel', new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12).translate(0, 0.45, 0), toonMaterial({ color: 0x8a5a32 }));
    P.part('band', new THREE.CylinderGeometry(0.355, 0.355, 0.06, 12), toonMaterial({ color: 0x3a2a1a }));
    P.part('crate', new THREE.BoxGeometry(0.7, 0.7, 0.7).translate(0, 0.35, 0), toonMaterial({ color: 0xb08850 }));
    P.part('pot', new THREE.CylinderGeometry(0.24, 0.18, 0.4, 10).translate(0, 0.2, 0), toonMaterial({ color: 0xb5653a }));
    P.part('bush', new THREE.IcosahedronGeometry(0.34, 1), addWind(toonMaterial({ color: 0xffffff }), { strength: 0.04, mode: 'canopy' }));
    P.part('seat', new THREE.BoxGeometry(1.6, 0.08, 0.42), wood);
    P.part('leg', new THREE.BoxGeometry(0.08, 0.45, 0.38).translate(0, 0.225, 0), wood);
    P.part('lanternBase', new THREE.BoxGeometry(0.55, 0.25, 0.55).translate(0, 0.125, 0), stone);
    P.part('lanternPost', new THREE.CylinderGeometry(0.1, 0.12, 0.75, 8).translate(0, 0.625, 0), stone);
    P.part('lanternBox', new THREE.BoxGeometry(0.42, 0.36, 0.42).translate(0, 1.18, 0), lampMat);
    P.part('lanternRoof', pyramid, stone);
    P.part('curb', new THREE.BoxGeometry(1, 1, 1), toonMaterial({ color: 0x9a948a }));
    P.part('bedEdge', new THREE.BoxGeometry(1, 1, 1), stone);
    P.part('flower', new THREE.IcosahedronGeometry(0.1, 0), white);
    P.part('trunk', new THREE.CylinderGeometry(0.16, 0.28, 1, 8).translate(0, 0.5, 0), toonMaterial({ color: 0x5a3a2a }));
    P.part('blossom', new THREE.IcosahedronGeometry(1, 1), addWind(toonMaterial({ color: 0xffffff }), { strength: 0.06, mode: 'canopy' }));
    P.part('post', new THREE.BoxGeometry(0.2, 3, 0.2).translate(0, 1.5, 0), toonMaterial({ color: 0x4a3324 }));
    P.part('lamp', new THREE.BoxGeometry(0.6, 0.8, 0.6), lampMat);
    P.part('chochin', new THREE.SphereGeometry(0.2, 10, 8), chochinMat);
  }

  // ---------- 石板路、路緣石 ----------
  buildRoads() {
    const tex = cobbleTexture();
    const roadMat = toonMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    for (const [axis, from, to] of [['x', -ROAD_END, ROAD_END], ['z', TOWER_FRONT, ROAD_END + 4]]) {
      const m = new THREE.Mesh(roadStrip(axis, from, to, 0.04), roadMat);
      m.receiveShadow = true;
      m.userData.noMerge = true;
      this.group.add(m);
      // 兩側路緣石（廣場範圍內不放）
      for (const side of [-1, 1]) {
        for (let t = from; t < to; t += 3) {
          const c = t + 1.5;
          if (Math.abs(c) < PLAZA_R + 1) continue;
          const x = axis === 'x' ? c : side * (ROAD_HALF + 0.12);
          const z = axis === 'x' ? side * (ROAD_HALF + 0.12) : c;
          const y = getTerrainHeight(x, z);
          this.props.add('curb', x, y + 0.05, z, axis === 'x' ? 0 : Math.PI / 2, 3, 0.16, 0.25);
        }
      }
    }
    this.roadMat = roadMat;
  }

  // ---------- 廣場：石板、水井、櫻花、長椅、花圃、石燈籠 ----------
  buildPlaza() {
    const geo = new THREE.CircleGeometry(PLAZA_R, 64).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, getTerrainHeight(x, z) + 0.06);
      uv.setXY(i, x / 3.2, z / 3.2);
    }
    geo.computeVertexNormals();
    const plazaMat = toonMaterial({ map: this.roadMat.map, color: 0xe8ddc8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    const plaza = new THREE.Mesh(geo, plazaMat);
    plaza.receiveShadow = true;
    plaza.userData.noMerge = true;
    this.group.add(plaza);
    this.buildWell(0, 0);

    const P = this.props;
    // 四個角落的櫻花樹，每棵配兩張長椅
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * 10.5, z = sz * 10.5;
      this.addSakura(x, z, 1.25);
      const a = Math.atan2(-x, -z); // 面向廣場中心
      for (const off of [-0.6, 0.6]) {
        const bx = x + Math.sin(a + off) * 2.8, bz = z + Math.cos(a + off) * 2.8;
        this.addBench(bx, bz, a + off + Math.PI / 2);
      }
    }
    // 廣場邊緣的花圃（避開四條路口）
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      for (const off of [-0.32, 0.32]) {
        const aa = a + off;
        this.addFlowerBed(Math.cos(aa) * 16.3, Math.sin(aa) * 16.3, -aa, 3.2);
      }
    }
    // 路口兩側的石燈籠
    for (const [x, z] of [[5.3, 16.5], [-5.3, 16.5], [5.3, -16.5], [-5.3, -16.5], [16.5, 5.3], [16.5, -5.3], [-16.5, 5.3], [-16.5, -5.3]]) {
      this.addStoneLantern(x, z);
    }
  }

  buildWell(x, z) {
    const y = getTerrainHeight(x, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a8478 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a32 });
    const add = (geo, mat, px, py, pz, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(1.3, 1.4, 0.85, 20), stone, x, y + 0.42, z);
    add(new THREE.CircleGeometry(1.05, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d3a5a }), x, y + 0.86, z);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.16, 2.3, 0.16), wood, x + sx * 1.15, y + 1.15, z);
    add(new THREE.BoxGeometry(2.6, 0.12, 0.12), wood, x, y + 2.05, z);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(2.9, 0.08, 1.0), new THREE.MeshStandardMaterial({ color: 0x5a7a9a }), x, y + 2.45, z + s * 0.38, s * 0.55);
    add(new THREE.CylinderGeometry(0.18, 0.15, 0.3, 10), wood, x + 0.5, y + 1.05, z);
    this.world.addCircle(x, z, 1.45, y + 0.85);
    this.take(x, z, 2.5);
  }

  addSakura(x, z, s = 1) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    const th = 2.6 * s;
    P.add('trunk', x, y, z, 0, s, th, s);
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + this.rng();
      const r = b === 0 ? 0 : (1.1 + this.rng() * 0.5) * s;
      const k = (b === 0 ? 1.9 : 1.3 + this.rng() * 0.4) * s;
      P.add('blossom', x + Math.cos(a) * r, y + th + (b === 0 ? 0.6 : 0.2 + this.rng() * 0.8) * s, z + Math.sin(a) * r,
        this.rng() * 6, k, k * 0.8, k, PINKS[Math.floor(this.rng() * PINKS.length)]);
    }
    this.world.addCircle(x, z, 0.3 * s);
    this.take(x, z, 1.4 * s);
    this.sakura.push({ x, z, y: y + th, r: 2.2 * s });
  }

  addBench(x, z, ry) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    P.add('seat', x, y + 0.47, z, ry);
    for (const s of [-0.65, 0.65]) P.add('leg', x + Math.cos(ry) * s, y, z - Math.sin(ry) * s, ry);
    this.world.addCircle(x, z, 0.6, y + 0.5);
    this.take(x, z, 1);
  }

  addStoneLantern(x, z) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    const ry = this.rng() * 0.3;
    P.add('lanternBase', x, y, z, ry);
    P.add('lanternPost', x, y, z, ry);
    P.add('lanternBox', x, y, z, ry);
    P.add('lanternRoof', x, y + 1.36, z, ry, 0.8, 0.32, 0.8);
    this.world.addCircle(x, z, 0.35, y + 1.6);
    this.take(x, z, 0.7);
  }

  addFlowerBed(x, z, ry, len) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    P.add('bedEdge', x, y + 0.12, z, ry, 0.9, 0.24, len);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (let i = 0; i < 14; i++) {
      const u = (this.rng() - 0.5) * 0.7, v = (this.rng() - 0.5) * (len - 0.3);
      P.add('flower', x + u * cos + v * sin, y + 0.3 + this.rng() * 0.08, z - u * sin + v * cos, 0, 1, 1, 1, FLOWERS[Math.floor(this.rng() * FLOWERS.length)]);
    }
    this.take(x, z, len / 2);
  }

  // ---------- 主街燈籠：東西向補路燈，再在路燈之間掛紅燈籠串 ----------
  buildStreetLanterns() {
    const P = this.props;
    const strings = [];
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) < 2) continue;
      const t = i * 15;
      // 東西向的路燈（避開電線桿）
      if (Math.abs(t) !== 90) {
        for (const s of [-5, 5]) {
          const y = getTerrainHeight(t, s);
          P.add('post', t, y, s);
          P.add('lamp', t, y + 3.2, s);
          this.take(t, s, 0.8);
        }
        strings.push([t, -5, t, 5]);
      }
      if (Math.abs(t) <= 75) strings.push([-5, t, 5, t]); // 南北向原本就有路燈
    }
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2018 });
    for (const [x0, z0, x1, z1] of strings) {
      const y0 = getTerrainHeight(x0, z0) + 3.65, y1 = getTerrainHeight(x1, z1) + 3.65;
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        pts.push(new THREE.Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * 0.55, z0 + (z1 - z0) * u));
      }
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      for (let k = 1; k <= 5; k++) {
        const u = k / 6;
        const sag = Math.sin(u * Math.PI) * 0.55;
        P.add('chochin', x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - sag - 0.3, z0 + (z1 - z0) * u, 0, 1, 1.35, 1);
      }
    }
  }

  // ---------- 人行道上的雜物與行道樹 ----------
  buildSidewalks() {
    const rng = this.rng;
    for (const axis of ['x', 'z']) {
      for (const dir of [-1, 1]) {
        for (let t = PLAZA_R + 4; t < ROAD_END - 4; t += 3.2) {
          if (axis === 'z' && dir < 0 && t > -TOWER_FRONT - 2) continue; // 首領塔前空出來
          for (const side of [-1, 1]) {
            if (rng() > 0.45) continue;
            const along = dir * (t + (rng() - 0.5) * 1.2);
            const off = side * (4.7 + rng() * 0.6);
            const x = axis === 'x' ? along : off;
            const z = axis === 'x' ? off : along;
            const r = rng();
            const ry = axis === 'x' ? 0 : Math.PI / 2;
            if (r < 0.1) {
              if (this.free(x, z, 1.4)) this.addSakura(x + (axis === 'z' ? side * 0.4 : 0), z + (axis === 'x' ? side * 0.4 : 0), 0.95 + rng() * 0.25);
            } else if (!this.free(x, z, 0.75)) {
              continue;
            } else if (r < 0.42) {
              this.addPot(x, z);
            } else if (r < 0.62) {
              this.addBarrel(x, z);
            } else if (r < 0.8) {
              this.addCrates(x, z, ry);
            } else if (r < 0.92) {
              this.addBench(x, z, ry);
            } else {
              this.addStoneLantern(x, z);
            }
          }
        }
      }
    }
  }

  addPot(x, z) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    const s = 0.9 + this.rng() * 0.4;
    P.add('pot', x, y, z, 0, s, s, s);
    const green = new THREE.Color(0x4e8c38).offsetHSL(this.rng() * 0.05, 0, (this.rng() - 0.5) * 0.1).getHex();
    P.add('bush', x, y + 0.55 * s, z, this.rng() * 6, s, s * 0.9, s, this.rng() < 0.3 ? PINKS[0] : green);
    this.world.addCircle(x, z, 0.3, y + 0.45 * s);
    this.take(x, z, 0.5);
  }

  addBarrel(x, z) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    P.add('barrel', x, y, z, this.rng() * 6);
    P.add('band', x, y + 0.2, z);
    P.add('band', x, y + 0.7, z);
    this.world.addCircle(x, z, 0.36, y + 0.9);
    this.take(x, z, 0.5);
  }

  addCrates(x, z, ry) {
    const P = this.props;
    const y = getTerrainHeight(x, z);
    P.add('crate', x, y, z, ry + (this.rng() - 0.5) * 0.3);
    if (this.rng() < 0.5) P.add('crate', x + 0.1, y + 0.7, z - 0.05, ry + this.rng(), 0.7, 0.7, 0.7);
    this.world.addCircle(x, z, 0.45, y + 0.7);
    this.take(x, z, 0.6);
  }

  // ---------- 櫻花花瓣 ----------
  buildPetals() {
    const N = 260;
    const pos = new Float32Array(N * 3);
    this.petals = [];
    for (let i = 0; i < N; i++) {
      const tree = this.sakura[i % this.sakura.length];
      const p = { tree, speed: 0.35 + this.rng() * 0.4, phase: this.rng() * 6 };
      this.resetPetal(p, true);
      this.petals.push(p);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.petalPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xf9c4d6, size: 0.09, transparent: true, depthWrite: false,
    }));
    this.petalPoints.frustumCulled = false;
    this.petalPoints.userData.noMerge = true;
    this.group.add(this.petalPoints);
  }

  resetPetal(p, anywhere) {
    const t = p.tree;
    const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * t.r;
    p.x = t.x + Math.cos(a) * r;
    p.z = t.z + Math.sin(a) * r;
    p.y = anywhere ? getTerrainHeight(p.x, p.z) + this.rng() * (t.y - getTerrainHeight(t.x, t.z)) : t.y;
    p.ground = getTerrainHeight(p.x, p.z) + 0.05;
  }

  update(dt, time) {
    if (!this.petalPoints) return;
    const arr = this.petalPoints.geometry.attributes.position.array;
    this.petals.forEach((p, i) => {
      p.y -= p.speed * dt;
      p.x += Math.sin(time * 1.3 + p.phase) * 0.5 * dt + 0.25 * dt; // 隨風飄
      p.z += Math.cos(time * 1.1 + p.phase) * 0.4 * dt;
      if (p.y < p.ground) this.resetPetal(p, false);
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    this.petalPoints.geometry.attributes.position.needsUpdate = true;
  }
}
