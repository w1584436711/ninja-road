import * as THREE from 'three';
import { mulberry32, smoothstep, clamp, lerp } from '../core/math.js';
import { HALF } from './terrain.js';

// 天空、日夜循環與天氣。太陽由東（+X）升起、經南方（+Z）、往西落下；夜裡由月光照明。
export const DAY_LENGTH = 1200; // 遊戲中一整天的長度（秒）
export const HORIZON_COLOR = 0xcfe8ff;

const C = hex => new THREE.Color(hex);
const PALETTE = {
  day: { top: C(0x2f7fe0), bottom: C(HORIZON_COLOR), light: C(0xfff1d6), hemiSky: C(0xd6ecff), hemiGround: C(0x55663a) },
  dusk: { top: C(0x3a4f8f), bottom: C(0xf2a070), light: C(0xffa060), hemiSky: C(0xf0b090), hemiGround: C(0x4a3a3a) },
  night: { top: C(0x060c1f), bottom: C(0x17264a), light: C(0x8aa4ff), hemiSky: C(0x34447a), hemiGround: C(0x141826) },
  storm: { top: C(0x5a6472), bottom: C(0x9aa4b0) },
};

export const WEATHER = {
  clear: { cloud: 0, rain: 0, label: '晴', weight: 0.55 },
  cloudy: { cloud: 0.75, rain: 0, label: '多雲', weight: 0.3 },
  rain: { cloud: 1, rain: 1, label: '雨', weight: 0.15 },
};

