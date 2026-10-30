import * as THREE from 'three';
import { lerpAngle, clamp } from '../core/math.js';
import { createCharacter, animateCharacter, advancePhase } from '../player/character.js';
import { toonify, toonMaterial } from '../render/toon.js';
import { getTerrainHeight } from '../world/terrain.js';
import { THEME } from '../data/theme.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { PlayerCombat } from './playerCombat.js';

const RESPAWN_POINT = { x: 0, z: 30 };
const CLONE_LIFE = 15;

// 分身：自動追打附近的敵人，被打中一下就消失
class Clone {
  constructor(combat, pos, side) {
    this.c = combat;
    this.side = side;
    this.model = createCharacter(THEME.player.look);
    toonify(this.model.root);
    combat.scene.add(this.model.root);
    this.pos = pos.clone();
    this.facing = combat.player.facing;
    this.life = CLONE_LIFE;
    this.attackCd = 0.3;
    this.phase = 0;
    this.time = 0;
    this.punch = 0;
    this.actionT = 1;
    this.dead = false;
    this.target = { pos: this.pos, kind: 'clone', ref: this };
  }

  poof() {
    if (this.dead) return;
    this.dead = true;
    this.c.sound('poof', this.pos);
    this.c.effects.smoke(new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z), 12, 0xf4f4f4, 0.45);
    this.c.scene.remove(this.model.root);
  }

  update(dt) {
    const c = this.c;
    this.time += dt;
    if ((this.life -= dt) <= 0) return this.poof();
    this.attackCd -= dt;
    this.actionT += dt / 0.3;

    let goal = null, speed = 0;
    let enemy = null, bestD = 22;
    for (const e of c.enemies.list) {
      if (!e.alive || e.def.dummy) continue;
      const d = e.pos.distanceTo(this.pos);
      if (d < bestD) { enemy = e; bestD = d; }
    }
    if (enemy) {
      goal = enemy.pos;
      if (bestD < 1.7) {
        if (this.attackCd <= 0) {
          this.punch = 1 - this.punch;
          this.actionT = 0;
          this.attackCd = 0.75;
          c.hitEnemy(enemy, 6, this.pos, 2);
        }
      } else {
        speed = 9;
      }
    } else {
      // 跟在主角左右兩側
      const p = c.player;
      goal = new THREE.Vector3(
        p.pos.x + Math.cos(p.facing) * this.side * 2 - Math.sin(p.facing) * 1.2, 0,
        p.pos.z - Math.sin(p.facing) * this.side * 2 - Math.cos(p.facing) * 1.2,
      );
      if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) > 1) speed = 9;
    }
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
      this.pos.x += (dx / len) * speed * dt;
      this.pos.z += (dz / len) * speed * dt;
    }
    c.world.resolve(this.pos, 0.4);
    this.pos.y = Math.max(getTerrainHeight(this.pos.x, this.pos.z), 0);

    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.facing;
    this.phase = advancePhase(this.phase, speed, dt);
    animateCharacter(this.model, {
      phase: this.phase, speed, sprint: speed > 0, time: this.time,
      action: this.actionT < 1 ? { type: this.punch ? 'punch1' : 'punch2', t: this.actionT } : null,
    }, dt);
  }
}

export class Combat {
  constructor({ scene, world, effects, player, camCtl, floatText, hud, progress }) {
    Object.assign(this, { scene, world, effects, player, camCtl, floatText, hud, progress });
    this.timers = [];
    this.props = [];
    this.spikeGeo = new THREE.ConeGeometry(0.45, 1.6, 5).translate(0, 0.6, 0);
    this.rockMat = toonMaterial({ color: 0x8a7458 });
    this.boltGeo = new THREE.CylinderGeometry(0.25, 0.4, 40, 6);
    this.enemies = new EnemyManager(scene, world);
    this.projectiles = new Projectiles(this);
    this.pc = new PlayerCombat(this);
    this.clones = [];
    this.logs = [];
    this.targets = [];
    this.playerTarget = { pos: player.pos, kind: 'player' };
    this.hitStop = 0;
    this.time = 0;
    this.lastHurt = -99;
    this.deathTimer = 0;
    this.recent = null; // 最近打到的敵人，給目標框顯示
    this.recentTimer = 0;
    this.logGeo = new THREE.CylinderGeometry(0.2, 0.22, 1.5, 10).translate(0, 0.75, 0);
    this.logMat = toonMaterial({ color: 0x8a6240 });
    this.createLockMarker();
  }

