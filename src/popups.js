import { setZoomScale, getZoomDefaults, setDealFrozen } from './animations.js';

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
let touchEndHandled  = false;
let resetFilters     = null;
let resetAccordion   = null;

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

    // Deal : clic en dehors du deal-item actif
    if (activeDeal) {
      const dealItemEl = document.querySelector(`.deal-item[data-deal="${activeDeal}"]`);
      if (dealItemEl && !dealItemEl.contains(target)) closeDeal();
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
  initFilterTags();
  initFiltersPanel();
  initAboutAccordion();
}

function openDeal(name) {
  const dealEl = document.querySelector('.deal');
  if (!dealEl) return;

  if (dealCloseTimer) { clearTimeout(dealCloseTimer); dealCloseTimer = null; }
  if (activeDeal) closeDeal();
  activeDeal = name;

  setDealFrozen(true);
  setBgDim(true);
  dealEl.style.pointerEvents = 'auto';
  dealEl.querySelectorAll('.deal-item').forEach(el => { el.style.pointerEvents = 'none'; });
  const dealItem = dealEl.querySelector(`.deal-item[data-deal="${name}"]`);
  if (!dealItem) return;

  dealItem.style.pointerEvents = 'auto';
  const staggerEls = [...dealItem.querySelectorAll('.deal-inner, .deal-close')];
  staggerEls.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity       = '1';
      el.style.transform     = el.classList.contains('deal-close') ? 'translate(-50%, 0px)' : 'translateY(0px)';
      el.style.pointerEvents = 'auto';
    }, i * 50);
  });
}

