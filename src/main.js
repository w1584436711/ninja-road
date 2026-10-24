import * as THREE from 'three';
import { Input } from './core/input.js';
import { CollisionWorld } from './world/colliders.js';
import { createTerrain } from './world/terrain.js';
import { createWater } from './world/water.js';
import { Grass } from './world/grass.js';
import { sharedTime } from './render/wind.js';
import { Sky, HORIZON_COLOR } from './world/sky.js';
import { createVillage } from './world/village.js';
import { createNature } from './world/nature.js';
import { Effects } from './fx/effects.js';
import { Player } from './player/player.js';
import { ThirdPersonCamera } from './player/camera.js';
import { Villagers } from './npc/villagers.js';
import { Minimap } from './ui/minimap.js';
import { HUD } from './ui/hud.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { loadQuality, saveQuality, QUALITY_PRESETS } from './core/quality.js';
import { toonify } from './render/toon.js';
import { PostFX } from './render/postfx.js';
import { loadLocalTheme, applyThemeText } from './data/theme.js';
import { Combat } from './combat/combat.js';
import { FloatText } from './ui/floatText.js';
import { Progression } from './progress/progression.js';
import { RAMEN_PRICE } from './progress/items.js';
import { Menu } from './ui/menu.js';
import { STALLS } from './world/village.js';
import { getTerrainHeight } from './world/terrain.js';
import { THEME } from './data/theme.js';

// 世界觀設定要在建立任何物件前載入（本機可用 theme.local.js 覆蓋）
await loadLocalTheme();
applyThemeText();

const touch = isTouchDevice();
document.body.classList.toggle('touch', touch);
const quality = loadQuality(touch);

const canvas = document.getElementById('game');
// 抗鋸齒交給離屏緩衝的 MSAA，畫面本身不需要
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON_COLOR, quality.fogFar * 0.25, quality.fogFar);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 1000);

// ---------- 世界 ----------
const world = new CollisionWorld();
scene.add(createTerrain());
const sky = new Sky(scene, quality, sharedTime);
scene.add(createWater(sky.sunDir, sky.waterTint));
if (quality.shadows) sky.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
const village = createVillage(world);
scene.add(village.group);
scene.add(createNature(world));

const effects = new Effects(scene);
const player = new Player(scene, world, effects, { x: 0, z: 40 });
const villagers = new Villagers(scene, world);
const camCtl = new ThirdPersonCamera(camera);
camCtl.world = world; // 鏡頭避開樹幹
const input = new Input(canvas);

// ---------- 成長與存檔 ----------
const progress = new Progression(player);
if (progress.pos) {
  const [x, z] = progress.pos;
  player.pos.set(x, Math.max(getTerrainHeight(x, z), 0), z);
}
if (progress.hour !== null) sky.hour = progress.hour;

const hud = new HUD(new Minimap(document.getElementById('minimap'), village.houses), progress);
player.onNotice = msg => hud.toast(msg);
const touchControls = touch ? new TouchControls(input) : null;

// 動畫風：全部轉賽璐璐材質，再由後製描邊
toonify(scene);
sky.refreshCloudMaterial();
sky.collectGlow(scene);
const post = new PostFX(renderer, scene, camera, quality);

// 點右上角時鐘：快轉一小時（方便看晚上、測試）
document.getElementById('clock').addEventListener('pointerdown', e => {
  e.stopPropagation();
  sky.advanceHours(1);
});
const grass = new Grass(scene, world, quality); // 草在 toonify 之後建立，本身已是賽璐璐材質

// ---------- 戰鬥 ----------
const floatText = new FloatText(camera);
const combat = new Combat({ scene, world, effects, player, camCtl, floatText, hud, progress });

progress.onLevelUp = (level, newRank, canPickNature) => {
  hud.levelUp(level, newRank, canPickNature);
  hud.refreshJutsu();
  const at = new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z);
  effects.ring(at, 0xffe08a, 4, 0.8);
  effects.ring(at, 0xffffff, 2.5, 0.6);
  for (let i = 0; i < 20; i++) effects.spark(new THREE.Vector3(player.pos.x + (Math.random() - 0.5) * 1.6, player.pos.y + Math.random() * 0.5, player.pos.z + (Math.random() - 0.5) * 1.6), 0xffe08a);
};

// ---------- 選單、商店、拉麵攤 ----------
const menu = new Menu(progress, player, hud);
function openMenu(kind = 'menu') {
  if (!playing || menu.isOpen) return;
  if (kind === 'shop') menu.openShop();
  else menu.open();
  if (!touch) document.exitPointerLock?.();
}
menu.onClose = () => {
  hud.refreshJutsu();
  if (!touch && playing) {
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* 忽略 */ }
  }
};
for (const id of ['menuBtn', 'menuBtn2']) {
  document.getElementById(id).addEventListener('pointerdown', e => {
    e.stopPropagation();
    openMenu();
  });
}

