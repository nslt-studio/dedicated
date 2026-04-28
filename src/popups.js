import { setZoomScale, getZoomDefaults } from './animations.js';

const STAGGER = 100;
const DURATION = 300;

const CONFIG = {
  '#newsButton':  { panel: '.news',  items: '.news-item' },
  '#aboutButton': { panel: '.about', items: '.about-item' },
  '#teamButton':  { panel: '.team',  items: '.team-item' },
};

let activeId       = null;
let activeView     = 'grid'; // 'grid' | 'index'
let activeDeal     = null;
let dealCloseTimer = null;
let touchEndHandled = false;

export function initPopups() {
  // Bloque tous les descendants de .grid (pointer-events: none ne cascade pas naturellement)
  const dimStyle = document.createElement('style');
  dimStyle.textContent = '.grid-dimmed, .grid-dimmed * { pointer-events: none !important; }';
  document.head.appendChild(dimStyle);

  Object.keys(CONFIG).forEach(id => {
    document.querySelector(id)?.addEventListener('click', () => onButtonClick(id));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (activeDeal) closeDeal();
      else if (activeId) closeAll();
    }
  });

  function handleInteraction(target) {
    if (!target) return;

    // Deal : bouton fermeture
    if (target.closest('.deal-close') && activeDeal) { closeDeal(); return; }

    // Deal : clic sur un item
    const item = target.closest('.grid-item[data-deal], .index-item[data-deal]');
    if (item) { openDeal(item.dataset.deal); return; }

    // Deal : clic en dehors
    if (activeDeal) {
      const dealEl = document.querySelector('.deal');
      if (dealEl && !dealEl.contains(target)) closeDeal();
    }

    // Popups : clic en dehors
    if (!activeId) return;
    const panelEl = document.querySelector(CONFIG[activeId].panel);
    if (!panelEl) return;
    const clickedButton = Object.keys(CONFIG).some(id => document.querySelector(id)?.contains(target));
    if (!panelEl.contains(target) && !clickedButton) closeAll();
  }

  // Tracking drag pour distinguer tap et scroll hors grid-list
  let tapStart = null;
  let tapMoved = false;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    tapStart = { x: t.clientX, y: t.clientY };
    tapMoved = false;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!tapStart) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - tapStart.x) > 8 || Math.abs(t.clientY - tapStart.y) > 8)
      tapMoved = true;
  }, { passive: true });

  // touchend sur document pour iOS (click ne fire pas sur les divs non-interactives)
  document.addEventListener('touchend', e => {
    const touch   = e.changedTouches[0];
    const target  = document.elementFromPoint(touch.clientX, touch.clientY);
    const inGrid  = !!target?.closest('.grid-list');
    const wasDrag = tapMoved;
    tapStart = null;
    tapMoved = false;

    if (inGrid) {
      // Géré par animations.js via click synthétique qui respecte hasDragged
      return;
    }

    touchEndHandled = true;
    if (!wasDrag) handleInteraction(target);
  }, { passive: true });

  // click pour desktop — ignoré si déjà traité par touchend
  document.addEventListener('click', e => {
    if (touchEndHandled) { touchEndHandled = false; return; }
    handleInteraction(e.target);
  });

  initViewToggle();
  initZoomCursor();
}

function openDeal(name) {
  const dealEl = document.querySelector('.deal');
  if (!dealEl) return;

  if (dealCloseTimer) { clearTimeout(dealCloseTimer); dealCloseTimer = null; }
  if (activeDeal) closeDeal();
  activeDeal = name;

  setBgDim(true);
  dealEl.style.pointerEvents = 'auto';
  const dealItem = dealEl.querySelector(`.deal-item[data-deal="${name}"]`);
  if (!dealItem) return;

  dealItem.style.pointerEvents = 'auto';
  const staggerEls = [...dealItem.querySelectorAll('.deal-inner, .deal-close')];
  staggerEls.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity   = '1';
      el.style.transform = el.classList.contains('deal-close') ? 'translate(-50%, 0px)' : 'translateY(0px)';
    }, i * 50);
  });
}

function closeDeal() {
  const dealEl = document.querySelector('.deal');
  if (!dealEl || !activeDeal) return;

  const dealItem = dealEl.querySelector(`.deal-item[data-deal="${activeDeal}"]`);
  activeDeal = null;
  setBgDim(false);

  if (dealItem) {
    dealItem.style.pointerEvents = 'none';
    dealItem.querySelectorAll('.deal-inner, .deal-close').forEach(el => { el.style.opacity = '0'; });
    dealCloseTimer = setTimeout(() => {
      dealCloseTimer = null;
      dealEl.style.pointerEvents = 'none';
      dealItem.querySelectorAll('.deal-inner, .deal-close').forEach(el => { el.style.transform = el.classList.contains('deal-close') ? 'translate(-50%, 24px)' : 'translateY(24px)'; });
    }, DURATION);
  }
}

function closeAll() {
  if (activeId) closePanel(activeId);
  activeId = null;
  setButtonsOpacity(null);
  setBgDim(false);
}