const domeVertex = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const domeFragment = /* glsl */`
  uniform vec3 top;
  uniform vec3 bottom;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunAmount;
  uniform float starAmount;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);
    float t = clamp(dir.y * 1.8 + 0.05, 0.0, 1.0);
    vec3 col = mix(bottom, top, t);

    // 太陽：圓盤＋光暈（靠近地平線時光暈更大）
    float sd = max(dot(dir, sunDir), 0.0);
    float low = 1.0 - smoothstep(0.0, 0.4, sunDir.y);
    col += sunColor * sunAmount * (smoothstep(0.9993, 0.9996, sd) * 6.0 + pow(sd, 64.0) * 0.5 + pow(sd, 5.0) * 0.25 * low);

    // 月亮在太陽正對面
    float md = max(dot(dir, -sunDir), 0.0);
    col += vec3(0.92, 0.95, 1.0) * starAmount * (smoothstep(0.9988, 0.9992, md) * 2.5 + pow(md, 300.0) * 0.35);

    // 星星：把方向切成小格子，少數格子亮起並閃爍
    vec3 cell = floor(dir * 320.0);
    float h = hash(cell);
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + h * 50.0);
    col += step(0.9975, h) * twinkle * starAmount * smoothstep(0.0, 0.25, dir.y) * 1.4;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export class Sky {
  constructor(scene, quality, time) {
    this.scene = scene;
    this.fogFar = quality.fogFar;
    this.sunDir = new THREE.Vector3(); // 給水面等材質共用
    this.waterTint = new THREE.Color(1, 1, 1);
    this.light = 1; // 整體亮度 0..1，給其他系統參考

    const params = new URLSearchParams(location.search);
    this.hour = Number(params.get('hour') ?? 8) % 24;
    this.weatherName = WEATHER[params.get('weather')] ? params.get('weather') : 'clear';
    this.weatherTimer = 180 + Math.random() * 180;
    this.cloud = WEATHER[this.weatherName].cloud;
    this.rain = WEATHER[this.weatherName].rain;

    // 天空球
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
        sunDir: { value: this.sunDir }, sunColor: { value: new THREE.Color() },
        sunAmount: { value: 1 }, starAmount: { value: 0 }, uTime: time,
      },
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.domeMat);
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    // 光源：同一盞平行光白天當太陽、夜裡當月亮
    this.hemi = new THREE.HemisphereLight();
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 1; s.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.lightDir = new THREE.Vector3();

    this.createClouds();
    this.createRain(quality.rainDrops);
    this.glow = [];
    this.update(0, new THREE.Vector3(), new THREE.Vector3());
  }

  createClouds() {
    const rng = mulberry32(77);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa });
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    this.clouds = [];
    for (let i = 0; i < 50; i++) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) {
        const p = new THREE.Mesh(puffGeo, this.cloudMat);
        const sc = 8 + rng() * 8;
        p.scale.set(sc, sc * 0.6, sc);
        p.position.set((j - n / 2) * 9 + rng() * 4, rng() * 4, rng() * 8 - 4);
        cloud.add(p);
      }
      cloud.position.set((rng() * 2 - 1) * HALF * 1.4, 120 + rng() * 50, (rng() * 2 - 1) * HALF * 1.4);
      cloud.userData.speed = 2 + rng() * 3;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  createRain(count) {
    this.rainCount = count;
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 60, z = (Math.random() - 0.5) * 60, y = Math.random() * 40;
      pos.set([x, y, z, x + 0.08, y + 0.9, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xb8c8e0, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  // toonify 之後呼叫：收集夜裡會發光的窗戶、燈籠
  collectGlow(root) {
    const seen = new Set();
    root.traverse(o => {
      if (!o.isMesh || !o.userData.glow || seen.has(o.material)) return;
      seen.add(o.material);
      this.glow.push({ mat: o.material, kind: o.userData.glow });
    });
  }

  // 雲朵材質在 toonify 後會被換掉，從場景裡取回目前的材質
  refreshCloudMaterial() {
    this.cloudMat = this.clouds[0].children[0].material;
  }

  setWeather(name) {
    if (!WEATHER[name]) return;
    this.weatherName = name;
    this.weatherTimer = 180 + Math.random() * 240;
  }

  advanceHours(h) {
    this.hour = (this.hour + h) % 24;
  }

  get weather() { return WEATHER[this.weatherName]; }
  get isNight() { return this.sunDir.y < -0.02; }

  pickWeather() {
    let r = Math.random();
    for (const [name, w] of Object.entries(WEATHER)) {
      if ((r -= w.weight) <= 0) return name;
    }
    return 'clear';
  }

  update(dt, focus, cameraPos) {
    // ---------- 時間與天氣 ----------
    this.hour = (this.hour + (dt * 24) / DAY_LENGTH) % 24;
    if ((this.weatherTimer -= dt) <= 0) this.setWeather(this.pickWeather());
    const w = this.weather;
    const k = 1 - Math.exp(-dt / 8); // 天氣約 20 秒轉換完成
    this.cloud = lerp(this.cloud, w.cloud, k);
    this.rain = lerp(this.rain, w.rain, k);
    const cloud = this.cloud, rain = this.rain;

    const a = ((this.hour - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.45).normalize();
    const e = this.sunDir.y;
    const day = smoothstep(0.0, 0.3, e);
    const night = 1 - smoothstep(-0.22, -0.02, e);
    const dusk = Math.max(0, 1 - day - night);

    // 依白天／黃昏／夜晚的權重混合三組顏色
    const mix3 = (key, out) => {
      const a = PALETTE.day[key], b = PALETTE.dusk[key], c = PALETTE.night[key];
      return out.setRGB(
        a.r * day + b.r * dusk + c.r * night,
        a.g * day + b.g * dusk + c.g * night,
        a.b * day + b.b * dusk + c.b * night,
      );
    };

    // ---------- 天空顏色 ----------
    const u = this.domeMat.uniforms;
    mix3('top', u.top.value);
    mix3('bottom', u.bottom.value);
    const bright = day + dusk * 0.6 + night * 0.12;
    const stormK = cloud * 0.75;
    u.top.value.lerp(this.tmpColor(PALETTE.storm.top, bright), stormK);
    u.bottom.value.lerp(this.tmpColor(PALETTE.storm.bottom, bright), stormK);
    mix3('light', u.sunColor.value);
    u.sunAmount.value = smoothstep(-0.1, 0.02, e) * (1 - cloud * 0.9);
    u.starAmount.value = night * (1 - cloud);
    this.dome.position.copy(cameraPos);

    this.scene.fog.color.copy(u.bottom.value);
    this.scene.fog.far = this.fogFar * (1 - 0.45 * rain);
    this.scene.fog.near = this.scene.fog.far * (0.25 - 0.15 * rain);

    // ---------- 光源 ----------
    const sunUp = e > -0.04;
    this.lightDir.copy(this.sunDir);
    if (!sunUp) this.lightDir.negate(); // 月光
    this.lightDir.y = Math.max(this.lightDir.y, 0.15);
    this.lightDir.normalize();
    this.sun.color.copy(sunUp ? u.sunColor.value : PALETTE.night.light);
    this.sun.intensity = sunUp
      ? (2.3 * day + 1.3 * dusk * smoothstep(-0.04, 0.05, e)) * (1 - 0.65 * cloud)
      : 0.45 * night * (1 - 0.5 * cloud);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 160);

    mix3('hemiSky', this.hemi.color);
    mix3('hemiGround', this.hemi.groundColor);
    this.hemi.intensity = (1.1 * day + 0.8 * dusk + 0.5 * night) * (1 - 0.25 * cloud);
    this.light = clamp(day + dusk * 0.5, 0, 1) * (1 - 0.4 * cloud);

    // 水面（不受光照的自訂材質）跟著天色變暗
    this.waterTint.setRGB(1, 1, 1).lerp(new THREE.Color(0.22, 0.27, 0.45), night).multiplyScalar(1 - 0.3 * cloud);

    // ---------- 雲 ----------
    const visible = 18 + Math.round(cloud * 32);
    this.clouds.forEach((c, i) => {
      c.visible = i < visible;
      c.position.x += c.userData.speed * (1 + cloud) * dt;
      if (c.position.x > HALF * 1.5) c.position.x = -HALF * 1.5;
    });
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0x8a909a), cloud);
    this.cloudMat.emissive.setHex(0x8899aa).multiplyScalar(bright * (1 - 0.5 * cloud));

    // ---------- 夜間燈光 ----------
    const lightsOn = Math.max(1 - smoothstep(-0.05, 0.15, e), rain * 0.5);
    for (const g of this.glow) {
      if (g.kind === 'window') {
        g.mat.emissive.setHex(0xffb35a);
        g.mat.emissiveIntensity = lightsOn * 1.6;
      } else if (g.kind === 'lantern') {
        g.mat.emissiveIntensity = 0.5 + lightsOn * 1.6;
      }
    }

    // ---------- 雨 ----------
    this.rainLines.visible = rain > 0.02;
    if (this.rainLines.visible) {
      this.rainLines.material.opacity = 0.55 * rain;
      this.rainLines.position.set(cameraPos.x, cameraPos.y - 18, cameraPos.z);
      const p = this.rainLines.geometry.attributes.position.array;
      const fall = 32 * dt;
      for (let i = 0; i < this.rainCount; i++) {
        const o = i * 6;
        p[o + 1] -= fall;
        p[o + 4] -= fall;
        if (p[o + 1] < 0) {
          p[o + 1] += 40;
          p[o + 4] += 40;
        }
      }
      this.rainLines.geometry.attributes.position.needsUpdate = true;
    }
  }

  tmpColor(c, k) {
    return (this._tmp ??= new THREE.Color()).copy(c).multiplyScalar(k);
  }

  clockText() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
