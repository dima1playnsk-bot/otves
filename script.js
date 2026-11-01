/* ==========================================================
   «Отвес» — анимации и интерактив
   GSAP + ScrollTrigger (анимации по прокрутке), Lenis (плавный скролл)
   ========================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const html = document.documentElement;
  // Решение принято в <head>: учитывает настройку системы и кнопку «Включить анимацию»
  const reduce = typeof window.__otvesReduce === 'boolean'
    ? window.__otvesReduce
    : matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const motion = !!(G && ST) && !reduce;

  const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  };
  // Готовит линии к «прорисовке»: прячет штрих, чтобы потом его «нарисовать»
  const prepDraw = (els) => els.forEach((el) => {
    const len = Math.ceil(el.getTotalLength()) + 2;
    el.style.strokeDasharray = `${len} ${len}`;
    el.style.strokeDashoffset = len;
  });

  if (motion) {
    G.registerPlugin(ST);
    ST.config({ ignoreMobileResize: true });
    html.classList.add('anim');
  }

  /* ---------- Плавный скролл ---------- */
  let lenis = null;
  if (motion && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ST.update);
    G.ticker.add((t) => lenis.raf(t * 1000));
    G.ticker.lagSmoothing(0);
  }

  const scrollToY = (y) => {
    if (lenis) lenis.scrollTo(y, { duration: 1.6 });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  };
  const targetY = (el) => {
    if (el.id === 'top') return 0;
    const box = el.parentElement && el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    const offset = el.hasAttribute('data-pin') ? 0 : 70;
    return box.getBoundingClientRect().top + window.scrollY - offset;
  };

  /* ---------- Шапка, меню, рулетка ---------- */
  const header = $('.header');
  const tapeFill = $('.tape__fill');
  const burger = $('.burger');
  const mnav = $('#mnav');
  const mbar = $('.mbar');
  const contactSec = $('#contact');
  const calcSec = $('#calc');
  let menuOpen = false;
  let lastY = window.scrollY;
  let ticking = false;

  // Пункт меню текущего раздела подсвечивается
  const spy = $$('.nav a').map((a) => ({ a, el: document.getElementById(a.hash.slice(1)) })).filter((s) => s.el);
  let spyActive = null;
  const boxOf = (el) => (el.parentElement && el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el);
  const updateSpy = () => {
    const mid = window.innerHeight * 0.4;
    let cur = null;
    spy.forEach((s) => { if (boxOf(s.el).getBoundingClientRect().top <= mid) cur = s; });
    if (cur && boxOf(cur.el).getBoundingClientRect().bottom < mid) cur = null;
    if (cur === spyActive) return;
    if (spyActive) { spyActive.a.classList.remove('is-active'); spyActive.a.removeAttribute('aria-current'); }
    if (cur) { cur.a.classList.add('is-active'); cur.a.setAttribute('aria-current', 'true'); }
    spyActive = cur;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      tapeFill.style.width = (max > 0 ? Math.min(1, y / max) * 100 : 0) + '%';
      header.classList.toggle('is-solid', y > 30);
      updateSpy();
      // Панель на телефоне: после первого экрана и до формы заявки,
      // а внутри калькулятора показывает текущую цену
      const vh = window.innerHeight;
      mbar.classList.toggle('is-on', y > vh * 0.7 && contactSec.getBoundingClientRect().top > vh * 0.85);
      const cr = calcSec.getBoundingClientRect();
      mbar.classList.toggle('is-calc', cr.top < vh * 0.6 && cr.bottom > vh * 0.4);
      if (!menuOpen) {
        const d = y - lastY;
        if (d > 2 && y > 240) header.classList.add('is-hidden');
        else if (d < -2) header.classList.remove('is-hidden');
      }
      lastY = y;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const setMenu = (open) => {
    menuOpen = open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    mnav.classList.toggle('is-open', open);
    html.classList.toggle('menu-open', open);
    header.classList.remove('is-hidden');
    if (lenis) { if (open) lenis.stop(); else lenis.start(); }
    else document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(!menuOpen));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); }
  });

  // Все ссылки-якоря — плавно и с учётом закреплённых секций
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2 || a.classList.contains('skip')) return;
      const el = document.getElementById(id.slice(1));
      if (!el) return;
      e.preventDefault();
      if (menuOpen) setMenu(false);
      scrollToY(targetY(el));
    });
  });

  /* ---------- Первый экран ---------- */
  // Чертёжная сетка, в центре «проявляется» фото дома и раскрывается на весь экран
  function heroIntro() {
    const words = $$('.hero__title .w');
    const tl = G.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 });
    tl.fromTo('.hero__photo',
      { clipPath: 'inset(40% 36% 40% 36%)', scale: 1.4 },
      { clipPath: 'inset(0% 0% 0% 0%)', scale: 1.06, duration: 2, ease: 'expo.inOut' }, 0)
      .fromTo('.hero__photo img', { filter: 'grayscale(1) brightness(1.6) contrast(.8)' },
        { filter: 'grayscale(0) brightness(1) contrast(1)', duration: 1.6, ease: 'power2.inOut', clearProps: 'filter' }, 0.5)
      .fromTo('.hero__grid', { opacity: 1 }, { opacity: 0.14, duration: 1.4, ease: 'power2.inOut' }, 0.7)
      .from(words, {
        y: -110, opacity: 0, rotation: () => G.utils.random(-12, 12),
        duration: 1, ease: 'back.out(2.4)', stagger: 0.09,
      }, 0.9)
      .from(['.hero__lead', '.hero__actions'], { y: 26, opacity: 0, duration: 0.9, stagger: 0.12 }, 1.4)
      .from('.hero__trust li', { y: 14, opacity: 0, duration: 0.6, stagger: 0.1 }, 1.7)
      .from('.temp', { opacity: 0, y: 24, scale: 0.7, duration: 0.8, stagger: 0.2, ease: 'back.out(2)' }, 1.8)
      .add(countTemps, 1.8)
      .from('.hero__hint', { opacity: 0, y: 10, duration: 0.6 }, 2.3)
      .from('.header > *', { y: -40, opacity: 0, duration: 0.8, stagger: 0.06 }, 0.6)
      .add(() => {
        // Фото медленно «дышит», как будто камера чуть наезжает
        G.to('.hero__photo', { scale: 1.13, duration: 14, ease: 'sine.inOut', repeat: -1, yoyo: true });
      });

    html.classList.remove('intro');
  }

  // Уход с первого экрана: фото уезжает медленнее страницы, текст тает
  function heroScroll() {
    const st = () => ({ trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true });
    G.to('.hero__photo', { yPercent: 22, ease: 'none', scrollTrigger: st() });
    G.to('.hero__temps', { yPercent: -40, opacity: 0, ease: 'none', scrollTrigger: st() });
    G.to('.hero__text', { yPercent: -16, opacity: 0.1, ease: 'none', scrollTrigger: st() });
  }

  /* ---------- Заставка ---------- */
  function loader(reveal) {
    const el = $('.loader');
    if (!el || !html.classList.contains('loading')) { reveal(); return; }
    if (lenis) lenis.stop();
    const num = $('.loader__num', el);
    const plumb = $('.loader__plumb', el);
    const drop = plumb.offsetHeight + 40;
    const o = { v: 0 };
    const end = () => {
      html.classList.remove('loading');
      if (lenis) lenis.start();
      try { sessionStorage.setItem('otves-seen', '1'); } catch (e) { /* нет хранилища — покажем заставку снова */ }
    };
    // timeScale 1.4 — заставка идёт ~2 с, чтобы не заставлять ждать
    G.timeline({ onComplete: end }).timeScale(1.4)
      .fromTo('.loader__line', { scaleY: 0 }, { scaleY: 1, duration: 0.85, ease: 'power3.in' }, 0)
      .fromTo('.loader__bob', { y: -drop }, { y: 0, duration: 0.85, ease: 'power3.in' }, 0)
      .to(plumb, {
        keyframes: [
          { rotation: 11, duration: 0.16, ease: 'power2.out' },
          { rotation: 0, duration: 1.1, ease: 'elastic.out(1.1, 0.3)' },
        ],
      }, 0.84)
      .fromTo('.loader__level', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut' }, 0.8)
      .fromTo('.loader__info', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5 }, 0.15)
      .to(o, { v: 100, duration: 1.35, ease: 'power2.inOut', onUpdate: () => { num.textContent = Math.round(o.v); } }, 0.1)
      .to(['.loader__info', '.loader__level'], { opacity: 0, duration: 0.3 }, 1.6)
      .to(plumb, { y: -drop - 80, duration: 0.5, ease: 'power3.in' }, 1.6)
      .to('.loader__half--t', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, 1.8)
      .to('.loader__half--b', { yPercent: 100, duration: 1, ease: 'expo.inOut' }, 1.8)
      .add(reveal, 1.95);
  }

  function countTemps() {
    $$('[data-count]').forEach((el) => {
      const end = Number(el.dataset.count);
      const o = { v: 0 };
      G.to(o, {
        v: end, duration: 1.6, ease: 'power2.out',
        onUpdate: () => {
          const v = Math.round(o.v);
          el.textContent = v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '0';
        },
      });
    });
  }

  /* Снег на первом экране */
  function snow() {
    const canvas = $('.hero__snow');
    const hero = $('.hero');
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, flakes = [], raf = 0, wind = 0, windTarget = 0;

    const make = (anywhere) => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -10,
      r: 0.6 + Math.random() * 2.1,
      s: 0.25 + Math.random() * 0.85,
      p: Math.random() * Math.PI * 2,
      a: 0.25 + Math.random() * 0.55,
    });
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(110, Math.round(w / 14));
      flakes = Array.from({ length: n }, () => make(true));
    };
    const tick = () => {
      wind += (windTarget - wind) * 0.02;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (const f of flakes) {
        f.y += f.s;
        f.p += 0.012;
        f.x += Math.sin(f.p) * 0.35 + wind * (0.5 + f.r / 3);
        if (f.y > h + 10) Object.assign(f, make(false));
        if (f.x > w + 10) f.x = -10;
        if (f.x < -10) f.x = w + 10;
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, 6.2832);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      windTarget = ((e.clientX - r.left) / r.width - 0.5) * 1.6;
    });
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { if (!raf) raf = requestAnimationFrame(tick); }
      else { cancelAnimationFrame(raf); raf = 0; }
    }).observe(hero);
  }

  /* ---------- Ленты «осторожно, стройка» ---------- */
  function tapes() {
    const tracks = $$('.tapes__track');
    const tweens = tracks.map((tr, i) => {
      const t = G.fromTo(tr, { xPercent: i ? -50 : 0 }, { xPercent: i ? 0 : -50, duration: i ? 34 : 28, ease: 'none', repeat: -1 });
      t.totalTime(t.duration() * 500); // запас, чтобы можно было крутить назад
      return t;
    });
    let settle = 0;
    ST.create({
      trigger: '.tapes', start: 'top bottom', end: 'bottom top',
      onUpdate: (self) => {
        const boost = 1 + Math.min(5, Math.abs(self.getVelocity()) / 450);
        tweens.forEach((t) => G.to(t, { timeScale: self.direction * boost, duration: 0.25, overwrite: true }));
        clearTimeout(settle);
        settle = setTimeout(() => {
          tweens.forEach((t) => G.to(t, { timeScale: self.direction, duration: 0.9, overwrite: true }));
        }, 140);
      },
    });
  }

  /* ---------- Стройка по прокрутке: фото этапов сменяют друг друга ---------- */
  function buildSceneTimeline() {
    const stages = $$('.stage');
    const imgs = stages.map((s) => $('img', s));
    const shades = stages.map((s) => $('.stage__shade', s));
    const cap = $('.build__cap');
    const capN = $('.build__capn');
    const capT = $('.build__capt');
    const names = $$('.step__name').map((e) => e.textContent);

    // Каждый этап появляется по-своему: снизу вверх (растёт фундамент), слева (кладка),
    // сверху (опускается кровля), кругом из центра (фасад), снова снизу (готовый дом)
    const reveal = [
      null,
      ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'],
      ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'],
      ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 0%)'],
      ['circle(0% at 50% 55%)', 'circle(80% at 50% 55%)'],
      ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'],
    ];

    G.set(stages.slice(1), { clipPath: (i) => reveal[i + 1][0] });
    G.set(imgs, { scale: 1.25, transformOrigin: '50% 60%' });
    G.set(shades, { opacity: 0 });
    G.set('.build__grid', { opacity: 0.55 });
    G.set('.build__done', { opacity: 0, scale: 0.6, y: 20 });

    const tl = G.timeline({ defaults: { ease: 'none' } });
    const ft = (target, from, to, at) => tl.fromTo(target, from, { ...to, immediateRender: false }, at);

    // Первый кадр — чертёж; сетка «синьки» лежит поверх и тает к фундаменту
    ft(imgs[0], { scale: 1.25 }, { scale: 1, duration: 1.1 }, 0);
    ft('.build__grid', { opacity: 0.55 }, { opacity: 0, duration: 0.4 }, 0.6);

    for (let i = 1; i < stages.length; i++) {
      const at = i - 0.3;
      ft(stages[i], { clipPath: reveal[i][0] }, { clipPath: reveal[i][1], duration: 0.45, ease: 'power2.inOut' }, at);
      ft(shades[i - 1], { opacity: 0 }, { opacity: 0.65, duration: 0.45 }, at);
      // Пока этап на экране, камера медленно наезжает
      ft(imgs[i], { scale: 1.25 }, { scale: 1, duration: i === stages.length - 1 ? 0.95 : 1.35 }, at);
    }

    ft('.build__done', { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'back.out(2)' }, 5.7);
    // На последнем этапе пропускать уже нечего — кнопка уходит
    ft('.build__skip', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.15 }, 5.5);
    tl.to({}, { duration: 0.05 }, 5.95);

    // Связь с колонкой этапов, подписью и счётчиком недель
    const weeks = [[0, 2], [2, 5], [5, 11], [11, 14], [14, 18], [18, 20]];
    const steps = $$('.step');
    const pin = $('.build__pin');
    const weekEl = $('.build__weeknum');
    let active = -1;
    const sync = () => {
      const t = tl.time();
      const i = Math.min(5, Math.floor(t));
      const f = Math.min(1, t - i);
      const [a, b] = weeks[i];
      weekEl.textContent = Math.max(1, Math.min(20, Math.ceil(a + f * (b - a))));
      pin.style.setProperty('--p', Math.min(1, t / 6).toFixed(4));
      if (i !== active) {
        active = i;
        steps.forEach((s, k) => {
          s.classList.toggle('is-active', k === i);
          s.classList.toggle('is-done', k < i);
        });
        capN.textContent = String(i + 1).padStart(2, '0');
        capT.textContent = names[i];
        G.fromTo(cap, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power3.out', overwrite: true });
      }
    };
    tl.eventCallback('onUpdate', sync);

    // Панель с этапами въезжает сбоку, пока секция поднимается
    G.from('.build__side', {
      xPercent: 45, ease: 'none',
      scrollTrigger: { trigger: '.build', start: 'top bottom', end: 'top top', scrub: true },
    });
    G.from('.steps .step', {
      x: 60, opacity: 0, stagger: 0.08, duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: '.build', start: 'top 40%', once: true },
    });

    const st = ST.create({
      trigger: '.build',
      start: 'top top',
      end: () => '+=' + Math.round(window.innerHeight * 5),
      pin: true,
      scrub: 0.9,
      animation: tl,
    });
    sync();

    // Клик по этапу — прокрутка к нему
    steps.forEach((s, k) => {
      $('.step__head', s).addEventListener('click', () => {
        scrollToY(st.start + (st.end - st.start) * ((k + 0.92) / 6));
      });
    });
  }

  /* ---------- Проекты ---------- */
  function projects() {
    const sec = $('.projects');
    const vp = $('.projects__viewport');
    const track = $('.projects__track');
    const cards = $$('.proj', track);
    const bar = $('.projects__bar i');

    const native = () => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-built'); });
      }, { threshold: 0.6 });
      cards.forEach((c) => io.observe(c));
      const onS = () => {
        const max = vp.scrollWidth - vp.clientWidth;
        bar.style.transform = `scaleX(${max > 0 ? vp.scrollLeft / max : 0})`;
      };
      vp.addEventListener('scroll', onS, { passive: true });
      return () => { io.disconnect(); vp.removeEventListener('scroll', onS); bar.style.transform = ''; };
    };

    if (!motion) { native(); return; }

    // Карточки выезжают снизу веером
    G.from(cards, {
      y: 140, opacity: 0, rotation: (i) => (i % 2 ? 4 : -4), duration: 1.1, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: vp, start: 'top 88%', once: true },
    });

    const mm = G.matchMedia();
    mm.add('(min-width: 900px)', () => {
      sec.classList.add('is-h');
      const dist = () => Math.max(0, track.scrollWidth - vp.clientWidth);
      const tween = G.to(track, { x: () => -dist(), ease: 'none' });
      // Лента «гнётся» от скорости прокрутки
      const skewTo = G.quickTo(track, 'skewX', { duration: 0.6, ease: 'power3' });
      let skewT = 0;
      const bend = (v) => {
        skewTo(G.utils.clamp(-12, 12, v / -220));
        clearTimeout(skewT);
        skewT = setTimeout(() => skewTo(0), 110);
      };
      // Карточка «строится», когда она заметно видна на экране
      const checkCards = () => {
        const vw = window.innerWidth, vh = window.innerHeight;
        cards.forEach((c) => {
          const r = c.getBoundingClientRect();
          const seen = r.left < vw * 0.8 && r.right > vw * 0.12 && r.top < vh * 0.72 && r.bottom > vh * 0.25;
          c.classList.toggle('is-built', seen);
        });
      };
      const pinSt = ST.create({
        trigger: sec, start: 'top top', end: () => '+=' + dist(),
        pin: true, scrub: 0.7, animation: tween, invalidateOnRefresh: true,
        onUpdate: (self) => { G.set(bar, { scaleX: self.progress }); bend(self.getVelocity()); },
      });
      tween.eventCallback('onUpdate', checkCards);
      // Переход Tab’ом на карточку за краем экрана — прокручиваем ленту к ней
      const onFocus = (e) => {
        if (!e.target.matches(':focus-visible')) return; // только клавиатура, не клик мышью
        const i = cards.indexOf(e.currentTarget);
        scrollToY(pinSt.start + (pinSt.end - pinSt.start) * (i / (cards.length - 1)));
      };
      cards.forEach((c) => c.addEventListener('focusin', onFocus));
      // Страховка для старых браузеров без overflow: clip
      const unshift = () => { if (sec.scrollLeft) sec.scrollLeft = 0; };
      sec.addEventListener('scroll', unshift);
      // Фото внутри карточки едет медленнее самой карточки — параллакс
      cards.forEach((c) => {
        G.fromTo($('.proj__img', c), { xPercent: 8 }, {
          xPercent: -8, ease: 'none',
          scrollTrigger: { trigger: c, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
        });
      });
      ST.create({ trigger: sec, start: 'top bottom', end: 'bottom top', onUpdate: checkCards, onLeave: checkCards, onLeaveBack: checkCards });
      checkCards();
      return () => {
        sec.classList.remove('is-h');
        cards.forEach((c) => { c.classList.remove('is-built'); c.removeEventListener('focusin', onFocus); });
        sec.removeEventListener('scroll', unshift);
      };
    });
    mm.add('(max-width: 899px)', native);

    // Наклон карточек за курсором
    if (finePointer) {
      cards.forEach((c) => {
        G.set(c, { transformPerspective: 900 });
        const rx = G.quickTo(c, 'rotationX', { duration: 0.6, ease: 'power3' });
        const ry = G.quickTo(c, 'rotationY', { duration: 0.6, ease: 'power3' });
        c.addEventListener('pointermove', (e) => {
          const r = c.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 9);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 9);
        });
        c.addEventListener('pointerleave', () => { rx(0); ry(0); });
      });
    }
  }

  /* ---------- Калькулятор ---------- */
  let calcSummary = '';
  function calc() {
    const form = $('#calcForm');
    const area = $('#area');
    const areaOut = $('#areaOut');
    const priceEl = $('#price');
    const termEl = $('#term');
    const sqmEl = $('#sqm');
    const hint = $('#finishHint');
    const wallHint = $('#wallHint');
    const label = $('#cvLabel');
    const cvImgs = $$('.cv-img');
    const cvArea = $('#cvArea');
    const cvFloors = $('#cvFloors');
    const cvFinish = $('#cvFinish');
    const mbarPrice = $('#mbarPrice');
    const live = $('#calcLive');
    let liveT = 0;

    // Цены условные (₽ за м², тёплый контур) — поправить под реальные
    const RATE = { gas: 46000, brick: 58000, frame: 36000, timber: 41000 };
    const FIN = { shell: 1, prefinish: 1.32, turnkey: 1.68 };
    const MAT = { gas: 'газобетон D500', brick: 'керамический кирпич', frame: 'каркас, утепление 200 мм', timber: 'клеёный брус 200 мм' };
    const MAT_SHORT = { gas: 'газобетон', brick: 'кирпич', frame: 'каркас', timber: 'брус' };
    const FIN_SHORT = { shell: 'тёплый контур', prefinish: 'под чистовую', turnkey: 'под ключ' };
    const WALL_TEXT = {
      gas: 'Тёплый, быстро кладётся и не даёт усадки. Самый частый выбор наших заказчиков.',
      brick: 'Самый прочный и долговечный, но дороже и строится на месяц дольше.',
      frame: 'Самый быстрый и доступный: на месяц быстрее. Тепло держит утеплитель 200 мм.',
      timber: 'Натуральное дерево и приятный микроклимат. Клеёный брус почти не даёт усадки.',
    };
    const FIN_TEXT = {
      shell: 'Фундамент, стены, кровля, окна и входная дверь. Снаружи готовый дом, внутри голые стены.',
      prefinish: 'Плюс инженерные сети, стяжка и штукатурка. Остаётся поклеить обои и положить пол.',
      turnkey: 'Заезжайте с чемоданами: отделка, сантехника, свет, отмостка и газон.',
    };

    const shown = { v: 0 };
    let first = true;
    let firstRun = true;
    let lastPrice = 0;

    const update = () => {
      const a = Number(area.value);
      const floors = Number(form.elements.floors.value);
      const mat = form.elements.wall.value;
      const fin = form.elements.finish.value;

      const price = Math.round((a * RATE[mat] * FIN[fin] * (floors === 1 ? 1.06 : 1)) / 10000) * 10000;
      let months = { shell: 3, prefinish: 4, turnkey: 5 }[fin]
        + Math.max(0, Math.round((a - 100) / 80))
        + (mat === 'brick' ? 1 : 0) - (mat === 'frame' ? 1 : 0);
      months = Math.max(2, months);

      areaOut.textContent = a + ' м²';
      area.style.setProperty('--fill', ((a - 60) / 240) * 100 + '%');
      termEl.textContent = months + ' ' + plural(months, ['месяц', 'месяца', 'месяцев']);
      sqmEl.textContent = fmt(price / a) + ' ₽';
      hint.textContent = FIN_TEXT[fin];
      wallHint.textContent = WALL_TEXT[mat];
      // Фото дома из выбранного материала плавно сменяет предыдущее
      label.textContent = MAT[mat];
      cvImgs.forEach((im) => im.classList.toggle('is-on', im.dataset.mat === mat));
      cvArea.textContent = a + ' м²';
      cvFloors.textContent = floors === 1 ? '1 этаж' : '2 этажа';
      cvFinish.textContent = FIN_SHORT[fin];
      mbarPrice.textContent = '≈ ' + (price / 1e6).toFixed(1).replace('.', ',') + ' млн ₽';

      if (motion && !first) {
        G.to(shown, { v: price, duration: 0.9, ease: 'power3.out', overwrite: true, onUpdate: () => { priceEl.textContent = fmt(shown.v); } });
      } else {
        shown.v = price;
        priceEl.textContent = fmt(price);
      }

      first = false;
      lastPrice = price;
      calcSummary = `Расчёт на сайте: ${a} м², ${floors === 1 ? '1 этаж' : '2 этажа'}, ${MAT_SHORT[mat]}, ${FIN_SHORT[fin]} — около ${fmt(price)} ₽`;
      // Озвучиваем итог, когда человек перестал двигать ползунок
      if (!firstRun) {
        clearTimeout(liveT);
        liveT = setTimeout(() => { live.textContent = `Примерная стоимость ${fmt(price)} рублей, срок ${termEl.textContent}`; }, 600);
      }
      firstRun = false;
    };

    // Расчёт из ссылки «Поделиться»: ?area=180&floors=1&wall=brick&finish=turnkey
    const qs = new URLSearchParams(location.search);
    const setRadio = (nm, v) => {
      const r = form.querySelector(`input[name="${nm}"][value="${v}"]`);
      if (r) r.checked = true;
    };
    const qArea = Number(qs.get('area'));
    if (qArea >= 60 && qArea <= 300) area.value = Math.round(qArea / 5) * 5;
    ['floors', 'wall', 'finish'].forEach((nm) => { if (qs.has(nm)) setRadio(nm, qs.get(nm)); });

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();

    // Поделиться: на телефоне — системное меню, на компьютере — копируем ссылку
    const shareBtn = $('#calcShare');
    const shareLabel = $('span', shareBtn);
    const shareStatus = $('#shareStatus');
    shareBtn.addEventListener('click', async () => {
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('area', area.value);
      url.searchParams.set('floors', form.elements.floors.value);
      url.searchParams.set('wall', form.elements.wall.value);
      url.searchParams.set('finish', form.elements.finish.value);
      url.hash = 'calc';
      const link = url.toString();
      const done = (msg) => {
        shareLabel.textContent = msg;
        shareStatus.textContent = msg;
        shareBtn.classList.add('is-done');
        setTimeout(() => { shareLabel.textContent = 'Поделиться расчётом'; shareBtn.classList.remove('is-done'); }, 2500);
      };
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
          await navigator.share({ title: 'Расчёт дома — «Отвес»', text: calcSummary, url: link });
        } else {
          await navigator.clipboard.writeText(link);
          done('Ссылка скопирована');
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return; // человек закрыл меню «Поделиться»
        window.prompt('Скопируйте ссылку на расчёт:', link);
      }
    });

    // Жёлтая «таблетка» под выбранным вариантом
    $$('.seg').forEach((seg) => {
      const opts = $('.seg__opts', seg);
      const place = () => {
        const checked = $('input:checked', opts);
        if (!checked) return;
        const lab = checked.closest('label');
        opts.style.setProperty('--x', lab.offsetLeft + 'px');
        opts.style.setProperty('--w', lab.offsetWidth + 'px');
      };
      opts.addEventListener('change', place);
      if (window.ResizeObserver) new ResizeObserver(place).observe(opts);
      place();
      seg.classList.add('is-ready');
    });

    $('#calcCta').addEventListener('click', () => setMessage(calcSummary));

    // Цена «набегает» с нуля, когда калькулятор появляется на экране
    return () => {
      G.fromTo(shown, { v: 0 }, {
        v: lastPrice, duration: 1.8, ease: 'power3.out', overwrite: true,
        onUpdate: () => { priceEl.textContent = fmt(shown.v); },
      });
    };
  }

  /* ---------- Подстановка текста в заявку ---------- */
  const msgField = $('#fMsg');
  msgField.dataset.auto = '1';
  msgField.addEventListener('animationend', () => msgField.classList.remove('is-filled'));
  msgField.addEventListener('input', () => { msgField.dataset.auto = msgField.value.trim() ? '0' : '1'; });
  function setMessage(text) {
    if (msgField.dataset.auto === '1' || !msgField.value.trim()) {
      msgField.value = text;
      msgField.dataset.auto = '1';
      // Поле коротко подсвечивается, чтобы было видно: расчёт уже подставлен
      msgField.classList.remove('is-filled');
      void msgField.offsetWidth; // перезапуск CSS-анимации
      msgField.classList.add('is-filled');
    }
  }
  $$('[data-project]').forEach((a) => {
    a.addEventListener('click', () => {
      const p = a.dataset.project;
      setMessage(p === 'Индивидуальный проект' ? 'Хочу индивидуальный проект дома' : `Интересует проект «${p}»`);
    });
  });

  /* ---------- Гарантии ---------- */
  function why() {
    const statement = $('.why__statement');
    const words = statement.textContent.trim().split(/ +/);
    statement.textContent = '';
    const spans = words.map((w, i) => {
      const s = document.createElement('span');
      s.textContent = w;
      statement.appendChild(s);
      if (i < words.length - 1) statement.appendChild(document.createTextNode(' '));
      return s;
    });
    G.fromTo(spans, { opacity: 0.16 }, {
      opacity: 1, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: statement, start: 'top 82%', end: 'bottom 45%', scrub: true },
    });

    // Фото стропил под секцией едет медленнее страницы
    G.fromTo('.why__photo img', { yPercent: -12 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: '.why', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    // Карточки гарантий «прорезаются» слева направо
    G.fromTo('.why__item',
      { y: 60, opacity: 0, clipPath: 'inset(0% 100% 0% 0%)' },
      {
        y: 0, opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, stagger: 0.14, ease: 'power3.out',
        clearProps: 'clipPath',
        scrollTrigger: { trigger: '.why__list', start: 'top 85%', once: true },
      });
    velSkew('.why__item', '.why', 'skewY');
    $$('.why__item').forEach((item, i) => {
      const paths = $$('.ic', item);
      prepDraw(paths);
      G.to(paths, {
        strokeDashoffset: 0, duration: 1.1, stagger: 0.15, ease: 'power2.inOut', delay: 0.2 + i * 0.12,
        scrollTrigger: { trigger: '.why__list', start: 'top 85%', once: true },
      });
    });
  }

  /* ---------- Заявка ---------- */
  function leadForm() {
    const form = $('#leadForm');
    const done = $('#leadDone');
    const rig = $('.contact__rig');
    const name = $('#fName');
    const phone = $('#fPhone');
    const agree = $('#fAgree');
    const submitBtn = $('.lead__submit');
    const submitLabel = $('span', submitBtn);
    const submitText = submitLabel.textContent;

    const formatPhone = (v) => {
      let d = v.replace(/\D/g, '');
      if (!d) return '';
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      const p = d.slice(1);
      let out = '+7';
      if (p.length) out += ' (' + p.slice(0, 3);
      if (p.length >= 3) out += ') ' + p.slice(3, 6);
      if (p.length >= 6) out += '-' + p.slice(6, 8);
      if (p.length >= 8) out += '-' + p.slice(8, 10);
      return out;
    };
    phone.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      phone.value = formatPhone(phone.value);
    });
    phone.addEventListener('blur', () => {
      phone.value = formatPhone(phone.value);
      // Номер начали, но не дописали — подсказываем сразу, а не после отправки
      const n = phone.value.replace(/\D/g, '').length;
      if (n > 1 && n !== 11) mark(phone, $('#errPhone'), true);
    });

    const mark = (input, err, bad) => {
      err.hidden = !bad;
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) input.setAttribute('aria-describedby', err.id);
      else input.removeAttribute('aria-describedby');
    };
    name.addEventListener('input', () => { if (name.value.trim().length >= 2) mark(name, $('#errName'), false); });
    phone.addEventListener('input', () => { if (phone.value.replace(/\D/g, '').length === 11) mark(phone, $('#errPhone'), false); });
    agree.addEventListener('change', () => { if (agree.checked) mark(agree, $('#errAgree'), false); });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const badName = name.value.trim().length < 2;
      const badPhone = phone.value.replace(/\D/g, '').length !== 11;
      const badAgree = !agree.checked;
      mark(name, $('#errName'), badName);
      mark(phone, $('#errPhone'), badPhone);
      mark(agree, $('#errAgree'), badAgree);
      const firstBad = badName ? name : badPhone ? phone : badAgree ? agree : null;
      if (firstBad) {
        firstBad.focus();
        if (motion) G.fromTo('.card', { x: -12 }, { x: 0, duration: 0.7, ease: 'elastic.out(1.2, 0.3)' });
        return;
      }

      // ДЕМО: здесь заявку нужно отправить на сервер
      // (например, функцию в Yandex Cloud, которая пришлёт письмо владельцу).
      // Пока «отправляется» — кнопка показывает это и не нажимается второй раз
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      submitLabel.textContent = 'Отправляем…';
      const swap = () => {
        form.hidden = true;
        done.hidden = false;
        done.focus({ preventScroll: true });
      };
      setTimeout(() => {
        if (motion) {
          G.timeline()
            .to(rig, { y: 16, duration: 0.18, ease: 'power1.out' })
            .to(rig, { y: -window.innerHeight * 1.1, duration: 0.75, ease: 'power3.in' })
            .add(swap)
            .fromTo(rig, { y: -window.innerHeight * 0.7, rotation: -5 }, { y: 0, rotation: 0, duration: 1.6, ease: 'elastic.out(1, 0.4)' });
        } else swap();
      }, 700);
    });

    $('#leadAgain').addEventListener('click', () => {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitLabel.textContent = submitText;
      form.reset();
      msgField.dataset.auto = '1';
      done.hidden = true;
      form.hidden = false;
      name.focus();
    });

    if (motion) {
      G.from(rig, {
        y: -340, rotation: 7, transformOrigin: '50% 0%', duration: 1.9, ease: 'elastic.out(1, 0.4)',
        scrollTrigger: { trigger: '.contact', start: 'top 65%', once: true },
      });
    }
  }

  /* ---------- Подвал: буквы поднимаются ---------- */
  function footerWord() {
    G.from('.footer__word span', {
      yPercent: 105, stagger: 0.07, ease: 'power3.out',
      scrollTrigger: { trigger: '.footer__word', start: 'top bottom', end: 'bottom bottom', scrub: 1 },
    });
    // Буква сплющивается, если навести на неё
    $$('.footer__word span').forEach((s) => {
      s.addEventListener('pointerenter', () => {
        G.fromTo(s, { scaleY: 1, scaleX: 1 }, {
          scaleY: 0.72, scaleX: 1.12, transformOrigin: '50% 100%', duration: 0.22, ease: 'power2.out',
          yoyo: true, repeat: 1, overwrite: 'auto',
        });
      });
    });
  }

  /* ---------- Общие помощники ---------- */
  // Наклон элементов от скорости прокрутки (быстро листаешь — сильнее гнутся)
  function velSkew(targets, trigger, prop = 'skewY', k = -280, max = 7) {
    const tos = G.utils.toArray(targets).map((t) => G.quickTo(t, prop, { duration: 0.5, ease: 'power3' }));
    let tm = 0;
    ST.create({
      trigger, start: 'top bottom', end: 'bottom top',
      onUpdate: (self) => {
        const v = G.utils.clamp(-max, max, self.getVelocity() / k);
        tos.forEach((f) => f(v));
        clearTimeout(tm);
        tm = setTimeout(() => tos.forEach((f) => f(0)), 100);
      },
    });
  }

  // Разбивает заголовок на буквы. Слова не переносятся посередине,
  // а скринридер читает заголовок целиком через aria-label
  function splitChars(el) {
    const text = el.textContent.replace(/[ \n\t\r]+/g, ' ').trim();
    el.setAttribute('aria-label', text.replace(/ /g, ' '));
    el.textContent = '';
    const chars = [];
    text.split(' ').forEach((word, i, arr) => {
      const w = document.createElement('span');
      w.className = 'sw';
      w.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach((ch) => {
        const c = document.createElement('span');
        c.className = 'sc';
        c.textContent = ch;
        w.appendChild(c);
        chars.push(c);
      });
      el.appendChild(w);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return chars;
  }

  function splitWords(el) {
    const text = el.textContent.replace(/[ \n\t\r]+/g, ' ').trim();
    el.textContent = '';
    return text.split(' ').map((word, i, arr) => {
      const s = document.createElement('span');
      s.className = 'spw';
      s.textContent = word;
      el.appendChild(s);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
  }

  /* ---------- Заголовки: буквы выпрыгивают из-под строки ---------- */
  function splitHeadings() {
    $$('.build__title, .projects .h2, .calc .h2, .faq .h2, .contact .h2').forEach((h) => {
      G.from(splitChars(h), {
        yPercent: 120, rotation: 12, transformOrigin: '0% 100%',
        duration: 1, ease: 'power4.out', stagger: 0.022,
        scrollTrigger: { trigger: h, start: 'top 88%', toggleActions: 'play none none reverse' },
      });
    });
    $$('.projects__head > p, .calc__head > p, .faq__head > p:not(.eyebrow), .contact__text > p:not(.eyebrow)').forEach((p) => {
      G.from(splitWords(p), {
        y: 16, opacity: 0, filter: 'blur(6px)', duration: 0.7, ease: 'power2.out', stagger: 0.018,
        clearProps: 'filter',
        scrollTrigger: { trigger: p, start: 'top 90%', once: true },
      });
    });
  }

  /* ---------- Калькулятор: секция раскрывается, цена набегает ---------- */
  function calcFx(countIn) {
    G.fromTo('.calc',
      { clipPath: 'inset(7% 4% 0% 4% round 48px)' },
      {
        clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
        scrollTrigger: { trigger: '.calc', start: 'top bottom', end: 'top 15%', scrub: true },
      });
    const st = () => ({ trigger: '.calc__grid', start: 'top 80%', once: true });
    G.from('.calc__form > *', { x: -70, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', scrollTrigger: st() });
    G.from('.calc__result', { y: 90, rotation: 2.5, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: st(), onStart: countIn });
    G.fromTo('.calc__preview', { clipPath: 'inset(0% 0% 100% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut', delay: 0.2, clearProps: 'clipPath', scrollTrigger: st(),
    });
  }

  /* ---------- Цифры: бегущие строки, счётчики, рулетки ---------- */
  function nums() {
    G.fromTo('.nums',
      { clipPath: 'inset(8% 4% 0% 4% round 56px)' },
      {
        clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
        scrollTrigger: { trigger: '.nums', start: 'top bottom', end: 'top 20%', scrub: true },
      });
    const rowSt = () => ({ trigger: '.nums', start: 'top bottom', end: 'bottom top', scrub: 0.5 });
    G.fromTo('.nums__row--a', { xPercent: 0 }, { xPercent: -36, ease: 'none', scrollTrigger: rowSt() });
    G.fromTo('.nums__row--b', { xPercent: -36 }, { xPercent: 0, ease: 'none', scrollTrigger: rowSt() });
    velSkew('.nums__row', '.nums', 'skewX', -200, 14);

    $$('.num').forEach((n, i) => {
      const b = $('b', n);
      const unit = $('.num__v span', n);
      const to = Number(b.dataset.to);
      const o = { v: 0 };
      // Скринридер читает итоговое число, а не «0» до анимации
      const sr = document.createElement('span');
      sr.className = 'vh';
      sr.textContent = `${to} ${unit.textContent}`;
      b.parentElement.prepend(sr);
      b.setAttribute('aria-hidden', 'true');
      unit.setAttribute('aria-hidden', 'true');
      b.textContent = '0';
      G.timeline({ delay: (i % 4) * 0.1, scrollTrigger: { trigger: n, start: 'top 88%', once: true } })
        .from(n, { y: 90, opacity: 0, duration: 0.9, ease: 'power3.out' })
        .to(o, { v: to, duration: 2, ease: 'expo.out', onUpdate: () => { b.textContent = fmt(o.v); } }, 0.15)
        .from($('.num__ruler', n), { scaleX: 0, duration: 1.3, ease: 'power3.inOut' }, 0.15)
        .from(unit, { opacity: 0, x: -20, duration: 0.6 }, 0.6);
    });
    velSkew('.num', '.nums', 'skewY');
    G.from('.nums__cta > *', {
      y: 30, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out',
      scrollTrigger: { trigger: '.nums__cta', start: 'top 90%', once: true },
    });
  }

  /* ---------- Вопросы наезжают на гарантии, а те уходят вглубь ---------- */
  function contactFx() {
    G.fromTo('.faq',
      { borderTopLeftRadius: 220, borderTopRightRadius: 220 },
      {
        borderTopLeftRadius: 0, borderTopRightRadius: 0, ease: 'none',
        scrollTrigger: { trigger: '.faq', start: 'top bottom', end: 'top 20%', scrub: true },
      });
    G.to('.why > .container', {
      scale: 0.9, opacity: 0.3, yPercent: 8, ease: 'none',
      scrollTrigger: { trigger: '.faq', start: 'top bottom', end: 'top top', scrub: true },
    });
    // Раскрытый ответ меняет высоту страницы — пересчитываем точки анимаций ниже
    $$('.faq__item').forEach((d) => d.addEventListener('toggle', () => ST.refresh()));
    G.from('.faq__item', {
      y: 40, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: '.faq__list', start: 'top 85%', once: true },
    });
    G.from('.after li', {
      x: -40, opacity: 0, duration: 0.8, stagger: 0.14, ease: 'power3.out',
      scrollTrigger: { trigger: '.after', start: 'top 88%', once: true },
    });
    G.from('.contact__ways li', {
      x: -50, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out',
      scrollTrigger: { trigger: '.contact__ways', start: 'top 90%', once: true },
    });
  }

  /* ---------- Летающие стройматериалы ---------- */
  function floaters() {
    const items = $$('.fl');
    items.forEach((el) => {
      const s = parseFloat(el.dataset.speed) || 1;
      G.fromTo(el, { y: 160 * s, rotation: -60 * s }, {
        y: -160 * s, rotation: 60 * s, ease: 'none',
        scrollTrigger: { trigger: el.closest('section'), start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      });
    });
  }

  /* ---------- Отвес: опускается по прокрутке и качается от скорости ---------- */
  function plumbPhysics() {
    const plumb = $('.plumb');
    const line = $('.plumb__line');
    const bob = $('.plumb__bob');
    const mark = $('.plumb__mark');
    const bobs = $$('.logo__bob');
    html.classList.add('bob-js');

    let ang = 0, av = 0, vel = 0, lastY = window.scrollY, markOp = 0, lastTxt = '';
    let maxY = 1, show = false;
    const measure = () => {
      maxY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      show = getComputedStyle(plumb).display !== 'none';
    };
    measure();
    ST.addEventListener('refresh', measure);
    window.addEventListener('resize', measure);

    G.ticker.add((time, dt) => {
      const f = Math.min(3, dt / 16.67);
      const y = window.scrollY;
      vel += ((y - lastY) / f - vel) * 0.25;
      lastY = y;
      // Пружина: угол тянется к «ветру» от прокрутки, раскачивается и затухает
      const target = G.utils.clamp(-32, 32, -vel * 0.8);
      av += (target - ang) * 0.05 * f;
      av *= Math.pow(0.9, f);
      ang += av * f;

      const idle = Math.sin(time * 1.96) * 8;
      const logoAng = G.utils.clamp(-40, 40, idle * 0.7 + ang * 0.9).toFixed(2);
      bobs.forEach((b) => { b.style.transform = `rotate(${logoAng}deg)`; });

      if (!show) return;
      const p = Math.min(1, y / maxY);
      const L = 70 + p * (window.innerHeight - 190);
      line.style.height = L.toFixed(1) + 'px';
      bob.style.transform = `translateY(${L.toFixed(1)}px)`;
      plumb.style.transform = `rotate(${ang.toFixed(2)}deg)`;
      markOp += ((Math.abs(vel) > 0.6 ? 1 : 0) - markOp) * 0.08 * f;
      mark.style.opacity = markOp.toFixed(3);
      const txt = (y < 50 ? '±' : '−') + (y / 100).toFixed(3).replace('.', ',');
      if (txt !== lastTxt) { mark.textContent = txt; lastTxt = txt; }
    });
  }

  /* ---------- Пункты меню «перебирают» буквы при наведении ---------- */
  function scramble() {
    const CH = 'абвгдежзиклмнопрстуфхцчшэюя0123456789';
    $$('.nav a, .footer__nav a').forEach((a) => {
      const orig = a.textContent;
      a.setAttribute('aria-label', orig);
      let raf = 0;
      a.addEventListener('pointerenter', () => {
        cancelAnimationFrame(raf);
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / 420);
          const n = Math.floor(p * orig.length);
          let s = orig.slice(0, n);
          for (let i = n; i < orig.length; i++) s += orig[i] === ' ' ? ' ' : CH[(Math.random() * CH.length) | 0];
          a.textContent = p < 1 ? s : orig;
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
    });
  }

  /* ---------- «Магнитные» кнопки ---------- */
  function magnets() {
    $$('.magnet').forEach((b) => {
      const xTo = G.quickTo(b, 'x', { duration: 0.5, ease: 'power3' });
      const yTo = G.quickTo(b, 'y', { duration: 0.5, ease: 'power3' });
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.25);
        yTo((e.clientY - r.top - r.height / 2) * 0.35);
      });
      b.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------- Кнопка «Включить / выключить анимацию» ---------- */
  function motionToggle() {
    if (!window.__otvesOsReduce) return;
    $$('[data-motion-toggle]').forEach((btn) => {
      btn.hidden = false;
      btn.textContent = reduce ? 'Включить анимацию' : 'Выключить анимацию';
      btn.addEventListener('click', toggleMotion);
    });
    // Плавающая кнопка видна только на первом экране
    const float = $('.motion-toggle');
    const place = () => float.classList.toggle('is-away', window.scrollY > window.innerHeight * 0.5);
    window.addEventListener('scroll', place, { passive: true });
    place();
  }
  function toggleMotion() {
    try {
      if (reduce) localStorage.setItem('otves-motion', 'on');
      else localStorage.removeItem('otves-motion');
    } catch (e) { /* хранилище недоступно — хватит параметра в адресе */ }
    const url = new URL(window.location.href);
    if (reduce) url.searchParams.set('motion', '1');
    else url.searchParams.delete('motion');
    url.hash = '';
    window.location.href = url.toString();
  }

  /* ---------- Запуск ---------- */
  motionToggle();
  const countIn = calc();

  if (!reduce) snow();

  // Порядок важен: анимации по прокрутке создаём сверху вниз по странице,
  // чтобы закреплённые секции правильно сдвигали всё, что ниже
  if (motion) {
    window.__otvesStarted = true;
    heroScroll();
    tapes();
    buildSceneTimeline();
    projects();
    splitHeadings();
    calcFx(countIn);
    nums();
    why();
    contactFx();
    leadForm();
    footerWord();
    floaters();
    plumbPhysics();
    if (finePointer) { magnets(); scramble(); }
    // Сначала заставка (если первый заход), потом влёт первого экрана
    loader(heroIntro);

    const refresh = () => ST.refresh();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    // Ссылка с якорем (#calc, #faq): закреплённые секции удлиняют страницу,
    // и браузер прыгает не туда — переходим к разделу сами, когда всё посчитано
    const jumpToHash = () => {
      const id = location.hash.slice(1);
      const el = id && document.getElementById(id);
      if (!el || id === 'top') return false;
      if (lenis) lenis.resize();
      const y = targetY(el);
      if (Math.abs(window.scrollY - y) < 30) return false;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
      return true;
    };
    window.addEventListener('load', () => {
      refresh();
      // Даём закреплённым секциям досчитаться, прыгаем и один раз сверяемся
      setTimeout(() => { if (jumpToHash()) setTimeout(jumpToHash, 400); }, 250);
    });
  } else {
    html.classList.remove('intro', 'loading');
    projects();
    leadForm();
  }
})();
