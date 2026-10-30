import * as THREE from 'three';
import { lerpAngle, clamp, lerp } from '../core/math.js';
import { createNameplate } from '../core/textures.js';
import { createCharacter, animateCharacter, advancePhase } from './character.js';
import { getTerrainHeight, WATER_LEVEL, HALF, isRoad, inStream, VILLAGE_RADIUS } from '../world/terrain.js';
import { THEME } from '../data/theme.js';

const GRAVITY = 32;
// 接近真人的速度（公尺/秒）：走路、跑步；忍者跑是超人速度
const WALK_SPEED = 2.3;
const RUN_SPEED = 6.5;
const SPRINT_SPEED = 15;
const SWIM_SPEED = 3.5;
const JUMP_VEL = 13;
const DOUBLE_JUMP_VEL = 12;
const DASH_SPEED = 50;
const DASH_TIME = 0.18;
const SWIM_Y = WATER_LEVEL - 1.25; // 游泳時腳底的高度（頭露出水面）

const COST = { doubleJump: 10, dash: 15, waterJump: 10 };

export class Player {
  constructor(scene, world, effects, spawn) {
    this.world = world;
    this.effects = effects;
    this.onNotice = () => {};
    this.onStep = () => {}; // (地面材質, 速度) 每踏出一步
    this.onLand = () => {}; // (地面材質, 落下速度)
    this.walkMode = false;
    this.surface = 'grass';

    this.model = createCharacter(THEME.player.look);
    const tag = createNameplate(THEME.player.name, '#ffd27a');
    tag.position.y = 2.45;
    this.model.root.add(tag);
    scene.add(this.model.root);

    // 查克拉護罩（聚集查克拉時出現）
    this.aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.55, 2.4, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.aura.position.y = 1.1;
    this.model.root.add(this.aura);

    this.pos = new THREE.Vector3(spawn.x, getTerrainHeight(spawn.x, spawn.z), spawn.z);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;
    this.onGround = true;
    this.jumpsLeft = 1;
    this.onWater = false;
    this.swimming = false;
    this.sprinting = false;
    this.charging = false;
    this.dashTime = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector3();

    this.maxHp = 100;
    this.hp = 100;
    this.maxChakra = 100;
    this.chakra = 100;
    // 由 progress/progression.js 依能力值與裝備設定
    this.moveMul = 1;
    this.chakraRegenMul = 1;
    this.meleeMul = 1;
    this.defMul = 1;

    // 戰鬥狀態（由 combat/playerCombat.js 設定）
    this.dead = false;
    this.hurtTime = 0; // 受擊硬直
    this.invuln = 0; // 無敵時間
    this.action = null; // 目前的戰鬥動作 { type, t }
    this.moveScale = 1; // 出招時移動變慢
    this.faceAngle = null; // 出招時強制面向

    this.time = 0;
    this.phase = 0;
    this.fxTimer = 0;
    this.tmp = new THREE.Vector3();
  }

  // 地面材質：村裡鋪石板的路、野外泥土路、沙灘、草地
  surfaceAt(x, z, h) {
    if (inStream(x, z)) return 'water'; // 高原的淺溪
    if (h < 0.8) return 'sand';
    if (isRoad(x, z)) return Math.hypot(x, z) < VILLAGE_RADIUS ? 'stone' : 'dirt';
    return 'grass';
  }

  feet(yOff = 0) {
    return this.tmp.set(this.pos.x, this.pos.y + yOff, this.pos.z);
  }

  useChakra(amount) {
    if (this.chakra < amount) {
      this.onNotice('查克拉不足！');
      return false;
    }
    this.chakra -= amount;
    return true;
  }

