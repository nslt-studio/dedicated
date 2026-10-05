const SCROLL_EASE    = 0.6;
const LERP_EASE      = 0.04;
const MAX_GAP_X      = 140;  // max horizontal gap between items (px)
const MAX_GAP_Y      = 100;  // max vertical gap between items (px)
const MAX_GAP_X_MOB  = 60;   // mobile
const MAX_GAP_Y_MOB  = 40;   // mobile
const EDGE_MARGIN    = 24;   // margin from canvas edges (px)
const INTRO_DURATION = 0.6;  // intro animation duration (s)
const INTRO_STAGGER  = 0.025; // delay between each item (s)
const FRICTION       = 0.95; // drag velocity decay per frame
const FLOAT_RADIUS   = 30;      // max float circle radius (px)
const FLOAT_FREQ_MIN = 0.00015; // min rotation speed (smaller = slower)
const FLOAT_FREQ_MAX = 0.0003;  // max rotation speed
const AUTO_SCROLL    = 0.2;     // auto-scroll downward (px/frame)
const PRIORITY_COUNT = 6;       // first N items placed in the visible area
const HOVER_SCALE    = 1.05;    // scale on hover
const SCALE_EASE     = 0.10;    // scale lerp speed
const DRAG_SCALE      = 0.95;  // canvas scale while grabbed
const DRAG_SCALE_EASE = 0.10;  // drag scale lerp speed

