import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { getTerrainHeight, WATER_LEVEL } from '../world/terrain.js';

// 第三人稱環繞鏡頭
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.26;
    this.dist = 7.5;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.snapped = false;
    this.shake = 0; // 震動強度，會自動衰減
  }

  handleInput(input) {
    this.yaw -= input.mouseDX * 0.0025;
    this.pitch = clamp(this.pitch + input.mouseDY * 0.0025, -0.4, 1.35);
    this.dist = clamp(this.dist + input.wheel * 0.01, 3.5, 24);
  }

  // 鏡頭與玩家之間若有樹幹，把鏡頭拉近到樹前面（水平距離）
  clearDistance(hDist) {
    if (!this.world) return hDist;
    const ox = this.target.x, oz = this.target.z;
    const dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
    let best = hDist;
    for (const c of this.world.circles) {
      if (c.top !== Infinity) continue;
      const rx = c.x - ox, rz = c.z - oz;
      const t = rx * dx + rz * dz; // 沿鏡頭方向的投影
      if (t < 0.5 || t > best + c.r) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      const r = c.r + 0.35;
      if (px * px + pz * pz < r * r) best = Math.max(1.5, Math.min(best, t - r));
    }
    return best;
  }

  update(dt, focus) {
    this.desired.copy(focus).y += 1.6;
    if (!this.snapped) {
      this.target.copy(this.desired);
      this.snapped = true;
    } else {
      this.target.lerp(this.desired, 1 - Math.exp(-15 * dt));
    }
    const cp = Math.cos(this.pitch);
    const dist = this.clearDistance(this.dist * cp) / (cp || 1);
    const x = this.target.x + Math.sin(this.yaw) * cp * dist;
    const z = this.target.z + Math.cos(this.yaw) * cp * dist;
    let y = this.target.y + Math.sin(this.pitch) * dist;
    y = Math.max(y, getTerrainHeight(x, z) + 0.6, WATER_LEVEL + 0.3);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
    if (this.shake > 0.001) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-10 * dt);
    }
  }
}
