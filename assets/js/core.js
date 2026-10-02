/* ==========================================================================
   Adroit Marketiq — core behaviour (runs on every page)
   Loader, page transitions, header, menu, smooth scroll, scroll progress,
   cursor, magnetic buttons and scroll reveals.

   Everything here is progressive: if GSAP fails to load or the visitor prefers
   reduced motion, content is simply shown and navigation works as normal.
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var hasGsap = typeof window.gsap !== 'undefined';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motion = hasGsap && !reduced;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (!hasGsap) root.classList.add('no-gsap');
  if (reduced) root.classList.add('no-motion');
  if (hasGsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  if (hasGsap && window.SplitText) gsap.registerPlugin(SplitText);

  /* Shared state for sections.js / scene.js */
  var readyQueue = [];
  var AM = (window.AM = {
    motion: motion,
    reduced: reduced,
    finePointer: finePointer,
    lenis: null,
    isReady: false,
    /* Runs fn once the loader or page-transition cover starts to lift. */
    onReady: function (fn) {
      if (AM.isReady) fn();
      else readyQueue.push(fn);
    },
    scrollTo: function (target, offset) {
      var y =
        typeof target === 'number'
          ? target
          : target.getBoundingClientRect().top + window.scrollY - (offset == null ? headerOffset() : offset);
      if (AM.lenis) AM.lenis.scrollTo(y);
      else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    },
  });

  function fireReady() {
    if (AM.isReady) return;
    AM.isReady = true;
    readyQueue.splice(0).forEach(function (fn) {
      fn();
    });
  }

  function headerOffset() {
    var header = document.querySelector('[data-site-header]');
    return header ? header.offsetHeight + 12 : 0;
  }

  function store(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      sessionStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  /* ---------- Loader: mark → growth chart → logo → lift ----------
     The 3D growth chart lives in loader-scene.js (an ES module that loads Three.js).
     It has a short window to claim the loader; if it does not (slow network, no WebGL),
     the simple sequence below runs instead. Both end with the same logo reveal. */

  var LOADER_CLAIM_WINDOW = 1100; // ms to wait for the 3D sequence before falling back

  function runLoader() {
    if (!root.classList.contains('is-loading')) return false;
    var loader = document.querySelector('.loader');
    var cleanup = function () {
      root.classList.remove('is-loading');
      store('am:seen', '1');
    };

    if (!motion || !loader) {
      cleanup();
      fireReady();
      return true;
    }

    var mark = loader.querySelector('.loader__mark');
    var lockup = loader.querySelector('.loader__lockup');
    var meter = loader.querySelector('.loader__meter');
    var fill = loader.querySelector('.loader__fill');
    var count = loader.querySelector('.loader__count');
    var claimed = false;
    var finished = false;

    // One number drives both the line and the percentage, so they can never disagree.
    var progress = { value: 0 };
    function renderProgress() {
      var value = Math.max(0, Math.min(100, progress.value));
      fill.style.transform = 'scaleX(' + value / 100 + ')';
      count.textContent = Math.round(value) + '%';
    }
    // While the 3D library loads, the count creeps forward so the screen is never static.
    var creep = gsap.to(progress, {
      value: 22,
      duration: LOADER_CLAIM_WINDOW / 1000,
      ease: 'power1.out',
      onUpdate: renderProgress,
    });

    // Final beat: the logo wipes in on the centre, then the cover lifts off the page.
    function finish() {
      if (finished) return;
      finished = true;
      mark.style.animation = 'none';
      gsap
        .timeline({ onComplete: cleanup })
        .to(mark, { opacity: 0, scale: 0.85, duration: 0.2, overwrite: true }, 0)
        .to(meter, { opacity: 0, duration: 0.25 }, 0)
        .fromTo(
          lockup,
          { opacity: 1, clipPath: 'inset(0% 100% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, ease: 'power3.inOut' },
          0.05
        )
        .add(fireReady, '+=0.2')
        .to(loader, { yPercent: -100, duration: 0.6, ease: 'power3.inOut' });
    }

    function simpleSequence() {
      creep.kill();
      gsap.to(progress, { value: 100, duration: 0.8, ease: 'power2.inOut', onUpdate: renderProgress, onComplete: finish });
    }

    var fallbackTimer = setTimeout(function () {
      if (claimed) return;
      claimed = true;
      simpleSequence();
    }, LOADER_CLAIM_WINDOW);

    AM.loader = {
      /* Called by loader-scene.js once Three.js is ready. Returns null if the fallback already started. */
      claim: function () {
        if (claimed) return null;
        claimed = true;
        clearTimeout(fallbackTimer);
        creep.kill();
        return {
          finish: finish,
          fail: simpleSequence,
          /* progress() reads the current percentage; progress(n) sets it */
          progress: function (value) {
            if (value === undefined) return progress.value;
            progress.value = value;
            renderProgress();
          },
        };
      },
    };
    return true;
  }

  /* ---------- Page transitions ---------- */

  var cover = {
    panel: document.querySelector('.transition__panel'),
    content: document.querySelector('.transition__content'),
    title: document.querySelector('.transition__title'),
  };

  function resetCover() {
    root.classList.remove('is-arriving', 'is-leaving');
    if (hasGsap && cover.panel) gsap.set([cover.panel, cover.content], { clearProps: 'all' });
  }

  function runArrival() {
    if (!root.classList.contains('is-arriving')) return false;
    if (cover.title) cover.title.textContent = document.body.dataset.pageTitle || '';

    if (!motion || !cover.panel) {
      resetCover();
      fireReady();
      return true;
    }

    gsap
      .timeline({ onComplete: resetCover })
      .to(cover.content, { opacity: 0, y: -10, duration: 0.22, delay: 0.12, ease: 'power2.in' })
      .add(fireReady)
      .to(cover.panel, { yPercent: -101, duration: 0.6, ease: 'power3.inOut' }, '-=0.04');
    return true;
  }

  function pageLabel(url) {
    var file = url.pathname.split('/').pop() || 'index.html';
    var link = document.querySelector('.menu__link[href="' + file + '"]');
    return link ? link.textContent.trim() : '';
  }

  function initTransitions() {
    if (!motion || !cover.panel) return;

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var link = event.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

      var url;
      try {
        url = new URL(link.href, location.href);
      } catch (e) {
        return;
      }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      // Same page (with or without a hash) is handled by the anchor scroller.
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!/(\.html|\/)$/.test(url.pathname)) return;

      event.preventDefault();
      closeMenu(true);
      root.classList.add('is-leaving');
      if (cover.title) cover.title.textContent = pageLabel(url);
      store('am:transition', '1');

      gsap
        .timeline({
          onComplete: function () {
            location.href = url.href;
          },
        })
        .fromTo(cover.panel, { yPercent: 101 }, { yPercent: 0, duration: 0.5, ease: 'power3.inOut' })
        .fromTo(cover.content, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.26, ease: 'power2.out' }, '-=0.18');
    });

    // Returning via the back button restores the page from cache with the cover still down.
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) resetCover();
    });
  }

  /* ---------- Smooth scroll (Lenis) and in-page anchors ---------- */

  function initScroll() {
    if (motion && typeof window.Lenis !== 'undefined') {
      var lenis = (AM.lenis = new Lenis({ duration: 1.05, smoothWheel: true }));
      if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) {
        lenis.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
    }

    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href*="#"]');
      if (!link) return;
      var url = new URL(link.href, location.href);
      if (url.pathname !== location.pathname || !url.hash) return;
      var target = url.hash === '#top' ? document.body : document.getElementById(url.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      closeMenu(true);
      AM.scrollTo(url.hash === '#top' ? 0 : target);
      if (url.hash !== '#top') history.replaceState(null, '', url.hash);
      if (target !== document.body) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  }

  /* ---------- Header state, scroll progress, floating actions ---------- */

  function initScrollState() {
    var header = document.querySelector('[data-site-header]');
    var floating = document.querySelector('[data-floating]');
    var bar = document.querySelector('.progress__bar');
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (header) header.classList.toggle('is-scrolled', y > 24);
      if (floating) floating.classList.toggle('is-scrolled', y > window.innerHeight * 0.8);
      if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    }

    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- Full-screen menu ---------- */

  var menu = document.querySelector('[data-menu]');
  var toggle = document.querySelector('[data-menu-toggle]');
  var menuTimer;

  function setInert(state) {
    ['main', '.site-footer', '.floating'].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) el.inert = state;
    });
  }

  function openMenu() {
    if (!menu || !toggle) return;
    clearTimeout(menuTimer);
    menu.hidden = false;
    // next frame, so the opening transitions run
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        menu.classList.add('is-open');
      });
    });
    root.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.querySelector('.menu-toggle__label').textContent = 'Close';
    setInert(true);
    if (AM.lenis) AM.lenis.stop();
    document.body.style.overflow = 'hidden';
  }

  function closeMenu(instant) {
    if (!menu || !toggle || menu.hidden) return;
    menu.classList.remove('is-open');
    root.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.querySelector('.menu-toggle__label').textContent = 'Menu';
    setInert(false);
    if (AM.lenis) AM.lenis.start();
    document.body.style.overflow = '';
    clearTimeout(menuTimer);
    menuTimer = setTimeout(
      function () {
        menu.hidden = true;
      },
      instant ? 0 : 700
    );
  }

  function initMenu() {
    if (!menu || !toggle) return;

    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        toggle.focus();
      } else {
        openMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (menu.hidden) return;
      if (event.key === 'Escape') {
        closeMenu();
        toggle.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      // keep focus within the toggle + menu while it is open
      var focusable = [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll('a[href], button')));
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.matchMedia('(min-width: 1200px)').addEventListener('change', function (event) {
      if (event.matches) closeMenu(true);
    });
  }

  /* ---------- Cursor and magnetic buttons (fine pointers only) ---------- */

  function initCursor() {
    var cursor = document.querySelector('.cursor');
    if (!cursor || !motion || !finePointer) return;

    var ring = cursor.querySelector('.cursor__ring');
    var dot = cursor.querySelector('.cursor__dot');
    var ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    var ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
    var dotX = gsap.quickTo(dot, 'x', { duration: 0.08 });
    var dotY = gsap.quickTo(dot, 'y', { duration: 0.08 });
    var interactive = 'a, button, [role="tab"], input, select, textarea, summary, label';

    window.addEventListener(
      'mousemove',
      function (event) {
        if (!root.classList.contains('has-cursor')) {
          root.classList.add('has-cursor');
          gsap.set([ring, dot], { x: event.clientX, y: event.clientY });
        }
        ringX(event.clientX);
        ringY(event.clientY);
        dotX(event.clientX);
        dotY(event.clientY);
        cursor.classList.remove('is-hidden');
      },
      { passive: true }
    );

    document.addEventListener('mouseover', function (event) {
      cursor.classList.toggle('is-active', Boolean(event.target.closest(interactive)));
    });
    document.documentElement.addEventListener('mouseleave', function () {
      cursor.classList.add('is-hidden');
    });
  }

  function initMagnetic() {
    if (!motion || !finePointer) return;

    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var moveX = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
      var moveY = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });

      el.addEventListener('mousemove', function (event) {
        var box = el.getBoundingClientRect();
        moveX((event.clientX - (box.left + box.width / 2)) * 0.22);
        moveY((event.clientY - (box.top + box.height / 2)) * 0.32);
      });
      el.addEventListener('mouseleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)' });
      });
    });
  }

  /* ---------- Scroll reveals ---------- */

  function initReveals() {
    var labels = document.querySelectorAll('[data-reveal-label]');

    if (!motion || !window.ScrollTrigger) {
      labels.forEach(function (el) {
        el.classList.add('is-in');
      });
      return;
    }

    labels.forEach(function (el) {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: function () {
          el.classList.add('is-in');
        },
      });
    });

    // Headlines: line-by-line mask reveal, re-split automatically on resize.
    var splitHeadings = function () {
      document.querySelectorAll('[data-reveal="lines"]').forEach(function (el) {
        if (!window.SplitText) {
          gsap.set(el, { visibility: 'visible' });
          gsap.from(el, { opacity: 0, y: 24, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
          return;
        }
        SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          autoSplit: true,
          onSplit: function (self) {
            gsap.set(el, { visibility: 'visible' });
            if (el.dataset.revealed) return;
            return gsap.from(self.lines, {
              yPercent: 112,
              duration: 1.05,
              stagger: 0.09,
              ease: 'power4.out',
              scrollTrigger: {
                trigger: el,
                start: 'top 88%',
                once: true,
                onEnter: function () {
                  el.dataset.revealed = '1';
                },
              },
            });
          },
        });
      });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(splitHeadings);
    else splitHeadings();

    document.querySelectorAll('[data-reveal="fade"]').forEach(function (el) {
      gsap.fromTo(
        el,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } }
      );
    });

    document.querySelectorAll('[data-reveal="clip"]').forEach(function (el) {
      gsap.fromTo(
        el,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'power3.inOut', scrollTrigger: { trigger: el, start: 'top 85%', once: true } }
      );
    });

    // Parallax: the value is the fraction of the element's own height it travels.
    document.querySelectorAll('[data-parallax]').forEach(function (el) {
      var amount = parseFloat(el.dataset.parallax) || 0.1;
      gsap.fromTo(
        el,
        { yPercent: -amount * 100 },
        { yPercent: 0, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }
      );
    });

    document.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseInt(el.dataset.count, 10) || 0;
      var state = { value: 0 };
      el.textContent = '0';
      gsap.to(state, {
        value: target,
        duration: 1.2,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: function () {
          el.textContent = Math.round(state.value);
        },
      });
    });

    document.querySelectorAll('[data-draw]').forEach(function (el) {
      var section = el.closest('section') || el;
      gsap.fromTo(
        el,
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: section, start: 'top 75%', end: 'bottom 85%', scrub: 0.6 } }
      );
    });

    // Statement whose words fill in as it is read
    document.querySelectorAll('[data-fill-text]').forEach(function (el) {
      if (!window.SplitText) return;
      var split = SplitText.create(el, { type: 'words', wordsClass: 'fill-word', aria: 'auto' });
      gsap.to(split.words, {
        opacity: 1,
        ease: 'none',
        stagger: 0.12,
        scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 48%', scrub: 0.4 },
      });
    });

    // Footer wordmark fills from the left as the footer arrives
    var wordmark = document.querySelector('[data-footer-wordmark] .site-footer__wordmark-line');
    if (wordmark) {
      gsap.fromTo(
        wordmark,
        { '--fill': '0%' },
        { '--fill': '100%', ease: 'none', scrollTrigger: { trigger: wordmark, start: 'top 96%', end: 'top 55%', scrub: 0.5 } }
      );
    }
  }

  /* ---------- Boot ---------- */

  initScroll();
  initScrollState();
  initMenu();
  initTransitions();
  initCursor();
  initMagnetic();
  initReveals();

  if (!runLoader() && !runArrival()) fireReady();

  // Layout shifts once fonts and images settle; keep scroll triggers accurate.
  window.addEventListener('load', function () {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
})();
