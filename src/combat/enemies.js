import * as THREE from 'three';
import { mulberry32, lerpAngle } from '../core/math.js';
import { createNameplate } from '../core/textures.js';
import { createCharacter, animateCharacter, advancePhase } from '../player/character.js';
import { createWolf, animateWolf } from './wolf.js';
import { toonify } from '../render/toon.js';
import { getTerrainHeight, VILLAGE_RADIUS } from '../world/terrain.js';
import { THEME } from '../data/theme.js';

// 敵人種類。windup = 出手前的預備時間（看到發紅就該閃）
export const ENEMY_TYPES = {
  wolf: {
    level: 2, hp: 45, radius: 0.6, height: 1.0, walk: 2.5, run: 9.5, sight: 16, range: 1.9,
    damage: 8, windup: 0.4, recover: 1.0, exp: 12, gold: [2, 5], model: 'wolf', pack: true,
  },
  bandit: {
    level: 4, hp: 80, radius: 0.45, height: 1.8, walk: 2, run: 6.5, sight: 14, range: 2.2,
    damage: 14, windup: 0.6, recover: 1.3, exp: 22, gold: [6, 12], model: 'human', attack: 'slash',
    look: { jacket: 0x7a5a3a, pants: 0x4a3a2a, shoulders: 0x5a4028, hair: 0x2a1a10, spiky: false, band: false, weapon: 'sword' },
  },
  rogue: {
    level: 7, hp: 110, radius: 0.45, height: 1.8, walk: 2.5, run: 8.5, sight: 22, range: 1.9,
    damage: 12, windup: 0.4, recover: 0.9, exp: 40, gold: [12, 20], model: 'human', attack: 'punch1',
    ranged: { min: 6, max: 18, cd: 2.6, damage: 10 }, dodge: 0.3,
    look: { jacket: 0x2a2a34, pants: 0x1e1e26, shoulders: 0x5a1f2a, hair: 0x9aa0a8, spiky: true, band: true, scarf: 0x5a1f2a },
  },
  dummy: { level: 1, hp: 500, radius: 0.45, height: 1.7, exp: 0, model: 'dummy', dummy: true },

  // ---------- 頭目 ----------
  // 狼王：體型大，會嚎叫召喚狼群
  wolfking: {
    level: 6, hp: 340, radius: 1.0, height: 1.7, scale: 1.75, color: 0x3a3c44, walk: 3, run: 10, sight: 20, range: 2.8,
    damage: 18, windup: 0.5, recover: 1.0, exp: 120, gold: [40, 60], model: 'wolf', boss: true, respawn: 180,
    skills: [{ name: 'howl', cd: 14, time: 0.9 }],
  },
  // 黑鴉：叛忍首領，扇形苦無、火球，血量剩一半時叫出影子分身
  crow: {
    level: 12, hp: 950, radius: 0.5, height: 2.0, scale: 1.12, walk: 3, run: 9.5, sight: 26, range: 2.0,
    damage: 22, windup: 0.4, recover: 0.7, exp: 600, gold: [150, 220], model: 'human', attack: 'punch1', boss: true, respawn: 240,
    dodge: 0.25,
    skills: [{ name: 'summon', cd: 999, time: 0.8, below: 0.5 }, { name: 'fan', cd: 5, time: 0.5 }, { name: 'fire', cd: 7, time: 0.6 }],
    look: { jacket: 0x16161c, pants: 0x101014, shoulders: 0x2a2a34, hair: 0xe8e8ee, eyes: 0xc8323c, spiky: true, band: true, scarf: 0x101014 },
  },
};

