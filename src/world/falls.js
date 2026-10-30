import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { sharedTime } from '../render/wind.js';
import { getTerrainHeight, riverX, FALLS_X, FALLS_Z, SPRING_Z, WATER_LEVEL } from './terrain.js';

// 霧鳴瀑布：從高原邊緣落進峽谷的瀑布、底部的水霧與彩虹，以及高原上流向瀑布的淺溪。

const FALL_WIDTH = 11;

// 動畫風的流水：沿著流動方向捲動的條紋，亮色條紋取門檻變成一塊一塊
const flowVertex = /* glsl */`
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const flowFragment = /* glsl */`
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float speed;
  uniform vec2 stretch;
  uniform vec3 base;
  uniform vec3 light;
  uniform vec3 tint;
  uniform float edgeFade;
  uniform float bottomFoam;
  varying vec2 vUv;
  varying vec3 vW;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    // v 方向是水流方向：條紋往下（往下游）捲動
    vec2 p = vec2(vUv.x * stretch.x, vUv.y * stretch.y - uTime * speed);
    float n = vnoise(p) * 0.65 + vnoise(p * 2.3 + 7.0) * 0.35;
    vec3 col = mix(base, light, step(0.55, n));
    col = mix(col, vec3(1.0), step(0.8, n) * 0.8);
    // 底部翻白（落進潭裡的水花）
    if (bottomFoam > 0.0) col = mix(col, vec3(1.0), smoothstep(1.0 - bottomFoam, 1.0, vUv.y));
    col *= tint;
    float side = smoothstep(0.0, edgeFade, vUv.x) * smoothstep(0.0, edgeFade, 1.0 - vUv.x);
    float alpha = (0.78 + 0.2 * n) * side;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function flowMaterial(opts, tint) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      speed: { value: opts.speed },
      stretch: { value: new THREE.Vector2(...opts.stretch) },
      base: { value: new THREE.Color(opts.base) },
      light: { value: new THREE.Color(opts.light) },
      edgeFade: { value: opts.edgeFade },
      bottomFoam: { value: opts.bottomFoam ?? 0 },
    }, { uTime: sharedTime, tint: { value: tint } }]),
    vertexShader: flowVertex,
    fragmentShader: flowFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

