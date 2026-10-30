import * as THREE from 'three';
import { valueNoise, smoothstep, clamp } from '../core/math.js';
import { toonMaterial } from '../render/toon.js';
import {
  forestDensity, isRoad, riverX, heightGrid, GRID_N, GRID_CELL, HALF, WORLD_SIZE,
} from './heightmap.js';

// 高度、區域等純函式放在 heightmap.js（不依賴 three.js），這裡統一轉出
export * from './heightmap.js';

const C = {
  sand: new THREE.Color(0xd9c38c),
  bed: new THREE.Color(0x8c7a5a),
  grass1: new THREE.Color(0x76b84c),
  grass2: new THREE.Color(0x4e8c38),
  forest: new THREE.Color(0x3c6e2e),
  dirt: new THREE.Color(0xc29a68),
  rock: new THREE.Color(0x8a7f72),
  ochre: new THREE.Color(0xa8714a),
  clay: new THREE.Color(0xc49a72),
  snow: new THREE.Color(0xf2f4f8),
};

// 岩壁的顏色：峽谷一帶有一層一層赭紅色的岩層
const sampleRock = new THREE.Color();
function rockStrata(x, z, h, out) {
  out.copy(C.rock);
  const near = smoothstep(-200, -260, z) * (1 - smoothstep(70, 120, Math.abs(x - riverX(z))));
  if (near <= 0) return out;
  const layer = Math.sin(h * 0.9 + valueNoise(x * 0.02, z * 0.02, 3) * 4);
  const band = layer > 0.35 ? C.ochre : layer < -0.5 ? C.clay : null;
  if (band) out.lerp(band, 0.75 * near);
  return out;
}

export function terrainColor(x, z, h, slope, out) {
  // 水邊與南方海灘是沙地
  const beach = smoothstep(560, 640, z) * (1 - smoothstep(3.5, 6, h));
  if (h < 0.8 || beach > 0.5) {
    return out.copy(C.sand).lerp(C.bed, clamp(-h / 4, 0, 1));
  }
  if (isRoad(x, z)) return out.copy(C.dirt);
  const n = valueNoise(x * 0.08, z * 0.08, 9);
  out.copy(C.grass1).lerp(C.grass2, n);
  out.lerp(C.forest, forestDensity(x, z) * 0.7);
  // 陡坡與高處是岩石；北方高原例外（高原頂上是草地）
  const plateau = smoothstep(-470, -540, z);
  const rockiness = Math.max(smoothstep(0.3, 0.55, slope), smoothstep(30, 45, h) * (1 - plateau) + smoothstep(58, 66, h) * plateau);
  out.lerp(rockStrata(x, z, h, sampleRock), rockiness);
  out.lerp(C.snow, smoothstep(62, 75, h));
  return out;
}

// ---------- 分區塊的地形 ----------
// 世界切成 8×8 塊，每塊有精細與簡化兩種網格：近處用精細的，遠處用簡化的，
// 超出霧的範圍整塊不畫。塊與塊交界處往下垂一圈「裙邊」，遮住精細度不同造成的縫隙。
const CHUNKS = 8;
const CHUNK_CELLS = (GRID_N - 1) / CHUNKS; // 每塊 64 格
const CHUNK_SIZE = WORLD_SIZE / CHUNKS; // 200 公尺
const LOW_STEP = 4; // 簡化網格：每 4 格取 1 點
const SKIRT = 4;

const sampleColor = new THREE.Color();

function buildChunkGeometry(grid, ci, cj, step) {
  const n = CHUNK_CELLS / step + 1;
  const i0 = ci * CHUNK_CELLS, j0 = cj * CHUNK_CELLS;
  const at = (i, j) => grid[clamp(j, 0, GRID_N - 1) * GRID_N + clamp(i, 0, GRID_N - 1)];
  const positions = [], normals = [], colors = [], index = [];
  const vert = (gi, gj, drop) => {
    const x = -HALF + gi * GRID_CELL, z = -HALF + gj * GRID_CELL;
    const h = at(gi, gj);
    // 法線用格點的中央差分
    const nx = at(gi - 1, gj) - at(gi + 1, gj), nz = at(gi, gj - 1) - at(gi, gj + 1);
    const len = Math.hypot(nx, 2 * GRID_CELL, nz);
    positions.push(x, h - drop, z);
    normals.push(nx / len, (2 * GRID_CELL) / len, nz / len);
    terrainColor(x, z, h, 1 - (2 * GRID_CELL) / len, sampleColor);
    colors.push(sampleColor.r, sampleColor.g, sampleColor.b);
    return positions.length / 3 - 1;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vert(i0 + i * step, j0 + j * step, 0);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  // 裙邊：沿著四邊各加一排往下垂的點。兩面都畫，不用管邊的方向
  const edge = (list) => {
    let prevTop = null, prevBot = null;
    for (const [i, j] of list) {
      const top = j * n + i;
      const bot = vert(i0 + i * step, j0 + j * step, SKIRT);
      if (prevTop !== null) index.push(prevTop, prevBot, top, top, prevBot, bot, prevTop, top, prevBot, top, bot, prevBot);
      prevTop = top;
      prevBot = bot;
    }
  };
  const range = [...Array(n).keys()];
  edge(range.map(i => [i, 0]));
  edge(range.map(i => [i, n - 1]));
  edge(range.map(j => [0, j]));
  edge(range.map(j => [n - 1, j]));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

export class Terrain {
  constructor(scene) {
    const grid = heightGrid();
    this.material = terrainMaterial();
    this.chunks = [];
    for (let cj = 0; cj < CHUNKS; cj++) {
      for (let ci = 0; ci < CHUNKS; ci++) {
        const high = new THREE.Mesh(buildChunkGeometry(grid, ci, cj, 1), this.material);
        const low = new THREE.Mesh(buildChunkGeometry(grid, ci, cj, LOW_STEP), this.material);
        high.receiveShadow = low.receiveShadow = true;
        low.visible = false;
        scene.add(high, low);
        this.chunks.push({
          high, low,
          cx: -HALF + (ci + 0.5) * CHUNK_SIZE, cz: -HALF + (cj + 0.5) * CHUNK_SIZE,
        });
      }
    }
  }

  // 依鏡頭距離切換精細度；far 之外不畫
  update(camPos, far) {
    for (const c of this.chunks) {
      // 鏡頭到區塊（方形）最近點的水平距離
      const dx = Math.max(0, Math.abs(camPos.x - c.cx) - CHUNK_SIZE / 2);
      const dz = Math.max(0, Math.abs(camPos.z - c.cz) - CHUNK_SIZE / 2);
      const d = Math.hypot(dx, dz);
      const visible = d < far + 60;
      c.high.visible = visible && d < 130;
      c.low.visible = visible && d >= 130;
    }
  }
}

// 頂點色只有約 3 公尺的解析度，在片段著色器裡疊上多層雜訊，讓地面近看也有斑駁細節
function terrainMaterial() {
  const mat = toonMaterial({ vertexColors: true });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vTerrainPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = /* glsl */`varying vec3 vTerrainPos;
      float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float tNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y);
      }
      ${shader.fragmentShader}`.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec2 tp = vTerrainPos.xz;
        float detail = 0.84 + 0.16 * tNoise(tp * 0.12) + 0.1 * tNoise(tp * 0.8) + 0.07 * tNoise(tp * 3.1);
        diffuseColor.rgb *= detail;`);
  };
  mat.customProgramCacheKey = () => 'terrain-detail';
  return mat;
}
