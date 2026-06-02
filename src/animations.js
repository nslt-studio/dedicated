const SCROLL_EASE    = 0.6;
const LERP_EASE      = 0.04;
const MAX_GAP_X      = 140;  // espace max entre items axe horizontal (px)
const MAX_GAP_Y      = 100;  // espace max entre items axe vertical (px)
const MAX_GAP_X_MOB  = 60;   // mobile
const MAX_GAP_Y_MOB  = 40;   // mobile
const EDGE_MARGIN    = 24;   // marge depuis les bords du canvas (px)
const INTRO_DURATION = 0.6;  // durée de l'animation d'entrée (s)
const INTRO_STAGGER  = 0.025; // délai entre chaque item (s)
const FRICTION       = 0.95; // décroissance de la vélocité de drag par frame
const FLOAT_RADIUS   = 30;      // rayon max du cercle de flottement (px)
const FLOAT_FREQ_MIN = 0.00015; // vitesse min de rotation (plus petit = plus lent)
const FLOAT_FREQ_MAX = 0.0003;  // vitesse max
const AUTO_SCROLL    = 0.2;     // scroll automatique vers le bas (px/frame)
const PRIORITY_COUNT = 6;       // nb de premiers items à placer dans la zone visible

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

// Placement dans une grille — pad = FLOAT_RADIUS de chaque côté de la cellule
// garantit un écart min de 2×FLOAT_RADIUS entre items adjacents (pas de chevauchement au flottement)
// Les `priorityCount` premiers items sont placés en priorité dans les cellules visibles à l'écran.
function gridPlacement(items, canvasW, canvasH, cols, rows, viewW, viewH, priorityCount = 0) {
  const cellW = (canvasW - EDGE_MARGIN * 2) / cols;
  const cellH = (canvasH - EDGE_MARGIN * 2) / rows;
  const pad   = FLOAT_RADIUS;

  // Sépare les items prioritaires (premiers de la liste DOM) du reste
  const priority = items.slice(0, priorityCount).sort(() => Math.random() - 0.5);
  const rest     = items.slice(priorityCount).sort(() => Math.random() - 0.5);

  // Identifie les positions de cellule visibles au chargement (scroll=0)
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

  // Assigne : items prioritaires → positions visibles d'abord, puis autres
  const positions = [...visiblePos, ...otherPos];
  const ordered   = [...priority, ...rest];
  const assigned  = new Array(items.length);
  for (let i = 0; i < ordered.length; i++) assigned[positions[i]] = ordered[i];

  dedupeAdjacent(assigned, cols);

  return assigned.map((item, i) => {
    const col    = i % cols;
    const row    = Math.floor(i / cols);
    const cellX  = EDGE_MARGIN + col * cellW;
    const cellY  = EDGE_MARGIN + row * cellH;
    const rangeX = Math.max(0, cellW - item.w - pad * 2);
    const rangeY = Math.max(0, cellH - item.h - pad * 2);
    return { ...item, x: cellX + pad + Math.random() * rangeX, y: cellY + pad + Math.random() * rangeY };
  });
}

let zoomScale    = 1;
let scrollSpeed  = 1; // compensé dynamiquement : getZoomDefaults().normal / zoomScale
let gridInstance = null;
let frozenByHover = false;
let frozenByDeal  = false;

export function setDealFrozen(frozen) {
  frozenByDeal = frozen;
}

export function setZoomScale(s) {
  zoomScale    = s;
  scrollSpeed  = getZoomDefaults().normal / s;
  gridInstance?.retile();
}

export function getZoomDefaults() {
  return window.innerWidth <= 767
    ? { normal: 0.60, zoomed: 0.2 }
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
    this.mouse            = { x: { t: 0.5, c: 0.5 }, y: { t: 0.5, c: 0.5 }, press: { t: 0, c: 0 } };
    this.isDragging = false;
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

    // Remplir toutes les cellules — cloner les items manquants pour éviter les zones vides
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

    // Propriétés de flottement — identiques pour les 4 copies d'un même item
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

      item.el.style.transform = `translate(${fx}px, ${fy}px)`;
    });

    this.scroll.last.x = this.scroll.current.x;
    this.scroll.last.y = this.scroll.current.y;
    requestAnimationFrame(this.render);
  }

  onTouchStart(e) {
    e.preventDefault();
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