// [種類, x, z, 數量]
const SPAWNS = [
  ['wolf', -200, 60, 3], ['wolf', -250, -80, 3], ['wolf', -170, 210, 3], ['wolf', -300, 150, 2],
  ['bandit', 14, 175, 2], ['bandit', 60, 240, 2], ['bandit', 125, 70, 2], ['bandit', -120, 140, 2],
  ['rogue', 235, -150, 1], ['rogue', -80, -240, 1], ['rogue', 250, 210, 1],
  ['dummy', -9, 120, 1], ['dummy', 0, 126, 1], ['dummy', 9, 120, 1], // 大門外的訓練木樁
  ['wolfking', -285, 20, 1], // 幽冥森林深處
  ['crow', 150, -262, 1], // 北方山區
];

const RESPAWN_TIME = 45;
const UP = new THREE.Vector3(0, 1, 0);
const LEASH = 45; // 離家太遠就放棄追擊

function createDummy() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6240 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xd8b86a });
  const root = new THREE.Group();
  const add = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    root.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.1, 0.12, 1.7, 8), wood, 0.85);
  add(new THREE.BoxGeometry(1.1, 0.1, 0.1), wood, 1.25);
  add(new THREE.CylinderGeometry(0.28, 0.3, 0.7, 10), straw, 0.95);
  add(new THREE.SphereGeometry(0.22, 12, 10), straw, 1.55);
  return { root };
}

function createBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 14;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.3, 0.14, 1);
  sprite.renderOrder = 10;
  return { sprite, canvas, tex, frac: -1 };
}

function drawBar(bar, frac) {
  if (Math.abs(bar.frac - frac) < 0.001) return;
  bar.frac = frac;
  const g = bar.canvas.getContext('2d');
  g.clearRect(0, 0, 128, 14);
  g.fillStyle = 'rgba(0,0,0,.75)';
  g.fillRect(0, 0, 128, 14);
  g.fillStyle = frac > 0.35 ? '#e8463a' : '#ff8a2a';
  g.fillRect(2, 2, 124 * frac, 10);
  bar.tex.needsUpdate = true;
}

class Enemy {
  constructor(key, home, mgr, temp = false) {
    this.key = key;
    this.temp = temp; // 召喚出來的臨時敵人：死了就消失，不重生
    this.skillCd = {};
    this.def = ENEMY_TYPES[key];
    this.mgr = mgr;
    this.home = home.clone();
    this.pos = home.clone();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.facing = Math.random() * Math.PI * 2;
    this.time = Math.random() * 10;
    this.phase = 0;
    this.rangedCd = 1 + Math.random() * 2;
    this.dodgeCd = 0;
    this.flash = 0;
    this.lastHit = -99;
    this.build();
    this.reset();
  }

  get name() {
    return `${THEME.enemies[this.key]}${this.def.dummy ? '' : ` Lv.${this.def.level}`}`;
  }

  build() {
    const d = this.def;
    this.model = d.model === 'wolf' ? createWolf(d.color) : d.model === 'dummy' ? createDummy() : createCharacter(d.look);
    toonify(this.model.root);
    this.mats = new Set();
    this.model.root.traverse(o => { if (o.isMesh && o.material.emissive) this.mats.add(o.material); });
    // 外層 root 負責位置與倒下；模型本身可以放大（頭目），名牌不受縮放影響
    this.root = new THREE.Group();
    this.model.root.scale.setScalar(d.scale ?? 1);
    this.root.add(this.model.root);

    this.tag = createNameplate(this.name, d.boss ? '#ffd23a' : d.dummy ? '#ffffff' : '#ff9a8a');
    this.tag.position.y = d.height + 0.75;
    this.bar = createBar();
    this.bar.sprite.position.y = d.height + 0.45;
    if (d.boss) this.bar.sprite.scale.set(2, 0.18, 1);
    this.root.add(this.tag, this.bar.sprite);
    this.mgr.scene.add(this.root);
  }