function initViewToggle() {
  const indexBtn   = document.querySelector('#indexButton');
  const gridBtn    = document.querySelector('#gridButton');
  const indexPanel = document.querySelector('.index');
  const grid       = document.querySelector('.grid');
  const gridList   = document.querySelector('.grid-list');
  const zoomDiv    = document.querySelector('#zoomDiv');
  const viewDiv    = document.querySelector('#viewDiv');
  if (!indexBtn || !gridBtn) return;

  if (grid) grid.style.transition = 'opacity 0.4s ease';

  indexBtn.addEventListener('click', () => {
    grid?.style.setProperty('opacity', '0');
    grid?.classList.add('grid-dimmed');
    if (gridList) gridList.style.pointerEvents = 'none';
    if (zoomDiv) { zoomDiv.style.opacity = '0'; zoomDiv.style.transform = 'translateY(24px)'; zoomDiv.style.pointerEvents = 'none'; }
    if (viewDiv) viewDiv.style.transform = 'translateX(50%)';

    if (indexPanel) {
      indexPanel.style.display = 'block';
      indexPanel.querySelectorAll('.index-item').forEach((item, i) => {
        setTimeout(() => {
          item.style.opacity = '1';
          item.style.transform = 'translateY(0px)';
        }, i * 50);
      });
    }

    activeView = 'index';
    indexBtn.classList.add('active');
    gridBtn.classList.remove('active');
  });

  gridBtn.addEventListener('click', () => {
    if (indexPanel) {
      indexPanel.querySelectorAll('.index-item').forEach(item => {
        item.style.opacity = '0';
      });
      setTimeout(() => {
        indexPanel.style.display = 'none';
        indexPanel.querySelectorAll('.index-item').forEach(item => {
          item.style.transform = 'translateY(24px)';
        });
      }, DURATION);
    }

    activeView = 'grid';
    grid?.style.setProperty('opacity', '1');
    if (!activeId && !activeDeal) grid?.classList.remove('grid-dimmed');
    if (gridList) gridList.style.pointerEvents = 'auto';
    if (zoomDiv) { zoomDiv.style.opacity = '1'; zoomDiv.style.transform = 'translateY(0px)'; zoomDiv.style.pointerEvents = 'auto'; }
    if (viewDiv) viewDiv.style.transform = 'translateX(0px)';

    gridBtn.classList.add('active');
    indexBtn.classList.remove('active');
  });
}

function onButtonClick(id) {
  if (id === activeId) {
    closeAll();
    return;
  }

  if (activeId) closePanel(activeId);

  activeId = id;
  setButtonsOpacity(id);
  setBgDim(true);
  animateIn(id);
}

function animateIn(id) {
  const { panel, items } = CONFIG[id];
  const panelEl = document.querySelector(panel);
  if (!panelEl) return;

  panelEl.style.pointerEvents = 'auto';
  panelEl.querySelectorAll(items).forEach((item, i) => {
    setTimeout(() => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0px)';
    }, i * STAGGER);
  });
}

function closePanel(id) {
  const { panel, items } = CONFIG[id];
  const panelEl = document.querySelector(panel);
  if (!panelEl) return;

  panelEl.querySelectorAll(items).forEach(item => {
    item.style.opacity = '0';
  });

  setTimeout(() => {
    panelEl.style.pointerEvents = 'none';
    panelEl.querySelectorAll(items).forEach(item => {
      item.style.transform = 'translateY(24px)';
    });
  }, DURATION);
}

function setButtonsOpacity(activeButtonId) {
  Object.keys(CONFIG).forEach(id => {
    const btn = document.querySelector(id);
    if (btn) btn.style.opacity = activeButtonId && id !== activeButtonId ? '0.35' : '1';
  });
}

function initZoomCursor() {
  const btn      = document.querySelector('#zoomCursor');
  const gridList = document.querySelector('.grid-list');
  if (!btn || !gridList) return;

  const updateOrigin = () => {
    gridList.style.transformOrigin = `${window.innerWidth / 2}px ${window.innerHeight / 2}px`;
  };
  updateOrigin();
  window.addEventListener('resize', updateOrigin);

  const cursor = btn.querySelector('.cursor');
  if (cursor) cursor.style.setProperty('left', '12px', 'important');

  const { normal, zoomed: zoomedScale } = getZoomDefaults();
  let zoomed = false;

  // Appliquer le scale initial (mobile : 0.75, desktop : 1)
  if (normal !== 1) {
    gridList.style.transform = `scale(${normal})`;
    setZoomScale(normal);
  }

  btn.addEventListener('click', () => {
    zoomed = !zoomed;
    const scale = zoomed ? zoomedScale : normal;
    gridList.style.transition = 'transform 450ms cubic-bezier(.23, 1, .32, 1)';
    gridList.style.transform  = `scale(${scale})`;
    setZoomScale(scale);
    if (cursor) cursor.style.setProperty('left', zoomed ? '42px' : '12px', 'important');
  });
}

function setBgDim(active) {
  const viewEl   = document.querySelector(activeView === 'index' ? '.index' : '.grid');
  const grid     = document.querySelector('.grid');
  const footer   = document.querySelector('.footer');
  const controls = document.querySelector('.controls');
  const opacity  = active ? '0.1' : '';
  const pointer  = active ? 'none' : '';
  [viewEl, footer].forEach(el => {
    if (!el) return;
    el.style.opacity       = opacity;
    el.style.pointerEvents = pointer;
  });
  // .grid et tous ses descendants bloqués via classe CSS quand popup ouverte ou vue index
  if (grid) grid.classList.toggle('grid-dimmed', !!(active || activeView === 'index'));
  if (controls) {
    controls.style.opacity       = active ? '0' : '';
    controls.style.transform     = active ? 'translate(-50%, 24px)' : 'translate(-50%, 0px)';
    controls.style.pointerEvents = pointer;
  }
}
