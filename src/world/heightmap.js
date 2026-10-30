// 地形高度與區域的純函式（不依賴 three.js，Node 也能直接執行，方便預覽地圖）。
// 座標：-Z 是北方。世界 1600×1600 公尺，村子在正中央。
//
// 地圖配置：
//   中央：風鈴之里，外圍一圈山脈（250～500 公尺），留有三個山口通往外面
//   北：白鷺川往上游穿過山脈形成峽谷，盡頭是瀑布，瀑布上方是高原
//   南：大門外的道路穿過南方山口，一路通到海岸
//   西：幽冥森林延伸成更茂密的古樹之森
//   東：山口外是起伏的原野
import { fbm, valueNoise, smoothstep, lerp, clamp } from '../core/math.js';

export const WORLD_SIZE = 1600;
export const HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = 0;
export const VILLAGE_RADIUS = 105;
export const VILLAGE_HEIGHT = 3;
const ROAD_HALF_WIDTH = 3.5;

export const FALLS_Z = -590; // 瀑布所在的位置（峽谷的盡頭）
export const PLATEAU_HEIGHT = 46; // 瀑布上方高原的高度
const CANYON_START_Z = -230; // 從這裡往北，河道兩側變成峽谷
const CANYON_HALF = 34; // 峽谷谷底半寬
export const SPRING_Z = -760; // 高原溪流的源頭
export const ROAD_END_Z = 660; // 南方道路的盡頭（海岸）
const SEA_Z = 700; // 從這裡往南是海

// 河道中心線（白鷺川）
export function riverX(z) {
  return 175 + Math.sin(z * 0.011) * 35 + Math.sin(z * 0.029 + 1.3) * 12;
}

export const FALLS_X = riverX(FALLS_Z);
// 瀑布潭的中心（瀑布正下方偏南）
export const POOL = { x: riverX(FALLS_Z + 20), z: FALLS_Z + 20, r: 24 };

// 0..1，越高樹越密（西側是茂密的森林，再往西是古樹之森）
export function forestDensity(x, z) {
  const n = smoothstep(-0.15, 0.35, fbm(x * 0.007, z * 0.007, 3, 21));
  const west = smoothstep(-430, -520, x);
  return Math.max(n * lerp(0.6, 1, smoothstep(50, -50, x)), west * (0.75 + 0.25 * n));
}

// 中央盆地外圍的山脈強度（0..1）；山口處變低
function ringStrength(x, z) {
  const d = Math.hypot(x, z);
  let ring = smoothstep(250, 380, d) * (1 - smoothstep(430, 520, d));
  // 南方山口（道路）、西方山口、東方山口
  const south = (1 - smoothstep(22, 60, Math.abs(x))) * smoothstep(200, 260, z);
  const west = (1 - smoothstep(28, 70, Math.abs(z - 20))) * smoothstep(-200, -260, x);
  const east = (1 - smoothstep(28, 70, Math.abs(z - 110))) * smoothstep(240, 300, x);
  ring *= 1 - Math.max(south, west, east) * 0.85;
  return ring;
}

// 峽谷：河道兩側的平坦谷底（0..1），只在峽谷區段有效
function canyonMask(x, z) {
  const along = smoothstep(CANYON_START_Z, CANYON_START_Z - 60, z) * smoothstep(FALLS_Z - 1, FALLS_Z + 5, z);
  return along * (1 - smoothstep(CANYON_HALF, CANYON_HALF + 12, Math.abs(x - riverX(z))));
}

