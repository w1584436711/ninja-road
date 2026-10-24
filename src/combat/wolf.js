import * as THREE from 'three';
import { lerp } from '../core/math.js';

// 四足野狼模型。原點在腳底，面向 +Z。
export function createWolf(color = 0x6b6f78) {
  const fur = new THREE.MeshStandardMaterial({ color });
  const belly = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, -0.05, 0.15) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e });
  const eye = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  root.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.24, 0.62, 6, 12).rotateX(Math.PI / 2), fur);
  torso.scale.set(0.95, 1, 1);
  body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), fur, 0, 0.04, 0.32)); // 胸
  const chestFur = mesh(new THREE.SphereGeometry(0.2, 10, 8), belly, 0, -0.08, 0.42);
  chestFur.scale.set(1, 1.1, 0.7);
  body.add(chestFur);

  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.58);
  body.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.3, 0.27, 0.3), fur));
  head.add(mesh(new THREE.BoxGeometry(0.17, 0.13, 0.26), fur, 0, -0.05, 0.25)); // 口鼻
  head.add(mesh(new THREE.BoxGeometry(0.07, 0.05, 0.04), dark, 0, -0.01, 0.39)); // 鼻
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), fur, sx * 0.09, 0.2, -0.04);
    ear.rotation.z = -sx * 0.2;
    head.add(ear);
    head.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), eye, sx * 0.08, 0.04, 0.15));
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.11, 0.12);
  head.add(jaw);
  jaw.add(mesh(new THREE.BoxGeometry(0.14, 0.04, 0.22), belly, 0, 0, 0.1));

  const legGeo = new THREE.CapsuleGeometry(0.055, 0.36, 4, 8);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.15, 0.55, sz * 0.36);
    g.add(mesh(legGeo, fur, 0, -0.26, 0));
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), dark, 0, -0.5, 0.03));
    root.add(g);
    return g;
  });

  const tail = new THREE.Group();
  tail.position.set(0, 0.1, -0.45);
  body.add(tail);
  const tailMesh = mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), fur, 0, 0, -0.22);
  tailMesh.rotation.x = Math.PI / 2;
  tail.add(tailMesh);
  tail.rotation.x = -0.5;

  return { root, body, head, jaw, legs, tail };
}

// s: { phase, move(0..1), action: { type: 'bite' | 'hurt', t }, time }
export function animateWolf(w, s, dt) {
  const k = 1 - Math.exp(-14 * dt);
  const a = Math.sin(s.phase);
  const amp = s.move * 0.9;
  // 奔跑：對角線兩腳同步
  w.legs[0].rotation.x = lerp(w.legs[0].rotation.x, a * amp, k);
  w.legs[3].rotation.x = lerp(w.legs[3].rotation.x, a * amp, k);
  w.legs[1].rotation.x = lerp(w.legs[1].rotation.x, -a * amp, k);
  w.legs[2].rotation.x = lerp(w.legs[2].rotation.x, -a * amp, k);
  w.body.position.y = 0.62 + Math.abs(a) * 0.05 * s.move;
  w.tail.rotation.y = Math.sin(s.time * (s.move > 0.3 ? 4 : 2)) * 0.35;

  let headX = Math.sin(s.phase * 2) * 0.05 * s.move;
  let jawX = 0;
  let pitch = 0;
  if (s.action?.type === 'bite') {
    const t = s.action.t;
    if (t < 0.5) { headX = -0.35; pitch = -0.1; } else { headX = 0.25; jawX = 0.5; pitch = 0.12; }
  } else if (s.action?.type === 'hurt') {
    pitch = -0.25;
  } else if (s.action?.type === 'windup') {
    headX = 0.3; jawX = 0.35; pitch = 0.08; // 壓低身體、露牙
  }
  w.head.rotation.x = lerp(w.head.rotation.x, headX, k);
  w.jaw.rotation.x = lerp(w.jaw.rotation.x, jawX, k);
  w.body.rotation.x = lerp(w.body.rotation.x, pitch, k);
}