function closeDeal() {
  const dealEl = document.querySelector('.deal');
  if (!dealEl || !activeDeal) return;

  const dealItem = dealEl.querySelector(`.deal-item[data-deal="${activeDeal}"]`);
  activeDeal = null;
  setDealFrozen(false);
  setBgDim(false);

  if (dealItem) {
    dealItem.style.pointerEvents = 'none';
    dealItem.querySelectorAll('.deal-inner, .deal-close').forEach(el => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
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
  setNavInvert(true);
}

function initViewToggle() {
  const indexBtn   = document.querySelector('#indexButton');
  const gridBtn    = document.querySelector('#gridButton');
  const indexPanel = document.querySelector('.index');
  const grid       = document.querySelector('.grid');
  const gridList   = document.querySelector('.grid-list');
  const zoomDiv    = document.querySelector('#zoomDiv');
  const filtersDiv = document.querySelector('#filtersDiv');
  if (!indexBtn || !gridBtn) return;

  if (grid) grid.style.transition = 'opacity 0.4s ease';

  let indexCloseTimer = null;

  indexBtn.addEventListener('click', () => {
    if (indexCloseTimer) { clearTimeout(indexCloseTimer); indexCloseTimer = null; }

    grid?.style.setProperty('opacity', '0');
    grid?.classList.add('grid-dimmed');
    if (gridList) gridList.style.pointerEvents = 'none';
    if (zoomDiv) { zoomDiv.style.opacity = '0'; zoomDiv.style.transform = 'translateY(24px)'; zoomDiv.style.pointerEvents = 'none'; }
    if (filtersDiv) { filtersDiv.style.opacity = '1'; filtersDiv.style.transform = 'translateY(0%)'; filtersDiv.style.pointerEvents = 'auto'; }

    if (indexPanel) {
      indexPanel.style.display = 'block';
      resetFilters?.();
      const items = [...indexPanel.querySelectorAll('.index-item')];
      // Reset to initial state instantly before animating in
      items.forEach(item => {
        item.style.transition = 'none';
        item.style.opacity    = '0';
        item.style.transform  = 'translateY(24px)';
      });
      indexPanel.offsetHeight;
      items.forEach(item => { item.style.transition = ''; });
      items.forEach((item, i) => {
        setTimeout(() => {
          item.style.opacity       = '1';
          item.style.transform     = 'translateY(0px)';
          item.style.pointerEvents = 'auto';
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
        item.style.opacity       = '0';
        item.style.pointerEvents = 'none';
      });
      indexCloseTimer = setTimeout(() => {
        indexCloseTimer = null;
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
    if (filtersDiv) { filtersDiv.style.opacity = '0'; filtersDiv.style.transform = 'translateY(-100%)'; filtersDiv.style.pointerEvents = 'none'; }

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
  setNavInvert(false);
  animateIn(id);
}

function animateIn(id) {
  const { panel, items } = CONFIG[id];
  const panelEl = document.querySelector(panel);
  if (!panelEl) return;

  panelEl.style.pointerEvents = 'auto';
  panelEl.querySelectorAll(items).forEach((item, i) => {
    setTimeout(() => {
      item.style.opacity       = '1';
      item.style.transform     = 'translateY(0px)';
      item.style.pointerEvents = 'auto';
    }, i * STAGGER);
  });
}

function closePanel(id) {
  const { panel, items } = CONFIG[id];
  const panelEl = document.querySelector(panel);
  if (!panelEl) return;

  if (id === '#aboutButton') resetAccordion?.();

  panelEl.querySelectorAll(items).forEach(item => {
    item.style.opacity       = '0';
    item.style.pointerEvents = 'none';
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
  const cursor   = btn?.querySelector('.cursor');
  if (!btn || !gridList) return;

  const CURSOR_MIN = 0;
  const CURSOR_MAX = 54;

  const updateOrigin = () => {
    gridList.style.transformOrigin = `${window.innerWidth / 2}px ${window.innerHeight / 2}px`;
  };
  updateOrigin();
  window.addEventListener('resize', updateOrigin);

  const { normal, zoomed: zoomedScale } = getZoomDefaults();

  if (normal !== 1) {
    gridList.style.transform = `scale(${normal})`;
    setZoomScale(normal);
  }

  let cursorLeft    = CURSOR_MIN;
  let dragging      = false;
  let dragStartX    = 0;
  let dragStartLeft = CURSOR_MIN;

  if (cursor) cursor.style.setProperty('left', `${CURSOR_MIN}px`, 'important');

  function applyLeft(left) {
    cursorLeft    = Math.max(CURSOR_MIN, Math.min(CURSOR_MAX, left));
    const t       = (cursorLeft - CURSOR_MIN) / (CURSOR_MAX - CURSOR_MIN);
    const scale   = normal + t * (zoomedScale - normal);
    gridList.style.transform = `scale(${scale})`;
    setZoomScale(scale);
    if (cursor) cursor.style.setProperty('left', `${cursorLeft}px`, 'important');
  }

  function startDrag(clientX) {
    const rect = btn.getBoundingClientRect();
    applyLeft(clientX - rect.left);
    dragging      = true;
    dragStartX    = clientX;
    dragStartLeft = cursorLeft;
    gridList.style.transition = 'none';
  }

  function moveDrag(clientX) {
    if (!dragging) return;
    applyLeft(dragStartLeft + (clientX - dragStartX));
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    gridList.style.transition = 'transform 450ms cubic-bezier(.23, 1, .32, 1)';
  }

  btn.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientX); });
  window.addEventListener('mousemove', e => moveDrag(e.clientX));
  window.addEventListener('mouseup', endDrag);

  btn.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e.touches[0].clientX); }, { passive: false });
  window.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); moveDrag(e.touches[0].clientX); } }, { passive: false });
  window.addEventListener('touchend', endDrag);
}

function initFilterTags() {
  document.querySelectorAll('.index-item[data-deal]').forEach(indexItem => {
    const gridItem = document.querySelector(`.grid-item[data-deal="${indexItem.dataset.deal}"]`);
    if (!gridItem) return;
    const tags = [...gridItem.querySelectorAll('.tags-list .tags-item p')]
      .map(p => p.textContent.trim())
      .filter(Boolean);
    if (tags.length) indexItem.setAttribute('filter-tag', tags.join(', '));
  });
}

function initFiltersPanel() {
  const btn        = document.querySelector('#filtersButton');
  const filtersDiv = document.querySelector('#filtersDiv');
  const panel      = document.querySelector('.filters');
  if (!btn || !panel) return;

  const innerItems = [...panel.querySelectorAll('.filters-inner')];
  const label      = btn.querySelector('p') || btn;

  let isOpen = false;

  function openFilters() {
    isOpen = true;
    panel.style.pointerEvents = 'auto';
    [...innerItems].reverse().forEach((el, i) => {
      setTimeout(() => {
        el.style.opacity       = '1';
        el.style.transform     = 'translateY(0px)';
        el.style.pointerEvents = 'auto';
      }, i * STAGGER);
    });
    label.textContent = 'Hide Filters';
    filtersDiv.style.filter = 'invert(100%)';
  }

  function closeFilters() {
    isOpen = false;
    innerItems.forEach(el => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
    setTimeout(() => {
      panel.style.pointerEvents = 'none';
      innerItems.forEach(el => { el.style.transform = 'translateY(24px)'; });
    }, DURATION);
    label.textContent = 'Show Filters';
    filtersDiv.style.filter = 'invert(0%)';
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    isOpen ? closeFilters() : openFilters();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closeFilters();
  });

  document.addEventListener('click', e => {
    if (isOpen && !panel.contains(e.target) && e.target !== btn) closeFilters();
  });

  // Filter buttons
  const filterBtns = [...panel.querySelectorAll('[data-filter]')];
  let activeFilter  = null;

  function filterText(b) { return b.textContent.trim(); }

  function itemMatchesFilter(item, text) {
    return ['filter-maturity', 'filter-status', 'filter-tag'].some(attr => {
      return (item.getAttribute(attr) || '').split(',').map(s => s.trim()).includes(text);
    });
  }

  // Masquer les tags-filter-item sans résultats
  const allIndexItems = [...document.querySelectorAll('.index-item')];
  filterBtns.forEach(b => {
    const hasMatch = allIndexItems.some(item => itemMatchesFilter(item, filterText(b)));
    if (!hasMatch) {
      const tagItem = b.closest('.tags-filter-item');
      if (tagItem) tagItem.style.display = 'none';
    }
  });

  function setButtonsHighlight(hoverText) {
    const hasHighlight = hoverText || activeFilter;
    filterBtns.forEach(b => {
      const t = filterText(b);
      b.style.opacity = (!hasHighlight || t === hoverText || t === activeFilter) ? '1' : '0.5';
    });
  }

  let itemHeights = null;

  function ensureHeights() {
    if (itemHeights) return;
    itemHeights = new Map();
    document.querySelectorAll('.index-item').forEach(item => {
      const h = item.offsetHeight;
      itemHeights.set(item, h);
      item.style.overflow   = 'hidden';
      item.style.transition = 'none';
      item.style.height     = `${h}px`;
      item.offsetHeight;
      item.style.transition = '';
    });
  }

  function setItemsFilter(text) {
    ensureHeights();
    document.querySelectorAll('.index-item').forEach(item => {
      const matches = !text || itemMatchesFilter(item, text);
      item.style.overflow      = 'hidden';
      item.style.height        = matches ? `${itemHeights.get(item)}px` : '0px';
      item.style.opacity       = matches ? '1' : '0';
      item.style.pointerEvents = matches ? 'auto' : 'none';
    });
  }

  filterBtns.forEach(b => {
    b.addEventListener('mouseover', () => setButtonsHighlight(filterText(b)));
    b.addEventListener('mouseout',  () => setButtonsHighlight(activeFilter));
    b.addEventListener('click', e => {
      e.stopPropagation();
      const text = filterText(b);
      activeFilter = activeFilter === text ? null : text;
      setButtonsHighlight(activeFilter);
      setItemsFilter(activeFilter);
    });
  });

  resetFilters = () => {
    if (isOpen) closeFilters();
    activeFilter = null;
    setButtonsHighlight(null);
    setItemsFilter(null);
  };
}

function initAboutAccordion() {
  const btn       = document.querySelector('.about .more-button');
  const accordion = document.querySelector('.about .accordion');
  if (!btn || !accordion) return;

  const label = btn.querySelector('p') || btn;
  let isOpen  = false;

  accordion.style.overflow   = 'hidden';
  accordion.style.maxHeight  = '0px';
  //accordion.style.transition = 'max-height 0.4s ease';

  btn.addEventListener('click', e => {
    e.stopPropagation();
    isOpen = !isOpen;
    if (isOpen) {
      const inner = accordion.querySelector('.accordion-inner');
      accordion.style.maxHeight = `${inner ? inner.offsetHeight : accordion.scrollHeight}px`;
      accordion.querySelectorAll('.accordion-item').forEach(item => {
        item.style.opacity       = '1';
        item.style.transform     = 'translateY(0px)';
        item.style.pointerEvents = 'auto';
      });
      label.textContent = 'Read Less -';
    } else {
      accordion.style.maxHeight = '0px';
      label.textContent = 'Read More +';
    }
  });

  resetAccordion = () => {
    if (!isOpen) return;
    isOpen = false;
    accordion.querySelectorAll('.accordion-item').forEach(item => {
      item.style.opacity       = '0';
      item.style.pointerEvents = 'none';
    });
    setTimeout(() => {
      accordion.style.maxHeight = '0px';
      accordion.querySelectorAll('.accordion-item').forEach(item => {
        item.style.transform = 'translateY(24px)';
      });
    }, DURATION);
    label.textContent = 'Read More +';
  };
}

function setNavInvert(inverted) {
  const nav = document.querySelector('.nav');
  if (nav) nav.style.filter = inverted ? 'invert(100%)' : 'invert(0%)';
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
  // .index et tous ses descendants bloqués quand un panel/deal est ouvert en vue liste
  const indexEl = document.querySelector('.index');
  if (indexEl) indexEl.classList.toggle('grid-dimmed', !!(active && activeView === 'index'));
  if (controls) {
    controls.style.opacity       = active ? '0' : '';
    controls.style.transform     = active ? 'translate(-50%, 24px)' : 'translate(-50%, 0px)';
    controls.style.pointerEvents = pointer;
  }
}
