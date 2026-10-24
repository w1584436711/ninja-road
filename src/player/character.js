import * as THREE from 'three';
import { lerp } from '../core/math.js';

// 程序化忍者角色。原點在腳底，面向 +Z。
// 四肢分兩節（大腿/小腿、上臂/前臂），膝蓋與手肘可以彎。
export function createCharacter(opts = {}) {
  const o = {
    skin: 0xf3cba5, jacket: 0x4a5a6a, pants: 0x3a3f48, shoulders: 0x2a2f38,
    hair: 0x2a1d14, eyes: 0x5a3a1a, spiky: true, band: true, whiskers: false,
    sandals: 0x1d1d22, vest: null, scarf: null,
    ...opts,
  };
  const mats = new Map();
  const M = c => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c }));
    return mats.get(c);
  };
  const mesh = (geo, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, color.isMaterial ? color : M(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const group = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();

  // ---------- 腿 ----------
  const thighGeo = new THREE.CapsuleGeometry(0.105, 0.3, 4, 10);
  const shinGeo = new THREE.CapsuleGeometry(0.088, 0.3, 4, 10);
  const footGeo = new THREE.CapsuleGeometry(0.075, 0.16, 4, 8).rotateX(Math.PI / 2);
  const legs = [-1, 1].map(side => {
    const hip = group(root, side * 0.12, 0.92, 0);
    hip.add(mesh(thighGeo, o.pants, 0, -0.21, 0));
    const knee = group(hip, 0, -0.44, 0);
    knee.add(mesh(shinGeo, o.pants, 0, -0.19, 0));
    knee.add(mesh(footGeo, o.sandals, 0, -0.42, 0.05));
    return { hip, knee };
  });

  // ---------- 軀幹 ----------
  const upper = group(root, 0, 0.92, 0);
  const torso = mesh(new THREE.CapsuleGeometry(0.22, 0.28, 6, 14), o.jacket, 0, 0.3, 0);
  torso.scale.set(1.05, 1, 0.72);
  upper.add(torso);
  const shoulder = mesh(new THREE.CapsuleGeometry(0.13, 0.36, 4, 10).rotateZ(Math.PI / 2), o.shoulders, 0, 0.53, 0);
  shoulder.scale.set(1, 0.85, 0.95);
  upper.add(shoulder);
  const tails = []; // 會隨速度往後飄的布條（護額綁帶、圍巾）
  if (o.scarf) {
    upper.add(mesh(new THREE.TorusGeometry(0.12, 0.06, 10, 20).rotateX(Math.PI / 2), o.scarf, 0, 0.65, 0));
    const scarfTail = new THREE.BoxGeometry(0.11, 0.55, 0.025).translate(0, -0.27, 0);
    for (const [sx, len] of [[-1, 1], [1, 0.75]]) {
      const pivot = group(upper, sx * 0.05, 0.64, -0.15);
      pivot.rotation.z = sx * 0.12;
      const t = mesh(scarfTail, o.scarf);
      t.scale.y = len;
      pivot.add(t);
      tails.push(pivot);
    }
  } else {
    upper.add(mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16).rotateX(Math.PI / 2), o.vest ? o.vest : 0xf4f4f4, 0, 0.64, 0));
  }
  if (o.vest) {
    const vest = mesh(new THREE.CapsuleGeometry(0.235, 0.22, 6, 14), o.vest, 0, 0.3, 0);
    vest.scale.set(1.08, 1, 0.8);
    upper.add(vest);
  } else {
    upper.add(mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), 0xf4f4f4, 0, 0.3, 0.165)); // 拉鍊
  }
  upper.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), o.skin, 0, 0.7, 0)); // 脖子

  // ---------- 頭 ----------
  const head = group(upper, 0, 0.92, 0);
  const skull = mesh(new THREE.SphereGeometry(0.25, 24, 18), o.skin);
  skull.scale.set(1, 1.05, 0.98);
  head.add(skull);

  // 動漫風大眼睛：眼白 + 虹膜 + 高光
  const eyeWhite = new THREE.SphereGeometry(0.05, 12, 10);
  const iris = new THREE.SphereGeometry(0.034, 12, 10);
  const shine = new THREE.SphereGeometry(0.011, 6, 6);
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = group(head, sx * 0.088, 0.0, 0.205);
    eyes.push(e);
    const w = mesh(eyeWhite, 0xffffff);
    w.scale.set(0.9, 1.25, 0.45);
    e.add(w);
    const ir = mesh(iris, o.eyes, 0, -0.004, 0.016);
    ir.scale.set(0.85, 1.25, 0.5);
    e.add(ir);
    e.add(mesh(shine, shineMat, sx * 0.01, 0.022, 0.032));
    // 眉毛
    const brow = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.01), 0x6b4a1f, sx * 0.088, 0.085, 0.228);
    brow.rotation.z = sx * -0.12;
    head.add(brow);
  }
  head.add(mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), 0x7a3a2a, 0, -0.12, 0.235)); // 嘴

  if (o.whiskers) {
    const wGeo = new THREE.BoxGeometry(0.075, 0.007, 0.006);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const w = mesh(wGeo, 0x5a3a2a, sx * 0.15, -0.045 - k * 0.025, 0.205 - 0.012 * Math.abs(k - 1));
        w.rotation.y = sx * 0.55;
        w.rotation.z = sx * (k - 1) * 0.12;
        head.add(w);
      }
    }
  }

  const hairMat = M(o.hair);
  if (o.spiky) {
    const spike = new THREE.ConeGeometry(0.085, 0.36, 6);
    const up = new THREE.Vector3(0, 1, 0);
    const rings = [[0.15, 12, 0], [0.55, 10, 0.3], [0.95, 7, 0.1], [1.35, 3, 0.5]];
    for (const [elev, n, off] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + off;
        const dir = new THREE.Vector3(Math.sin(a) * Math.cos(elev), Math.sin(elev), Math.cos(a) * Math.cos(elev)).normalize();
        if (dir.z > 0.45 && dir.y < 0.5) continue; // 露出臉
        dir.y += 0.25; // 整體往上翹
        dir.normalize();
        const s = mesh(spike, hairMat);
        s.position.copy(dir).multiplyScalar(0.24);
        s.quaternion.setFromUnitVectors(up, dir);
        s.scale.setScalar(0.85 + ((i * 7 + n) % 5) * 0.08);
        head.add(s);
      }
    }
    // 瀏海
    for (let i = -2; i <= 2; i++) {
      const b = mesh(spike, hairMat, i * 0.07, 0.13, 0.2);
      b.rotation.set(2.5, 0, i * 0.25);
      b.scale.set(0.8, 0.6, 0.8);
      head.add(b);
    }
    head.add(mesh(new THREE.SphereGeometry(0.262, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), hairMat));
  } else {
    const cap = mesh(new THREE.SphereGeometry(0.268, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    cap.rotation.x = -0.3;
    cap.position.z = -0.01;
    head.add(cap);
  }

  if (o.band) {
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x23408e, side: THREE.DoubleSide });
    head.add(mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.075, 28, 1, true), bandMat, 0, 0.1, 0));
    head.add(mesh(new THREE.BoxGeometry(0.2, 0.07, 0.025), new THREE.MeshStandardMaterial({ color: 0xd8dee6 }), 0, 0.1, 0.258));
    // 護額後面的綁帶（以綁結為軸，跑步時往後飄）
    const tailGeo = new THREE.BoxGeometry(0.045, 0.28, 0.012).translate(0, -0.14, 0);
    for (const sx of [-1, 1]) {
      const pivot = group(head, sx * 0.035, 0.1, -0.265);
      pivot.rotation.z = sx * 0.2;
      pivot.add(mesh(tailGeo, bandMat));
      tails.push(pivot);
    }
  }

  // ---------- 手臂 ----------
  const upperArmGeo = new THREE.CapsuleGeometry(0.068, 0.22, 4, 10);
  const foreArmGeo = new THREE.CapsuleGeometry(0.06, 0.2, 4, 10);
  const handGeo = new THREE.SphereGeometry(0.07, 10, 8);
  const arms = [-1, 1].map(side => {
    const shoulderJ = group(upper, side * 0.31, 0.53, 0);
    shoulderJ.add(mesh(upperArmGeo, o.jacket, 0, -0.14, 0));
    const elbow = group(shoulderJ, 0, -0.29, 0);
    elbow.add(mesh(foreArmGeo, o.jacket, 0, -0.13, 0));
    elbow.add(mesh(handGeo, o.skin, 0, -0.29, 0));
    return { shoulder: shoulderJ, elbow };
  });

  return {
    root, upper, head, eyes, tails, blinkAt: 1 + Math.random() * 3,
    legR: legs[0].hip, kneeR: legs[0].knee, legL: legs[1].hip, kneeL: legs[1].knee,
    armR: arms[0].shoulder, elbowR: arms[0].elbow, armL: arms[1].shoulder, elbowL: arms[1].elbow,
  };
}

