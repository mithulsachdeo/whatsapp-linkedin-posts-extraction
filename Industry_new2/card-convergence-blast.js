/**
 * Card Convergence & Blast 3D Motion Orchestrator + Rotary Press Lazy-Loaded Editions
 *
 * Sequence:
 * 1. Initial Page Arrival:
 *    - Post cards in the first edition converge from all 360° directions outside the viewport
 *      into one temporary central small circle (colored #7a2418, matching "FROM THE ARCHIVE").
 *    - Singularity compresses and pulses; kinetic blast detonates with shockwave ring.
 *    - Post cards disperse outward with high velocity and 3D perspective depth, settling into place.
 * 2. Downstream "Print Next Edition" Action:
 *    - When the reader clicks "Print Next Edition", the next batch of dispatches is fetched via SSR fragment.
 *    - Appended in a separate, isolated 3-column edition band (zero reflow of earlier cards).
 *    - Newly printed cards enter via a tactile rotary press and wet-ink unroll animation (.anim-press-unroll)
 *      with staggered 35ms delays.
 * 3. 60fps GPU acceleration via transform3d, scale3d, and clip-path.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initConvergenceBlast() {
    if (prefersReducedMotion) return;

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

  function initEditionTrigger() {
    function bindTrigger() {
      const triggerBtn = document.querySelector('.edition-trigger');
      if (!triggerBtn) return;

      triggerBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        const nextOffset = triggerBtn.getAttribute('data-next-offset');
        const density = triggerBtn.getAttribute('data-density') || 'cards';
        const view = triggerBtn.getAttribute('data-view') || 'unread';

        const urlParams = new URLSearchParams(window.location.search);
        const q = urlParams.get('q') || '';
        const member = urlParams.get('member') || '';

        const params = new URLSearchParams();
        params.set('offset', nextOffset);
        params.set('density', density);
        params.set('view', view);
        if (q) params.set('q', q);
        if (member) params.set('member', member);

        triggerBtn.disabled = true;
        const originalText = triggerBtn.innerHTML;
        triggerBtn.innerHTML = '<span>⚙ Rolling Rotary Press...</span>';

        try {
          const res = await fetch('/dispatches?' + params.toString());
          if (!res.ok) throw new Error('Failed to fetch dispatches');
          const html = await res.text();

          const wrapper = triggerBtn.closest('.edition-trigger-wrap');
          if (!wrapper) return;

          const temp = document.createElement('div');
          temp.innerHTML = html.trim();

          const newBand = temp.querySelector('.edition-band');
          const newCards = newBand ? Array.from(newBand.children) : [];

          // Animate new cards with staggered rotary press unroll if reduced motion is off
          if (!prefersReducedMotion) {
            newCards.forEach((card, idx) => {
              card.classList.add('anim-press-unroll');
              card.style.setProperty('--delay', `${idx * 35}ms`);
            });
          }

          const parent = wrapper.parentNode;
          while (temp.firstChild) {
            parent.insertBefore(temp.firstChild, wrapper);
          }
          parent.removeChild(wrapper);

          // Re-bind to next trigger if one exists
          bindTrigger();

          // Smooth scroll to the newly printed edition divider
          if (newBand) {
            const divider = newBand.previousElementSibling;
            if (divider) {
              divider.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        } catch (err) {
          console.error(err);
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = originalText;
        }
      });
    }

    bindTrigger();
  }

  function start() {
    initConvergenceBlast();
    initEditionTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
