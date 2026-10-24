import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { sharedTime } from '../render/wind.js';
import { getTerrainHeight, WORLD_SIZE, HALF, WATER_LEVEL } from './terrain.js';

// 動畫風水面：深淺色、岸邊白色浪花、卡通波光、緩慢波浪
const DEPTH_RES = 256;
const MAX_DEPTH = 6;

function depthTexture() {
  const data = new Uint8Array(DEPTH_RES * DEPTH_RES);
  const cell = WORLD_SIZE / DEPTH_RES;
  for (let j = 0; j < DEPTH_RES; j++) {
    for (let i = 0; i < DEPTH_RES; i++) {
      const h = getTerrainHeight(-HALF + (i + 0.5) * cell, -HALF + (j + 0.5) * cell);
      data[j * DEPTH_RES + i] = clamp((WATER_LEVEL - h) / MAX_DEPTH, 0, 1) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, DEPTH_RES, DEPTH_RES, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  uniform float uTime;
  varying vec3 vW;
  void main() {
    vec3 p = position;
    p.y += sin(p.x * 0.15 + uTime * 1.2) * 0.06 + sin(p.z * 0.21 + uTime * 0.9) * 0.06;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const fragmentShader = /* glsl */`
  #include <fog_pars_fragment>
  uniform sampler2D depthTex;
  uniform float uTime;
  uniform float worldSize;
  uniform vec3 shallow;
  uniform vec3 deep;
  uniform vec3 foam;
  uniform vec3 sunDir;
  varying vec3 vW;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    float depth = texture2D(depthTex, vW.xz / worldSize + 0.5).r;
    vec3 col = mix(shallow, deep, smoothstep(0.02, 0.5, depth));

    // 卡通水紋：雜訊取門檻變成一塊塊亮色
    float r = vnoise(vW.xz * 0.25 + vec2(uTime * 0.15, uTime * 0.1)) + 0.5 * vnoise(vW.xz * 0.7 - uTime * 0.2);
    col += step(1.08, r) * 0.07;

    // 岸邊浪花
    float wave = sin(uTime * 1.6 + vW.x * 0.3 + vW.z * 0.2);
    float edge = 1.0 - smoothstep(0.05, 0.1 + 0.03 * wave, depth);
    // 第二道浪線：在稍深處，隨時間往岸邊推
    float line2 = fract(uTime * 0.25 + vW.x * 0.02);
    float band = step(abs(depth - (0.22 - line2 * 0.12)), 0.012) * (1.0 - line2);
    float fn = step(0.45, vnoise(vW.xz * 1.3 + uTime * 0.35));
    col = mix(col, foam, clamp(edge * 1.4 + band * 0.7, 0.0, 1.0) * mix(0.6, 1.0, fn));

    // 太陽反射的波光
    vec3 V = normalize(cameraPosition - vW);
    float glint = step(0.93, vnoise(vW.xz * 2.2 + uTime * 0.7)) * smoothstep(0.75, 0.98, dot(reflect(-sunDir, vec3(0.0, 1.0, 0.0)), V));
    col += glint * 1.5;

    float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
    col = mix(col, vec3(0.8, 0.92, 1.0), fres * 0.35);

    float alpha = max(mix(0.72, 0.92, smoothstep(0.0, 0.4, depth)), edge * 0.95);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createWater(sunDir) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    worldSize: { value: WORLD_SIZE },
    shallow: { value: new THREE.Color(0x4fc7d9) },
    deep: { value: new THREE.Color(0x1d5fae) },
    foam: { value: new THREE.Color(0xf4fbff) },
    sunDir: { value: new THREE.Vector3() },
  }]);
  uniforms.depthTex = { value: depthTexture() };
  uniforms.uTime = sharedTime;
  uniforms.sunDir.value.copy(sunDir).normalize();

  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true, fog: true,
  }));
  mesh.position.y = WATER_LEVEL;
  return mesh;
}
