import * as THREE from 'three';
import { lerp } from '../core/math.js';
import { mergeByMaterial } from '../core/merge.js';

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
  // body：動畫用的起伏與傾斜都加在這層，root 的位置交給外部控制
  const body = group(root, 0, 0, 0);

  // ---------- 腿 ----------
  const thighGeo = new THREE.CapsuleGeometry(0.105, 0.3, 4, 10);
  const shinGeo = new THREE.CapsuleGeometry(0.088, 0.3, 4, 10);
  const footGeo = new THREE.CapsuleGeometry(0.075, 0.16, 4, 8).rotateX(Math.PI / 2);
  const legs = [-1, 1].map(side => {
    const hip = group(body, side * 0.12, 0.92, 0);
    hip.add(mesh(thighGeo, o.pants, 0, -0.21, 0));
    const knee = group(hip, 0, -0.44, 0);
    knee.add(mesh(shinGeo, o.pants, 0, -0.19, 0));
    // 腳踝：讓腳掌可以貼地、蹬地、抬腳尖
    const ankle = group(knee, 0, -0.4, 0);
    ankle.add(mesh(footGeo, o.sandals, 0, -0.02, 0.06));
    return { hip, knee, ankle };
  });

  // ---------- 軀幹 ----------
  const upper = group(body, 0, 0.92, 0);
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

  // 斗笠（村長、旅人）
  if (o.hat) {
    const hat = mesh(new THREE.ConeGeometry(0.52, 0.28, 18), o.hat, 0, 0.3, 0);
    head.add(hat);
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

  // 武器握在 R 手（手肘群組裡，手臂往前時刀身朝前）
  if (o.weapon === 'sword') {
    const blade = mesh(new THREE.BoxGeometry(0.05, 0.85, 0.11), 0xd8dde4, 0, -0.78, 0);
    const guard = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.16), 0x3a2a1a, 0, -0.35, 0);
    arms[0].elbow.add(blade, guard);
  }

  // 每個關節底下的零件依材質合併（例如頭上三十根頭髮變成一個），大幅減少繪製次數
  const joints = [];
  root.traverse(o => { if (o.children.filter(ch => ch.isMesh).length > 1) joints.push(o); });
  joints.forEach(mergeByMaterial);
  // 很小的零件（眼睛、眉毛、手）的影子看不出來，不畫影子省效能
  root.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere.radius < 0.1) o.castShadow = false;
  });

  return {
    root, body, upper, head, eyes, tails, blinkAt: 1 + Math.random() * 3,
    legR: legs[0].hip, kneeR: legs[0].knee, ankleR: legs[0].ankle,
    legL: legs[1].hip, kneeL: legs[1].knee, ankleL: legs[1].ankle,
    armR: arms[0].shoulder, elbowR: arms[0].elbow, armL: arms[1].shoulder, elbowL: arms[1].elbow,
  };
}

// 戰鬥動作：覆蓋基本姿勢。a = { type, t(0..1) }。回傳 [前傾, 上身扭轉]
function applyAction(c, a, dt, lean) {
  const k = 1 - Math.exp(-30 * dt);
  const t = a.t ?? 0;
  switch (a.type) {
    case 'punch1': // 右直拳
      ease(c.armR, -1.6, -0.1, k); ease(c.elbowR, -0.05, 0, k);
      ease(c.armL, 0.4, 0.25, k); ease(c.elbowL, -1.3, 0, k);
      return [0.3, 0.5];
    case 'punch2': // 左鉤拳
      ease(c.armL, -1.6, 0.1, k); ease(c.elbowL, -0.05, 0, k);
      ease(c.armR, 0.4, -0.25, k); ease(c.elbowR, -1.3, 0, k);
      return [0.3, -0.5];
    case 'kick': // 迴旋踢
      ease(c.legR, -1.75, 0, k); ease(c.kneeR, 0.1, 0, k);
      ease(c.legL, 0.15, 0, k); ease(c.kneeL, 0.35, 0, k);
      if (c.ankleR) { ease(c.ankleR, 0.4, 0, k); ease(c.ankleL, -0.5, 0, k); }
      ease(c.armL, 0.3, 0.9, k); ease(c.armR, 0.3, -0.9, k);
      return [-0.25, 0.3];
    case 'throw':
      if (t < 0.35) { ease(c.armR, 0.9, -0.2, k); ease(c.elbowR, -1.4, 0, k); return [0, 0.5]; }
      ease(c.armR, -1.4, -0.05, k); ease(c.elbowR, -0.1, 0, k);
      return [0.25, -0.35];
    case 'seal': { // 結印：雙手在胸前快速變換
      const j = Math.sin(t * Math.PI * 4) * 0.15;
      ease(c.armL, -1.15 + j, -0.55, k); ease(c.armR, -1.15 - j, 0.55, k);
      ease(c.elbowL, -1.1, 0, k); ease(c.elbowR, -1.1, 0, k);
      return [0.1, 0];
    }
    case 'cast': // 忍術發動：雙手往前推
      ease(c.armL, -1.5, 0.15, k); ease(c.armR, -1.5, -0.15, k);
      ease(c.elbowL, 0, 0, k); ease(c.elbowR, 0, 0, k);
      return [0.2, 0];
    case 'slash': // 揮刀：舉高再劈下
      if (t < 0.5) { ease(c.armR, -2.7, -0.1, k); ease(c.elbowR, -0.3, 0, k); return [-0.1, 0.3]; }
      ease(c.armR, -0.7, -0.1, k); ease(c.elbowR, 0, 0, k);
      return [0.35, -0.2];
    case 'hurt':
      ease(c.armL, 0.5, 0.6, k); ease(c.armR, 0.5, -0.6, k);
      return [-0.4, 0];
    case 'down':
      ease(c.armL, 0.2, 0.9, k); ease(c.armR, 0.2, -0.9, k);
      ease(c.legL, -0.1, 0.1, k); ease(c.legR, -0.1, -0.1, k);
      return [0, 0];
    default:
      return [lean, 0];
  }
}