function ease(obj, x, z, k) {
  obj.rotation.x = lerp(obj.rotation.x, x, k);
  obj.rotation.z = lerp(obj.rotation.z, z, k);
}

// 程序化動畫。s: { phase, move(0..1), sprint, airborne, charging, swimming, time }
export function animateCharacter(c, s, dt) {
  const k = 1 - Math.exp(-14 * dt);
  const sw = Math.sin(s.phase);
  // 往前擺的那隻腳膝蓋彎得多
  const bendL = Math.max(0, Math.sin(s.phase + 1.2));
  const bendR = Math.max(0, Math.sin(s.phase + 1.2 + Math.PI));
  let lean = 0;

  if (s.charging) {
    // 結印：雙手合在胸前，微微蹲低
    ease(c.armL, -1.15, -0.5, k); ease(c.armR, -1.15, 0.5, k);
    ease(c.elbowL, -1.0, 0, k); ease(c.elbowR, -1.0, 0, k);
    ease(c.legL, -0.25, 0.14, k); ease(c.legR, -0.25, -0.14, k);
    ease(c.kneeL, 0.5, 0, k); ease(c.kneeR, 0.5, 0, k);
    lean = 0.15;
  } else if (s.airborne) {
    ease(c.legL, -1.1, 0, k); ease(c.legR, -0.35, 0, k);
    ease(c.kneeL, 1.5, 0, k); ease(c.kneeR, 0.9, 0, k);
    ease(c.armL, 0.5, 0.75, k); ease(c.armR, 0.5, -0.75, k);
    ease(c.elbowL, -0.6, 0, k); ease(c.elbowR, -0.6, 0, k);
    lean = 0.25;
  } else if (s.sprint && s.move > 0.3) {
    // 經典忍者跑：前傾、雙手往後伸直
    ease(c.legL, sw * 1.15 - 0.2, 0, k); ease(c.legR, -sw * 1.15 - 0.2, 0, k);
    ease(c.kneeL, 0.2 + bendL * 1.6, 0, k); ease(c.kneeR, 0.2 + bendR * 1.6, 0, k);
    ease(c.armL, 1.3, 0.18, k); ease(c.armR, 1.3, -0.18, k);
    ease(c.elbowL, 0, 0, k); ease(c.elbowR, 0, 0, k);
    lean = 0.6;
  } else {
    const a = s.move * (s.swimming ? 0.5 : 0.75);
    ease(c.legL, sw * a, 0, k); ease(c.legR, -sw * a, 0, k);
    ease(c.kneeL, 0.08 + bendL * a * 1.1, 0, k); ease(c.kneeR, 0.08 + bendR * a * 1.1, 0, k);
    ease(c.armL, -sw * a * 0.8, 0.1, k); ease(c.armR, sw * a * 0.8, -0.1, k);
    ease(c.elbowL, -0.25 - a * 0.4, 0, k); ease(c.elbowR, -0.25 - a * 0.4, 0, k);
    lean = 0.08 * s.move;
  }
  c.upper.rotation.x = lerp(c.upper.rotation.x, lean, k);
  // 跑步時身體上下起伏
  const bob = s.move > 0.3 && !s.airborne ? Math.abs(sw) * 0.03 : 0;
  c.upper.position.y = 0.92 + Math.sin(s.time * 2.2) * 0.008 + bob;
  c.head.rotation.x = lerp(c.head.rotation.x, -lean * 0.5, k);

  // 眨眼：每隔幾秒閉眼 0.12 秒
  if (s.time > c.blinkAt + 0.12) c.blinkAt = s.time + 2 + Math.random() * 3;
  const closed = s.time > c.blinkAt;
  for (const e of c.eyes) e.scale.y = closed ? 0.12 : 1;

  // 護額綁帶：速度越快飄得越高，帶一點抖動
  const speed = s.airborne ? 1 : s.move * (s.sprint ? 1.4 : 0.6);
  for (const [i, t] of c.tails.entries()) {
    const flutter = Math.sin(s.time * 14 + i * 1.7) * 0.15 * speed;
    t.rotation.x = lerp(t.rotation.x, 0.15 + speed * 1.0 + flutter, 1 - Math.exp(-8 * dt));
  }
}