const interactEl = document.getElementById('interact');
const interactBtn = document.getElementById('tbInteract');
let nearStall = null;
function updateInteract() {
  nearStall = STALLS.find(s => Math.hypot(player.pos.x - s.x, player.pos.z - (s.z + 3.2)) < 3.2) ?? null;
  const label = !nearStall ? '' : nearStall.key === 'shop'
    ? `${touch ? '點「店」' : '按 G'} 打開${THEME.signs.toolshop}店`
    : `${touch ? '點「麵」' : '按 G'} 吃拉麵（${RAMEN_PRICE} 兩，HP・查克拉全滿）`;
  interactEl.classList.toggle('hidden', !nearStall);
  if (interactEl.textContent !== label) interactEl.textContent = label;
  interactBtn.hidden = !nearStall;
  if (nearStall) interactBtn.textContent = nearStall.key === 'shop' ? '店' : '麵';
}
function interact() {
  if (!nearStall) return;
  if (nearStall.key === 'shop') {
    openMenu('shop');
  } else if (progress.pay(RAMEN_PRICE)) {
    player.hp = player.maxHp;
    player.chakra = player.maxChakra;
    hud.toast('好吃！HP、查克拉全滿');
  } else {
    hud.toast('錢不夠');
  }
}
let saveTimer = 15;

// ---------- 畫質選擇 ----------
const qualityRow = document.getElementById('quality');
for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
  const b = document.createElement('button');
  b.id = `quality-${key}`;
  b.textContent = preset.label;
  b.classList.toggle('on', key === quality.key);
  b.addEventListener('click', () => {
    if (key === quality.key) return;
    saveQuality(key);
    location.reload();
  });
  qualityRow.append(b);
}

// ---------- 開始 / 暫停 ----------
const overlay = document.getElementById('overlay');
const hudEl = document.getElementById('hud');
const touchEl = document.getElementById('touch');
const startBtn = document.getElementById('startBtn');
let playing = false;

function pause() {
  playing = false;
  touchControls?.reset();
  startBtn.textContent = '繼續遊戲';
  overlay.classList.remove('hidden');
  touchEl.classList.add('hidden');
}

startBtn.addEventListener('click', () => {
  playing = true;
  overlay.classList.add('hidden');
  hudEl.classList.remove('hidden');
  if (touch) {
    touchEl.classList.remove('hidden');
    // 盡量全螢幕＋橫向；不支援的瀏覽器（例如 iPhone Safari）會直接略過
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else {
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* 沙盒環境可能不允許 */ }
  }
});
document.getElementById('pauseBtn').addEventListener('click', pause);
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && playing && !touch && !menu.isOpen) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) pause();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize();
});

// ---------- 主迴圈 ----------
const clock = new THREE.Clock();
function frame() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  const active = playing && !menu.isOpen; // 選單開著時遊戲暫停
  const dt = active ? combat.timeScale(realDt) : playing ? 0 : realDt; // 命中停頓時放慢
  sharedTime.value += dt;
  if (active) {
    if (input.pressed('KeyT')) sky.advanceHours(1);
    if (input.pressed('Tab')) openMenu();
    if (input.pressed('KeyG')) interact();
    if (input.pressed('Digit5')) hud.toast(progress.useItem('potion'));
    if (input.pressed('Digit6')) hud.toast(progress.useItem('pill'));
    camCtl.handleInput(input);
    combat.preUpdate(dt, input);
    player.update(dt, input, camCtl.yaw);
    combat.update(dt);
    updateInteract();
    if ((saveTimer -= realDt) <= 0) {
      progress.save(sky.hour);
      saveTimer = 15;
    }
  } else if (!playing) {
    camCtl.yaw += dt * 0.08; // 開始畫面時鏡頭緩慢環繞
  }
  villagers.update(dt);
  effects.update(dt);
  floatText.update(active ? realDt : 0);
  grass.update(player.pos);
  camCtl.update(realDt, player.pos);
  sky.update(dt, player.pos, camera.position);
  if (playing) hud.update(realDt, player, sky, combat);
  input.endFrame();
  post.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.game = { scene, player, camCtl, world, renderer, input, hud, post, quality, grass, sharedTime, sky, combat, floatText, effects, progress, menu, ui: { updateInteract, interact, openMenu } };

// 關閉或切到背景前存檔
addEventListener('pagehide', () => progress.save(sky.hour));