  reset() {
    this.alive = true;
    this.hp = this.def.hp;
    this.state = this.def.dummy ? 'dummy' : 'patrol';
    this.timer = 0;
    this.target = null;
    this.wanderTo = null;
    this.deadTimer = 0;
    this.pos.copy(this.home);
    this.vel.set(0, 0, 0);
    this.summoned = false;
    // 一般招式開場有一點冷卻；血量觸發的招式（below）隨時可用
    for (const s of this.def.skills ?? []) this.skillCd[s.name] = s.below ? 0 : s.cd * 0.4;
    this.root.visible = true;
    this.root.rotation.set(0, this.facing, 0);
  }

  // 頭目招式：在追擊中挑一個冷卻好的來用
  pickSkill(dist) {
    const d = this.def;
    for (const s of d.skills ?? []) {
      if (this.skillCd[s.name] > 0) continue;
      if (s.below && (this.summoned || this.hp > d.hp * s.below)) continue;
      if (s.name === 'fan' && (dist < 4 || dist > 20)) continue;
      if (s.name === 'fire' && (dist < 5 || dist > 22)) continue;
      return s;
    }
    return null;
  }

  useSkill(name, combat) {
    const target = this.target;
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    const aim = () => new THREE.Vector3(target.pos.x, target.pos.y + 1.1, target.pos.z).sub(from).normalize();
    const ft = combat.floatText;
    const head = new THREE.Vector3(this.pos.x, this.pos.y + this.def.height + 1, this.pos.z);
    if (name === 'howl') {
      ft.spawn('嗷嗚——！', head, 'alert');
      combat.camCtl.shake = 0.3;
      for (const side of [-1, 1]) this.mgr.summon('wolf', this, side * 3, combat);
    } else if (name === 'fan') {
      const base = aim();
      for (const a of [-0.25, 0, 0.25]) {
        combat.projectiles.spawn({ kind: 'kunai', owner: 'enemy', pos: from.clone(), dir: base.clone().applyAxisAngle(UP, a), speed: 32, damage: 12, radius: 0.3 });
      }
    } else if (name === 'fire') {
      ft.spawn(THEME.jutsu.fireball, head, 'info');
      combat.projectiles.spawn({ kind: 'fire', owner: 'enemy', pos: from.clone(), dir: aim(), speed: 18, damage: 20, radius: 0.7, aoe: { r: 3.5, dmg: 14 } });
    } else if (name === 'summon') {
      this.summoned = true;
      ft.spawn(THEME.jutsu.clone, head, 'info');
      for (const side of [-1, 1]) this.mgr.summon('rogue', this, side * 3, combat);
    }
  }

  get chest() {
    return this._chest.set(this.pos.x, this.pos.y + this.def.height * 0.6, this.pos.z);
  }

  // 回傳 'dodged' / 'killed' / 'hit'
  takeHit(dmg, from, kb, combat, opts = {}) {
    if (!this.alive) return null;
    const d = this.def;
    const ft = combat.floatText;
    if (d.dodge && this.dodgeCd <= 0 && this.state !== 'hurt' && Math.random() < d.dodge) {
      // 流浪忍者也會替身術
      combat.spawnLog(this.pos);
      const side = Math.random() < 0.5 ? -1 : 1;
      const f = this.facing + side * Math.PI / 2;
      this.pos.x += Math.sin(f) * 5;
      this.pos.z += Math.cos(f) * 5;
      this.mgr.world.resolve(this.pos, d.radius);
      combat.effects.smoke(this._chest.set(this.pos.x, this.pos.y + 1, this.pos.z), 10, 0xf4f4f4, 0.4);
      ft.spawn(THEME.skills.sub, this.chest, 'info');
      this.dodgeCd = 6;
      return 'dodged';
    }
    this.hp -= dmg;
    this.flash = 0.12;
    this.lastHit = this.time;
    ft.spawn(String(Math.round(dmg)), this.chest, kb >= 8 ? 'crit' : '');
    if (d.dummy) {
      if (this.hp < 100) this.hp = d.hp;
      combat.quests?.event({ type: 'hit', target: 'dummy' });
      return 'hit';
    }
    if (this.hp <= 0) {
      this.die(combat);
      return 'killed';
    }
    // 頭目不會被小招打斷，只有重擊或暈眩才會硬直
    if (d.boss && kb < 8 && !opts.stun) {
      this.target = combat.playerTarget;
      if (this.state === 'patrol' || this.state === 'return') this.state = 'chase';
      return 'hit';
    }
    this.state = 'hurt';
    this.timer = Math.max(kb >= 8 ? 0.65 : 0.3, opts.stun ?? 0);
    if (d.boss) kb *= 0.3;
    if (opts.stun) combat.floatText.spawn('暈眩', this._chest.set(this.pos.x, this.pos.y + this.def.height + 0.4, this.pos.z), 'info');
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    this.vel.set((dx / len) * kb, 0, (dz / len) * kb);
    if (kb >= 8) this.vy = 6;
    this.target = combat.playerTarget;
    // 狼群：一隻被打，附近的同伴一起上
    if (d.pack) {
      for (const o of this.mgr.list) {
        if (o !== this && o.key === this.key && o.alive && o.pos.distanceTo(this.pos) < 18 && o.state === 'patrol') {
          o.target = combat.playerTarget;
          o.state = 'chase';
        }
      }
    }
    return 'hit';
  }

