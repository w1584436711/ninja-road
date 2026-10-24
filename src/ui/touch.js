// 手機觸控操作：左半邊浮動搖桿（推到底＝忍者跑），右半邊滑動轉視角，雙指捏合縮放，右下技能按鈕。
const STICK_RADIUS = 60;
const LOOK_SENSITIVITY = 1.6;

// 網址加上 ?touch 可以在電腦上強制開啟觸控介面測試
export function isTouchDevice() {
  return new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;
}

function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* 指標已失效時忽略 */ }
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.layer = document.getElementById('touch');
    this.base = document.getElementById('stickBase');
    this.knob = document.getElementById('stickKnob');
    this.stickId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.looks = new Map(); // pointerId → 上一次位置
    this.pinchDist = 0;

    this.layer.addEventListener('pointerdown', e => this.onDown(e));
    this.layer.addEventListener('pointermove', e => this.onMove(e));
    for (const type of ['pointerup', 'pointercancel']) this.layer.addEventListener(type, e => this.onUp(e));

    document.querySelectorAll('#tbtns [data-key]').forEach(btn => {
      const code = btn.dataset.key;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        capture(btn, e.pointerId);
        btn.classList.add('pressed');
        input.press(code);
      });
      const up = () => {
        btn.classList.remove('pressed');
        input.release(code);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    });
  }

  onDown(e) {
    e.preventDefault();
    capture(this.layer, e.pointerId);
    if (this.stickId === null && e.clientX < innerWidth * 0.45) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('show');
      this.setKnob(0, 0);
      this.input.analog.active = true;
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinchDist = this.currentPinch();
    }
  }

  onMove(e) {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.setKnob(dx, dy);
      this.input.analog.x = dx / STICK_RADIUS;
      this.input.analog.y = -dy / STICK_RADIUS;
      return;
    }
    const last = this.looks.get(e.pointerId);
    if (!last) return;
    if (this.looks.size >= 2) {
      // 雙指捏合：縮放鏡頭
      last.x = e.clientX;
      last.y = e.clientY;
      const d = this.currentPinch();
      this.input.wheel += (this.pinchDist - d) * 4;
      this.pinchDist = d;
      return;
    }
    this.input.look((e.clientX - last.x) * LOOK_SENSITIVITY, (e.clientY - last.y) * LOOK_SENSITIVITY);
    last.x = e.clientX;
    last.y = e.clientY;
  }

  onUp(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.base.classList.remove('show');
      Object.assign(this.input.analog, { active: false, x: 0, y: 0 });
    } else {
      this.looks.delete(e.pointerId);
      this.pinchDist = this.currentPinch();
    }
  }

  currentPinch() {
    const p = [...this.looks.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }

  setKnob(dx, dy) {
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  // 暫停時放開所有輸入，避免角色一直跑
  reset() {
    this.stickId = null;
    this.looks.clear();
    this.base.classList.remove('show');
    Object.assign(this.input.analog, { active: false, x: 0, y: 0 });
    for (const code of ['Space', 'KeyE', 'KeyC']) this.input.release(code);
  }
}
