import * as THREE from 'three';
import { Input } from './core/input.js';
import { CollisionWorld } from './world/colliders.js';
import { Terrain } from './world/terrain.js';
import { createWater } from './world/water.js';
import { Grass } from './world/grass.js';
import { sharedTime } from './render/wind.js';
import { Sky, HORIZON_COLOR } from './world/sky.js';
import { createVillage } from './world/village.js';
import { Nature } from './world/nature.js';
import { Falls } from './world/falls.js';
import { Waystations, waystationName } from './world/waystations.js';
import { Effects } from './fx/effects.js';
import { Player } from './player/player.js';
import { ThirdPersonCamera } from './player/camera.js';
import { Villagers } from './npc/villagers.js';
import { StreetLife } from './npc/streetLife.js';
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
import { STALLS, QUEST_BOARD } from './world/village.js';
import { smoothstep } from './core/math.js';
import { getTerrainHeight, getAreaKey, riverX, FALLS_X, FALLS_Z, SPRING_Z, ROAD_END_Z } from './world/terrain.js';
import { QuestLog } from './quests/quests.js';
import { TownNpcs, TIPS, leaderScript, travelerScript } from './npc/townNpcs.js';
import { Dialogue } from './ui/dialogue.js';
import { WorldMap } from './ui/worldmap.js';
import { Streets } from './world/streets.js';
import { Sfx } from './audio/sfx.js';
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
const terrain = new Terrain(scene); // 分區塊、遠近不同精細度
const sky = new Sky(scene, quality, sharedTime);
scene.add(createWater(sky.sunDir, sky.waterTint));
if (quality.shadows) sky.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
const village = createVillage(world);
scene.add(village.group);
const streets = new Streets(scene, world); // 石板路、廣場、路邊雜物、燈籠串、櫻花
const nature = new Nature(world);
scene.add(nature.group);
const falls = new Falls(scene, sky); // 霧鳴瀑布與高原的溪
const waystations = new Waystations(scene, world); // 驛站（傳送點）

const effects = new Effects(scene);
const player = new Player(scene, world, effects, { x: 0, z: 40 });
const villagers = new Villagers(scene, world, { low: 10, medium: 16, high: 24 }[quality.key], village.houses);
const camCtl = new ThirdPersonCamera(camera);
camCtl.world = world; // 鏡頭避開樹幹
const input = new Input(canvas);

// ---------- 成長與存檔 ----------
const progress = new Progression(player);
progress.flags.waystations ??= ['village']; // 村子的驛站一開始就能用
if (progress.pos) {
  const [x, z] = progress.pos;
  player.pos.set(x, Math.max(getTerrainHeight(x, z), 0), z);
}
if (progress.hour !== null) sky.hour = progress.hour;

const minimap = new Minimap(document.getElementById('minimap'), village.houses);
const hud = new HUD(minimap, progress);
player.onNotice = msg => hud.toast(msg);

// ---------- 音效 ----------
const sfx = new Sfx();
player.onStep = (surface, speed) => sfx.step(surface, speed);
player.onLand = (surface, impact) => sfx.land(surface, impact);
const soundBtn = document.getElementById('soundBtn');
const showSound = () => { soundBtn.textContent = sfx.enabled ? '開' : '關'; soundBtn.classList.toggle('on', sfx.enabled); };
soundBtn.addEventListener('click', () => {
  sfx.toggle();
  sfx.unlock();
  showSound();
});
showSound();
const touchControls = touch ? new TouchControls(input) : null;

// 動畫風：全部轉賽璐璐材質，再由後製描邊
toonify(scene);
sky.refreshCloudMaterial();
const streetLife = new StreetLife(scene, world, village.houses, sfx); // 貓狗、麻雀、晾衣服
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
combat.sfx = sfx;

progress.onLevelUp = (level, newRank, canPickNature) => {
  hud.levelUp(level, newRank, canPickNature);
  sfx.play('levelUp');
  hud.refreshJutsu();
  const at = new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z);
  effects.ring(at, 0xffe08a, 4, 0.8);
  effects.ring(at, 0xffffff, 2.5, 0.6);
  for (let i = 0; i < 20; i++) effects.spark(new THREE.Vector3(player.pos.x + (Math.random() - 0.5) * 1.6, player.pos.y + Math.random() * 0.5, player.pos.z + (Math.random() - 0.5) * 1.6), 0xffe08a);
};

