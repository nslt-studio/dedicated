import { setZoomScale } from './animations.js';

const STAGGER = 100;
const DURATION = 300;

const CONFIG = {
  '#newsButton':  { panel: '.news',  items: '.news-item' },
  '#aboutButton': { panel: '.about', items: '.about-item' },
  '#teamButton':  { panel: '.team',  items: '.team-item' },
};

let activeId   = null;
let activeView = 'grid'; // 'grid' | 'index'
let activeDeal    = null;
let dealCloseTimer = null;

export function initPopups() {
  Object.keys(CONFIG).forEach(id => {
    document.querySelector(id)?.addEventListener('click', () => onButtonClick(id));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (activeDeal) closeDeal();
      else if (activeId) closeAll();
    }
  });

  document.addEventListener('click', e => {
    // Deal : bouton fermeture
    if (e.target.closest('.deal-close') && activeDeal) { closeDeal(); return; }

    // Deal : clic sur un item
    const item = e.target.closest('.grid-item[data-deal], .index-item[data-deal]');
    if (item) {
      openDeal(item.dataset.deal);
      return;
    }

    // Deal : clic en dehors
    if (activeDeal) {
      const dealEl = document.querySelector('.deal');
      if (dealEl && !dealEl.contains(e.target)) closeDeal();
    }

    // Popups : clic en dehors
    if (!activeId) return;
    const panelEl = document.querySelector(CONFIG[activeId].panel);
    if (!panelEl) return;
    const clickedButton = Object.keys(CONFIG).some(id => document.querySelector(id)?.contains(e.target));
    if (!panelEl.contains(e.target) && !clickedButton) closeAll();
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
      el.style.transform = 'translateY(0px)';
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
      dealItem.querySelectorAll('.deal-inner, .deal-close').forEach(el => { el.style.transform = 'translateY(24px)'; });
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
  if (!indexBtn || !gridBtn) return;

  if (grid) grid.style.transition = 'opacity 0.4s ease';

  indexBtn.addEventListener('click', () => {
    grid?.style.setProperty('opacity', '0');
    if (gridList) gridList.style.pointerEvents = 'none';
    if (zoomDiv) { zoomDiv.style.opacity = '0'; zoomDiv.style.transform = 'translateY(24px)'; zoomDiv.style.pointerEvents = 'none'; }

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
    if (gridList) gridList.style.pointerEvents = 'auto';
    if (zoomDiv) { zoomDiv.style.opacity = '1'; zoomDiv.style.transform = 'translateY(0px)'; zoomDiv.style.pointerEvents = 'auto'; }

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
  const cursor   = btn?.querySelector('.cursor');
  const gridList = document.querySelector('.grid-list');
  if (!btn || !cursor || !gridList) return;

  gridList.style.transition = 'transform 450ms cubic-bezier(.23, 1, .32, 1)';

  const updateOrigin = () => {
    gridList.style.transformOrigin = `${window.innerWidth / 2}px ${window.innerHeight / 2}px`;
  };
  updateOrigin();
  window.addEventListener('resize', updateOrigin);

  let zoomed = false;
  btn.addEventListener('click', () => {
    zoomed = !zoomed;
    const scale               = zoomed ? 0.65 : 1;
    cursor.style.left         = zoomed ? '12px' : '42px';
    gridList.style.transform  = `scale(${scale})`;
    setZoomScale(scale);
  });
}

function setBgDim(active) {
  const viewEl = document.querySelector(activeView === 'index' ? '.index' : '.grid');
  const footer = document.querySelector('.footer');
  const opacity = active ? '0.1' : '';
  const pointer = active ? 'none' : '';
  [viewEl, footer].forEach(el => {
    if (!el) return;
    el.style.opacity       = opacity;
    el.style.pointerEvents = pointer;
  });
}
