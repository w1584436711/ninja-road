import * as THREE from 'three';
import { lerpAngle } from '../core/math.js';
import { THEME } from '../data/theme.js';
import { JUTSU, performJutsu, jutsuName } from './jutsu.js';

// 體術三連擊：最後一下迴旋踢會把敵人踢飛
const COMBO = [
  { type: 'punch1', dur: 0.3, hit: 0.45, dmg: 10, kb: 2 },
  { type: 'punch2', dur: 0.3, hit: 0.45, dmg: 12, kb: 2 },
  { type: 'kick', dur: 0.45, hit: 0.5, dmg: 18, kb: 9 },
];

const SUB_COST = 20;
const SEAL_TIMEOUT = 1.6;

export class PlayerCombat {
  constructor(combat) {
    this.c = combat;
    this.p = combat.player;
    this.action = null;
    this.lastCombo = -1;
    this.comboTimer = 0;
    this.queued = false;
    this.kunaiCd = 0;
    this.subCd = 0;
    this.lock = null;
    this.seals = [];
    this.sealTimer = 0;
    this.v = new THREE.Vector3();
  }

  cancel() {
    this.action = null;
    this.queued = false;
    this.seals = [];
  }

  forward(angle = this.p.facing) {
    return this.v.set(Math.sin(angle), 0, Math.cos(angle));
  }

  angleTo(e) {
    return Math.atan2(e.pos.x - this.p.pos.x, e.pos.z - this.p.pos.z);
  }