// ---------- 任務 ----------
const quests = new QuestLog(progress);
quests.onNotice = msg => hud.toast(msg);
combat.quests = quests;
hud.quests = quests;
const townNpcs = new TownNpcs(scene);

// ---------- 選單、對話（開啟時遊戲暫停、放開滑鼠） ----------
const menu = new Menu(progress, player, hud);
menu.quests = quests;
menu.sfx = sfx;
const dialogue = new Dialogue();
const worldMap = new WorldMap(minimap.base);
const uiOpen = () => menu.isOpen || dialogue.isOpen || worldMap.isOpen;

function openUi(show) {
  if (!playing || uiOpen()) return;
  show();
  if (!touch) document.exitPointerLock?.();
}
function onUiClosed() {
  input.endFrame(); // 關閉用的按鍵不要再觸發遊戲動作
  hud.refreshJutsu();
  if (!touch && playing && !uiOpen()) {
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* 忽略 */ }
  }
}
menu.onClose = onUiClosed;
dialogue.onClose = onUiClosed;
worldMap.onClose = onUiClosed;
const openMenu = () => openUi(() => menu.open());
const openMap = () => openUi(() => worldMap.open(player, combat.enemies.list, waystations.list, progress.flags.waystations));
document.getElementById('minimap').addEventListener('pointerdown', e => {
  e.stopPropagation();
  openMap();
});

for (const id of ['menuBtn', 'menuBtn2']) {
  document.getElementById(id).addEventListener('pointerdown', e => {
    e.stopPropagation();
    openMenu();
  });
}

function talk(npcKey) {
  if (npcKey === 'leader') {
    const s = leaderScript(quests, progress);
    const options = s.offer ? [
      { label: '交給我吧！', fn: () => quests.accept(s.offer) },
      { label: '我再準備一下', fn: () => {} },
    ] : [];
    openUi(() => dialogue.open(THEME.npcs.leader, s.pages, options));
    if (s.turnIn) quests.turnIn(s.turnIn);
  } else if (npcKey === 'traveler') {
    const s = travelerScript(quests);
    openUi(() => dialogue.open(THEME.npcs.traveler, s.pages));
    if (s.talk) quests.event({ type: 'talk', npc: s.talk });
  }
  progress.save();
}

// 有新消息的 NPC 頭上會出現「！」
function hasNews(key) {
  if (key === 'leader') {
    const st = quests.status('crow');
    return !progress.flags.metLeader || st === 'available' || st === 'complete';
  }
  if (key === 'traveler') return quests.isActive('delivery') && !quests.isComplete('delivery');
  return false;
}

// ---------- 互動：攤位、任務板、NPC、村民 ----------
const interactEl = document.getElementById('interact');
const interactBtn = document.getElementById('tbInteract');
let near = null;
function interactables() {
  const list = [
    ...STALLS.map(s => ({
      x: s.x, z: s.z + 3.2, r: 3.2, btn: s.key === 'shop' ? '店' : '麵',
      label: s.key === 'shop' ? `打開${THEME.signs.toolshop}店` : `吃拉麵（${RAMEN_PRICE} 兩，HP・查克拉全滿）`,
      act: () => (s.key === 'shop' ? openUi(() => menu.openShop()) : eatRamen()),
    })),
    { x: QUEST_BOARD.x, z: QUEST_BOARD.z + 1.8, r: 2.8, btn: '任', label: '查看任務板', act: () => openUi(() => menu.openBoard()) },
    ...waystations.list.filter(s => progress.flags.waystations.includes(s.key)).map(s => ({
      x: s.x, z: s.z, r: 3.2, btn: '驛', label: `使用${waystationName(s)}（傳送）`, act: () => travelMenu(s),
    })),
    ...townNpcs.list.map(n => ({ x: n.pos.x, z: n.pos.z, r: 2.6, btn: '談', label: `和${n.name}說話`, act: () => talk(n.key) })),
    ...villagers.list.filter(v => !v.inside).map(v => ({
      x: v.pos.x, z: v.pos.z, r: 2.2, btn: '談', label: `和${v.name}說話`,
      act: () => openUi(() => dialogue.open(v.name, [TIPS[Math.floor(Math.random() * TIPS.length)]])),
    })),
  ];
  return list;
}
function updateInteract() {
  near = null;
  let best = Infinity;
  for (const it of interactables()) {
    const d = Math.hypot(player.pos.x - it.x, player.pos.z - it.z);
    if (d < it.r && d < best) {
      near = it;
      best = d;
    }
  }
  const label = near ? `${touch ? `點「${near.btn}」` : '按 G'} ${near.label}` : '';
  interactEl.classList.toggle('hidden', !near);
  if (interactEl.textContent !== label) interactEl.textContent = label;
  interactBtn.hidden = !near;
  if (near) interactBtn.textContent = near.btn;
}
function interact() {
  near?.act();
}
// ---------- 驛站傳送 ----------
function travelMenu(from) {
  const found = progress.flags.waystations;
  const dests = waystations.list.filter(s => s !== from && found.includes(s.key));
  if (!dests.length) {
    openUi(() => dialogue.open(waystationName(from), ['還沒有發現其他驛站。到各地走走，碰到驛站的水晶就能登記。']));
    return;
  }
  const options = dests.map(d => ({ label: waystationName(d), fn: () => travelTo(d) }));
  options.push({ label: '不用了', fn: () => {} });
  openUi(() => dialogue.open(waystationName(from), ['要傳送到哪裡？'], options));
}