  update(dt, input, camYaw) {
    this.time += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const stunned = this.dead || this.hurtTime > 0;

    // ---------- 輸入 → 移動方向（相對鏡頭） ----------
    let ix = 0, iz = 0;
    if (input.down('KeyW')) iz += 1;
    if (input.down('KeyS')) iz -= 1;
    if (input.down('KeyD')) ix += 1;
    if (input.down('KeyA')) ix -= 1;
    // Z 切換慢走／跑步
    if (input.pressed('KeyZ')) {
      this.walkMode = !this.walkMode;
      this.onNotice(this.walkMode ? '慢走模式' : '跑步模式');
    }
    // 觸控搖桿：輕推慢走、推一半跑步、推到底忍者跑
    let gaitSpeed = this.walkMode ? WALK_SPEED : RUN_SPEED;
    let stickSprint = false;
    if (input.analog.active) {
      ix = input.analog.x;
      iz = input.analog.y;
      const mag = Math.hypot(ix, iz);
      if (mag < 0.12) ix = iz = 0;
      stickSprint = mag > 0.92;
      gaitSpeed = mag > 0.55 ? RUN_SPEED : WALK_SPEED * clamp(mag / 0.45, 0.5, 1);
    }
    this.charging = input.down('KeyC') && this.onGround && !this.swimming && !stunned && !this.action;
    if (this.charging || stunned) ix = iz = 0;

    let dx = -Math.sin(camYaw) * iz + Math.cos(camYaw) * ix;
    let dz = -Math.cos(camYaw) * iz - Math.sin(camYaw) * ix;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    this.sprinting = (input.down('ShiftLeft') || input.down('ShiftRight') || stickSprint) && len > 0 && !this.swimming;
    const speed = (this.swimming ? SWIM_SPEED : this.sprinting ? SPRINT_SPEED : gaitSpeed) * this.moveScale * this.moveMul;

    // ---------- 衝刺技能（E） ----------
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (input.pressed('KeyE') && !stunned && this.dashCd <= 0 && !this.swimming && this.useChakra(COST.dash)) {
      this.dashTime = DASH_TIME;
      this.dashCd = 0.45;
      if (len > 0) this.dashDir.set(dx, 0, dz);
      else this.dashDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      this.effects.smoke(this.feet(1), 14, 0xf4f4f4, 0.45);
    }

    // ---------- 跳躍 / 二段跳 / 從水中躍出 ----------
    if (input.pressed('Space') && !stunned) {
      if (this.onGround && !this.swimming) {
        this.vel.y = JUMP_VEL;
        this.onGround = false;
      } else if (this.swimming) {
        if (this.useChakra(COST.waterJump)) {
          this.vel.y = JUMP_VEL;
          this.swimming = false;
          this.onGround = false;
          this.effects.ring(this.feet(-SWIM_Y), 0xffffff, 2.5);
        }
      } else if (this.jumpsLeft > 0 && this.useChakra(COST.doubleJump)) {
        this.vel.y = DOUBLE_JUMP_VEL;
        this.jumpsLeft--;
        this.effects.smoke(this.feet(0), 8, 0xffffff, 0.35, 0.6);
      }
    }

    // ---------- 速度 ----------
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vel.set(this.dashDir.x * DASH_SPEED, 0, this.dashDir.z * DASH_SPEED);
    } else {
      // 有慣性的加減速：起步要一點時間、停下會滑一小段；忍者跑起步更慢
      // 受擊或出招突進時降低加速度，擊退／衝刺速度才不會馬上被抵銷
      const curSpeed = Math.hypot(this.vel.x, this.vel.z);
      const speedingUp = speed > curSpeed + 0.1;
      const accel = this.hurtTime > 0 || this.action ? 3
        : !(this.onGround || this.swimming) ? 2.5
          : speedingUp ? (this.sprinting ? 3.5 : 7) : 9;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (dx * speed - this.vel.x) * k;
      this.vel.z += (dz * speed - this.vel.z) * k;
      this.vel.y -= GRAVITY * dt;
    }

    this.pos.addScaledVector(this.vel, dt);
    this.world.resolve(this.pos, 0.4);
    this.pos.x = clamp(this.pos.x, -HALF + 8, HALF - 8);
    this.pos.z = clamp(this.pos.z, -HALF + 8, HALF - 8);

    // ---------- 地面 / 水面 ----------
    const wasSwimming = this.swimming;
    let floor = this.world.floorAt(this.pos.x, this.pos.z, this.pos.y, getTerrainHeight(this.pos.x, this.pos.z));
    let surface = 'ground';
    if (floor < WATER_LEVEL) {
      if (this.chakra > 0 && !wasSwimming && this.pos.y >= WATER_LEVEL - 0.25) {
        floor = WATER_LEVEL; // 水面行走
        surface = 'water';
      } else if (floor < SWIM_Y) {
        floor = SWIM_Y;
        surface = 'swim';
      }
    }

    // 腳下的材質（給腳步聲、揚塵用）
    const terrainY = getTerrainHeight(this.pos.x, this.pos.z);
    this.surface = surface === 'water' || surface === 'swim' ? 'water'
      : floor > terrainY + 0.05 ? 'wood'
        : this.surfaceAt(this.pos.x, this.pos.z, terrainY);