function calcCanvasSize(items, viewW, viewH) {
  const n    = items.length;
  const avgW = items.reduce((s, i) => s + i.w, 0) / n;
  const avgH = items.reduce((s, i) => s + i.h, 0) / n;
  const cols = Math.max(1, Math.round(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const mob  = viewW <= 767;
  const gapX = mob ? MAX_GAP_X_MOB : MAX_GAP_X;
  const gapY = mob ? MAX_GAP_Y_MOB : MAX_GAP_Y;
  const w    = Math.max(viewW, cols * (avgW + gapX) + EDGE_MARGIN * 2);
  const h    = Math.max(viewH, rows * (avgH + gapY) + EDGE_MARGIN * 2);
  return { w, h, cols, rows };
}

function dedupeAdjacent(arr, cols) {
  const getId = item => item.el.dataset.deal || '';

  function conflicts(i, id) {
    for (let d = 1; d <= 2; d++) {
      if (i % cols >= d && getId(arr[i - d]) === id) return true;
      if (i >= cols * d && getId(arr[i - cols * d]) === id) return true;
    }
    return false;
  }

  for (let pass = 0; pass < 50; pass++) {
    let hadConflict = false;
    for (let i = 0; i < arr.length; i++) {
      const id = getId(arr[i]);
      if (!id || !conflicts(i, id)) continue;
      hadConflict = true;
      for (let j = i + 1; j < arr.length; j++) {
        const jId = getId(arr[j]);
        if (jId === id || conflicts(i, jId)) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        break;
      }
    }
    if (!hadConflict) break;
  }
}

// Grid placement — pad = FLOAT_RADIUS on each side of the cell guarantees a min 2×FLOAT_RADIUS
// gap between adjacent items (no overlap while floating). The first `priorityCount` items get
// placed in cells visible on screen at load.
function gridPlacement(items, canvasW, canvasH, cols, rows, viewW, viewH, priorityCount = 0) {
  const cellW = (canvasW - EDGE_MARGIN * 2) / cols;
  const cellH = (canvasH - EDGE_MARGIN * 2) / rows;
  const pad   = FLOAT_RADIUS;

  // Priority items (first in DOM order) vs the rest
  const priority = items.slice(0, priorityCount).sort(() => Math.random() - 0.5);
  const rest     = items.slice(priorityCount).sort(() => Math.random() - 0.5);

  // Cell positions visible at load (scroll=0)
  const visiblePos = [];
  const otherPos   = [];
  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (EDGE_MARGIN + col * cellW < viewW && EDGE_MARGIN + row * cellH < viewH) {
      visiblePos.push(i);
    } else {
      otherPos.push(i);
    }
  }

  // Priority items go to visible positions first, then the rest
  const positions = [...visiblePos, ...otherPos];
  const ordered   = [...priority, ...rest];
  const assigned  = new Array(items.length);
  for (let i = 0; i < ordered.length; i++) assigned[positions[i]] = ordered[i];

  dedupeAdjacent(assigned, cols);

  // Per-column stagger: each column gets a random fraction of rangeY, keeping a min
  // 2×FLOAT_RADIUS gap between adjacent rows regardless of the fraction.
  const colFrac = Array.from({ length: cols }, () => Math.random());

  return assigned.map((item, i) => {
    const col    = i % cols;
    const row    = Math.floor(i / cols);
    const cellX  = EDGE_MARGIN + col * cellW;
    const cellY  = EDGE_MARGIN + row * cellH;
    const rangeX = Math.max(0, cellW - item.w - pad * 2);
    const rangeY = Math.max(0, cellH - item.h - pad * 2);
    return { ...item, x: cellX + pad + Math.random() * rangeX, y: cellY + pad + colFrac[col] * rangeY };
  });
}

let zoomScale    = 1;
let scrollSpeed  = 1; // dynamically compensated: getZoomDefaults().normal / zoomScale
let gridInstance = null;
let frozenByHover = false;
let frozenByDeal  = false;
const zoomChangeListeners = [];

export function setDealFrozen(frozen) {
  frozenByDeal = frozen;
}

// Stops the grid's RAF loop and releases will-change (each item + its 4 infinite-scroll clones
// otherwise keep their own GPU layer alive permanently, ~100+ layers total). Two independent
// reasons can request a pause: the active view (.index/panel/deal, driven from popups.js) and an
// in-progress resize (driven here) — the grid only runs when neither is blocking it.
let pausedByView   = false;
let pausedByResize = false;
let gridPaused     = false;

function applyGridPaused() {
  const paused = pausedByView || pausedByResize;
  if (paused !== gridPaused) {
    gridPaused = paused;
    if (gridInstance) {
      gridInstance.items.forEach(item => { item.el.style.willChange = paused ? 'auto' : 'transform'; });
      if (!paused) requestAnimationFrame(gridInstance.render);
    }
  }
  // display:none on the container drops the whole subtree at once, forcing those GPU layers to
  // actually free up (will-change alone just stops updating them). Resize-only: view changes
  // keep the existing opacity fade.
  if (gridInstance) gridInstance.$list.style.display = pausedByResize ? 'none' : '';
}

export function setGridPaused(paused) {
  pausedByView = paused;
  applyGridPaused();
}

// A real orientation change can't be avoided, but the browser has to recomposite the whole page
// at once — with ~100+ GPU layers permanently on the grid, that can spike CPU and crash Safari on
// iPhone. Pause on the first "resize" and release once it settles (~200ms of silence): one
// recalculation at the end instead of one per event.
let resizeSettleTimer = null;
window.addEventListener('resize', () => {
  pausedByResize = true;
  applyGridPaused();
  clearTimeout(resizeSettleTimer);
  resizeSettleTimer = setTimeout(() => {
    pausedByResize = false;
    applyGridPaused();
  }, 200);
});

export function setZoomScale(s) {
  zoomScale    = s;
  scrollSpeed  = getZoomDefaults().normal / s;
  gridInstance?.retile();
  zoomChangeListeners.forEach(cb => cb(s));
}

// Keeps the slider UI (.cursor) in sync when zoom changes elsewhere (touch pinch)
export function onZoomChange(cb) {
  zoomChangeListeners.push(cb);
}

export function getZoomDefaults() {
  return window.innerWidth <= 767
    ? { normal: 0.75, zoomed: 0.3 }
    : { normal: 1,    zoomed: 0.4  };
}

export function initAnimations() {
  gridInstance = new InfiniteGrid();
}

class InfiniteGrid {
  constructor() {
    this.$container = document.querySelector('.grid');
    this.$list      = document.querySelector('.grid-list');
    if (!this.$container || !this.$list) return;

    this.scroll = {
      current: { x: 0, y: 0 },
      target:  { x: 0, y: 0 },
      last:    { x: 0, y: 0 },
      delta:   { x: { c: 0, t: 0 }, y: { c: 0, t: 0 } },
    };
    this.drag             = { startX: 0, startY: 0, scrollX: 0, scrollY: 0 };
    this.dragVelocity     = { x: 0, y: 0 };
    this.inertiaVel       = { x: 0, y: 0 };
    this.hasDragged          = false;
    this.touchStartedOnGrid  = false;
    this.isPinching      = false;
    this.pinchStartDist  = 0;
    this.pinchStartScale = 1;
    this.mouse            = { x: { t: 0.5, c: 0.5 }, y: { t: 0.5, c: 0.5 }, press: { t: 0, c: 0 } };
    this.isDragging  = false;
    this.dragScaleC  = 1;
    this.dragScaleT  = 1;
    this.items         = [];
    this.tileSize      = { w: 0, h: 0 };
    this.introStartTime = null;
    this.winW = window.innerWidth;
    this.winH = window.innerHeight;

    this.onResize     = this.onResize.bind(this);
    this.onWheel      = this.onWheel.bind(this);
    this.onMouseMove  = this.onMouseMove.bind(this);
    this.onMouseDown  = this.onMouseDown.bind(this);
    this.onMouseUp    = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove  = this.onTouchMove.bind(this);
    this.onTouchEnd   = this.onTouchEnd.bind(this);
    this.render       = this.render.bind(this);

    window.addEventListener('resize', () => { this.winW = window.innerWidth; this.winH = window.innerHeight; });
    this.$list.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('mousemove', this.onMouseMove);
    this.$list.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.$list.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd);

    this.$list.addEventListener('click', e => {
      if (this.hasDragged) { e.stopPropagation(); this.hasDragged = false; }
    });

    this.$list.addEventListener('mouseover', e => {
      if (e.target.closest('.grid-item') && !e.relatedTarget?.closest('.grid-item'))
        frozenByHover = true;
    });
    this.$list.addEventListener('mouseout', e => {
      if (e.target.closest('.grid-item') && !e.relatedTarget?.closest('.grid-item'))
        frozenByHover = false;
    });

    this.onResize();
    requestAnimationFrame(this.render);
  }

  onResize() {
    this.winW = window.innerWidth;
    this.winH = window.innerHeight;

    this.$list.querySelectorAll('.grid-item--clone, .grid-item--fill').forEach(el => el.remove());
    this.$list.style.cssText = '';
    [...this.$list.querySelectorAll('.grid-item')].forEach(el => { el.style.cssText = ''; });

    const originals = [...this.$list.querySelectorAll('.grid-item')];
    const sizes = originals.map(el => {
      const r = el.getBoundingClientRect();
      return { el, w: r.width, h: r.height };
    });

    const { w: tileW, h: tileH, cols, rows } = calcCanvasSize(sizes, this.winW, this.winH);
    this.tileSize = { w: tileW * 2, h: tileH * 2 };

    // Fill every cell — clone missing items so there are no empty gaps
    const allSizes = [...sizes];
    while (allSizes.length < cols * rows) {
      const src = sizes[allSizes.length % sizes.length];
      const fill = src.el.cloneNode(true);
      fill.classList.add('grid-item--fill');
      this.$list.appendChild(fill);
      allSizes.push({ el: fill, w: src.w, h: src.h });
    }

    const placed   = gridPlacement(allSizes, tileW, tileH, cols, rows, this.winW, this.winH, PRIORITY_COUNT);
    const baseItems = placed.map((p, i) => ({ ...p, ease: 0.5 + (i / placed.length) * 0.5 }));

    this.$list.style.position     = 'relative';
    this.$list.style.width        = `${tileW}px`;
    this.$list.style.height       = `${tileH}px`;
    this.$list.style.overflow     = 'visible';
    this.$list.style.pointerEvents = 'auto';

    baseItems.forEach(b => {
      b.el.style.position   = 'absolute';
      b.el.style.left       = '0';
      b.el.style.top        = '0';
      b.el.style.willChange = 'transform';
    });

    // Float properties — same for all 4 copies of a given item
    const floatProps = baseItems.map(() => ({
      phase:  Math.random() * Math.PI * 2,
      freq:   FLOAT_FREQ_MIN + Math.random() * (FLOAT_FREQ_MAX - FLOAT_FREQ_MIN),
      radius: FLOAT_RADIUS * (0.5 + Math.random() * 0.5),
    }));

    this.items = [];
    [[0, 0], [tileW, 0], [0, tileH], [tileW, tileH]].forEach(([ox, oy]) => {
      baseItems.forEach((base, i) => {
        const isOrigin = ox === 0 && oy === 0;
        const el = isOrigin ? base.el : (() => {
          const clone = base.el.cloneNode(true);
          clone.classList.add('grid-item--clone');
          this.$list.appendChild(clone);
          return clone;
        })();

        const ax = base.x + ox;
        const ay = base.y + oy;
        const visible = isOrigin &&
          ax + base.w > 0 && ax < this.winW &&
          ay + base.h > 0 && ay < this.winH;
        const fp = floatProps[i];

        if (!el._hoverBound) {
          el.addEventListener('mouseenter', () => { el._hovered = true; });
          el.addEventListener('mouseleave', () => { el._hovered = false; });
          el._hoverBound = true;
        }

        this.items.push({
          el,
          x: ax, y: ay, w: base.w, h: base.h,
          extraX: 0, extraY: 0,
          ease: base.ease,
          introX:     visible ? this.winW * 0.5 - (ax + base.w * 0.5) : 0,
          introY:     visible ? this.winH * 0.5 - (ay + base.h * 0.5) : 0,
          introDelay: visible ? i * INTRO_STAGGER : 0,
          introDone:  !visible,
          floatPhase:  fp.phase,
          floatFreq:   fp.freq,
          floatRadius: fp.radius,
          scaleC: 1,
        });
      });
    });

    this.scroll.current = { x: 0, y: 0 };
    this.scroll.target  = { x: 0, y: 0 };
    this.scroll.last    = { x: 0, y: 0 };
    this.introStartTime = null;
  }

  onWheel(e) {
    e.preventDefault();
    this.scroll.target.x -= e.deltaX * 0.4;
    this.scroll.target.y -= e.deltaY * 0.4;
  }

  onMouseDown(e) {
    e.preventDefault();
    this.isDragging   = true;
    this.hasDragged   = false;
    this.inertiaVel   = { x: 0, y: 0 };
    this.dragVelocity = { x: 0, y: 0 };
    this.$list.style.cursor = 'grabbing';
    this.mouse.press.t   = 1;
    this.drag = {
      startX: e.clientX, startY: e.clientY,
      scrollX: this.scroll.target.x, scrollY: this.scroll.target.y,
    };
  }

  onMouseUp() {
    this.isDragging        = false;
    this.$list.style.cursor = 'grab';
    this.mouse.press.t     = 0;
    this.inertiaVel        = { x: this.dragVelocity.x, y: this.dragVelocity.y };
    this.dragVelocity      = { x: 0, y: 0 };
  }

  onMouseMove(e) {
    this.mouse.x.t = e.clientX / this.winW;
    this.mouse.y.t = e.clientY / this.winH;
    if (this.isDragging) {
      const newX = this.drag.scrollX + (e.clientX - this.drag.startX);
      const newY = this.drag.scrollY + (e.clientY - this.drag.startY);
      this.dragVelocity.x = newX - this.scroll.target.x;
      this.dragVelocity.y = newY - this.scroll.target.y;
      this.scroll.target.x = newX;
      this.scroll.target.y = newY;
      if (Math.abs(e.clientX - this.drag.startX) > 4 || Math.abs(e.clientY - this.drag.startY) > 4)
        this.hasDragged = true;
    }
  }

  render(ts) {
    if (gridPaused) return;
    if (!this.introStartTime && ts) this.introStartTime = ts;

    if (!this.isDragging) {
      this.scroll.target.x += this.inertiaVel.x;
      this.scroll.target.y += this.inertiaVel.y;
      this.inertiaVel.x *= FRICTION;
      this.inertiaVel.y *= FRICTION;
      if (!(frozenByHover || frozenByDeal)) {
        const blend = Math.max(0, 1 - Math.abs(this.inertiaVel.y) / (AUTO_SCROLL * 2));
        this.scroll.target.y -= AUTO_SCROLL * blend;
      }
    }

    this.scroll.current.x += (this.scroll.target.x - this.scroll.current.x) * SCROLL_EASE;
    this.scroll.current.y += (this.scroll.target.y - this.scroll.current.y) * SCROLL_EASE;

    this.scroll.delta.x.t = this.scroll.current.x - this.scroll.last.x;
    this.scroll.delta.y.t = this.scroll.current.y - this.scroll.last.y;
    this.scroll.delta.x.c += (this.scroll.delta.x.t - this.scroll.delta.x.c) * LERP_EASE;
    this.scroll.delta.y.c += (this.scroll.delta.y.t - this.scroll.delta.y.c) * LERP_EASE;

    this.mouse.x.c     += (this.mouse.x.t     - this.mouse.x.c)     * LERP_EASE;
    this.mouse.y.c     += (this.mouse.y.t     - this.mouse.y.c)     * LERP_EASE;
    this.mouse.press.c += (this.mouse.press.t - this.mouse.press.c) * 0.1;

    this.dragScaleT = this.isDragging ? DRAG_SCALE : 1;
    this.dragScaleC += (this.dragScaleT - this.dragScaleC) * DRAG_SCALE_EASE;
    this.$list.style.transform = `scale(${(zoomScale * this.dragScaleC).toFixed(5)})`;

    const pad  = zoomScale < 1 ? (1 / zoomScale - 1) / 2 : 0;
    const bX   = this.winW * pad;
    const bY   = this.winH * pad;
    const dirX = this.scroll.current.x >= this.scroll.last.x ? 'right' : 'left';
    const dirY = this.scroll.current.y >= this.scroll.last.y ? 'down'  : 'up';

    this.items.forEach(item => {
      let ix = 0, iy = 0;
      if (!item.introDone && this.introStartTime) {
        const elapsed = (ts - this.introStartTime) / 1000;
        const t       = Math.max(0, Math.min((elapsed - item.introDelay) / INTRO_DURATION, 1));
        const eased   = 1 - Math.pow(2, -10 * t);
        ix = item.introX * (1 - eased);
        iy = item.introY * (1 - eased);
        if (t >= 1) item.introDone = true;
      }

      const px = (this.mouse.x.c - 0.5) * item.w * 0.3 * (item.ease - 0.5);
      const py = (this.mouse.y.c - 0.5) * item.h * 0.3 * (item.ease - 0.5);
      const vx = 5 * this.scroll.delta.x.c * item.ease;
      const vy = 5 * this.scroll.delta.y.c * item.ease;

      let checkX = item.x + this.scroll.current.x + item.extraX + px + vx;
      let checkY = item.y + this.scroll.current.y + item.extraY + py + vy;

      if (dirX === 'right') { while (checkX          > this.winW + bX) { item.extraX -= this.tileSize.w; checkX -= this.tileSize.w; } }
      if (dirX === 'left')  { while (checkX + item.w < -bX)            { item.extraX += this.tileSize.w; checkX += this.tileSize.w; } }
      if (dirY === 'down')  { while (checkY          > this.winH + bY) { item.extraY -= this.tileSize.h; checkY -= this.tileSize.h; } }
      if (dirY === 'up')    { while (checkY + item.h < -bY)            { item.extraY += this.tileSize.h; checkY += this.tileSize.h; } }

      const angle  = ts * item.floatFreq + item.floatPhase;
      const floatX = Math.cos(angle) * item.floatRadius;
      const floatY = Math.sin(angle) * item.floatRadius;

      const fx = item.x + this.scroll.current.x + item.extraX + px + vx + ix + floatX;
      const fy = item.y + this.scroll.current.y + item.extraY + py + vy + iy + floatY;

      item.scaleC += ((item.el._hovered ? HOVER_SCALE : 1) - item.scaleC) * SCALE_EASE;
      item.el.style.transform = `translate(${fx}px, ${fy}px) scale(${item.scaleC.toFixed(4)})`;
    });

    this.scroll.last.x = this.scroll.current.x;
    this.scroll.last.y = this.scroll.current.y;
    requestAnimationFrame(this.render);
  }

  getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  onTouchStart(e) {
    e.preventDefault();

    if (e.touches.length === 2) {
      this.isPinching      = true;
      this.isDragging       = false;
      this.touchStartedOnGrid = false;
      this.pinchStartDist   = this.getTouchDistance(e.touches);
      this.pinchStartScale  = zoomScale;
      return;
    }

    const t = e.touches[0];
    this.touchStartedOnGrid = true;
    this.isDragging   = true;
    this.hasDragged   = false;
    this.inertiaVel   = { x: 0, y: 0 };
    this.dragVelocity = { x: 0, y: 0 };
    this.mouse.press.t = 1;
    this.drag = {
      startX: t.clientX, startY: t.clientY,
      scrollX: this.scroll.target.x, scrollY: this.scroll.target.y,
    };
  }

  onTouchMove(e) {
    if (this.isPinching) {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const dist = this.getTouchDistance(e.touches);
      const { normal, zoomed } = getZoomDefaults();
      const min = Math.min(normal, zoomed);
      const max = Math.max(normal, zoomed);
      const scale = Math.max(min, Math.min(max, this.pinchStartScale * (dist / this.pinchStartDist)));
      setZoomScale(scale);
      return;
    }

    if (!this.isDragging) return;
    e.preventDefault();
    const t = e.touches[0];
    const newX = this.drag.scrollX + (t.clientX - this.drag.startX) * scrollSpeed;
    const newY = this.drag.scrollY + (t.clientY - this.drag.startY) * scrollSpeed;
    this.dragVelocity.x = newX - this.scroll.target.x;
    this.dragVelocity.y = newY - this.scroll.target.y;
    this.scroll.target.x = newX;
    this.scroll.target.y = newY;
    if (Math.abs(t.clientX - this.drag.startX) > 4 || Math.abs(t.clientY - this.drag.startY) > 4)
      this.hasDragged = true;
  }

  onTouchEnd(e) {
    if (this.isPinching) {
      if (e.touches.length < 2) this.isPinching = false;
      return;
    }

    const startedOnGrid     = this.touchStartedOnGrid;
    this.touchStartedOnGrid = false;
    this.isDragging         = false;
    this.mouse.press.t      = 0;
    this.inertiaVel         = { x: this.dragVelocity.x, y: this.dragVelocity.y };
    this.dragVelocity       = { x: 0, y: 0 };
    if (startedOnGrid && !this.hasDragged) {
      const touch  = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: touch.clientX, clientY: touch.clientY }));
    }
  }

  retile() {
    const pad = zoomScale < 1 ? (1 / zoomScale - 1) / 2 : 0;
    const bX  = this.winW * pad;
    const bY  = this.winH * pad;
    const tw  = this.tileSize.w;
    const th  = this.tileSize.h;

    this.items.forEach(item => {
      let px = item.x + this.scroll.current.x + item.extraX;
      let py = item.y + this.scroll.current.y + item.extraY;

      while (px          > this.winW + bX) { item.extraX -= tw; px -= tw; }
      while (px + item.w < -bX)            { item.extraX += tw; px += tw; }
      while (py          > this.winH + bY) { item.extraY -= th; py -= th; }
      while (py + item.h < -bY)            { item.extraY += th; py += th; }
    });
  }

  destroy() {
    this.$list.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.$list.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.$list.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
  }
}
