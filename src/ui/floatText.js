import * as THREE from 'three';

// 3D 位置上浮出的文字：傷害數字、經驗值、驚嘆號
export class FloatText {
  constructor(camera) {
    this.camera = camera;
    this.layer = document.getElementById('floaters');
    this.items = [];
    this.v = new THREE.Vector3();
  }

  spawn(text, pos, cls = '') {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.layer.append(el);
    this.items.push({ el, pos: pos.clone(), t: 0, life: cls === 'exp' ? 1.4 : 0.9, dx: (Math.random() - 0.5) * 40 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      if (f.t >= f.life) {
        f.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      this.v.copy(f.pos);
      this.v.y += f.t * 1.4;
      this.v.project(this.camera);
      if (this.v.z > 1) {
        f.el.style.opacity = 0;
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * innerWidth + f.dx * f.t;
      const y = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const pop = f.t < 0.1 ? 1.4 - f.t * 4 : 1;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
      f.el.style.opacity = Math.min(1, (f.life - f.t) / 0.3);
    }
  }
}
