// 鍵盤、滑鼠與觸控輸入。滑鼠視角：鎖定指標時直接轉，沒鎖定時按住左鍵拖曳也能轉。
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.dragging = false;
    // 虛擬搖桿（觸控）：x 右、y 前，長度 0..1
    this.analog = { active: false, x: 0, y: 0 };

    addEventListener('keydown', e => {
      if (!e.repeat) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === el || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    el.addEventListener('mousedown', () => { this.dragging = true; });
    addEventListener('mouseup', () => { this.dragging = false; });
    el.addEventListener('wheel', e => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  // 觸控按鈕用
  press(code) {
    this.keys.add(code);
    this.justPressed.add(code);
  }
  release(code) { this.keys.delete(code); }

  look(dx, dy) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  endFrame() {
    this.justPressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }
}