  die(combat) {
    this.alive = false;
    this.deadTimer = 0;
    this.state = 'dead';
    combat.effects.smoke(this.chest, 10, 0xd8d8d8, 0.45);
    combat.onEnemyKilled(this);
  }

  face(target, dt, rate = 10) {
    const a = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    this.facing = lerpAngle(this.facing, a, 1 - Math.exp(-rate * dt));
  }

  // 朝 dest 移動；碰到水或村子就停
  moveToward(dest, speed, dt) {
    const dx = dest.x - this.pos.x, dz = dest.z - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return 0;
    const nx = this.pos.x + (dx / len) * speed * dt;
    const nz = this.pos.z + (dz / len) * speed * dt;
    if (getTerrainHeight(nx, nz) < 0.3) return 0;
    if (Math.hypot(nx, nz) < VILLAGE_RADIUS + 6) return 0;
    this.pos.x = nx;
    this.pos.z = nz;
    this.face(dest, dt);
    return speed;
  }

  update(dt, ctx) {
    const d = this.def;
    const combat = ctx.combat;
    this.time += dt;
    this.flash -= dt;
    this.rangedCd -= dt;
    this.dodgeCd -= dt;
    let speed = 0;
    let action = null;

    for (const k in this.skillCd) this.skillCd[k] -= dt;

    if (!this.alive) {
      this.deadTimer += dt;
      const r = this.root;
      r.rotation.z = Math.min(Math.PI / 2, this.deadTimer * 5);
      if (this.deadTimer > 1.5) r.position.y -= dt * 0.8;
      if (this.deadTimer > 2.5) {
        r.visible = false;
        if (this.temp) this.removed = true;
      }
      if (!this.temp && this.deadTimer > (d.respawn ?? RESPAWN_TIME) && ctx.player.pos.distanceTo(this.home) > 40) this.reset();
      return;
    }

    if (d.dummy) {
      if (this.time - this.lastHit > 3) this.hp = d.hp;
      this.updateVisual(dt, 0, null);
      return;
    }

    // 找最近的目標（玩家或分身）
    let best = null, bestD = Infinity;
    for (const t of ctx.targets) {
      const dist = t.pos.distanceTo(this.pos);
      const reach = t === this.target ? d.sight * 1.6 : d.sight;
      if (dist < reach && dist < bestD && Math.hypot(t.pos.x, t.pos.z) > VILLAGE_RADIUS) {
        best = t;
        bestD = dist;
      }
    }
    const homeDist = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);

