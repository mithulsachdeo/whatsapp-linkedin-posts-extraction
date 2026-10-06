/**
 * Card Convergence & Blast 3D Motion Orchestrator
 *
 * Sequence:
 * 1. Post cards converge from all 360° directions outside the viewport
 *    into one temporary central small circle (colored #7a2418, matching "FROM THE ARCHIVE").
 * 2. As cards enter the central circle, the singularity compresses and pulses with energy.
 * 3. At peak compression, a kinetic blast detonates, sending out a shockwave ring.
 * 4. Post cards disperse outwards with high velocity, 3D perspective depth, and photorealistic
 *    drop shadows before settling with back-easing into their exact grid/index layout positions.
 * 5. Smooth 60fps GPU acceleration via transform3d and scale3d.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Accessibility: respect user motion preferences
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  function initConvergenceBlast() {
    const cards = Array.from(
      document.querySelectorAll(
        '[data-testid="post-list-cards"] .anim-card-block, [data-testid="post-list-rows"] .anim-card-block'
      )
    );
    if (!cards.length) return;

    // Viewport center
    const vpCenterX = window.innerWidth / 2;
    const vpCenterY = window.innerHeight / 2;

    // Temporary central circle (#7a2418) and blast shockwave
    const circle = document.createElement('div');
    circle.id = 'convergence-center-circle';
    circle.setAttribute('aria-hidden', 'true');

    const shockwave = document.createElement('div');
    shockwave.id = 'convergence-shockwave';
    shockwave.setAttribute('aria-hidden', 'true');

    document.body.appendChild(shockwave);
    document.body.appendChild(circle);

    const total = cards.length;
    const maxDim = Math.max(window.innerWidth, window.innerHeight);
    const dist = maxDim * 0.9 + 300;

    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;

      // Exact vector to central circle
      const dx = vpCenterX - cardCenterX;
      const dy = vpCenterY - cardCenterY;

      // 360-degree perimeter entry vector
      // Distribute evenly around 360 degrees so cards converge from all directions
      const angle = (index / total) * Math.PI * 2 + (index % 2 === 0 ? 0.15 : -0.15);
      const sx = dx + Math.cos(angle) * dist;
      const sy = dy + Math.sin(angle) * dist;

      card.style.setProperty('--cx', `${Math.round(dx)}px`);
      card.style.setProperty('--cy', `${Math.round(dy)}px`);
      card.style.setProperty('--sx', `${Math.round(sx)}px`);
      card.style.setProperty('--sy', `${Math.round(sy)}px`);
    });

    // Cleanup temporary elements once animation completes (~2.1s)
    let isCleanedUp = false;
    function cleanup() {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (circle.parentNode) circle.parentNode.removeChild(circle);
      if (shockwave.parentNode) shockwave.parentNode.removeChild(shockwave);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', cleanup);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') cleanup();
    }

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', cleanup, { once: true });
    setTimeout(cleanup, 2100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConvergenceBlast);
  } else {
    initConvergenceBlast();
  }
})();
