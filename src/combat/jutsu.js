import * as THREE from 'three';
import { getTerrainHeight } from '../world/terrain.js';
import { THEME } from '../data/theme.js';

// 忍術一覽。seals 是印的順序（0 寅、1 巳、2 未、3 辰）。
// 整組序列不能有「某招是另一招的開頭」，否則較長的那招永遠按不出來。
// type：projectile 飛行道具／multi 多發／cone 前方扇形／burst 自身周圍／strike 指定地點／clone 分身
export const JUTSU = [
  { key: 'clone', nature: null, level: 1, jp: 0, seals: [2, 1, 0], cost: 30, type: 'clone',
    desc: '召喚兩個分身協同作戰 15 秒，被打一下就消失' },

  { key: 'fireball', nature: 'fire', level: 3, jp: 1, seals: [1, 0], cost: 25, type: 'projectile', visual: 'fire',
    speed: 22, dmg: 30, kb: 6, aoe: { r: 4, dmg: 18 }, desc: '火球命中後爆炸，造成範圍傷害' },
  { key: 'firedragon', nature: 'fire', level: 8, jp: 2, seals: [1, 2, 1], cost: 45, type: 'multi', visual: 'fire',
    count: 5, spread: 0.6, speed: 24, dmg: 20, kb: 5, aoe: { r: 3, dmg: 12 }, desc: '扇形連發五顆火球' },

  { key: 'wind', nature: 'wind', level: 3, jp: 1, seals: [3, 2], cost: 20, type: 'cone', visual: 'wind',
    range: 8, angle: 0.65, dmg: 22, kb: 12, desc: '前方扇形風刃，擊退所有敵人' },
  { key: 'whirlwind', nature: 'wind', level: 8, jp: 2, seals: [3, 1, 3], cost: 40, type: 'burst', visual: 'wind',
    radius: 7, dmg: 34, kb: 16, desc: '以自己為中心捲起旋風，把周圍敵人全部吹飛' },

  { key: 'thunder', nature: 'lightning', level: 3, jp: 1, seals: [0, 3], cost: 22, type: 'projectile', visual: 'thunder',
    speed: 55, dmg: 34, kb: 3, pierce: true, desc: '高速雷槍，貫穿直線上所有敵人' },
  { key: 'lightning', nature: 'lightning', level: 8, jp: 2, seals: [0, 1, 2], cost: 45, type: 'strike', visual: 'thunder',
    radius: 4.5, dmg: 55, kb: 4, delay: 0.35, desc: '對目標地點降下落雷，範圍傷害極高' },

  { key: 'waterbullet', nature: 'water', level: 3, jp: 1, seals: [2, 3], cost: 18, type: 'projectile', visual: 'water',
    speed: 30, dmg: 24, kb: 10, aoe: { r: 2.5, dmg: 10 }, desc: '水彈把敵人沖退，耗費低' },
  { key: 'torrent', nature: 'water', level: 8, jp: 2, seals: [2, 0, 2], cost: 40, type: 'cone', visual: 'water',
    range: 11, angle: 0.8, dmg: 32, kb: 18, desc: '大範圍激流沖走前方敵人' },

  { key: 'rockspike', nature: 'earth', level: 3, jp: 1, seals: [3, 0], cost: 24, type: 'strike', visual: 'earth',
    radius: 2.6, dmg: 32, kb: 6, delay: 0.3, desc: '從目標腳下刺出岩槍' },
  { key: 'rockslam', nature: 'earth', level: 8, jp: 2, seals: [0, 2, 0], cost: 45, type: 'burst', visual: 'earth',
    radius: 6.5, dmg: 42, kb: 5, stun: 1.6, desc: '震碎地面，讓周圍敵人暈眩' },
];

export const NATURE_COLORS = { fire: '#ff8a3a', wind: '#7fe0c0', lightning: '#ffe066', water: '#5ab8ff', earth: '#c49a6a' };
export const NATURE_DESC = {
  fire: '高傷害的範圍爆炸',
  wind: '擊退與控場',
  lightning: '速度快、可貫穿',
  water: '耗費低、擊退強',
  earth: '指定地點攻擊與暈眩',
};