// 瀑布本體：從崖頂往外推出一點再落下的弧面
function createSheet(top, tint) {
  const W = 12, H = 30;
  const pos = [], uv = [], index = [];
  for (let j = 0; j <= H; j++) {
    const v = j / H;
    for (let i = 0; i <= W; i++) {
      const u = i / W;
      const spread = 1 + 0.35 * v;
      pos.push(FALLS_X + (u - 0.5) * FALL_WIDTH * spread, top + 0.1 - (top + 0.4) * v, FALLS_Z - 0.5 + 5.5 * Math.pow(v, 1.6));
      uv.push(u, v);
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const a = j * (W + 1) + i;
      index.push(a, a + W + 1, a + 1, a + 1, a + W + 1, a + W + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, flowMaterial({
    speed: 1.6, stretch: [7, 9], base: 0x8fd6f0, light: 0xe8f8ff, edgeFade: 0.12, bottomFoam: 0.12,
  }, tint));
  mesh.renderOrder = 2;
  return mesh;
}

// 高原上的淺溪：沿河道中心線的一條緞帶，貼著溪床
function createStream(tint) {
  const pos = [], uv = [], index = [];
  const width = 5.5;
  const z0 = SPRING_Z, z1 = FALLS_Z - 0.5;
  const steps = Math.ceil((z1 - z0) / 2);
  let length = 0;
  for (let k = 0; k <= steps; k++) {
    const z = z0 + ((z1 - z0) * k) / steps;
    const x = riverX(z);
    const y = getTerrainHeight(x, z) + 0.34;
    if (k > 0) length += 2;
    // 源頭窄、越往下游越寬
    const w = width * Math.min(1, 0.35 + k / 25);
    pos.push(x - w / 2, y, z, x + w / 2, y, z);
    uv.push(0, length / 8, 1, length / 8);
    if (k > 0) {
      const a = (k - 1) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, flowMaterial({
    speed: 0.9, stretch: [3, 2.5], base: 0x5cc4dc, light: 0xc8f0ff, edgeFade: 0.2,
  }, tint));
  mesh.renderOrder = 1;
  return mesh;
}

// 柔邊的圓點貼圖（水霧）
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 彩虹：水霧裡一道淡淡的弧，只在白天看得到
function createRainbow() {
  const geo = new THREE.TorusGeometry(22, 2.2, 4, 48, Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0.25 } },
    vertexShader: /* glsl */`
      varying vec3 vLocal;
      void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float opacity;
      varying vec3 vLocal;
      void main() {
        float r = (length(vLocal.xy) - 19.8) / 4.4; // 0 內圈 → 1 外圈
        vec3 c = clamp(abs(fract(r * 0.85 + vec3(0.0, 0.33, 0.67)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
        float fade = smoothstep(0.0, 0.25, r) * smoothstep(1.0, 0.75, r) * smoothstep(0.0, 6.0, vLocal.y);
        gl_FragColor = vec4(c * opacity * fade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(FALLS_X, WATER_LEVEL - 4, FALLS_Z + 16);
  return mesh;
}

export class Falls {
  constructor(scene, sky) {
    this.sky = sky;
    this.group = new THREE.Group();
    this.top = getTerrainHeight(FALLS_X, FALLS_Z - 3);
    // 瀑布與溪水跟著日夜變暗（借用水面的明暗色）
    this.group.add(createSheet(this.top, sky.waterTint), createStream(sky.waterTint));

    // 水霧粒子：在潭面附近湧起、擴散、消失
    const N = 70;
    this.mist = [];
    const rng = mulberry32(77);
    const geo = new THREE.BufferGeometry();
    this.mistPos = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.mistPos, 3));
    for (let i = 0; i < N; i++) this.mist.push({ t: rng() * 3, life: 2.2 + rng() * 1.5, a: rng() * Math.PI * 2, r: rng(), rng });
    this.mistMat = new THREE.PointsMaterial({
      map: softDot(), size: 9, transparent: true, depthWrite: false, opacity: 0.38, color: 0xf2fbff, sizeAttenuation: true,
    });
    this.mistPoints = new THREE.Points(geo, this.mistMat);
    this.mistPoints.frustumCulled = false;
    this.mistPoints.renderOrder = 3;
    this.group.add(this.mistPoints);

    this.rainbow = createRainbow();
    this.group.add(this.rainbow);
    scene.add(this.group);
  }

  update(dt, camPos) {
    const near = Math.hypot(camPos.x - FALLS_X, camPos.z - FALLS_Z) < 700;
    this.group.visible = near;
    if (!near) return;
    for (let i = 0; i < this.mist.length; i++) {
      const m = this.mist[i];
      m.t += dt;
      if (m.t > m.life) {
        m.t = 0;
        m.a = m.rng() * Math.PI * 2;
        m.r = m.rng();
      }
      const k = m.t / m.life;
      const spread = 2 + k * 9 * (0.5 + m.r);
      this.mistPos[i * 3] = FALLS_X + Math.cos(m.a) * spread;
      this.mistPos[i * 3 + 1] = WATER_LEVEL + 0.5 + k * 7 * (0.4 + m.r);
      this.mistPos[i * 3 + 2] = FALLS_Z + 5 + Math.abs(Math.sin(m.a)) * spread * 0.9;
    }
    this.mistPoints.geometry.attributes.position.needsUpdate = true;
    this.mistMat.color.copy(this.sky.waterTint).multiplyScalar(0.95);
    // 彩虹只在太陽高掛、沒下雨時出現
    const sunUp = Math.max(0, this.sky.sunDir.y);
    this.rainbow.material.uniforms.opacity.value = 0.13 * Math.min(1, sunUp * 3) * (1 - (this.sky.rain ?? 0));
    this.rainbow.visible = this.rainbow.material.uniforms.opacity.value > 0.01;
  }
}
