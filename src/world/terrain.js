import * as THREE from 'three';
import { fbm, valueNoise, smoothstep, lerp, clamp } from '../core/math.js';
import { toonMaterial } from '../render/toon.js';

export const WORLD_SIZE = 800;
export const HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = 0;
export const VILLAGE_RADIUS = 105;
export const VILLAGE_HEIGHT = 3;
const ROAD_HALF_WIDTH = 3.5;

// 村子東邊河流的河道中心線
export function riverX(z) {
  return 175 + Math.sin(z * 0.011) * 35 + Math.sin(z * 0.029 + 1.3) * 12;
}

// 0..1，越高樹越密（西側是茂密的森林）
export function forestDensity(x, z) {
  const n = smoothstep(-0.15, 0.35, fbm(x * 0.007, z * 0.007, 3, 21));
  return n * lerp(0.6, 1, smoothstep(50, -50, x));
}

export function getTerrainHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = 7 + fbm(x * 0.005, z * 0.005, 5, 1) * 26;

  // 外圍山脈
  const edge = smoothstep(250, 380, d);
  h += edge * (45 + fbm(x * 0.012, z * 0.012, 4, 7) * 25);

  // 村子整平
  const v = 1 - smoothstep(VILLAGE_RADIUS - 25, VILLAGE_RADIUS + 25, d);
  h = lerp(h, VILLAGE_HEIGHT, v);

  // 村子北方的首領岩懸崖
  const cliff = smoothstep(-122, -138, z) * (1 - smoothstep(70, 100, Math.abs(x)));
  h = Math.max(h, VILLAGE_HEIGHT + cliff * (42 + fbm(x * 0.08, z * 0.08, 3, 3) * 3));

  // 河道
  const r = 1 - smoothstep(8, 28, Math.abs(x - riverX(z)));
  h = lerp(h, -4.5, r);
  return h;
}

export function isRoad(x, z) {
  const d = Math.hypot(x, z);
  if (d < 18) return true; // 中央廣場
  if (d < VILLAGE_RADIUS && (Math.abs(x) < ROAD_HALF_WIDTH || Math.abs(z) < ROAD_HALF_WIDTH)) return true;
  if (z > 0 && z < 260 && Math.abs(x) < ROAD_HALF_WIDTH - 0.5) return true; // 大門外的道路
  return false;
}

// 回傳區域代號，顯示名稱在 data/theme.js 的 areas
export function getAreaKey(x, z) {
  if (z < -118 && Math.abs(x) < 105) return 'rock';
  const d = Math.hypot(x, z);
  if (d < VILLAGE_RADIUS + 5) return 'village';
  if (Math.abs(x - riverX(z)) < 30) return 'river';
  if (d > 290) return 'mountains';
  if (forestDensity(x, z) > 0.65) return 'forest';
  return 'outskirts';
}

const C = {
  sand: new THREE.Color(0xd9c38c),
  bed: new THREE.Color(0x8c7a5a),
  grass1: new THREE.Color(0x76b84c),
  grass2: new THREE.Color(0x4e8c38),
  forest: new THREE.Color(0x3c6e2e),
  dirt: new THREE.Color(0xc29a68),
  rock: new THREE.Color(0x8a7f72),
  snow: new THREE.Color(0xf2f4f8),
};

export function terrainColor(x, z, h, slope, out) {
  if (h < 0.8) {
    return out.copy(C.sand).lerp(C.bed, clamp(-h / 4, 0, 1));
  }
  if (isRoad(x, z)) return out.copy(C.dirt);
  const n = valueNoise(x * 0.08, z * 0.08, 9);
  out.copy(C.grass1).lerp(C.grass2, n);
  out.lerp(C.forest, forestDensity(x, z) * 0.7);
  out.lerp(C.rock, Math.max(smoothstep(0.3, 0.55, slope), smoothstep(30, 45, h)));
  out.lerp(C.snow, smoothstep(62, 75, h));
  return out;
}

export function createTerrain() {
  const seg = 256;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    terrainColor(pos.getX(i), pos.getZ(i), pos.getY(i), 1 - nor.getY(i), c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.receiveShadow = true;
  return mesh;
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
