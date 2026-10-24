import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { HALF } from './terrain.js';

export const HORIZON_COLOR = 0xcfe8ff;

export function createSky(scene) {
  // 漸層天空球
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d8be0) },
        bottom: { value: new THREE.Color(HORIZON_COLOR) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float t = clamp(vDir.y * 1.8 + 0.05, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, t), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x55663a, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 1; s.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(90, 140, 50);

  // 雲朵
  const rng = mulberry32(77);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, flatShading: true });
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 28; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) {
      const p = new THREE.Mesh(puffGeo, cloudMat);
      const sc = 8 + rng() * 8;
      p.scale.set(sc, sc * 0.6, sc);
      p.position.set((j - n / 2) * 9 + rng() * 4, rng() * 4, rng() * 8 - 4);
      cloud.add(p);
    }
    cloud.position.set((rng() * 2 - 1) * HALF * 1.4, 120 + rng() * 50, (rng() * 2 - 1) * HALF * 1.4);
    cloud.userData.speed = 2 + rng() * 3;
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    sun,
    sunDir: sunOffset.clone().normalize(),
    update(dt, focus, cameraPos) {
      dome.position.copy(cameraPos);
      sun.target.position.copy(focus);
      sun.position.copy(focus).add(sunOffset);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > HALF * 1.5) c.position.x = -HALF * 1.5;
      }
    },
  };
}
