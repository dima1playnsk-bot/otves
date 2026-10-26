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
  const SVGNS = 'http://www.w3.org/2000/svg';

  const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  };
  const svgEl = (tag, attrs, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(el);
    return el;
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
  let menuOpen = false;
  let lastY = window.scrollY;
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      tapeFill.style.width = (max > 0 ? Math.min(1, y / max) * 100 : 0) + '%';
      header.classList.toggle('is-solid', y > 30);
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
  function heroIntro() {
    const lines = $$('.bp .d');
    const dims = $$('.bp .dm');
    const texts = $$('.bp .tx');
    const words = $$('.hero__title .w');
    prepDraw(lines);
    prepDraw(dims);

    const tl = G.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 });
    tl.from('.hero__grid', { opacity: 0, scale: 1.06, duration: 1.6, ease: 'power2.out' }, 0)
      .from(words, {
        y: -110, opacity: 0, rotation: () => G.utils.random(-12, 12),
        duration: 1, ease: 'back.out(2.4)', stagger: 0.09,
      }, 0.2)
      .from(['.hero__lead', '.hero__actions'], { y: 26, opacity: 0, duration: 0.9, stagger: 0.12 }, 0.8)
      .to(lines, { strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut', stagger: 0.045 }, 0.3)
      .to(dims, { strokeDashoffset: 0, duration: 0.7, ease: 'power1.inOut', stagger: 0.03 }, 1.3)
      .from(texts, { opacity: 0, y: 6, duration: 0.5, stagger: 0.035 }, 1.55)
      .add(countTemps, 1.7)
      .from('.bp-glow > *', { opacity: 0, duration: 0.6, stagger: 0.08 }, 2)
      .from('.stamp tr', { opacity: 0, x: 24, duration: 0.5, stagger: 0.07 }, 1.4)
      .from('.stamp', { opacity: 0, duration: 0.3 }, 1.4)
      .from('.hero__hint', { opacity: 0, y: 10, duration: 0.6 }, 2.1)
      .add(() => {
        G.to('.bp-glow', { opacity: 1, duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true });
      });

    html.classList.remove('intro');

    // Лёгкий параллакс при уходе с первого экрана
    G.to('.hero__drawing', {
      yPercent: 16, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    G.to('.hero__text', {
      yPercent: -12, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
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

  /* Перекрестье как в чертёжной программе */
  function crosshair() {
    const hero = $('.hero');
    const cross = $('.cross');
    const coords = $('.cross__coords');
    let raf = 0, px = 0, py = 0;
    hero.addEventListener('pointermove', (e) => {
      px = e.clientX; py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = hero.getBoundingClientRect();
        const x = px - r.left, y = py - r.top;
        cross.style.setProperty('--cx', x + 'px');
        cross.style.setProperty('--cy', y + 'px');
        coords.textContent = `X ${fmt((x / r.width) * 24000)}   Y ${fmt((1 - y / r.height) * 12000)}`;
        cross.classList.add('is-on');
      });
    });
    hero.addEventListener('pointerleave', () => cross.classList.remove('is-on'));
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

  /* ---------- Сцена стройки: генерация блоков и крана ---------- */
  function buildSceneMarkup() {
    const blocks = $('#blocks');
    const X0 = 240, X1 = 560, BW = 40, BH = 20;
    // ряды кладки снизу вверх (между этажами — монолитный пояс на y=355)
    const rows = [435, 415, 395, 375, 335, 315, 295, 275, 255];
    const holes = [
      [268, 332, 375, 435], [380, 420, 375, 455], [468, 532, 375, 435],
      [268, 332, 275, 335], [368, 432, 275, 335], [468, 532, 275, 335],
    ];
    const shades = ['#E3E0D8', '#DCD9D1', '#E7E4DC', '#D8D5CC', '#E0DDD4'];
    rows.forEach((y, r) => {
      const g = svgEl('g', { class: 'brow' }, blocks);
      const off = r % 2 ? BW / 2 : 0;
      for (let x = X0 - off; x < X1; x += BW) {
        let segs = [[Math.max(x, X0), Math.min(x + BW, X1)]];
        holes.forEach(([hx1, hx2, hy1, hy2]) => {
          if (y >= hy1 && y + BH <= hy2) {
            segs = segs.flatMap(([a, b]) => {
              if (b <= hx1 || a >= hx2) return [[a, b]];
              const out = [];
              if (a < hx1) out.push([a, hx1]);
              if (b > hx2) out.push([hx2, b]);
              return out;
            });
          }
        });
        segs.forEach(([a, b]) => {
          if (b - a < 3) return;
          svgEl('rect', {
            x: a, y, width: b - a, height: BH,
            fill: shades[(Math.random() * shades.length) | 0],
            stroke: '#C2BEB4', 'stroke-width': 1,
          }, g);
        });
      }
    });

    // Решётка башни крана и стрелы
    let mast = '';
    for (let y = 470, k = 0; y >= 40; y -= 20, k++) mast += (k ? 'L' : 'M') + (k % 2 ? 130 : 110) + ' ' + y;
    $('#mastLattice').setAttribute('d', mast);
    let jib = '';
    for (let x = 130, k = 0; x <= 650; x += 13, k++) jib += (k ? 'L' : 'M') + x + ' ' + (k % 2 ? 24 : 36);
    for (let x = 40, k = 0; x <= 110; x += 10, k++) jib += (k ? 'L' : 'M') + x + ' ' + (k % 2 ? 24 : 36);
    $('#jibLattice').setAttribute('d', jib);

    // На телефоне чуть приближаем сцену
    const svg = $('#scene');
    const fitView = () => svg.setAttribute('viewBox', window.innerWidth < 700 ? '90 0 640 560' : '0 0 800 560');
    fitView();
    window.addEventListener('resize', fitView);
  }

  /* ---------- Сцена стройки: анимация по прокрутке ---------- */
  function buildSceneTimeline() {
    const scene = $('.build__scene');
    const svg = $('#scene');
    const qa = (s) => Array.from(svg.querySelectorAll(s));

    const ghostLines = qa('#ghost > *');
    const dimLines = qa('#dims .sd');
    const rebar = qa('#rebar path');
    const rafters = qa('#rafters path');
    const rowGroups = qa('#blocks .brow');
    const allBlocks = qa('#blocks rect');
    const wins = qa('#windows .win');
    const trolley = $('#trolley');
    const cable = $('#cable');
    const hook = $('#hook');
    prepDraw(ghostLines);
    prepDraw(dimLines);
    prepDraw(rebar);
    prepDraw(rafters);

    // ---- исходное состояние: чистый лист-чертёж ----
    G.set(scene, { '--sky-a': '#1D4596', '--sky-b': '#1D4596' });
    G.set('.build__grid', { opacity: 1 });
    G.set(['#ghost', '#dims', '#groundline'], { opacity: 1 });
    G.set('#dims .stx', { opacity: 0 });
    G.set('#stars', { opacity: 0 });
    G.set('#sun', { opacity: 0, y: 220 });
    G.set('#soil', { scaleY: 0, transformOrigin: '50% 0%' });
    G.set('#grass', { scaleX: 0, transformOrigin: '50% 50%' });
    G.set('#path', { scaleY: 0, opacity: 0, transformOrigin: '50% 0%' });
    G.set('#fenceL', { scaleX: 0, transformOrigin: '100% 50%' });
    G.set('#fenceR', { scaleX: 0, transformOrigin: '0% 50%' });
    G.set(['#tree', '#tree2'], { scale: 0, transformOrigin: '50% 100%' });
    G.set('#bushes circle', { scale: 0, transformOrigin: '50% 100%' });
    G.set(['#lamp', '#lampGlow'], { opacity: 0 });
    G.set('#crane', { opacity: 1, x: 0 });
    G.set('#mast', { scaleY: 0, transformOrigin: '50% 100%' });
    G.set('#jib', { scaleX: 0, svgOrigin: '120 30' });
    G.set(['#trolley', '#load'], { opacity: 0 });
    G.set('#slab', { scaleY: 0, transformOrigin: '50% 100%' });
    G.set(['#plinth', '#porch'], { opacity: 0 });
    G.set(allBlocks, { opacity: 0, y: -34 });
    G.set(['#band1', '#band2'], { scaleX: 0, transformOrigin: '0% 50%' });
    G.set('#plaster', { opacity: 0 });
    G.set('#chimney', { scaleY: 0, transformOrigin: '50% 100%' });
    G.set('#gable', { scaleY: 0, transformOrigin: '50% 100%' });
    G.set('#roofband', { opacity: 0, y: -45 });
    G.set(wins, { scale: 0, transformOrigin: '50% 50%' });
    G.set('#door', { scale: 0, transformOrigin: '50% 100%' });
    G.set('#canopy', { scaleX: 0, transformOrigin: '50% 50%' });
    G.set(['#dusk', '#light', '#smoke'], { opacity: 0 });
    G.set('.build__done', { opacity: 0, scale: 0.6, y: 20 });

    // Крюк крана: тележка ездит по стреле, трос меняет длину
    const rig = { x: 400, y: 120 };
    const applyRig = () => {
      trolley.setAttribute('transform', `translate(${rig.x.toFixed(1)} 0)`);
      cable.setAttribute('y2', (rig.y + 1).toFixed(1));
      hook.setAttribute('transform', `translate(0 ${rig.y.toFixed(1)})`);
    };
    applyRig();

    const tl = G.timeline({ defaults: { ease: 'none' } });
    const rigTo = (x, y, at, dur = 0.2) => tl.to(rig, { x, y, duration: dur, ease: 'power1.inOut', onUpdate: applyRig }, at);

    // 1. Проект: чертёж рисуется
    tl.to(ghostLines, { strokeDashoffset: 0, duration: 0.55, stagger: 0.03, ease: 'power1.inOut' }, 0.05)
      .to(dimLines, { strokeDashoffset: 0, duration: 0.3, stagger: 0.03 }, 0.45)
      .to('#dims .stx', { opacity: 1, duration: 0.2 }, 0.7)
      .to({}, { duration: 0.1 }, 0.9);

    // У свойств, которые меняются несколько раз, задаём начало явно (fromTo),
    // чтобы при прокрутке назад всё возвращалось точно в исходный вид
    const ft = (target, from, to, at) => tl.fromTo(target, from, { ...to, immediateRender: false }, at);

    // 2. Фундамент: светает, приезжает кран, заливаем плиту
    ft(scene, { '--sky-a': '#1D4596', '--sky-b': '#1D4596' }, { '--sky-a': '#8FBCE3', '--sky-b': '#E3EEF4', duration: 0.5 }, 1);
    ft('.build__grid', { opacity: 1 }, { opacity: 0, duration: 0.5 }, 1);
    ft('#ghost', { stroke: '#FFFFFF', opacity: 1 }, { stroke: '#2B57B0', opacity: 0.5, duration: 0.4 }, 1);
    ft('#dims', { stroke: '#FFFFFF' }, { stroke: '#2B57B0', duration: 0.4 }, 1);
    ft('#dims .stx', { fill: '#FFFFFF' }, { fill: '#2B57B0', duration: 0.4 }, 1);
    ft('#sun', { opacity: 0, y: 220 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power1.out' }, 1.1);
    tl.to('#groundline', { opacity: 0, duration: 0.3 }, 1.1)
      .to('#soil', { scaleY: 1, duration: 0.3 }, 1.05)
      .to('#mast', { scaleY: 1, duration: 0.35, ease: 'power2.out' }, 1.1)
      .to('#jib', { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 1.4)
      .to('#trolley', { opacity: 1, duration: 0.08 }, 1.62)
      .to(rebar, { strokeDashoffset: 0, duration: 0.22, stagger: 0.03 }, 1.45)
      .to('#slab', { scaleY: 1, duration: 0.28, ease: 'power1.inOut' }, 1.72);
    rigTo(400, 250, 1.68, 0.25);

    // 3. Стены: ряд за рядом, между этажами — монолитный пояс
    tl.to('#load', { opacity: 1, duration: 0.04 }, 1.96);
    rowGroups.forEach((g, i) => {
      const at = 2 + i * 0.088 + (i >= 4 ? 0.06 : 0);
      tl.to(g.children, { opacity: 1, y: 0, duration: 0.1, stagger: 0.008, ease: 'power2.out' }, at);
    });
    tl.to('#band1', { scaleX: 1, duration: 0.08, ease: 'power2.out' }, 2.36)
      .to('#band2', { scaleX: 1, duration: 0.08, ease: 'power2.out' }, 2.86);
    rigTo(300, 320, 2.0, 0.18);
    rigTo(520, 290, 2.24, 0.2);
    rigTo(320, 220, 2.5, 0.2);
    rigTo(480, 170, 2.74, 0.18);
    tl.to('#load', { opacity: 0, duration: 0.04 }, 2.95);

    // 4. Кровля: стропила, кран опускает крышу, труба
    tl.to(rafters, { strokeDashoffset: 0, duration: 0.3, stagger: 0.04, ease: 'power1.inOut' }, 3.0);
    rigTo(400, 55, 3.0, 0.28);
    tl.to('#roofband', { opacity: 1, duration: 0.06 }, 3.3)
      .to('#roofband', { y: 0, duration: 0.35, ease: 'power1.inOut' }, 3.4)
      .to('#chimney', { scaleY: 1, duration: 0.12, ease: 'back.out(2)' }, 3.78);
    rigTo(400, 100, 3.4, 0.35);
    rigTo(400, 70, 3.8, 0.15);

    // 5. Окна и фасад
    tl.to('#plaster', { opacity: 1, duration: 0.25 }, 4.0)
      .to('#gable', { scaleY: 1, duration: 0.25, ease: 'power2.out' }, 4.05)
      .to('#plinth', { opacity: 1, duration: 0.15 }, 4.1)
      .to(wins, { scale: 1, duration: 0.15, stagger: 0.05, ease: 'back.out(2.2)' }, 4.25)
      .to('#door', { scale: 1, duration: 0.12, ease: 'back.out(2)' }, 4.5)
      .to('#canopy', { scaleX: 1, duration: 0.1 }, 4.6)
      .to('#porch', { opacity: 1, duration: 0.1 }, 4.62);
    ft('#ghost', { opacity: 0.5 }, { opacity: 0, duration: 0.25 }, 4.6);
    ft('#dims', { opacity: 1 }, { opacity: 0, duration: 0.25 }, 4.6);
    rigTo(620, 90, 4.2, 0.25);

    // 6. Двор и ключи: кран уезжает, вечереет, зажигается свет
    ft('#crane', { x: 0, opacity: 1 }, { x: -460, duration: 0.35, ease: 'power1.in' }, 5.0);
    ft('#crane', { opacity: 1 }, { opacity: 0, duration: 0.08 }, 5.28);
    ft(scene, { '--sky-a': '#8FBCE3', '--sky-b': '#E3EEF4' }, { '--sky-a': '#1E2A55', '--sky-b': '#E9905A', duration: 0.35 }, 5.45);
    ft('#sun', { y: 0, fill: '#FFD45C' }, { y: 330, fill: '#FF7A3D', duration: 0.35 }, 5.45);
    tl.to('#grass', { scaleX: 1, duration: 0.2 }, 5.08)
      .to('#path', { opacity: 1, scaleY: 1, duration: 0.15 }, 5.18)
      .to('#bushes circle', { scale: 1, stagger: 0.03, duration: 0.12, ease: 'back.out(2.5)' }, 5.24)
      .to('#tree', { scale: 1, duration: 0.25, ease: 'back.out(1.7)' }, 5.28)
      .to('#tree2', { scale: 1, duration: 0.2, ease: 'back.out(1.7)' }, 5.36)
      .to(['#fenceL', '#fenceR'], { scaleX: 1, duration: 0.2 }, 5.32)
      .to('#lamp', { opacity: 1, duration: 0.1 }, 5.4)
      .to('#dusk', { opacity: 0.2, duration: 0.3 }, 5.5)
      .to('#stars', { opacity: 1, duration: 0.15 }, 5.65)
      .to('#light', { opacity: 1, duration: 0.15 }, 5.6)
      .to('#lampGlow', { opacity: 1, duration: 0.15 }, 5.7)
      .to({}, { duration: 0.05 }, 5.95);
    ft('.build__done', { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'back.out(2)' }, 5.75);

    // Дым из трубы — бесконечный, включается в конце
    const smokeTl = G.timeline({ repeat: -1, paused: true });
    qa('#smoke circle').forEach((c, i) => {
      smokeTl.fromTo(c,
        { x: 0, y: 0, scale: 0.5, opacity: 0.8, transformOrigin: '50% 50%' },
        { x: 16 + i * 4, y: -64, scale: 1.9, opacity: 0, duration: 2.4, ease: 'power1.out' },
        i * 0.8);
    });

    // Связь с колонкой этапов и счётчиком недель
    const stages = [[0, 2], [2, 5], [5, 11], [11, 14], [14, 18], [18, 20]];
    const steps = $$('.step');
    const pin = $('.build__pin');
    const weekEl = $('.build__weeknum');
    let active = -1;
    let smokeOn = false;
    const sync = () => {
      const t = tl.time();
      const i = Math.min(5, Math.floor(t));
      const f = Math.min(1, t - i);
      const [a, b] = stages[i];
      weekEl.textContent = Math.max(1, Math.min(20, Math.ceil(a + f * (b - a))));
      pin.style.setProperty('--p', (t / 6).toFixed(4));
      if (i !== active) {
        active = i;
        steps.forEach((s, k) => {
          s.classList.toggle('is-active', k === i);
          s.classList.toggle('is-done', k < i);
        });
      }
      const on = t > 5.55;
      if (on !== smokeOn) {
        smokeOn = on;
        G.to('#smoke', { opacity: on ? 0.7 : 0, duration: 0.4, overwrite: true });
        if (on) smokeTl.play(); else smokeTl.pause();
      }
      applyRig();
    };
    tl.eventCallback('onUpdate', sync);

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

    const mm = G.matchMedia();
    mm.add('(min-width: 900px)', () => {
      sec.classList.add('is-h');
      const dist = () => Math.max(0, track.scrollWidth - vp.clientWidth);
      const tween = G.to(track, { x: () => -dist(), ease: 'none' });
      // Карточка «строится», когда она заметно видна на экране
      const checkCards = () => {
        const vw = window.innerWidth, vh = window.innerHeight;
        cards.forEach((c) => {
          const r = c.getBoundingClientRect();
          const seen = r.left < vw * 0.8 && r.right > vw * 0.12 && r.top < vh * 0.72 && r.bottom > vh * 0.25;
          c.classList.toggle('is-built', seen);
        });
      };
      ST.create({
        trigger: sec, start: 'top top', end: () => '+=' + dist(),
        pin: true, scrub: 0.7, animation: tween, invalidateOnRefresh: true,
        onUpdate: (self) => G.set(bar, { scaleX: self.progress }),
      });
      tween.eventCallback('onUpdate', checkCards);
      ST.create({ trigger: sec, start: 'top bottom', end: 'bottom top', onUpdate: checkCards, onLeave: checkCards, onLeaveBack: checkCards });
      checkCards();
      return () => {
        sec.classList.remove('is-h');
        cards.forEach((c) => c.classList.remove('is-built'));
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
    const label = $('#cvLabel');
    const cvWalls = $$('#cprev .cv-wall');
    const cvWins = $$('#cprev .cv-win');
    const house = $('#cvHouse');
    const f2 = $('#cvF2');
    const roof = $('#cvRoof');
    const extra = $('#cvExtra');

    // Цены условные (₽ за м², тёплый контур) — поправить под реальные
    const RATE = { gas: 46000, brick: 58000, frame: 36000, timber: 41000 };
    const FIN = { shell: 1, prefinish: 1.32, turnkey: 1.68 };
    const MAT = { gas: 'газобетон D500', brick: 'керамический кирпич', frame: 'каркас, утепление 200 мм', timber: 'клеёный брус 200 мм' };
    const MAT_SHORT = { gas: 'газобетон', brick: 'кирпич', frame: 'каркас', timber: 'брус' };
    const FIN_SHORT = { shell: 'тёплый контур', prefinish: 'под чистовую', turnkey: 'под ключ' };
    const FIN_TEXT = {
      shell: 'Фундамент, стены, кровля, окна и входная дверь. Снаружи готовый дом, внутри голые стены.',
      prefinish: 'Плюс инженерные сети, стяжка и штукатурка. Остаётся поклеить обои и положить пол.',
      turnkey: 'Заезжайте с чемоданами: отделка, сантехника, свет, отмостка и газон.',
    };

    const shown = { v: 0 };
    let prevMat = '';
    let first = true;

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
      label.textContent = MAT[mat];
      cvWalls.forEach((w) => w.setAttribute('fill', `url(#mat-${mat})`));

      const scale = 0.74 + ((a - 60) / 240) * 0.34;
      const winFill = fin === 'shell' ? '#5E6A75' : fin === 'prefinish' ? '#A9C9E4' : '#FFCB6B';

      if (motion) {
        const d = first ? 0 : 1;
        if (first) { shown.v = price; priceEl.textContent = fmt(price); }
        else {
          G.to(shown, { v: price, duration: 0.9, ease: 'power3.out', overwrite: true, onUpdate: () => { priceEl.textContent = fmt(shown.v); } });
        }
        G.to(house, { scale, svgOrigin: '180 220', duration: 0.7 * d, ease: 'back.out(1.5)', overwrite: 'auto' });
        G.to(f2, { scaleY: floors === 2 ? 1 : 0, svgOrigin: '180 150', duration: 0.6 * d, ease: 'back.out(1.6)', overwrite: 'auto' });
        G.to(roof, { y: floors === 2 ? 0 : 70, duration: 0.6 * d, ease: 'back.out(1.6)', overwrite: 'auto' });
        G.to(cvWins, { fill: winFill, duration: 0.4 * d, stagger: 0.04 * d, overwrite: 'auto' });
        G.to(extra, { opacity: fin === 'turnkey' ? 1 : 0, y: fin === 'turnkey' ? 0 : 12, duration: 0.5 * d, overwrite: 'auto' });
        if (!first && prevMat !== mat) G.fromTo(cvWalls, { opacity: 0.2 }, { opacity: 1, duration: 0.5 });
      } else {
        priceEl.textContent = fmt(price);
        house.setAttribute('transform', `translate(180 220) scale(${scale}) translate(-180 -220)`);
        f2.style.display = floors === 2 ? '' : 'none';
        roof.setAttribute('transform', floors === 2 ? 'translate(0 0)' : 'translate(0 70)');
        cvWins.forEach((w) => w.setAttribute('fill', winFill));
        extra.style.opacity = fin === 'turnkey' ? '1' : '0';
      }

      prevMat = mat;
      first = false;
      calcSummary = `Расчёт на сайте: ${a} м², ${floors === 1 ? '1 этаж' : '2 этажа'}, ${MAT_SHORT[mat]}, ${FIN_SHORT[fin]} — около ${fmt(price)} ₽`;
    };

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();

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
  }

  /* ---------- Подстановка текста в заявку ---------- */
  const msgField = $('#fMsg');
  msgField.dataset.auto = '1';
  msgField.addEventListener('input', () => { msgField.dataset.auto = msgField.value.trim() ? '0' : '1'; });
  function setMessage(text) {
    if (msgField.dataset.auto === '1' || !msgField.value.trim()) {
      msgField.value = text;
      msgField.dataset.auto = '1';
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

    G.from('.why__item', {
      y: 50, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out',
      scrollTrigger: { trigger: '.why__list', start: 'top 85%', once: true },
    });
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
    phone.addEventListener('blur', () => { phone.value = formatPhone(phone.value); });

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
      const swap = () => {
        form.hidden = true;
        done.hidden = false;
        done.focus({ preventScroll: true });
      };
      if (motion) {
        G.timeline()
          .to(rig, { y: 16, duration: 0.18, ease: 'power1.out' })
          .to(rig, { y: -window.innerHeight * 1.1, duration: 0.75, ease: 'power3.in' })
          .add(swap)
          .fromTo(rig, { y: -window.innerHeight * 0.7, rotation: -5 }, { y: 0, rotation: 0, duration: 1.6, ease: 'elastic.out(1, 0.4)' });
      } else swap();
    });

    $('#leadAgain').addEventListener('click', () => {
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
  buildSceneMarkup();
  calc();

  if (!reduce) snow();
  if (!reduce && finePointer) crosshair();

  // Порядок важен: анимации по прокрутке создаём сверху вниз по странице,
  // чтобы закреплённые секции правильно сдвигали всё, что ниже
  if (motion) {
    heroIntro();
    tapes();
    buildSceneTimeline();
    projects();
    why();
    leadForm();
    footerWord();
    if (finePointer) magnets();

    const refresh = () => ST.refresh();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    window.addEventListener('load', refresh);
  } else {
    html.classList.remove('intro');
    projects();
    leadForm();
  }
})();
