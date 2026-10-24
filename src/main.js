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
const hud = new HUD(new Minimap(document.getElementById('minimap'), village.houses));
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
const combat = new Combat({ scene, world, effects, player, camCtl, floatText, hud });

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
  if (document.pointerLockElement !== canvas && playing && !touch) pause();
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
  const dt = playing ? combat.timeScale(realDt) : realDt; // 命中停頓時放慢
  sharedTime.value += dt;
  if (playing) {
    if (input.pressed('KeyT')) sky.advanceHours(1);
    camCtl.handleInput(input);
    combat.preUpdate(dt, input);
    player.update(dt, input, camCtl.yaw);
    combat.update(dt);
  } else {
    camCtl.yaw += dt * 0.08; // 開始畫面時鏡頭緩慢環繞
  }
  villagers.update(dt);
  effects.update(dt);
  floatText.update(realDt);
  grass.update(player.pos);
  camCtl.update(realDt, player.pos);
  sky.update(dt, player.pos, camera.position);
  if (playing) hud.update(realDt, player, sky, combat);
  input.endFrame();
  post.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.game = { scene, player, camCtl, world, renderer, input, hud, post, quality, grass, sharedTime, sky, combat, floatText, effects };
