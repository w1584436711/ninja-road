import * as THREE from 'three';

// 賽璐璐上色：光照只分成三階（暗、中、亮），像動畫一樣
let gradient = null;
export function toonGradient() {
  if (!gradient) {
    const data = new Uint8Array([110, 185, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export function toonMaterial(params = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
}

// 把場景裡的一般材質換成賽璐璐材質（共用的材質只轉一次）。
// 想保留原材質的物件（例如水面）設 userData.keepMaterial = true。
export function toonify(root) {
  const cache = new Map();
  const convert = m => {
    if (!m.isMeshStandardMaterial && !m.isMeshLambertMaterial) return m;
    if (!cache.has(m)) {
      cache.set(m, toonMaterial({
        color: m.color, map: m.map, vertexColors: m.vertexColors,
        emissive: m.emissive, emissiveIntensity: m.emissiveIntensity,
        transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite,
      }));
      m.dispose();
    }
    return cache.get(m);
  };
  root.traverse(o => {
    if (!o.isMesh || o.userData.keepMaterial) return;
    o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
  });
}