    const wasOnGround = this.onGround;
    if (this.pos.y <= floor) {
      if (!wasOnGround && this.vel.y < -6) {
        this.onLand(this.surface, -this.vel.y);
        if (this.vel.y < -14) {
          if (surface === 'ground') this.effects.smoke(this.feet(0.1), 6, 0xd8c8a8, 0.4);
          else this.effects.ring(this.tmp.set(this.pos.x, WATER_LEVEL, this.pos.z), 0xffffff, 2.2);
        }
      }
      this.pos.y = floor;
      this.vel.y = 0;
      this.onGround = true;
    } else if (wasOnGround && this.vel.y <= 0 && this.pos.y - floor < 0.9) {
      this.pos.y = floor; // 下坡時貼地
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
    if (this.onGround) this.jumpsLeft = 1;

    this.onWater = this.onGround && surface === 'water';
    this.swimming = this.onGround && surface === 'swim';
    if (this.swimming && !wasSwimming && this.chakra <= 0) {
      this.onNotice('查克拉耗盡，掉進水裡了！');
      this.effects.ring(this.feet(-SWIM_Y), 0xffffff, 3);
    }

    // ---------- 查克拉 ----------
    if (this.onWater) this.chakra -= (this.sprinting ? 7 : 4) * dt;
    else if (this.charging) this.chakra += 35 * this.chakraRegenMul * dt;
    else if (this.onGround && !this.swimming) this.chakra += 3 * this.chakraRegenMul * dt;
    this.chakra = clamp(this.chakra, 0, this.maxChakra);

    // ---------- 特效 ----------
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.fxTimer -= dt;
    if (this.fxTimer <= 0) {
      if ((this.onWater || this.swimming) && hs > 1) {
        this.effects.ring(this.feet(this.swimming ? -SWIM_Y : 0), 0xffffff, 1.6);
        this.fxTimer = this.sprinting ? 0.12 : 0.25;
      } else if (this.charging) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          this.effects.spark(this.tmp.set(this.pos.x + Math.cos(a) * 0.8, this.pos.y + 0.1, this.pos.z + Math.sin(a) * 0.8));
        }
        this.fxTimer = 0.05;
      } else if (this.dashTime > 0) {
        this.effects.smoke(this.feet(1), 2, 0xffffff, 0.3, 0.3);
        this.fxTimer = 0.03;
      }
    }
    const auraTarget = this.charging ? 0.28 + Math.sin(this.time * 12) * 0.08 : 0;
    this.aura.material.opacity += (auraTarget - this.aura.material.opacity) * Math.min(1, dt * 10);
    this.aura.visible = this.aura.material.opacity > 0.01;
    this.aura.scale.setScalar(1 + Math.sin(this.time * 8) * 0.05);

    // ---------- 模型 ----------
    const prevFacing = this.facing;
    if (this.faceAngle !== null) {
      this.facing = lerpAngle(this.facing, this.faceAngle, 1 - Math.exp(-25 * dt));
    } else if (hs > 0.5 && !this.charging && !stunned) {
      // 跑越快轉身越慢，才有重量感
      const turnRate = this.sprinting ? 6 : hs > 4 ? 9 : 12;
      this.facing = lerpAngle(this.facing, Math.atan2(this.vel.x, this.vel.z), 1 - Math.exp(-turnRate * dt));
    }
    // 轉彎時身體往內側傾斜（速度越快傾斜越多）
    let dYaw = this.facing - prevFacing;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const bankTarget = this.onGround && dt > 0 ? clamp((-dYaw / dt) * hs * 0.012, -0.3, 0.3) : 0;
    this.bank = lerp(this.bank ?? 0, bankTarget, 1 - Math.exp(-8 * dt));
    // 加減速（給身體前傾／後仰）
    const accel = dt > 0 ? (hs - (this.prevHs ?? hs)) / dt : 0;
    this.prevHs = hs;
    this.accelSmooth = lerp(this.accelSmooth ?? 0, accel, 1 - Math.exp(-6 * dt));
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    // 倒下：往後躺平；無敵時閃爍
    this.model.root.rotation.x = lerp(this.model.root.rotation.x, this.dead ? -1.45 : 0, 1 - Math.exp(-8 * dt));
    if (this.dead) this.model.root.position.y += 0.2;
    this.model.root.visible = this.dead || this.invuln <= 0 || Math.floor(this.time * 20) % 2 === 0;
    // 步伐相位跟著實際移動距離走；每跨出一步（相位過半圈）觸發一次腳步
    const animSpeed = this.onGround ? Math.min(hs, SPRINT_SPEED) : 0;
    this.phase = advancePhase(this.phase, animSpeed, dt);
    const step = Math.floor((this.phase + Math.PI / 2) / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (this.onGround && hs > 0.8 && this.dashTime <= 0) {
        this.onStep(this.surface, hs);
        if (hs > 5 && (this.surface === 'dirt' || this.surface === 'sand')) {
          this.effects.smoke(this.feet(0.1), 2, this.surface === 'sand' ? 0xe0d0a0 : 0xc8a878, 0.22, 0.4);
        }
      }
    }
    animateCharacter(this.model, {
      phase: this.phase,
      speed: animSpeed,
      bank: this.bank,
      accel: this.accelSmooth,
      sprint: this.sprinting || this.dashTime > 0,
      airborne: !this.onGround,
      charging: this.charging,
      swimming: this.swimming,
      time: this.time,
      action: this.dead ? { type: 'down' } : this.hurtTime > 0 ? { type: 'hurt' } : this.action,
    }, dt);
  }
}