function travelTo(dest) {
  const smokeAt = p => effects.smoke(new THREE.Vector3(p.x, p.y + 1, p.z), 14, 0xf4f4f4, 0.5);
  smokeAt(player.pos);
  const x = dest.x + 2.4, z = dest.z + 2.4;
  player.pos.set(x, getTerrainHeight(x, z), z);
  player.vel.set(0, 0, 0);
  camCtl.snapped = false;
  smokeAt(player.pos);
  sfx.play('poof');
  hud.toast(`抵達${waystationName(dest)}`);
  progress.save(sky.hour);
}

// 走到尚未發現的驛站旁邊：登記起來
function checkWaystations() {
  const found = progress.flags.waystations;
  const s = waystations.newlyFound(player.pos, found);
  if (!s) return;
  found.push(s.key);
  sfx.play('cast');
  hud.toast(`發現「${waystationName(s)}」！之後在任何驛站都能傳送到這裡`);
  progress.save(sky.hour);
}

function eatRamen() {
  if (progress.pay(RAMEN_PRICE)) {
    player.hp = player.maxHp;
    player.chakra = player.maxChakra;
    hud.toast('好吃！HP、查克拉全滿');
  } else {
    hud.toast('錢不夠');
  }
}
let saveTimer = 15;
let lastArea = null;

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
  sfx.unlock(); // 瀏覽器規定要使用者操作後才能出聲
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
  if (document.pointerLockElement !== canvas && playing && !touch && !uiOpen()) pause();
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

// 環境音：依離瀑布、河、海的距離決定音量（0..1）
function ambienceAt(p) {
  const fade = (d, range) => Math.max(0, 1 - d / range) ** 2;
  const rx = Math.abs(p.x - riverX(p.z));
  const river = p.z > FALLS_Z ? fade(Math.max(0, rx - 10), 70) : p.z > SPRING_Z ? fade(rx, 30) * 0.6 : 0;
  const falls = fade(Math.hypot(p.x - FALLS_X, p.z - FALLS_Z - 6, Math.max(0, p.y - 40) * 0.5), 260);
  const area = getAreaKey(p.x, p.z);
  const inVillage = area === 'village';
  const day = smoothstep(-0.08, 0.12, sky.sunDir.y);
  const dry = 1 - sky.rain;
  // 越高風越大；村子裡被房子擋住
  const wind = Math.min(1, Math.max(0, (p.y - 20) / 35) + (area === 'highlands' ? 0.4 : 0) + (inVillage ? 0.05 : 0.15)) * (1 - falls * 0.6);
  return {
    falls, river,
    sea: fade(Math.max(0, ROAD_END_Z - 10 - p.z), 170),
    wind, rain: sky.rain,
    crickets: (1 - day) * dry * (area === 'coast' ? 0.3 : 1) * (1 - falls),
    birds: day * dry * (inVillage ? 0.5 : area === 'coast' || area === 'highlands' ? 0.4 : 1),
  };
}