function ease(obj, x, z, k) {
  obj.rotation.x = lerp(obj.rotation.x, x, k);
  obj.rotation.z = lerp(obj.rotation.z, z, k);
}

// 依速度算出一個完整步伐（左右各一步）的長度，讓腳步和移動距離同步、不會滑步
export const strideLength = speed => 0.8 + 0.45 * speed;

// 依移動距離推進步伐相位
export function advancePhase(phase, speed, dt, scale = 1) {
  return phase + (speed * dt / (strideLength(speed) * scale)) * Math.PI * 2;
}

// 一條腿的步態。ph：這條腿的相位；sin(ph) > 0 代表腿在身後
function gaitLeg(hip, knee, ankle, ph, amp, offset, kneeSwing, kneeStance, moving, k) {
  const thigh = offset + amp * Math.sin(ph);
  const swing = Math.max(0, -Math.cos(ph)); // 往前擺的階段（0..1）
  const kneeA = (kneeStance + kneeSwing * swing ** 1.5) * moving + 0.03;
  // 著地時腳掌平貼地面；蹬地時腳尖下壓；往前擺時腳尖上翹
  const flat = -(thigh + kneeA);
  const pushOff = Math.max(0, Math.sin(ph) - 0.4) * 0.6 * moving;
  const ankleA = swing > 0 ? flat * 0.5 - 0.3 * swing * moving : flat + pushOff;
  ease(hip, thigh, 0, k);
  ease(knee, kneeA, 0, k);
  if (ankle) ease(ankle, ankleA, 0, k);
}