  // 前方一定角度、距離內最近的敵人（有鎖定時優先）
  softTarget(range, cone) {
    const p = this.p;
    if (this.lock && this.lock.pos.distanceTo(p.pos) < range * 1.5) return this.lock;
    let best = null, bestD = range;
    for (const e of this.c.enemies.list) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d > bestD) continue;
      let diff = Math.abs(this.angleTo(e) - p.facing) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < cone) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  toggleLock() {
    if (this.lock) {
      this.lock = null;
      return;
    }
    // 選鏡頭前方、距離近的敵人
    const cam = this.c.camCtl;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    let best = null, bestScore = Infinity;
    for (const e of this.c.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.p.pos.x, dz = e.pos.z - this.p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 28) continue;
      const score = d * (1.6 - (dx * fx + dz * fz) / (d || 1));
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    this.lock = best;
    if (!best) this.c.notice('附近沒有可以鎖定的目標');
  }

  start(type, dur, opts = {}) {
    this.action = { type, dur, t: 0, done: false, ...opts };
  }

  startCombo(i) {
    const step = COMBO[i];
    const p = this.p;
    const tgt = this.softTarget(4.5, 1.2);
    let face = p.facing;
    if (tgt) {
      face = this.angleTo(tgt);
      const d = Math.hypot(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
      if (d > 1.6) {
        // 往目標衝過去
        const lunge = Math.min(14, (d - 1.2) * 7);
        p.vel.x = Math.sin(face) * lunge;
        p.vel.z = Math.cos(face) * lunge;
      }
    }
    this.lastCombo = i;
    this.comboTimer = step.dur + 0.5;
    this.start(step.type, step.dur, { combo: i, hitAt: step.hit, face, onHit: () => this.meleeHit(step) });
  }

  meleeHit(step) {
    const p = this.p;
    const f = this.forward();
    const cx = p.pos.x + f.x * 1.2, cz = p.pos.z + f.z * 1.2;
    let any = false;
    for (const e of this.c.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - cx, dz = e.pos.z - cz;
      if (dx * dx + dz * dz < (1.3 + e.def.radius) ** 2 && Math.abs(e.pos.y - p.pos.y) < 1.6) {
        this.c.hitEnemy(e, Math.round(step.dmg * p.meleeMul), p.pos, step.kb);
        any = true;
      }
    }
    if (any) {
      this.c.hitStop = step.kb > 5 ? 0.09 : 0.05;
      this.c.camCtl.shake = step.kb > 5 ? 0.25 : 0.1;
    }
  }

  aimAt(e) {
    const from = new THREE.Vector3(this.p.pos.x, this.p.pos.y + 1.4, this.p.pos.z);
    const to = new THREE.Vector3(e.pos.x, e.pos.y + e.def.height * 0.6, e.pos.z);
    return to.sub(from).normalize();
  }

  throwKunai() {
    const p = this.p;
    let dir;
    if (this.lock) {
      dir = this.aimAt(this.lock);
    } else {
      dir = new THREE.Vector3();
      this.c.camCtl.camera.getWorldDirection(dir);
      dir.y += 0.04; // 稍微往上抵銷下墜
      dir.normalize();
    }
    this.kunaiCd = 0.35;
    this.start('throw', 0.28, {
      hitAt: 0.4,
      face: Math.atan2(dir.x, dir.z),
      onHit: () => {
        const f = this.forward(Math.atan2(dir.x, dir.z));
        const pos = new THREE.Vector3(p.pos.x + f.z * -0.3 + f.x * 0.4, p.pos.y + 1.4, p.pos.z + f.x * 0.3 + f.z * 0.4);
        this.c.projectiles.spawn({ kind: 'kunai', owner: 'player', pos, dir, speed: 38, gravity: 4, damage: Math.round(8 * p.meleeMul), radius: 0.3, kb: 1.5 });
      },
    });
  }

  substitute() {
    const p = this.p;
    if (this.subCd > 0 || !p.useChakra(SUB_COST)) return;
    const c = this.c;
    c.spawnLog(p.pos);
    let x, z;
    if (this.lock && this.lock.pos.distanceTo(p.pos) < 12) {
      // 鎖定中：繞到敵人背後
      const e = this.lock;
      const a = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      x = e.pos.x + Math.sin(a) * 2.2;
      z = e.pos.z + Math.cos(a) * 2.2;
      p.facing = a + Math.PI;
    } else {
      x = p.pos.x - Math.sin(p.facing) * 7;
      z = p.pos.z - Math.cos(p.facing) * 7;
    }
    p.pos.x = x;
    p.pos.z = z;
    c.world.resolve(p.pos, 0.4);
    p.vel.set(0, 0, 0);
    p.invuln = 0.6;
    p.hurtTime = 0;
    this.cancel();
    this.subCd = 1.2;
    c.effects.smoke(new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), 10, 0xf4f4f4, 0.4);
    c.floatText.spawn(THEME.skills.sub, new THREE.Vector3(p.pos.x, p.pos.y + 2.2, p.pos.z), 'info');
  }

  addSeal(i) {
    if (this.action) return;
    this.seals.push(i);
    this.sealTimer = SEAL_TIMEOUT;
    const seq = this.seals.join(',');
    const match = JUTSU.find(j => j.seals.join(',') === seq);
    if (match) {
      this.seals = [];
      if (this.c.progress.knows(match.key)) this.cast(match);
      else this.c.notice(`尚未習得「${jutsuName(match)}」`);
    } else if (!JUTSU.some(j => j.seals.join(',').startsWith(seq))) {
      this.seals = [];
      this.c.notice('結印失敗');
    }
  }

  cast(def) {
    const prog = this.c.progress;
    if (!this.p.useChakra(prog.jutsuCost(def))) return;
    this.c.hud.jutsuCall(jutsuName(def));
    performJutsu(this, def, prog.jutsuMul(def.key));
    if (prog.recordCast(def.key)) this.c.notice(`「${jutsuName(def)}」熟練度提升！`);
  }

  update(dt, input) {
    const p = this.p;
    const c = this.c;
    this.kunaiCd -= dt;
    this.subCd -= dt;
    this.comboTimer -= dt;

    if (p.dead) {
      this.cancel();
      this.lock = null;
      this.publish();
      return;
    }

    // ---------- 鎖定 ----------
    if (input.pressed('KeyR')) this.toggleLock();
    if (this.lock && (!this.lock.alive || this.lock.pos.distanceTo(p.pos) > 32)) this.lock = null;
    c.enemies.lockTarget = this.lock;
    if (this.lock) {
      const want = Math.atan2(p.pos.x - this.lock.pos.x, p.pos.z - this.lock.pos.z);
      c.camCtl.yaw = lerpAngle(c.camCtl.yaw, want, 1 - Math.exp(-5 * dt));
    }

    // 替身術：被打中時也能用
    if (input.pressed('KeyX')) this.substitute();

    if (p.hurtTime > 0) {
      this.cancel();
      this.publish();
      return;
    }

    // ---------- 結印 ----------
    for (let i = 0; i < 4; i++) if (input.pressed(`Digit${i + 1}`)) this.addSeal(i);
    if (this.seals.length && (this.sealTimer -= dt) <= 0) this.seals = [];

    // ---------- 體術、苦無 ----------
    if (input.pressed('KeyF') || input.pressed('Mouse0')) {
      if (!this.action) {
        this.seals = [];
        this.startCombo(this.comboTimer > 0 && this.lastCombo < 2 ? this.lastCombo + 1 : 0);
      } else if (this.action.combo !== undefined && this.action.t > 0.35) {
        this.queued = true;
      }
    }
    if (input.pressed('KeyQ') && !this.action && this.kunaiCd <= 0) this.throwKunai();

    // ---------- 動作進行 ----------
    const a = this.action;
    if (a) {
      a.t += dt / a.dur;
      if (!a.done && a.t >= a.hitAt) {
        a.done = true;
        a.onHit?.();
      }
      if (a.t >= 1) {
        this.action = null;
        if (this.queued && a.combo !== undefined && a.combo < 2) this.startCombo(a.combo + 1);
        this.queued = false;
      }
    }
    this.publish();
  }

  // 把目前動作交給 Player（移動速度、面向、動畫）
  publish() {
    const p = this.p;
    const a = this.action;
    if (a) {
      p.action = { type: a.type, t: a.t };
      p.moveScale = a.type === 'cast' ? 0 : 0.2;
      p.faceAngle = a.face ?? null;
    } else if (this.seals.length) {
      p.action = { type: 'seal', t: (p.time * 2) % 1 };
      p.moveScale = 0;
      p.faceAngle = null;
    } else {
      p.action = null;
      p.moveScale = 1;
      p.faceAngle = null;
    }
  }
}