  createLockMarker() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ff5a4a';
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(12, 14);
    g.lineTo(52, 14);
    g.lineTo(32, 46);
    g.closePath();
    g.stroke();
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.marker.scale.setScalar(0.5);
    this.marker.renderOrder = 20;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  notice(msg) {
    this.player.onNotice(msg);
  }

  // 音效：離玩家越遠越小聲（pos 省略就是玩家自己發出的）
  sound(name, pos) {
    if (!this.sfx) return;
    let vol = 1;
    if (pos) vol = clamp(1 - pos.distanceTo(this.player.pos) / 50, 0, 1) ** 1.5;
    this.sfx.play(name, vol);
  }

  // 命中停頓：打中的瞬間時間幾乎靜止，打擊感更強
  timeScale(dt) {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return dt * 0.08;
    }
    return dt;
  }

  // 依遊戲時間延遲執行（暫停、命中停頓時也會跟著停）
  schedule(delay, fn) {
    this.timers.push({ at: this.time + delay, fn });
  }

  // 短暫存在的特效物件：update(prop, dt) 回傳 false 時移除
  addProp(mesh, life, update) {
    this.scene.add(mesh);
    this.props.push({ mesh, t: 0, life, update });
  }

  hitEnemy(e, dmg, from, kb = 2, opts = {}) {
    const result = e.takeHit(dmg, from, kb, this, opts);
    if (result) {
      this.recent = e;
      this.recentTimer = 4;
    }
    if (result === 'hit' || result === 'killed') {
      this.sound(kb >= 8 ? 'hitHeavy' : 'hit', e.pos);
      if (result === 'killed') this.schedule(0.35, () => this.sound('down', e.pos));
      this.effects.ring(new THREE.Vector3(e.pos.x, e.pos.y + e.def.height * 0.6, e.pos.z), 0xfff2c0, 1.2, 0.25);
    }
    return result;
  }

  hitTarget(t, dmg, from) {
    if (t.kind === 'clone') t.ref.poof();
    else this.hitPlayer(dmg, from);
  }

  hitPlayer(dmg, from) {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;
    dmg = Math.max(1, Math.round(dmg * p.defMul)); // 防具減傷
    p.hp = Math.max(0, p.hp - dmg);
    p.hurtTime = 0.3;
    p.invuln = 0.35;
    this.lastHurt = this.time;
    const dx = p.pos.x - from.x, dz = p.pos.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    p.vel.x = (dx / len) * 7;
    p.vel.z = (dz / len) * 7;
    this.sound('hurt');
    this.floatText.spawn(`-${dmg}`, new THREE.Vector3(p.pos.x, p.pos.y + 1.6, p.pos.z), 'hurt');
    this.hud.flashHurt();
    this.camCtl.shake = 0.3;
    this.pc.cancel();
    if (p.hp <= 0) {
      p.dead = true;
      this.deathTimer = 3.5;
      this.hud.showDeath(true);
    }
  }

  explode(pos, radius, dmg, owner, kind = 'fire') {
    const ground = new THREE.Vector3(pos.x, Math.max(pos.y - 0.5, getTerrainHeight(pos.x, pos.z) + 0.1), pos.z);
    this.sound(kind === 'water' ? 'water' : 'explosion', pos);
    if (kind === 'water') {
      this.effects.smoke(pos, 16, 0xbfe6ff, 0.6, 2.5);
      this.effects.ring(ground, 0x5ab8ff, radius, 0.5);
    } else {
      this.effects.smoke(pos, 18, 0xff8a3a, 0.8, 2.5);
      this.effects.smoke(pos, 8, 0x4a4a4a, 0.7, 1.5);
      this.effects.ring(ground, 0xffa040, radius, 0.5);
    }
    this.camCtl.shake = 0.35;
    if (owner === 'enemy') {
      for (const t of [...this.targets]) {
        if (t.pos.distanceTo(pos) < radius + 0.4) this.hitTarget(t, dmg, pos);
      }
      return;
    }
    if (owner !== 'player') return;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(pos);
      if (d < radius + e.def.radius) this.hitEnemy(e, Math.round(dmg * (1 - (d / (radius + 1)) * 0.5)), pos, kind === 'water' ? 10 : 8);
    }
  }

  // 自身周圍範圍招式的特效
  burstFx(pos, radius, kind) {
    const color = { wind: 0xd8fff4, earth: 0x9a7a52 }[kind] ?? 0xffffff;
    const ground = new THREE.Vector3(pos.x, pos.y + 0.1, pos.z);
    this.sound(kind === 'earth' ? 'rock' : 'wind', pos);
    this.effects.ring(ground, color, radius, 0.6);
    this.effects.ring(ground, color, radius * 0.6, 0.45);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.effects.smoke(new THREE.Vector3(pos.x + Math.cos(a) * radius * 0.7, pos.y + 0.5, pos.z + Math.sin(a) * radius * 0.7), 1, color, 0.6, 1.5);
    }
    if (kind === 'earth') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
        const r = radius * (0.45 + Math.random() * 0.45);
        this.rockSpike(new THREE.Vector3(pos.x + Math.cos(a) * r, 0, pos.z + Math.sin(a) * r), 0.7 + Math.random() * 0.6);
      }
    }
    this.camCtl.shake = 0.45;
  }

  // 岩槍：從地面刺出再縮回
  rockSpike(at, size) {
    at.y = getTerrainHeight(at.x, at.z);
    const mesh = new THREE.Mesh(this.spikeGeo, this.rockMat);
    mesh.position.copy(at);
    mesh.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4);
    mesh.castShadow = true;
    this.addProp(mesh, 1.3, (pr) => {
      const t = pr.t;
      const grow = t < 0.12 ? t / 0.12 : t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.4) : 1;
      mesh.scale.set(size, size * 1.8 * grow, size);
    });
  }

  // 指定地點招式：warn 預告圈、hit 命中特效
  strikeFx(point, kind, phase, radius) {
    const ground = new THREE.Vector3(point.x, point.y + 0.15, point.z);
    if (phase === 'warn') {
      this.effects.ring(ground, kind === 'thunder' ? 0xfff2a0 : 0xc49a6a, radius, 0.4);
      return;
    }
    this.sound(kind === 'thunder' ? 'thunder' : 'rock', point);
    if (kind === 'thunder') {
      const bolt = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({
        color: 0xfffbe0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      bolt.position.set(point.x, point.y + 20, point.z);
      this.addProp(bolt, 0.3, (pr) => {
        bolt.material.opacity = Math.random() > 0.3 ? 1 - pr.t / 0.3 : 0.2; // 閃爍
        bolt.scale.x = bolt.scale.z = 1 + Math.random();
      });
      this.effects.ring(ground, 0xfff2a0, radius, 0.5);
      this.effects.smoke(ground, 14, 0xfff2a0, 0.4, 2);
      this.effects.smoke(ground, 8, 0x555555, 0.6, 1.2);
      this.camCtl.shake = 0.5;
    } else {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * radius * 0.8;
        this.rockSpike(new THREE.Vector3(point.x + Math.cos(a) * r, 0, point.z + Math.sin(a) * r), 0.6 + Math.random() * 0.5);
      }
      this.effects.smoke(ground, 10, 0x9a7a52, 0.5, 1.5);
      this.camCtl.shake = 0.3;
    }
  }

  // 擊敗敵人：經驗值（等級差會打折）與金錢
  onEnemyKilled(e) {
    const d = e.def;
    this.quests?.event({ type: 'kill', target: e.key });
    if (d.boss) {
      this.hud.jutsuCall(`擊敗${THEME.enemies[e.key]}！`);
      this.camCtl.shake = 0.5;
    }
    const top = new THREE.Vector3(e.pos.x, e.pos.y + d.height + 0.8, e.pos.z);
    if (d.exp) this.floatText.spawn(`+${this.progress.gainExp(d.exp, d.level)} EXP`, top, 'exp');
    if (d.gold) {
      const g = d.gold[0] + Math.floor(Math.random() * (d.gold[1] - d.gold[0] + 1));
      this.progress.addGold(g);
      this.schedule(0.25, () => {
        this.floatText.spawn(`+${g} 兩`, top, 'gold');
        this.sound('coin');
      });
    }
  }

  spawnLog(pos) {
    const mesh = new THREE.Mesh(this.logGeo, this.logMat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.logs.push({ mesh, t: 0 });
    this.sound('poof', pos);
    this.effects.smoke(new THREE.Vector3(pos.x, pos.y + 1, pos.z), 12, 0xf4f4f4, 0.45);
  }

  spawnClones() {
    const p = this.player;
    this.sound('poof');
    for (const side of [-1, 1]) {
      const pos = new THREE.Vector3(p.pos.x + Math.cos(p.facing) * side * 1.6, p.pos.y, p.pos.z - Math.sin(p.facing) * side * 1.6);
      this.effects.smoke(new THREE.Vector3(pos.x, pos.y + 1, pos.z), 12, 0xf4f4f4, 0.45);
      this.clones.push(new Clone(this, pos, side));
    }
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = p.maxHp;
    p.chakra = Math.max(p.chakra, p.maxChakra * 0.5);
    p.pos.set(RESPAWN_POINT.x, getTerrainHeight(RESPAWN_POINT.x, RESPAWN_POINT.z), RESPAWN_POINT.z);
    p.vel.set(0, 0, 0);
    p.invuln = 2;
    this.hud.showDeath(false);
    for (const e of this.enemies.list) {
      if (e.alive && e.state !== 'patrol' && e.state !== 'dummy') e.state = 'return';
    }
  }

  // 玩家移動前：處理輸入（攻擊、結印、鎖定）
  preUpdate(dt, input) {
    this.pc.update(dt, input);
  }

  update(dt) {
    const p = this.player;
    this.time += dt;

    this.targets.length = 0;
    if (!p.dead) this.targets.push(this.playerTarget);
    for (const cl of this.clones) this.targets.push(cl.target);

    this.enemies.update(dt, { targets: this.targets, combat: this, player: p });

    // 身體碰撞：玩家不能穿過敵人
    for (const e of this.enemies.list) {
      if (!e.alive || Math.abs(e.pos.y - p.pos.y) > 1.5) continue;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const min = e.def.radius + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.pos.x = e.pos.x + (dx / d) * min;
        p.pos.z = e.pos.z + (dz / d) * min;
      }
    }
    this.projectiles.update(dt);
    for (const cl of this.clones) cl.update(dt);
    this.clones = this.clones.filter(cl => !cl.dead);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].at) {
        const t = this.timers.splice(i, 1)[0];
        t.fn();
      }
    }
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      pr.t += dt;
      pr.update?.(pr, dt);
      if (pr.t >= pr.life) {
        this.scene.remove(pr.mesh);
        if (pr.mesh.material !== this.rockMat) pr.mesh.material.dispose();
        this.props.splice(i, 1);
      }
    }

    // 替身木頭：倒下、沉入地面
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const l = this.logs[i];
      l.t += dt;
      l.mesh.rotation.x = Math.min(1.45, l.t * 3);
      if (l.t > 1.5) l.mesh.position.y -= dt * 0.6;
      if (l.t > 2.5) {
        this.scene.remove(l.mesh);
        this.logs.splice(i, 1);
      }
    }

    // 鎖定標記
    const lock = this.pc.lock;
    this.marker.visible = !!lock;
    if (lock) this.marker.position.set(lock.pos.x, lock.pos.y + lock.def.height + 1.4 + Math.sin(this.time * 5) * 0.08, lock.pos.z);
    if (lock) {
      this.recent = lock;
      this.recentTimer = 1;
    }
    this.recentTimer -= dt;

    // 脫離戰鬥 6 秒後慢慢回血
    if (!p.dead && this.time - this.lastHurt > 6) p.hp = clamp(p.hp + 4 * dt, 0, p.maxHp);

    if (p.dead && (this.deathTimer -= dt) <= 0) this.respawn();
  }

  get targetInfo() {
    const e = this.recentTimer > 0 ? this.recent : null;
    if (!e || !e.alive) return null;
    return { name: e.name, frac: Math.max(0, e.hp / e.def.hp), boss: !!e.def.boss };
  }
}