// 背景音樂：戰鬥中（附近有敵人在追自己）→ 戰鬥曲；否則依地點與晝夜。
// 離開戰鬥後多等幾秒才換回來，免得一直切換
let battleHold = 0, bossFight = false;
function musicMood(dt) {
  const p = player.pos;
  let fighting = false, boss = false;
  for (const e of combat.enemies.list) {
    if (!e.alive || e.def.dummy || e.state === 'patrol' || e.state === 'return') continue;
    if (e.pos.distanceToSquared(p) > 45 * 45) continue;
    fighting = true;
    if (e.def.boss) boss = true;
  }
  if (fighting) {
    battleHold = 6;
    bossFight ||= boss;
  } else if ((battleHold -= dt) <= 0) bossFight = false;
  if (battleHold > 0 && !player.dead) return bossFight ? 'boss' : 'battle';
  if (sky.isNight) return 'night';
  return getAreaKey(p.x, p.z) === 'village' ? 'day' : 'wild';
}

// ---------- 主迴圈 ----------
const clock = new THREE.Clock();
function frame() {
  tick(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(frame);
}
// 一幀的更新與繪製（測試時也可以從 window.game.tick 手動推進）
function tick(realDt) {
  const active = playing && !uiOpen(); // 選單、對話開著時遊戲暫停
  const dt = active ? combat.timeScale(realDt) : playing ? 0 : realDt; // 命中停頓時放慢
  sharedTime.value += dt;
  if (active) {
    if (input.pressed('KeyT')) sky.advanceHours(1);
    if (input.pressed('Tab')) openMenu();
    if (input.pressed('KeyM')) openMap();
    if (input.pressed('KeyG')) interact();
    if (input.pressed('Digit5')) hud.toast(progress.useItem('potion'));
    if (input.pressed('Digit6')) hud.toast(progress.useItem('pill'));
    camCtl.handleInput(input);
    combat.preUpdate(dt, input);
    player.update(dt, input, camCtl.yaw);
    combat.update(dt);
    updateInteract();
    checkWaystations();
    const area = getAreaKey(player.pos.x, player.pos.z);
    if (area !== lastArea) {
      lastArea = area;
      quests.event({ type: 'visit', area });
    }
    if ((saveTimer -= realDt) <= 0) {
      progress.save(sky.hour);
      saveTimer = 15;
    }
  } else if (!playing) {
    camCtl.yaw += dt * 0.08; // 開始畫面時鏡頭緩慢環繞
  }
  villagers.update(dt, sky.hour);
  streetLife.update(dt, player, camera.position, sky.rain > 0.5 ? 0.9 : 0.45);
  townNpcs.update(dt, player, hasNews);
  streets.update(dt, sharedTime.value);
  // 太遠的角色不畫（在霧裡也看不清楚）
  const camPos = camera.position;
  for (const v of villagers.list) v.model.root.visible = !v.inside && v.pos.distanceToSquared(camPos) < 90 * 90;
  for (const e of combat.enemies.list) if (e.alive) e.root.visible = e.pos.distanceToSquared(camPos) < (e.def.boss ? 160 : 110) ** 2;
  // 忍者跑時視野稍微變廣，速度感更強
  const fov = 60 + (playing && player.sprinting ? 7 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * realDt));
    camera.updateProjectionMatrix();
  }
  effects.update(dt);
  floatText.update(active ? realDt : 0);
  grass.update(player.pos);
  camCtl.update(realDt, player.pos);
  sky.update(dt, player.pos, camera.position);
  terrain.update(camera.position, quality.fogFar);
  nature.update(camera.position, quality.fogFar);
  falls.update(dt, camera.position);
  waystations.update(dt, progress.flags.waystations);
  sfx.setAmbience(playing ? ambienceAt(player.pos) : {});
  sfx.update(realDt, playing ? musicMood(active ? dt : 0) : null);
  if (playing) hud.update(realDt, player, sky, combat);
  input.endFrame();
  post.render();
}
requestAnimationFrame(frame);

window.game = { tick, scene, terrain, nature, falls, waystations, player, camCtl, world, renderer, input, hud, post, quality, grass, sharedTime, sky, combat, floatText, effects, progress, menu, quests, dialogue, townNpcs, streets, village, villagers, streetLife, sfx, ui: { updateInteract, interact, openMenu, openMap, talk, checkWaystations, travelMenu, travelTo } };

// 關閉或切到背景前存檔
addEventListener('pagehide', () => progress.save(sky.hour));
