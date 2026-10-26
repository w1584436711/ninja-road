import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = new Set(['position', 'normal', 'uv']);

// 把 group 底下使用同一個材質的靜態 Mesh 合併成一個，大幅減少繪製次數。
// 只處理 group 的直接子物件；InstancedMesh、userData.noMerge 的物件不動。
// 合併後保留 userData.glow（夜間發光標記）。
export function mergeByMaterial(group) {
  const buckets = new Map();
  for (const m of group.children) {
    if (!m.isMesh || m.isInstancedMesh || m.userData.noMerge || Array.isArray(m.material)) continue;
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(m);
  }
  let before = 0, after = 0;
  for (const [material, meshes] of buckets) {
    before += meshes.length;
    if (meshes.length < 2) {
      after += meshes.length;
      continue;
    }
    const geos = meshes.map(m => {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry : m.geometry.toNonIndexed()).clone();
      for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
      g.clearGroups();
      return g.applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) {
      after += meshes.length;
      continue;
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = meshes.some(m => m.castShadow);
    mesh.receiveShadow = true;
    const glow = meshes.find(m => m.userData.glow)?.userData.glow;
    if (glow) mesh.userData.glow = glow;
    for (const m of meshes) group.remove(m);
    group.add(mesh);
    after++;
  }
  return { before, after };
}
