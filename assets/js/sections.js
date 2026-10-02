/* ==========================================================================
   Adroit Marketiq — section interactions
   Hero entrance, service rail, approach counter, process journey,
   industry selector, work plates and filter, live illustrations.
   Depends on core.js (window.AM). Each block exits quietly if its markup is absent.
   ========================================================================== */

(function () {
  'use strict';

  var AM = window.AM || { motion: false, onReady: function (fn) { fn(); } };
  var motion = AM.motion && typeof window.ScrollTrigger !== 'undefined';
  var each = function (list, fn) {
    Array.prototype.forEach.call(list, fn);
  };

  /* ---------- Hero entrance (home) ---------- */

  function initHero() {
    var hero = document.querySelector('[data-hero]');
    if (!hero) return;
    var lines = hero.querySelectorAll('.hero__line > span');
    var items = hero.querySelectorAll('[data-hero-item]');
    var arrow = hero.querySelector('.hero__equation-arrow');

    if (!AM.motion) return;

    gsap.set(lines, { y: 0, yPercent: 108 }); // y: 0 overrides the CSS start offset, which GSAP would otherwise read as pixels
    gsap.set(items, { opacity: 0, y: 20 });
    if (arrow) gsap.set(arrow, { scaleX: 0, transformOrigin: 'left center' });
    hero.classList.add('is-armed');

    AM.onReady(function () {
      var tl = gsap.timeline({ delay: 0.1 });
      tl.to(lines, { yPercent: 0, duration: 1.15, stagger: 0.11, ease: 'power4.out' })
        .to(items, { opacity: 1, y: 0, duration: 0.85, stagger: 0.1, ease: 'power3.out' }, '-=0.7');
      if (arrow) tl.to(arrow, { scaleX: 1, duration: 0.8, ease: 'power3.inOut' }, '-=0.9');
    });

    // The headline drifts up a little slower than the page as the hero leaves.
    if (motion) {
      gsap.to(hero.querySelector('.hero__inner'), {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      });
    }
  }

  /* ---------- Illustrations: animate only while visible ---------- */

  function initLiveFigures() {
    var figures = document.querySelectorAll('[data-viz], [data-chain]');
    if (!figures.length) return;

    if (!('IntersectionObserver' in window)) {
      each(figures, function (el) {
        el.classList.add('is-live');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          // On the pinned desktop rail the active tab decides, not visibility.
          if (entry.target.closest('[data-rail].is-pinned')) return;
          entry.target.classList.toggle('is-live', entry.isIntersecting);
        });
      },
      { threshold: 0.35 }
    );
    each(figures, function (el) {
      observer.observe(el);
    });
  }

  /* ---------- 02 Service rail ---------- */

  function initRail() {
    var rail = document.querySelector('[data-rail]');
    if (!rail) return;

    var pin = rail.querySelector('[data-rail-pin]');
    var items = rail.querySelectorAll('[data-rail-item]');
    var tabs = rail.querySelectorAll('[data-rail-tab]');
    var progress = rail.querySelector('[data-rail-progress]');
    var desktop = window.matchMedia('(min-width: 1024px)');
    var active = -1;
    var trigger = null;

    function setActive(index) {
      if (index === active) return;
      active = index;
      each(items, function (item, i) {
        var on = i === index;
        item.classList.toggle('is-active', on);
        tabs[i].setAttribute('aria-current', on ? 'true' : 'false');
        each(item.querySelectorAll('[data-viz], [data-chain]'), function (el) {
          el.classList.toggle('is-live', on);
        });
      });
    }

    function enableDesktop() {
      rail.classList.add('is-pinned');
      active = -1;
      setActive(0);

      if (!motion) return;
      trigger = ScrollTrigger.create({
        trigger: pin,
        start: 'top top',
        end: function () {
          return '+=' + Math.round(window.innerHeight * 0.6 * items.length);
        },
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          setActive(Math.min(items.length - 1, Math.floor(self.progress * items.length)));
          if (progress) progress.style.transform = 'scaleY(' + self.progress + ')';
        },
      });
    }

    function disableDesktop() {
      rail.classList.remove('is-pinned');
      if (trigger) {
        trigger.kill(true);
        trigger = null;
      }
      active = -1;
      each(items, function (item) {
        item.classList.remove('is-active');
        each(item.querySelectorAll('[data-viz], [data-chain]'), function (el) {
          el.classList.remove('is-live');
        });
      });
    }

    each(tabs, function (tab, i) {
      tab.addEventListener('click', function () {
        if (!desktop.matches) return;
        if (trigger) {
          // land in the middle of that service's scroll segment
          AM.scrollTo(trigger.start + ((i + 0.5) / items.length) * (trigger.end - trigger.start), 0);
        } else {
          setActive(i);
        }
      });
    });

    var apply = function () {
      if (desktop.matches) enableDesktop();
      else disableDesktop();
    };
    desktop.addEventListener('change', apply);
    apply();
  }

  /* ---------- 03 Approach: counter follows the principle in view ---------- */

  function initApproach() {
    var list = document.querySelector('[data-approach]');
    if (!list || !motion) return;
    var principles = list.querySelectorAll('[data-principle]');
    var strip = document.querySelector('[data-approach-counter] .approach__counter-strip');

    list.classList.add('is-tracking');
    each(principles, function (el, i) {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 58%',
        end: 'bottom 58%',
        onToggle: function (self) {
          if (!self.isActive) return;
          each(principles, function (other) {
            other.classList.toggle('is-active', other === el);
          });
          if (strip) strip.style.setProperty('--step', i);
        },
      });
    });
    principles[0].classList.add('is-active');
  }

  /* ---------- 04 Process journey: one line through six nodes ---------- */

  function initJourney() {
    each(document.querySelectorAll('[data-journey]'), function (journey) {
      var track = journey.querySelector('.journey__track');
      var svg = journey.querySelector('.journey__svg');
      var base = journey.querySelector('.journey__path--base');
      var live = journey.querySelector('.journey__path--live');
      var head = journey.querySelector('.journey__head');
      var steps = journey.querySelectorAll('[data-step]');
      var capStart = journey.querySelector('.journey__cap--start');
      var capEnd = journey.querySelector('.journey__cap--end');
      var length = 0;
      var nodeLengths = [];
      var yStart = 0;
      var yEnd = 0;
      var progress = motion ? 0 : 1;

      // The path only moves downward, so the length at a given y can be found by bisection.
      function lengthAtY(y) {
        var lo = 0;
        var hi = length;
        for (var i = 0; i < 18; i++) {
          var mid = (lo + hi) / 2;
          if (live.getPointAtLength(mid).y < y) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      }

      function render() {
        if (!length) return;
        var drawn = lengthAtY(yStart + progress * (yEnd - yStart));
        live.style.strokeDasharray = length;
        live.style.strokeDashoffset = length - drawn;
        var point = live.getPointAtLength(drawn);
        head.style.transform = 'translate(' + point.x + 'px,' + point.y + 'px)';
        head.style.opacity = motion && progress > 0.005 && progress < 0.995 ? 1 : 0;
        each(steps, function (step, i) {
          step.classList.toggle('is-reached', drawn >= nodeLengths[i] - 2);
        });
      }

      function build() {
        var box = track.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var centre = box.width / 2;
        yStart = capStart.getBoundingClientRect().bottom - box.top - parseFloat(getComputedStyle(capStart).paddingBottom) + 14;
        yEnd = capEnd.getBoundingClientRect().top - box.top + parseFloat(getComputedStyle(capEnd).paddingTop) - 14;

        var points = [];
        each(steps, function (step) {
          var node = step.querySelector('.step__node').getBoundingClientRect();
          points.push([node.left + node.width / 2 - box.left, node.top + node.height / 2 - box.top]);
        });
        points.push([centre, yEnd]);

        var d = 'M' + centre + ' ' + yStart;
        var prev = [centre, yStart];
        points.forEach(function (p) {
          var mid = (prev[1] + p[1]) / 2;
          d += ' C' + prev[0] + ' ' + mid + ' ' + p[0] + ' ' + mid + ' ' + p[0] + ' ' + p[1];
          prev = p;
        });

        svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
        base.setAttribute('d', d);
        live.setAttribute('d', d);
        length = live.getTotalLength();
        nodeLengths = points.slice(0, steps.length).map(function (p) {
          return lengthAtY(p[1]);
        });
        render();
      }

      build();
      window.addEventListener('resize', build);
      window.addEventListener('load', build);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);

      if (!motion) return;
      journey.classList.add('is-tracking');
      ScrollTrigger.create({
        trigger: journey,
        start: 'top 62%',
        end: 'bottom 62%',
        scrub: 0.5,
        onRefresh: build,
        onUpdate: function (self) {
          progress = self.progress;
          render();
        },
      });
    });
  }

  /* ---------- 05 Industry selector (tabs) ---------- */

  function initIndustries() {
    each(document.querySelectorAll('[data-industries]'), function (selector) {
      var tabs = selector.querySelectorAll('[role="tab"]');
      var panels = selector.querySelectorAll('[role="tabpanel"]');
      var current = 0;
      var leaveTimer;

      function select(index, focus) {
        if (index === current) return;
        var previous = panels[current];
        clearTimeout(leaveTimer);
        each(panels, function (panel) {
          panel.classList.remove('is-leaving');
        });
        previous.classList.add('is-leaving');
        leaveTimer = setTimeout(function () {
          previous.classList.remove('is-leaving');
        }, 950);

        current = index;
        each(tabs, function (tab, i) {
          var on = i === index;
          tab.classList.toggle('is-active', on);
          tab.setAttribute('aria-selected', on ? 'true' : 'false');
          tab.tabIndex = on ? 0 : -1;
          panels[i].classList.toggle('is-active', on);
        });
        if (focus) tabs[index].focus();
        tabs[index].scrollIntoView({ block: 'nearest', inline: 'center', behavior: AM.reduced ? 'auto' : 'smooth' });
      }

      each(tabs, function (tab, i) {
        tab.addEventListener('click', function () {
          select(i);
        });
        tab.addEventListener('keydown', function (event) {
          var next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          select((next + tabs.length) % tabs.length, true);
        });
      });

      // Deep link: industries.html?industry=travel
      var wanted = new URLSearchParams(location.search).get('industry');
      if (wanted) {
        each(tabs, function (tab, i) {
          if (tab.id === 'ind-tab-' + wanted) select(i);
        });
      }
    });
  }

  /* ---------- 06 Work plates: drift sideways with the scroll ---------- */

  function initPlates() {
    var plates = document.querySelector('[data-plates]');
    if (!plates || !motion) return;
    var track = plates.querySelector('.plates__track');

    gsap.matchMedia().add('(min-width: 1024px) and (hover: hover)', function () {
      gsap.to(track, {
        x: function () {
          return -Math.max(0, track.scrollWidth - window.innerWidth);
        },
        ease: 'none',
        scrollTrigger: { trigger: plates, start: 'top 82%', end: 'bottom 22%', scrub: 0.7, invalidateOnRefresh: true },
      });
    });
  }

  /* ---------- Work page: category filter ---------- */

  function initFilter() {
    var bar = document.querySelector('[data-filter-bar]');
    if (!bar) return;
    var buttons = bar.querySelectorAll('[data-filter]');
    var plates = document.querySelectorAll('[data-plate]');
    var status = document.querySelector('[data-filter-status]');

    each(buttons, function (button) {
      button.addEventListener('click', function () {
        var wanted = button.dataset.filter;
        var shown = 0;
        each(buttons, function (b) {
          b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
        });
        each(plates, function (plate) {
          var match = wanted === 'all' || plate.dataset.category === wanted;
          plate.hidden = !match;
          if (match) shown++;
        });
        if (status) status.textContent = shown + (shown === 1 ? ' category shown' : ' categories shown');
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });
    });
  }

  /* ---------- 01 Introduction: three rings converge ---------- */

  function initTriad() {
    var triad = document.querySelector('[data-triad]');
    if (!triad || !motion) return;
    var offsets = [
      { x: 0, y: -46 },
      { x: -52, y: 30 },
      { x: 52, y: 30 },
    ];
    var tl = gsap.timeline({
      scrollTrigger: { trigger: triad, start: 'top 88%', end: 'center 45%', scrub: 0.6 },
    });
    each(triad.querySelectorAll('[data-triad-ring]'), function (ring, i) {
      tl.fromTo(ring, { x: offsets[i].x, y: offsets[i].y }, { x: 0, y: 0, ease: 'power2.out' }, 0);
    });
    tl.fromTo(triad.querySelector('.triad__core'), { scale: 0, transformOrigin: 'center' }, { scale: 1, ease: 'back.out(3)' }, 0.55);
  }

  /* ---------- About: values drift sideways ---------- */

  function initValues() {
    if (!motion) return;
    each(document.querySelectorAll('[data-drift]'), function (el) {
      var amount = parseFloat(el.dataset.drift) || 6;
      gsap.fromTo(
        el,
        { xPercent: amount },
        { xPercent: -amount, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 } }
      );
    });
  }

  initHero();
  initRail();
  initLiveFigures();
  initApproach();
  initJourney();
  initIndustries();
  initPlates();
  initFilter();
  initTriad();
  initValues();
})();
