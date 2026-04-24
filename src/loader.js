const INITIAL_DELAY      = 600;  // ms avant d'animer les headlines
const HEADLINE_STAGGER   = 100;  // ms entre chaque headline
const HEADLINE_TRANS     = 300;  // durée de la transition CSS des headlines (ms)
const HOLD_DELAY         = 900;  // ms d'attente après la dernière headline
const HEADLINE_FADE_OUT  = 300;  // ms pour faire disparaître les headlines
const LOADER_FADE        = 600;  // durée de la transition opacity du loader (ms, définie en CSS)

export function initLoader() {
  const loader    = document.querySelector('.loader');
  const headlines = [...document.querySelectorAll('.headline')];
  if (!loader) return;

  // 1. Stagger headlines IN
  headlines.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0px)';
    }, INITIAL_DELAY + i * HEADLINE_STAGGER);
  });

  // Moment où la dernière headline a fini d'apparaître
  const allInAt = INITIAL_DELAY
    + (headlines.length - 1) * HEADLINE_STAGGER
    + HEADLINE_TRANS
    + HOLD_DELAY;

  // 2. Fade out headlines en stagger
  headlines.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity   = '0';
      el.style.transform = 'translateY(-24px)';
    }, allInAt + i * HEADLINE_STAGGER);
  });

  // 3. Fade out loader après la dernière headline + sa transition
  const allOutAt = allInAt + (headlines.length - 1) * HEADLINE_STAGGER + HEADLINE_FADE_OUT;
  setTimeout(() => {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, LOADER_FADE);
  }, allOutAt);
}
