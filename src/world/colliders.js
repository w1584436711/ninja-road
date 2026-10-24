// 簡易碰撞世界：軸對齊方塊（房屋、大門）與圓柱（樹幹、岩石、高塔）
// 頂部可站立；高於頂部 STEP 以內會被「踩上去」，否則被推開。

const STEP = 0.7;
const BODY_HEIGHT = 1.8;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.circles = [];
  }

  addBox(cx, cz, w, d, top, bottom = -Infinity) {
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top, bottom });
  }

  addCircle(x, z, r, top = Infinity, bottom = -Infinity) {
    this.circles.push({ x, z, r, top, bottom });
  }

  // 傳回 (x,z) 處、位於 y 下方最高的可站立表面
  floorAt(x, z, y, terrainY) {
    let f = terrainY;
    for (const b of this.boxes) {
      if (b.top > f && y >= b.top - STEP && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) f = b.top;
    }
    for (const c of this.circles) {
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
    for (const c of this.circles) {
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
