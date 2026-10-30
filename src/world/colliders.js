// 簡易碰撞世界：軸對齊方塊（房屋、大門）與圓柱（樹幹、岩石、高塔）
// 頂部可站立；高於頂部 STEP 以內會被「踩上去」，否則被推開。

const STEP = 0.7;
const BODY_HEIGHT = 1.8;
// 圓柱數量很多（每棵樹一個），依位置分到 20 公尺的格子裡，查詢時只看附近的格子
const CELL = 20;
const MARGIN = 1; // 查詢的角色半徑上限
const key = (i, j) => i * 100003 + j;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.cells = new Map();
    this.none = [];
  }

  addBox(cx, cz, w, d, top, bottom = -Infinity) {
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top, bottom });
  }

  addCircle(x, z, r, top = Infinity, bottom = -Infinity) {
    const c = { x, z, r, top, bottom };
    const reach = r + MARGIN;
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++) {
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
        const k = key(i, j);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(c);
      }
    }
  }

  circlesNear(x, z) {
    return this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? this.none;
  }

  // 範圍內的所有圓柱（不重複）
  circlesInBox(minX, minZ, maxX, maxZ) {
    const out = new Set();
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
        for (const c of this.cells.get(key(i, j)) ?? this.none) out.add(c);
      }
    }
    return out;
  }

  // 傳回 (x,z) 處、位於 y 下方最高的可站立表面
  floorAt(x, z, y, terrainY) {
    let f = terrainY;
    for (const b of this.boxes) {
      if (b.top > f && y >= b.top - STEP && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) f = b.top;
    }
    for (const c of this.circlesNear(x, z)) {
      if (c.top !== Infinity && c.top > f && y >= c.top - STEP) {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < c.r * c.r) f = c.top;
      }
    }
    return f;
  }

  insideAnyBox(x, z, margin = 0) {
    return this.boxes.some(b => x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin);
  }

  // 把半徑 r 的角色從障礙物中水平推出
  resolve(pos, r) {
    for (const b of this.boxes) {
      if (pos.y >= b.top - STEP || pos.y + BODY_HEIGHT <= b.bottom) continue;
      const cx = Math.min(Math.max(pos.x, b.minX), b.maxX);
      const cz = Math.min(Math.max(pos.z, b.minZ), b.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        // 中心已在方塊內：往最近的邊推出
        const opts = [
          [b.minX - r - pos.x, 0], [b.maxX + r - pos.x, 0],
          [0, b.minZ - r - pos.z], [0, b.maxZ + r - pos.z],
        ];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        pos.x += opts[0][0];
        pos.z += opts[0][1];
      }
    }
    for (const c of this.circlesNear(pos.x, pos.z)) {
      if (pos.y >= c.top - STEP || pos.y + BODY_HEIGHT <= c.bottom) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-4;
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
}