export const jutsuName = def => THEME.jutsu[def.key] ?? def.key;
export const sealText = def => def.seals.map(s => THEME.seals[s]).join(' → ');

const UP = new THREE.Vector3(0, 1, 0);

// 由 PlayerCombat 呼叫；mul 是能力值與熟練度帶來的傷害倍率
export function performJutsu(pc, def, mul) {
  const c = pc.c, p = pc.p;
  const tgt = pc.softTarget(def.type === 'strike' ? 26 : 22, 0.7);
  const face = tgt ? pc.angleTo(tgt) : p.facing;
  const dmg = v => Math.round(v * mul);
  const cast = (onHit, dur = 0.4, hitAt = 0.5) => pc.start('cast', dur, { hitAt, face, onHit });

  switch (def.type) {
    case 'clone':
      cast(() => c.spawnClones(), 0.35);
      break;

    case 'projectile':
    case 'multi':
      cast(() => {
        const n = def.count ?? 1;
        for (let i = 0; i < n; i++) {
          c.schedule(i * 0.08, () => {
            const dir = tgt ? pc.aimAt(tgt) : pc.forward(face).clone();
            if (n > 1) dir.applyAxisAngle(UP, (i / (n - 1) - 0.5) * def.spread);
            const f = pc.forward(face);
            const pos = new THREE.Vector3(p.pos.x + f.x * 1.1, p.pos.y + 1.3, p.pos.z + f.z * 1.1);
            c.projectiles.spawn({
              kind: def.visual, owner: 'player', pos, dir, speed: def.speed,
              damage: dmg(def.dmg), kb: def.kb, pierce: def.pierce,
              radius: def.visual === 'thunder' ? 0.5 : 0.7, life: def.visual === 'thunder' ? 0.8 : 2.5,
              aoe: def.aoe && { r: def.aoe.r, dmg: dmg(def.aoe.dmg) },
            });
          });
        }
      });
      break;

    case 'cone':
      cast(() => {
        for (const e of c.enemies.list) {
          if (!e.alive) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          let diff = Math.abs(pc.angleTo(e) - face) % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (d < def.range && diff < def.angle) c.hitEnemy(e, dmg(def.dmg), p.pos, def.kb);
        }
        const f = pc.forward(face).clone();
        for (let k = 0; k < 3; k++) {
          c.schedule(k * 0.06, () => c.projectiles.spawn({
            kind: def.visual === 'water' ? 'wave' : 'wind', owner: 'none',
            pos: new THREE.Vector3(p.pos.x, p.pos.y + 0.8 + k * 0.25, p.pos.z), dir: f, speed: def.range * 2.4, life: 0.42,
          }));
        }
        c.camCtl.shake = 0.2;
      }, 0.35, 0.45);
      break;

    case 'burst':
      cast(() => {
        for (const e of c.enemies.list) {
          if (e.alive && e.pos.distanceTo(p.pos) < def.radius + e.def.radius) {
            c.hitEnemy(e, dmg(def.dmg), p.pos, def.kb, { stun: def.stun });
          }
        }
        c.burstFx(p.pos, def.radius, def.visual);
      }, 0.45, 0.55);
      break;

    case 'strike': {
      const point = tgt
        ? tgt.pos.clone()
        : p.pos.clone().add(pc.forward(face).clone().multiplyScalar(8));
      point.y = getTerrainHeight(point.x, point.z);
      cast(() => {
        c.strikeFx(point, def.visual, 'warn', def.radius);
        c.schedule(def.delay, () => {
          for (const e of c.enemies.list) {
            if (e.alive && Math.hypot(e.pos.x - point.x, e.pos.z - point.z) < def.radius + e.def.radius) {
              c.hitEnemy(e, dmg(def.dmg), point, def.kb);
            }
          }
          c.strikeFx(point, def.visual, 'hit', def.radius);
        });
      });
      break;
    }
  }
}
