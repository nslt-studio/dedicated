const INITIAL_DELAY      = 600;  // ms before headlines start animating
const HEADLINE_STAGGER   = 100;  // ms between each headline
const HEADLINE_TRANS     = 300;  // headline CSS transition duration (ms)
const HOLD_DELAY         = 1500;  // ms to hold after the last headline
const HEADLINE_FADE_OUT  = 300;  // ms for headlines to fade out
const LOADER_FADE        = 600;  // loader opacity transition duration (ms, set in CSS)

export function initLoader() {
  const loader    = document.querySelector('.loader');
  const headlines = [...document.querySelectorAll('.headline')];
  if (!loader) return;

  // Stagger headlines in
  headlines.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0px)';
    }, INITIAL_DELAY + i * HEADLINE_STAGGER);
  });

  // When the last headline finishes appearing
  const allInAt = INITIAL_DELAY
    + (headlines.length - 1) * HEADLINE_STAGGER
    + HEADLINE_TRANS
    + HOLD_DELAY;

  // Stagger headlines out
  headlines.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity   = '0';
      el.style.transform = 'translateY(-24px)';
    }, allInAt + i * HEADLINE_STAGGER);
  });

  // Fade out the loader once the last headline is done
  const allOutAt = allInAt + (headlines.length - 1) * HEADLINE_STAGGER + HEADLINE_FADE_OUT;
  setTimeout(() => {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, LOADER_FADE);
  }, allOutAt);
}
