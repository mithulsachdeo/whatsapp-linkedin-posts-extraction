/**
 * Newspaper Gutter Photo Ads
 *
 * Markup is server-rendered by src/views/dashboard.js (Posts page only).
 * This script is loaded on every page (see layout.js) but is fully
 * defensive -- when `[data-testid="gutter-ads-root"]` isn't present (every
 * page except `/`, or `/` with the gutters_hidden cookie set) every function
 * here no-ops immediately.
 *
 * Entrance coordination (Q9): card-convergence-blast.js dispatches no
 * completion event -- its only hook is an internal `setTimeout(cleanup,
 * 2100)` (and an early return, with nothing to wait for, when
 * prefers-reduced-motion is set). So the gutters fade in on a matching
 * delay rather than an event listener: 2100ms when the entrance animation
 * is actually running, 0ms when reduced motion means it never ran.
 *
 * Rotation (Q4/Q7): every 5s, cross-fade exactly one of the 6 visible slots
 * to a photo not currently shown anywhere, paused while the tab is hidden.
 * Reduced motion disables rotation entirely -- the server-picked initial 6
 * stay put.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var CONVERGENCE_BLAST_DURATION_MS = 2100; // must match Industry_new2/card-convergence-blast.js's cleanup timeout
  var ROTATION_INTERVAL_MS = 5000;
  var CROSSFADE_MS = 450; // must match the .gutter-slot img transition in dashboard.js
  var GUTTER_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // matches src/http/gutterCookie.js

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function initEntranceFade(root) {
    var delay = prefersReducedMotion() ? 0 : CONVERGENCE_BLAST_DURATION_MS;
    window.setTimeout(function () {
      root.classList.add('gutter-ads-visible');
    }, delay);
  }

  function initClose(root) {
    var closeButtons = root.querySelectorAll('[data-gutter-close]');
    for (var i = 0; i < closeButtons.length; i++) {
      closeButtons[i].addEventListener('click', function () {
        document.cookie =
          'gutters_hidden=1; Path=/; Max-Age=' + GUTTER_COOKIE_MAX_AGE_SECONDS + '; SameSite=Lax';
        root.parentNode && root.parentNode.removeChild(root);
      });
    }
  }

  function initRotation(root) {
    if (prefersReducedMotion()) return;

    var pool = (root.getAttribute('data-photos') || '').split(',').filter(Boolean);
    if (pool.length === 0) return;

    var slots = Array.prototype.slice.call(root.querySelectorAll('[data-gutter-img]'));
    if (slots.length === 0) return;

    var timer = null;

    function visibleFilenames() {
      return slots.map(function (img) {
        return img.getAttribute('data-gutter-img');
      });
    }

    function rotateOne() {
      var visible = visibleFilenames();
      var candidates = pool.filter(function (name) {
        return visible.indexOf(name) === -1;
      });
      if (candidates.length === 0) return;

      var slot = slots[Math.floor(Math.random() * slots.length)];
      var next = candidates[Math.floor(Math.random() * candidates.length)];

      slot.style.opacity = '0';
      window.setTimeout(function () {
        slot.src = '/assets/gutter-photos/' + next;
        slot.setAttribute('data-gutter-img', next);
        slot.style.opacity = '1';
      }, CROSSFADE_MS);
    }

    function start() {
      if (timer === null) timer = window.setInterval(rotateOne, ROTATION_INTERVAL_MS);
    }

    function stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    start();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
  }

  function start() {
    var root = document.querySelector('[data-testid="gutter-ads-root"]');
    if (!root) return;

    initEntranceFade(root);
    initClose(root);
    initRotation(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
