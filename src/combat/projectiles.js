import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';
import { getTerrainHeight, WATER_LEVEL } from '../world/terrain.js';

// 飛行道具：苦無、爆炎球、裂風刃（純視覺）
export class Projectiles {
  constructor(combat) {
    this.c = combat;
    this.list = [];
    this.steel = toonMaterial({ color: 0xb8c0cc });
    this.grip = toonMaterial({ color: 0x2a2a30 });
    this.bladeGeo = new THREE.ConeGeometry(0.045, 0.3, 4).rotateX(Math.PI / 2);
    this.gripGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6).rotateX(Math.PI / 2);
    this.ringGeo = new THREE.TorusGeometry(0.03, 0.01, 6, 10);
    this.fireCore = new THREE.SphereGeometry(0.35, 16, 12);
    this.fireShell = new THREE.IcosahedronGeometry(0.6, 1);
    // 裂風刃：水平的弧形刀光，弧心朝 +Z（之後依飛行方向旋轉）
    this.windGeo = new THREE.TorusGeometry(1.6, 0.07, 6, 28, Math.PI * 0.7).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.15);
    this.tmp = new THREE.Vector3();
  }

  makeKunai() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(this.bladeGeo, this.steel);
    blade.position.z = 0.12;
    const grip = new THREE.Mesh(this.gripGeo, this.grip);
    grip.position.z = -0.08;
    const ring = new THREE.Mesh(this.ringGeo, this.grip);
    ring.position.z = -0.19;
    g.add(blade, grip, ring);
    return g;
  }

  makeFireball() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.fireCore, new THREE.MeshBasicMaterial({ color: 0xfff2b0 })));
    const shell = new THREE.Mesh(this.fireShell, new THREE.MeshBasicMaterial({
      color: 0xff7a1a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    g.add(shell);
    g.userData.shell = shell;
    return g;
  }

  // o: { kind, owner('player'|'enemy'), pos, dir, speed, damage, radius, gravity, life, aoe:{r,dmg}, kb }
  spawn(o) {
    const mesh = o.kind === 'kunai' ? this.makeKunai()
      : o.kind === 'fireball' ? this.makeFireball()
      : new THREE.Mesh(this.windGeo, new THREE.MeshBasicMaterial({
        color: 0xd8fff4, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    mesh.position.copy(o.pos);
    if (o.kind === 'wind') mesh.rotation.y = Math.atan2(o.dir.x, o.dir.z);
    this.c.scene.add(mesh);
    this.list.push({
      gravity: 0, life: 2.5, radius: 0.3, kb: 2, ...o,
      mesh, pos: mesh.position, vel: o.dir.clone().multiplyScalar(o.speed), age: 0, stuck: false, trail: 0,
    });
  }

  remove(i) {
    const p = this.list[i];
    this.c.scene.remove(p.mesh);
    p.mesh.traverse(o => { if (o.material && o.material !== this.steel && o.material !== this.grip) o.material.dispose(); });
    this.list.splice(i, 1);
  }

  impact(p, i) {
    const c = this.c;
    if (p.kind === 'fireball') {
      c.explode(p.pos, p.aoe.r, p.aoe.dmg, p.owner);
      this.remove(i);
    } else if (p.kind === 'kunai') {
      p.stuck = true; // 插在地上，兩秒後消失
      p.life = p.age + 2;
    }
  }

  update(dt) {
    const c = this.c;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age > p.life) {
        if (p.kind === 'fireball') this.impact(p, i);
        else this.remove(i);
        continue;
      }
      if (p.stuck) continue;

      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      if (p.kind === 'wind') {
        p.mesh.scale.setScalar(1 + p.age * 3);
        p.mesh.material.opacity = 0.85 * (1 - p.age / p.life);
        continue;
      }
      if (p.kind === 'kunai') {
        p.mesh.lookAt(this.tmp.copy(p.pos).add(p.vel));
      } else {
        p.mesh.rotation.y += dt * 8;
        p.mesh.userData.shell.scale.setScalar(1 + Math.sin(p.age * 30) * 0.08);
        if ((p.trail -= dt) <= 0) {
          c.effects.smoke(p.pos, 2, 0xff9a3a, 0.35, 0.3);
          p.trail = 0.03;
        }
      }

      // 命中判定
      let hit = false;
      if (p.owner === 'player') {
        for (const e of c.enemies.list) {
          if (!e.alive) continue;
          const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
          if (dx * dx + dz * dz < (e.def.radius + p.radius) ** 2 && p.pos.y > e.pos.y - p.radius && p.pos.y < e.pos.y + e.def.height + p.radius) {
            c.hitEnemy(e, p.damage, p.pos, p.kb);
            hit = true;
            break;
          }
        }
      } else {
        for (const t of c.targets) {
          const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
          if (dx * dx + dz * dz < (0.45 + p.radius) ** 2 && p.pos.y > t.pos.y && p.pos.y < t.pos.y + 1.9) {
            c.hitTarget(t, p.damage, p.pos);
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        if (p.kind === 'fireball') this.impact(p, i);
        else this.remove(i);
        continue;
      }

      // 撞到地面、水面或建築
      const ground = getTerrainHeight(p.pos.x, p.pos.z);
      const top = c.world.floorAt(p.pos.x, p.pos.z, 1e9, ground);
      if (p.pos.y < WATER_LEVEL && ground < WATER_LEVEL) {
        c.effects.ring(this.tmp.set(p.pos.x, WATER_LEVEL, p.pos.z), 0xffffff, 1.5);
        if (p.kind === 'fireball') c.effects.smoke(p.pos, 10, 0xeeeeee, 0.6, 1.5); // 蒸氣
        this.remove(i);
      } else if (p.pos.y < ground || p.pos.y < top) {
        this.impact(p, i);
      }
    }
  }
}