export function getTerrainHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = 7 + fbm(x * 0.005, z * 0.005, 5, 1) * 26;

  // 外圍山脈
  h += ringStrength(x, z) * (45 + fbm(x * 0.012, z * 0.012, 4, 7) * 25);

  // 北方高原（瀑布上方）
  const plateau = smoothstep(-470, -550, z);
  if (plateau > 0) h = lerp(h, Math.max(h, PLATEAU_HEIGHT + fbm(x * 0.01, z * 0.01, 3, 5) * 7), plateau);

  // 陸地最低 3 公尺（低窪處是平地，不會積水）；水只出現在下面特意挖出來的河、潭、海
  h = Math.max(h, VILLAGE_HEIGHT);

  // 南方海岸
  h = lerp(h, -7, smoothstep(SEA_Z - 90, SEA_Z + 20, z) * (0.6 + 0.4 * smoothstep(SEA_Z - 60, SEA_Z, z)));

  // 世界邊緣的山（南邊是海，不加）
  const edge = Math.max(smoothstep(660, 780, Math.abs(x)), smoothstep(660, 780, -z));
  h += edge * (70 + fbm(x * 0.01, z * 0.01, 3, 9) * 20);

  // 村子整平
  const v = 1 - smoothstep(VILLAGE_RADIUS - 25, VILLAGE_RADIUS + 25, d);
  h = lerp(h, VILLAGE_HEIGHT, v);

  // 村子北方的首領岩懸崖
  const cliff = smoothstep(-122, -138, z) * (1 - smoothstep(70, 100, Math.abs(x))) * (1 - smoothstep(-200, -240, z));
  if (cliff > 0) h = Math.max(h, VILLAGE_HEIGHT + cliff * (42 + fbm(x * 0.08, z * 0.08, 3, 3) * 3));

  // 南方道路兩旁整平
  if (z > VILLAGE_RADIUS && z < ROAD_END_Z + 20) {
    const road = 1 - smoothstep(6, 26, Math.abs(x));
    h = lerp(h, Math.min(h, 5 + fbm(x * 0.004, z * 0.004, 3, 2) * 4), road * smoothstep(VILLAGE_RADIUS, VILLAGE_RADIUS + 40, z));
  }

  const rx = Math.abs(x - riverX(z));
  // 峽谷谷底（河道兩側的乾地，可以走）
  const cm = canyonMask(x, z);
  if (cm > 0) h = lerp(h, Math.min(h, 2.2 + valueNoise(x * 0.1, z * 0.1, 4) * 0.8), cm);

  if (z > FALLS_Z) {
    // 河道：峽谷裡河面窄一點，留出兩岸
    const inCanyon = smoothstep(CANYON_START_Z, CANYON_START_Z - 60, z);
    const r = 1 - smoothstep(lerp(8, 6, inCanyon), lerp(28, 15, inCanyon), rx);
    h = lerp(h, -4.5, r);
    // 瀑布潭
    const pd = Math.hypot(x - POOL.x, z - POOL.z);
    h = lerp(h, -6, 1 - smoothstep(POOL.r * 0.5, POOL.r, pd));
  } else if (z > SPRING_Z) {
    // 高原上的淺溪（裝飾用的流水，水深只到腳踝）
    h -= (1 - smoothstep(2.5, 6, rx)) * 0.45;
  }
  return h;
}

// 高原淺溪：回傳該點是否在溪水裡（腳步聲用）
export function inStream(x, z) {
  return z < FALLS_Z && z > SPRING_Z && Math.abs(x - riverX(z)) < 3;
}

export function isRoad(x, z) {
  const d = Math.hypot(x, z);
  if (d < 18) return true; // 中央廣場
  if (d < VILLAGE_RADIUS && (Math.abs(x) < ROAD_HALF_WIDTH || Math.abs(z) < ROAD_HALF_WIDTH)) return true;
  if (z > 0 && z < ROAD_END_Z && Math.abs(x) < ROAD_HALF_WIDTH - 0.5) return true; // 大門外往南的道路
  return false;
}

// 道路附近（放樹、石頭時避開）
export function nearRoad(x, z, margin) {
  return z > 0 && z < ROAD_END_Z && Math.abs(x) < margin;
}

// 回傳區域代號，顯示名稱在 data/theme.js 的 areas
export function getAreaKey(x, z) {
  if (z < -118 && z > -230 && Math.abs(x) < 105) return 'rock';
  const d = Math.hypot(x, z);
  if (d < VILLAGE_RADIUS + 5) return 'village';
  if (Math.hypot(x - FALLS_X, z - FALLS_Z) < 75) return 'falls';
  if (z < -500) return 'highlands';
  const rx = Math.abs(x - riverX(z));
  if (z < CANYON_START_Z - 30 && rx < CANYON_HALF + 14) return 'canyon';
  if (z > 520) return 'coast';
  if (x < -450) return 'westwood';
  if (x > 450) return 'eastplain';
  if (rx < 30) return 'river';
  if (ringStrength(x, z) > 0.5) return 'mountains';
  if (forestDensity(x, z) > 0.65) return 'forest';
  return 'outskirts';
}

// 預先算好整個世界的高度格點，地形網格、水深圖、小地圖共用，不用重算
export const GRID_CELL = 3.125;
export const GRID_N = WORLD_SIZE / GRID_CELL + 1; // 513
let grid = null;
export function heightGrid() {
  if (grid) return grid;
  grid = new Float32Array(GRID_N * GRID_N);
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) grid[j * GRID_N + i] = getTerrainHeight(-HALF + i * GRID_CELL, -HALF + j * GRID_CELL);
  }
  return grid;
}

export const clampToWorld = v => clamp(v, -HALF + 8, HALF - 8);