// 程序化動畫。
// s: { phase, speed(公尺/秒), sprint, airborne, charging, swimming, time, bank(轉彎傾斜), accel(加減速), action }
// 舊呼叫方式只給 move(0..1) 也可以，會換算成速度
export function animateCharacter(c, s, dt) {
  const k = 1 - Math.exp(-14 * dt);
  const kf = 1 - Math.exp(-22 * dt); // 腿要跟得上步伐，用比較快的平滑
  const speed = s.speed ?? (s.move ?? 0) * 6;
  const p = s.phase;
  const sw = Math.sin(p);
  const moving = Math.min(1, speed / 1.2); // 0 靜止 → 1 移動中
  const g = speed < 2.6 ? 0 : speed > 5.5 ? 1 : ((speed - 2.6) / 2.9) ** 2 * (3 - 2 * (speed - 2.6) / 2.9); // 走→跑
  let lean = 0;
  let twist = 0;
  let bob = 0;
  let sway = 0;

  if (s.charging) {
    // 結印：雙手合在胸前，微微蹲低
    ease(c.armL, -1.15, -0.5, k); ease(c.armR, -1.15, 0.5, k);
    ease(c.elbowL, -1.0, 0, k); ease(c.elbowR, -1.0, 0, k);
    ease(c.legL, -0.25, 0.14, k); ease(c.legR, -0.25, -0.14, k);
    ease(c.kneeL, 0.5, 0, k); ease(c.kneeR, 0.5, 0, k);
    if (c.ankleL) { ease(c.ankleL, -0.25, 0, k); ease(c.ankleR, -0.25, 0, k); }
    lean = 0.15;
  } else if (s.airborne) {
    ease(c.legL, -1.1, 0, k); ease(c.legR, -0.35, 0, k);
    ease(c.kneeL, 1.5, 0, k); ease(c.kneeR, 0.9, 0, k);
    if (c.ankleL) { ease(c.ankleL, 0.35, 0, k); ease(c.ankleR, 0.3, 0, k); }
    ease(c.armL, 0.5, 0.75, k); ease(c.armR, 0.5, -0.75, k);
    ease(c.elbowL, -0.6, 0, k); ease(c.elbowR, -0.6, 0, k);
    lean = 0.25;
  } else if (s.sprint && moving > 0.3) {
    // 忍者跑：大幅前傾、雙手往後伸直、步伐很大
    gaitLeg(c.legL, c.kneeL, c.ankleL, p, 1.1, -0.25, 1.8, 0.35, 1, kf);
    gaitLeg(c.legR, c.kneeR, c.ankleR, p + Math.PI, 1.1, -0.25, 1.8, 0.35, 1, kf);
    ease(c.armL, 1.3, 0.18, k); ease(c.armR, 1.3, -0.18, k);
    ease(c.elbowL, 0, 0, k); ease(c.elbowR, 0, 0, k);
    lean = 0.6;
    bob = -Math.cos(p * 2) * 0.05;
  } else {
    // 走路／跑步：依速度在兩種步態之間混合
    const amp = lerp(0.42, 0.8, g) * moving * (s.swimming ? 0.6 : 1);
    const off = -0.1 * g * moving; // 跑步時腳往前伸
    gaitLeg(c.legL, c.kneeL, c.ankleL, p, amp, off, lerp(0.95, 1.75, g), lerp(0.06, 0.3, g), moving, kf);
    gaitLeg(c.legR, c.kneeR, c.ankleR, p + Math.PI, amp, off, lerp(0.95, 1.75, g), lerp(0.06, 0.3, g), moving, kf);
    // 手臂和同側的腳反向擺動；跑步時手肘彎成九十度
    const armA = lerp(0.32, 0.75, g) * moving;
    const elbow = -lerp(0.18, 1.35, g) * moving - 0.12;
    ease(c.armL, -sw * armA, lerp(0.08, 0.14, g), kf); ease(c.armR, sw * armA, -lerp(0.08, 0.14, g), kf);
    ease(c.elbowL, elbow - Math.max(0, -sw) * 0.25 * moving, 0, kf);
    ease(c.elbowR, elbow - Math.max(0, sw) * 0.25 * moving, 0, kf);
    lean = lerp(0.04, 0.2, g) * moving;
    // 肩膀和骨盆反向扭轉
    twist = -sw * lerp(0.1, 0.18, g) * moving;
    // 走路時在腳步交錯的瞬間重心最高；跑步則是著地時最低、騰空時最高
    bob = lerp(Math.cos(p * 2) * 0.025, -Math.cos(p * 2) * 0.055, g) * moving;
    // 重心左右移到支撐腳
    sway = sw * lerp(0.035, 0.02, g) * moving;
  }
  // 加速時身體前傾、煞車時後仰
  lean += Math.max(-0.15, Math.min(0.15, (s.accel ?? 0) * 0.02));
  if (s.action) [lean, twist] = applyAction(c, s.action, dt, lean);

  c.upper.rotation.y = lerp(c.upper.rotation.y, twist, 1 - Math.exp(-25 * dt));
  c.upper.rotation.x = lerp(c.upper.rotation.x, lean, k);
  c.upper.position.y = 0.92 + (moving < 0.2 ? Math.sin(s.time * 2.2) * 0.008 : 0);
  c.body.position.y = lerp(c.body.position.y, bob, kf); // 整個身體一起起伏
  c.body.rotation.z = lerp(c.body.rotation.z, sway + (s.bank ?? 0), k);
  c.head.rotation.x = lerp(c.head.rotation.x, -lean * 0.5, k);

  // 眨眼：每隔幾秒閉眼 0.12 秒
  if (s.time > c.blinkAt + 0.12) c.blinkAt = s.time + 2 + Math.random() * 3;
  const closed = s.time > c.blinkAt;
  for (const e of c.eyes) e.scale.y = closed ? 0.12 : 1;

  // 護額綁帶、圍巾：速度越快飄得越高，帶一點抖動
  const wind = s.airborne ? 1 : Math.min(1.4, speed / 10);
  for (const [i, t] of c.tails.entries()) {
    const flutter = Math.sin(s.time * 14 + i * 1.7) * 0.15 * wind;
    t.rotation.x = lerp(t.rotation.x, 0.15 + wind * 1.0 + flutter, 1 - Math.exp(-8 * dt));
  }
}
