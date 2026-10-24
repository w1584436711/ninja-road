import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { getTerrainHeight, WATER_LEVEL } from '../world/terrain.js';

// 第三人稱環繞鏡頭
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = 9;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.snapped = false;
  }

  handleInput(input) {
    this.yaw -= input.mouseDX * 0.0025;
    this.pitch = clamp(this.pitch + input.mouseDY * 0.0025, -0.4, 1.35);
    this.dist = clamp(this.dist + input.wheel * 0.01, 3.5, 24);
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
    const x = this.target.x + Math.sin(this.yaw) * cp * this.dist;
    const z = this.target.z + Math.cos(this.yaw) * cp * this.dist;
    let y = this.target.y + Math.sin(this.pitch) * this.dist;
    y = Math.max(y, getTerrainHeight(x, z) + 0.6, WATER_LEVEL + 0.3);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}