    switch (this.state) {
      case 'patrol':
        if (best) {
          this.target = best;
          this.state = 'alert';
          this.timer = 0.45;
          combat.floatText.spawn('!', this._chest.set(this.pos.x, this.pos.y + d.height + 1, this.pos.z), 'alert');
          break;
        }
        if (!this.wanderTo || (this.timer -= dt) <= 0) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 10;
          this.wanderTo = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.timer = 3 + Math.random() * 4;
        }
        if (Math.hypot(this.wanderTo.x - this.pos.x, this.wanderTo.z - this.pos.z) > 0.8) speed = this.moveToward(this.wanderTo, d.walk, dt);
        break;

      case 'alert':
        this.face(this.target.pos, dt, 14);
        if ((this.timer -= dt) <= 0) {
          this.state = 'chase';
          this.rangedCd = Math.min(this.rangedCd, 0.2); // 遠程型發現目標先丟一把苦無
        }
        break;

      case 'chase': {
        if (!best || homeDist > LEASH) {
          this.state = 'return';
          break;
        }
        this.target = best;
        const r = d.ranged;
        const skill = this.pickSkill(bestD);
        if (skill) {
          this.state = 'skill';
          this.skill = skill;
          this.timer = skill.time;
        } else if (r && bestD > r.min && bestD < r.max && this.rangedCd <= 0) {
          this.state = 'aim';
          this.timer = 0.5;
        } else if (bestD <= d.range) {
          this.state = 'windup';
          this.timer = d.windup;
        } else {
          speed = this.moveToward(best.pos, d.run, dt);
        }
        break;
      }

      case 'windup':
        this.face(this.target.pos, dt, 12);
        action = { type: d.model === 'wolf' ? 'windup' : d.attack, t: 0 };
        if ((this.timer -= dt) <= 0) {
          this.state = 'attack';
          this.timer = 0.25;
          // 出手當下判定：還在攻擊範圍內且在前方才算命中
          const t = this.target;
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          const front = (dx * Math.sin(this.facing) + dz * Math.cos(this.facing)) / (dist || 1);
          if (dist < d.range + 0.7 && front > 0.3 && Math.abs(t.pos.y - this.pos.y) < 1.6) combat.hitTarget(t, d.damage, this.pos);
          // 撲咬／揮刀時往前衝一點
          this.vel.set(Math.sin(this.facing) * 5, 0, Math.cos(this.facing) * 5);
        }
        break;

      case 'attack':
        action = { type: d.model === 'wolf' ? 'bite' : d.attack, t: 0.8 };
        if ((this.timer -= dt) <= 0) {
          this.state = 'recover';
          this.timer = d.recover;
        }
        break;

      case 'aim':
        this.face(this.target.pos, dt, 12);
        action = { type: 'throw', t: 0.1 };
        if ((this.timer -= dt) <= 0) {
          const from = this._chest.set(this.pos.x, this.pos.y + 1.4, this.pos.z).clone();
          const to = new THREE.Vector3(this.target.pos.x, this.target.pos.y + 1.1, this.target.pos.z);
          combat.projectiles.spawn({ kind: 'kunai', owner: 'enemy', pos: from, dir: to.sub(from).normalize(), speed: 30, damage: d.ranged.damage, radius: 0.3 });
          this.rangedCd = d.ranged.cd;
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;

      case 'skill':
        this.face(this.target.pos, dt, 10);
        action = d.model === 'wolf'
          ? { type: 'windup', t: 0 }
          : { type: this.skill.name === 'fan' ? 'throw' : this.skill.name === 'summon' ? 'seal' : 'cast', t: 1 - this.timer / this.skill.time };
        if ((this.timer -= dt) <= 0) {
          this.useSkill(this.skill.name, combat);
          this.skillCd[this.skill.name] = this.skill.cd;
          this.state = 'recover';
          this.timer = 0.6;
        }
        break;

      case 'recover':
        if (this.target) this.face(this.target.pos, dt, 4);
        if ((this.timer -= dt) <= 0) this.state = 'chase';
        break;

      case 'hurt':
        action = { type: 'hurt', t: 0 };
        if ((this.timer -= dt) <= 0) this.state = 'chase';
        break;

      case 'return':
        speed = this.moveToward(this.home, d.run, dt);
        if (homeDist < 2 || speed === 0) {
          this.hp = d.hp;
          this.state = 'patrol';
          this.target = null;
        }
        break;
    }

