import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';
import { getTerrainHeight, WATER_LEVEL } from '../world/terrain.js';

const glow = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
});

// 飛行道具。kind：kunai 苦無／fire 火球／thunder 雷槍／water 水彈／wind、wave 純視覺的刀光與水浪
export class Projectiles {
  constructor(combat) {
    this.c = combat;
    this.list = [];
    this.steel = toonMaterial({ color: 0xb8c0cc });
    this.grip = toonMaterial({ color: 0x2a2a30 });
    this.shared = new Set([this.steel, this.grip]);
    this.geo = {
      blade: new THREE.ConeGeometry(0.045, 0.3, 4).rotateX(Math.PI / 2),
      grip: new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6).rotateX(Math.PI / 2),
      ring: new THREE.TorusGeometry(0.03, 0.01, 6, 10),
      core: new THREE.SphereGeometry(0.35, 16, 12),
      shell: new THREE.IcosahedronGeometry(0.6, 1),
      bolt: new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6).rotateX(Math.PI / 2),
      boltGlow: new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8).rotateX(Math.PI / 2),
      // 水平弧形，弧心朝 +Z（之後依飛行方向旋轉）
      arc: new THREE.TorusGeometry(1.6, 0.07, 6, 28, Math.PI * 0.7).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.15),
      wave: new THREE.TorusGeometry(1.8, 0.22, 8, 28, Math.PI * 0.8).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.2),
    };
    this.tmp = new THREE.Vector3();
  }

  makeMesh(kind) {
    const g = new THREE.Group();
    const add = (geo, mat, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.z = z;
      g.add(m);
      return m;
    };
    switch (kind) {
      case 'kunai':
        add(this.geo.blade, this.steel, 0.12);
        add(this.geo.grip, this.grip, -0.08);
        add(this.geo.ring, this.grip, -0.19);
        break;
      case 'fire':
        add(this.geo.core, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
        g.userData.pulse = add(this.geo.shell, glow(0xff7a1a, 0.75));
        break;
      case 'thunder':
        add(this.geo.bolt, new THREE.MeshBasicMaterial({ color: 0xfffbe0 }));
        g.userData.pulse = add(this.geo.boltGlow, glow(0x9ad8ff, 0.6));
        break;
      case 'water':
        add(this.geo.core, new THREE.MeshBasicMaterial({ color: 0xd8f2ff }));
        g.userData.pulse = add(this.geo.shell, new THREE.MeshBasicMaterial({ color: 0x3a9cff, transparent: true, opacity: 0.7, depthWrite: false }));
        break;
      case 'wind':
        add(this.geo.arc, glow(0xd8fff4, 0.85));
        break;
      case 'wave':
        add(this.geo.wave, new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.8, depthWrite: false }));
        break;
    }
    return g;
  }

  // o: { kind, owner('player'|'enemy'|'none'), pos, dir, speed, damage, radius, gravity, life, aoe:{r,dmg}, kb, pierce }
  spawn(o) {
    const mesh = this.makeMesh(o.kind);
    mesh.position.copy(o.pos);
    mesh.rotation.y = Math.atan2(o.dir.x, o.dir.z);
    this.c.scene.add(mesh);
    this.list.push({
      gravity: 0, life: 2.5, radius: 0.3, kb: 2, ...o,
      mesh, pos: mesh.position, vel: o.dir.clone().multiplyScalar(o.speed), age: 0, stuck: false, trail: 0, hitSet: new Set(),
    });
  }

  remove(i) {
    const p = this.list[i];
    this.c.scene.remove(p.mesh);
    p.mesh.traverse(o => { if (o.material && !this.shared.has(o.material)) o.material.dispose(); });
    this.list.splice(i, 1);
  }

  // 撞到東西：有範圍傷害的爆開，苦無插在原地兩秒
  impact(p, i) {
    if (p.aoe) {
      this.c.explode(p.pos, p.aoe.r, p.aoe.dmg, p.owner, p.kind);
      this.remove(i);
    } else if (p.kind === 'kunai') {
      p.stuck = true;
      p.life = p.age + 2;
    } else {
      this.c.effects.smoke(p.pos, 6, p.kind === 'thunder' ? 0xfff2a0 : 0xd8f2ff, 0.3, 1);
      this.remove(i);
    }
  }

  update(dt) {
    const c = this.c;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age > p.life) {
        if (p.aoe) this.impact(p, i);
        else this.remove(i);
        continue;
      }
      if (p.stuck) continue;

      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      if (p.kind === 'wind' || p.kind === 'wave') {
        p.mesh.scale.setScalar(1 + p.age * 3);
        p.mesh.children[0].material.opacity = 0.85 * (1 - p.age / p.life);
        if (p.kind === 'wave' && (p.trail -= dt) <= 0) {
          c.effects.smoke(p.pos, 3, 0xbfe6ff, 0.35, 1.2);
          p.trail = 0.04;
        }
        continue;
      }
      p.mesh.lookAt(this.tmp.copy(p.pos).add(p.vel));
      const pulse = p.mesh.userData.pulse;
      if (pulse) {
        pulse.scale.setScalar(1 + Math.sin(p.age * 30) * 0.1);
        if ((p.trail -= dt) <= 0) {
          const col = p.kind === 'fire' ? 0xff9a3a : p.kind === 'thunder' ? 0xfff2a0 : 0x8ccfff;
          c.effects.smoke(p.pos, 2, col, p.kind === 'thunder' ? 0.15 : 0.3, 0.3);
          p.trail = 0.03;
        }
      }

      // 命中判定
      let hit = false;
      if (p.owner === 'player') {
        for (const e of c.enemies.list) {
          if (!e.alive || p.hitSet.has(e)) continue;
          const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
          if (dx * dx + dz * dz < (e.def.radius + p.radius) ** 2 && p.pos.y > e.pos.y - p.radius && p.pos.y < e.pos.y + e.def.height + p.radius) {
            c.hitEnemy(e, p.damage, p.pos, p.kb);
            p.hitSet.add(e);
            if (!p.pierce) {
              hit = true;
              break;
            }
          }
        }
      } else if (p.owner === 'enemy') {
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
        if (p.kind === 'kunai') this.remove(i);
        else this.impact(p, i);
        continue;
      }

      // 撞到地面、水面或建築
      const ground = getTerrainHeight(p.pos.x, p.pos.z);
      const top = c.world.floorAt(p.pos.x, p.pos.z, 1e9, ground);
      if (p.pos.y < WATER_LEVEL && ground < WATER_LEVEL) {
        c.effects.ring(this.tmp.set(p.pos.x, WATER_LEVEL, p.pos.z), 0xffffff, 1.5);
        if (p.kind === 'fire') c.effects.smoke(p.pos, 10, 0xeeeeee, 0.6, 1.5); // 蒸氣
        this.remove(i);
      } else if (p.pos.y < ground || p.pos.y < top) {
        this.impact(p, i);
      }
    }
  }
}
