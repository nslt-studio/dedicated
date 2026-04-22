import { initLoader } from './loader.js';
import { initAnimations } from './animations.js';
import { initPopups } from './popups.js';

document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initAnimations();
  initPopups();
});