    // 擊退與重力
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.vel.multiplyScalar(Math.exp(-8 * dt));
    this.mgr.world.resolve(this.pos, d.radius);
    const ground = getTerrainHeight(this.pos.x, this.pos.z);
    this.vy -= 30 * dt;
    this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
    if (this.pos.y <= ground) this.vy = 0;

    this.updateVisual(dt, speed, action);
  }

  updateVisual(dt, speed, action) {
    const d = this.def;
    const r = this.root;
    r.position.copy(this.pos);
    r.rotation.y = this.facing;
    if (d.model === 'wolf') this.phase += dt * speed * 1.3;
    else this.phase = advancePhase(this.phase, speed, dt, d.scale ?? 1);
    const move = Math.min(1, speed / (d.model === 'wolf' ? 6 : 4));
    if (d.model === 'wolf') animateWolf(this.model, { phase: this.phase, move, action, time: this.time }, dt);
    else if (d.model === 'human') animateCharacter(this.model, { phase: this.phase, speed, sprint: speed > 7.5, action, time: this.time }, dt);

    // 受擊閃白、蓄力閃紅
    const windup = this.state === 'windup' || this.state === 'aim' || this.state === 'skill';
    for (const m of this.mats) {
      if (this.flash > 0) m.emissive.setRGB(0.9, 0.9, 0.9);
      else if (windup) m.emissive.setRGB(0.6 + 0.3 * Math.sin(this.time * 30), 0.05, 0.02);
      else m.emissive.setRGB(0, 0, 0);
    }
    drawBar(this.bar, Math.max(0, this.hp / d.hp));
    this.bar.sprite.visible = this.hp < d.hp || this.mgr.lockTarget === this;
  }
}
Enemy.prototype._chest = new THREE.Vector3();

export class EnemyManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.lockTarget = null;
    const rng = mulberry32(5);
    for (const [key, x, z, n] of SPAWNS) {
      for (let i = 0; i < n; i++) {
        const home = this.findSpot(x, z, key === 'dummy' ? 0 : 10, rng);
        this.list.push(new Enemy(key, home, this));
      }
    }
  }

  findSpot(x, z, spread, rng) {
    for (let i = 0; i < 30; i++) {
      const px = x + (rng() - 0.5) * spread, pz = z + (rng() - 0.5) * spread;
      const h = getTerrainHeight(px, pz);
      if (h > 0.6 && h < 45 && !this.world.insideAnyBox(px, pz, 1)) return new THREE.Vector3(px, h, pz);
    }
    return new THREE.Vector3(x, getTerrainHeight(x, z), z);
  }

  alive() {
    return this.list.filter(e => e.alive);
  }

  // 頭目召喚手下：出現在召喚者旁邊，直接進入追擊
  summon(key, owner, side, combat) {
    const f = owner.facing + Math.PI / 2;
    const pos = new THREE.Vector3(owner.pos.x + Math.sin(f) * side, 0, owner.pos.z + Math.cos(f) * side);
    pos.y = getTerrainHeight(pos.x, pos.z);
    const e = new Enemy(key, pos, this, true);
    e.target = owner.target;
    e.state = 'chase';
    this.list.push(e);
    combat.effects.smoke(new THREE.Vector3(pos.x, pos.y + 1, pos.z), 12, key === 'wolf' ? 0x6b6f78 : 0x2a2a34, 0.5);
  }

  update(dt, ctx) {
    for (const e of this.list) e.update(dt, ctx);
    // 移除已消失的召喚物
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].removed) {
        this.scene.remove(this.list[i].root);
        this.list.splice(i, 1);
      }
    }
  }
}
