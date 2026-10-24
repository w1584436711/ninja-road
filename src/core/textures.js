import * as THREE from 'three';

// 用 Canvas 畫文字貼圖（招牌、名牌）
export function textTexture(text, { width = 256, height = 256, bg = null, fg = '#fff', font = 'bold 160px "Microsoft JhengHei", sans-serif', stroke = null, circle = false } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    if (circle) {
      g.beginPath();
      g.arc(width / 2, height / 2, Math.min(width, height) / 2 - 4, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(0, 0, width, height);
    }
  }
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 以 \n 分行，整體垂直置中（直式匾額用）
  const lines = text.split('\n');
  const lineH = height / (lines.length + 0.4);
  lines.forEach((line, i) => {
    const y = height / 2 + (i - (lines.length - 1) / 2) * lineH + 4;
    if (stroke) {
      g.lineWidth = 6;
      g.strokeStyle = stroke;
      g.strokeText(line, width / 2, y);
    }
    g.fillStyle = fg;
    g.fillText(line, width / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createNameplate(text, color = '#ffffff') {
  const tex = textTexture(text, {
    width: 256, height: 64, fg: color, stroke: 'rgba(0,0,0,.8)',
    font: 'bold 30px "Microsoft JhengHei", sans-serif',
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}
