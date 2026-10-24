import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';

// 輕量粒子：煙霧（衝刺、落地）、水波紋、查克拉光點
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1, 1);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 32);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  _add(mesh, data) {
    this.scene.add(mesh);
    this.items.push({ mesh, life: 0, ...data });
  }

  smoke(pos, count = 10, color = 0xf2f2f2, size = 0.5, spread = 1) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.puffGeo, toonMaterial({
        color, transparent: true, opacity: 0.85, depthWrite: false,
      }));
      mesh.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + (Math.random() - 0.5) * 0.6, pos.z + (Math.random() - 0.5) * 0.6);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      this._add(mesh, {
        vel: new THREE.Vector3((Math.random() - 0.5) * 4 * spread, Math.random() * 2.5, (Math.random() - 0.5) * 4 * spread),
        max: 0.5 + Math.random() * 0.4, size: size * (0.6 + Math.random() * 0.6), grow: 2.2, alpha: 0.85, drag: 3,
      });
    }
  }

  ring(pos, color = 0xffffff, size = 1.8, life = 0.8) {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    mesh.position.copy(pos);
    mesh.position.y += 0.03;
    this._add(mesh, { vel: new THREE.Vector3(), max: life, size: 0.3, grow: size / 0.3, alpha: 0.7, drag: 0 });
  }

  spark(pos, color = 0x6fd3ff) {
    const mesh = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mesh.position.copy(pos);
    this._add(mesh, {
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6),
      max: 0.6 + Math.random() * 0.4, size: 0.07, grow: -0.6, alpha: 0.9, drag: 0,
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.mesh.scale.setScalar(Math.max(0.001, p.size * (1 + p.grow * t)));
      p.mesh.material.opacity = p.alpha * (1 - t);
    }
  }
}
