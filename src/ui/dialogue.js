// 對話框：一頁一頁顯示，最後一頁可以有選項。開著時遊戲暫停。
export class Dialogue {
  constructor() {
    this.el = document.getElementById('dialogue');
    this.nameEl = document.getElementById('dlgName');
    this.textEl = document.getElementById('dlgText');
    this.optsEl = document.getElementById('dlgOpts');
    this.pages = [];
    this.options = [];
    this.index = 0;
    this.open_ = false;
    this.onClose = () => {};

    this.el.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      this.next();
    });
    this.optsEl.addEventListener('click', e => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      const opt = this.options[Number(b.dataset.opt)];
      this.close();
      opt?.fn?.();
    });
    addEventListener('keydown', e => {
      if (!this.open_) return;
      if (['Space', 'Enter', 'KeyG', 'KeyF'].includes(e.code)) {
        e.preventDefault();
        if (!this.options.length || this.index < this.pages.length - 1) this.next();
      } else if (e.code === 'Escape') {
        this.close();
      } else if (/^Digit[1-9]$/.test(e.code) && this.index === this.pages.length - 1) {
        const opt = this.options[Number(e.code.slice(5)) - 1];
        if (opt) {
          this.close();
          opt.fn?.();
        }
      }
    });
  }

  get isOpen() { return this.open_; }

  // options: [{ label, fn }]，顯示在最後一頁
  open(name, pages, options = []) {
    this.nameEl.textContent = name;
    this.pages = pages;
    this.options = options;
    this.index = 0;
    this.open_ = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  render() {
    this.textEl.textContent = this.pages[this.index];
    this.optsEl.replaceChildren();
    const last = this.index === this.pages.length - 1;
    if (last && this.options.length) {
      this.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'mbtn';
        b.dataset.opt = i;
        b.textContent = `${i + 1}. ${o.label}`;
        this.optsEl.append(b);
      });
    } else {
      const hint = document.createElement('span');
      hint.className = 'dlg-next';
      hint.textContent = last ? '▼ 點一下關閉' : '▼ 點一下繼續';
      this.optsEl.append(hint);
    }
  }

  next() {
    if (this.index < this.pages.length - 1) {
      this.index++;
      this.render();
    } else if (!this.options.length) {
      this.close();
    }
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
