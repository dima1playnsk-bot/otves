'use strict';

/* Отвес: бизнесы Новосибирска без своего сайта.
   Данные: data/novosibirsk.json (раз в день обновляет GitHub Actions из OpenStreetMap).
   Если файла нет — спрашиваем Overpass напрямую.
   Статусы и заметки хранятся только в этом браузере (localStorage). */

(function () {
  // ---------- Настройки ----------

  const CITY = { name: 'Новосибирск', bbox: { s: 54.80, w: 82.72, n: 55.20, e: 83.16 }, center: [82.93, 55.03], zoom: 11 };
  const DATA_URL = 'data/novosibirsk.json';

  const ENDPOINTS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  // Должно совпадать с TAGS в scripts/fetch-data.mjs.
  const CATS = [
    { id: 'hair', chip: 'Парикмахерские', one: 'Парикмахерская', q: [['shop', 'hairdresser']] },
    { id: 'beauty', chip: 'Салоны красоты', one: 'Салон красоты', q: [['shop', 'beauty']] },
    { id: 'tattoo', chip: 'Тату', one: 'Тату-салон', q: [['shop', 'tattoo']] },
    { id: 'massage', chip: 'Массаж', one: 'Массаж', q: [['shop', 'massage']] },
    { id: 'cafe', chip: 'Кафе', one: 'Кафе', q: [['amenity', 'cafe']] },
    { id: 'rest', chip: 'Рестораны', one: 'Ресторан', q: [['amenity', 'restaurant']] },
    { id: 'fast', chip: 'Фастфуд', one: 'Фастфуд', q: [['amenity', 'fast_food']] },
    { id: 'bakery', chip: 'Пекарни', one: 'Пекарня', q: [['shop', 'bakery'], ['shop', 'confectionery']] },
    { id: 'flowers', chip: 'Цветы', one: 'Цветы', q: [['shop', 'florist']] },
    { id: 'car', chip: 'Автосервисы', one: 'Автосервис', q: [['shop', 'car_repair']] },
    { id: 'tyres', chip: 'Шиномонтаж', one: 'Шиномонтаж', q: [['shop', 'tyres']] },
    { id: 'wash', chip: 'Автомойки', one: 'Автомойка', q: [['amenity', 'car_wash']] },
    { id: 'dent', chip: 'Стоматологии', one: 'Стоматология', q: [['amenity', 'dentist']] },
    { id: 'vet', chip: 'Ветклиники', one: 'Ветклиника', q: [['amenity', 'veterinary']] },
    { id: 'pet', chip: 'Зоотовары', one: 'Зоотовары', q: [['shop', 'pet'], ['shop', 'pet_grooming']] },
    { id: 'fit', chip: 'Фитнес', one: 'Фитнес', q: [['leisure', 'fitness_centre']] },
    { id: 'repair', chip: 'Ремонт техники', one: 'Ремонт техники', q: [['craft', 'electronics_repair'], ['shop', 'mobile_phone']] },
    { id: 'shoe', chip: 'Ремонт обуви', one: 'Ремонт обуви и одежды', q: [['craft', 'shoemaker'], ['shop', 'shoe_repair'], ['craft', 'tailor'], ['shop', 'tailor']] },
    { id: 'clean', chip: 'Химчистки', one: 'Химчистка', q: [['shop', 'dry_cleaning'], ['shop', 'laundry']] },
    { id: 'photo', chip: 'Фотостудии', one: 'Фотостудия', q: [['craft', 'photographer'], ['shop', 'photo']] },
  ];

  const STATUSES = [
    { id: 'new', label: 'Новый' },
    { id: 'checked', label: 'Проверил: сайта нет' },
    { id: 'contacted', label: 'Связался' },
    { id: 'interested', label: 'Интересно' },
    { id: 'declined', label: 'Отказ' },
    { id: 'hassite', label: 'Сайт есть' },
  ];
  const WORK = ['checked', 'contacted', 'interested'];
  const SUMMARY_LABELS = { new: 'новые', checked: 'проверено', contacted: 'связался', interested: 'интересно', declined: 'отказ', hassite: 'сайт есть' };

  const COLORS = { new: '#F2C14E', work: '#6EA8FE', hot: '#4CC38A', off: '#5A606A' };
  const DOT = { new: 'new', checked: 'work', contacted: 'work', interested: 'hot', declined: 'off', hassite: 'off' };

  // Ссылка в поле «сайт» на соцсеть или сервис записи — своего сайта нет.
  const PAGE_HOSTS = [
    [/(^|\.)vk\.(com|ru)$/, 'ВКонтакте'], [/(^|\.)ok\.ru$/, 'Одноклассники'], [/(^|\.)instagram\.com$/, 'Instagram'],
    [/(^|\.)t\.me$/, 'Telegram'], [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'], [/(^|\.)facebook\.com$/, 'Facebook'],
    [/(^|\.)max\.ru$/, 'Max'], [/(^|\.)taplink\.(cc|ws|at|ru)$/, 'Taplink'], [/(^|\.)linktr\.ee$/, 'Linktree'],
    [/(^|\.)dikidi\.(net|ru|app)$/, 'DIKIDI'], [/(^|\.)yclients\.com$/, 'YCLIENTS'], [/(^|\.)booksy\.com$/, 'Booksy'],
    [/(^|\.)2gis\.(ru|com)$/, '2ГИС'], [/(^|\.)yandex\.(ru|com)$/, 'Яндекс'], [/(^|\.)zoon\.ru$/, 'Zoon'],
    [/(^|\.)flamp\.ru$/, 'Flamp'], [/(^|\.)avito\.ru$/, 'Авито'], [/(^|\.)youtube\.com$/, 'YouTube'], [/(^|\.)tiktok\.com$/, 'TikTok'],
  ];
  const WEAK_HOST = /(^|\.)(tilda\.ws|wixsite\.com|ukit\.me|nethouse\.ru|narod\.ru|ucoz\.(ru|net)|tb\.ru|mya5\.ru|webflow\.io|turbo\.site|business\.site|setup\.ru|okis\.ru|github\.io)$/;

  const SOCIAL_TAGS = [
    [['contact:vk', 'vk'], 'ВКонтакте', (v) => 'https://vk.com/' + v.replace(/^@/, '')],
    [['contact:telegram', 'telegram'], 'Telegram', (v) => 'https://t.me/' + v.replace(/^@/, '')],
    [['contact:whatsapp', 'whatsapp'], 'WhatsApp', (v) => 'https://wa.me/' + v.replace(/\D/g, '')],
    [['contact:instagram', 'instagram'], 'Instagram', (v) => 'https://instagram.com/' + v.replace(/^@/, '')],
    [['contact:ok'], 'Одноклассники', (v) => 'https://ok.ru/' + v.replace(/^@/, '')],
  ];

  const DAYS = { Mo: 'Пн', Tu: 'Вт', We: 'Ср', Th: 'Чт', Fr: 'Пт', Sa: 'Сб', Su: 'Вс', PH: 'праздники' };
  const PAGE_SIZE = 50;

  // ---------- Мелочи ----------

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;
  const withScheme = (u) => (/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u);

  function safeUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
    } catch (e) { return ''; }
  }
  function hostOf(u) {
    try { return new URL(withScheme(u)).hostname.toLowerCase().replace(/^(www|m)\./, ''); } catch (e) { return ''; }
  }

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* без хранилища */ }
    },
  };

  // ---------- Состояние ----------

  const saved = store.get('otves.state.v2', {});
  let leads = store.get('otves.leads.v1', {});
  if (!leads || typeof leads !== 'object') leads = {};

  const state = {
    cats: new Set(Array.isArray(saved.cats) ? saved.cats : []), // пусто = все виды
    filters: Object.assign({ phone: false, chains: true, sites: false, status: 'all', name: '' }, saved.filters || {}),
    all: [],
    shown: PAGE_SIZE,
    selected: null,
    loaded: false,
    loading: false,
    view: 'search',
  };
  state.filters.name = '';

  const saveState = () => store.set('otves.state.v2', { cats: [...state.cats], filters: state.filters });
  const saveLeads = () => store.set('otves.leads.v1', leads);

  // ---------- Разбор данных OpenStreetMap ----------

  function classifySite(raw) {
    if (!raw) return { kind: 'none', label: 'Нет сайта', url: '' };
    const first = raw.split(';')[0].trim();
    const url = safeUrl(withScheme(first));
    const host = hostOf(first);
    const page = PAGE_HOSTS.find(([re]) => re.test(host));
    if (page) return { kind: 'page', label: 'Только ' + page[1], via: page[1], url };
    if (WEAK_HOST.test(host)) return { kind: 'weak', label: 'Сайт на конструкторе', url };
    return { kind: 'own', label: 'Есть сайт', url };
  }

  function phonesOf(t) {
    const raw = [t.phone, t['contact:phone'], t['contact:mobile'], t.mobile].filter(Boolean).join(';');
    return [...new Set(raw.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean))];
  }

  function socialsOf(t, site) {
    const out = [];
    for (const [keys, label, make] of SOCIAL_TAGS) {
      const v = keys.map((k) => t[k]).find(Boolean);
      if (!v) continue;
      const first = v.split(';')[0].trim();
      const guess = /^https?:\/\//i.test(first) ? first : /\.[a-z]{2,}\//i.test(first) ? 'https://' + first : make(first);
      const url = safeUrl(guess);
      if (url) out.push({ label, url });
    }
    if (site.kind === 'page' && site.url && !out.some((s) => s.label === site.via)) out.unshift({ label: site.via, url: site.url });
    return out;
  }

  function addressOf(t) {
    const street = t['addr:street'] || t['addr:place'];
    if (street) return street + (t['addr:housenumber'] ? ', ' + t['addr:housenumber'] : '');
    return t['addr:full'] || '';
  }

  const prettyHours = (h) => (h || '')
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => DAYS[m])
    .replace(/\boff\b/g, 'выходной')
    .replace('24/7', 'круглосуточно')
    .replace(/\s*;\s*/g, '; ');

  const catOf = (t) => CATS.find((c) => c.q.some(([k, v]) => t[k] === v));

  function toBiz(el) {
    const t = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    const site = classifySite(t.website || t['contact:website'] || t.url || t['contact:url'] || '');
    const socials = socialsOf(t, site);
    if (site.kind === 'none' && socials.length) site.label = 'Нет сайта, есть ' + socials[0].label;
    const cat = catOf(t);
    return {
      id: el.type[0] + el.id,
      osm: el.type + '/' + el.id,
      name: t.name,
      catId: cat ? cat.id : '',
      cat: cat ? cat.one : '',
      addr: addressOf(t),
      city: t['addr:city'] || '',
      phones: phonesOf(t),
      email: (t.email || t['contact:email'] || '').split(';')[0].trim(),
      socials,
      hours: prettyHours(t.opening_hours),
      site,
      chain: Boolean(t.brand || t['brand:wikidata']),
      lat, lon,
    };
  }

  // ---------- Загрузка ----------

  async function loadFile() {
    const r = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j.elements) || !j.elements.length) throw new Error('пустой файл');
    return { elements: j.elements, updated: j.updated };
  }

  // Запасной путь: прямо с серверов OpenStreetMap. Спрашиваем по очереди, медленный сервер
  // через 15 секунд дублируем следующим, берём первый ответ.
  function loadOverpass(onProgress) {
    const b = CITY.bbox;
    const bbox = [b.s, b.w, b.n, b.e].join(',');
    const parts = CATS.flatMap((c) => c.q).map(([k, v]) => `nwr["${k}"="${v}"]["name"](${bbox});`).join('');
    const query = `[out:json][timeout:120];(${parts});out center tags qt;`;
    const order = [0, 1, 2, 0, 3, 1, 0, 2, 1, 0];

    return new Promise((resolve, reject) => {
      const ctrls = [];
      let attempts = 0, pending = 0, done = false, lastError = null, hedge = 0;
      const finish = (fn, v) => {
        if (done) return;
        done = true;
        clearTimeout(hedge);
        clearTimeout(deadline);
        ctrls.forEach((c) => c.abort());
        fn(v);
      };
      const deadline = setTimeout(() => finish(reject, lastError || new Error('нет ответа')), 240000);
      const launch = () => {
        if (done) return;
        clearTimeout(hedge);
        if (attempts >= order.length) { if (!pending) finish(reject, lastError || new Error('нет ответа')); return; }
        if (pending >= 3) { hedge = setTimeout(launch, 15000); return; }
        const url = ENDPOINTS[order[attempts]];
        attempts++;
        pending++;
        if (attempts > 1) onProgress('Сервер занят, пробую другой…');
        const ctrl = new AbortController();
        ctrls.push(ctrl);
        const timer = setTimeout(() => ctrl.abort(), 150000);
        fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal })
          .then(async (r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            if (!j.elements || j.elements.length < 50) throw new Error(j.remark || 'мало данных');
            finish(resolve, { elements: j.elements, updated: new Date().toISOString() });
          })
          .catch((e) => { lastError = e; if (!done) setTimeout(launch, Math.min(1000 * attempts, 5000)); })
          .finally(() => {
            clearTimeout(timer);
            pending--;
            if (!done && attempts >= order.length && !pending) finish(reject, lastError || new Error('нет ответа'));
          });
        hedge = setTimeout(launch, 15000);
      };
      launch();
    });
  }

  function setStatus(text) { $('#status').textContent = text; }

  async function search() {
    if (state.loading) return;
    state.loading = true;
    const btn = $('#searchBtn');
    btn.disabled = true;
    btn.textContent = 'Ищу…';
    const t0 = Date.now();
    let timer = 0;
    let data;
    try {
      setStatus('Загружаю бизнесы Новосибирска…');
      try {
        data = await loadFile();
      } catch (e) {
        setStatus('Спрашиваю OpenStreetMap напрямую, это может занять минуту…');
        timer = setInterval(() => setStatus('Спрашиваю OpenStreetMap напрямую… ' + Math.round((Date.now() - t0) / 1000) + ' с'), 1000);
        data = await loadOverpass((msg) => setStatus(msg));
      }
      clearInterval(timer);
      const b = CITY.bbox;
      const seen = new Set();
      state.all = data.elements.map(toBiz).filter((x) => {
        if (x.lat == null || !x.name) return false;
        if (x.lat < b.s || x.lat > b.n || x.lon < b.w || x.lon > b.e) return false;
        const key = x.name.toLowerCase() + '|' + x.lat.toFixed(4) + '|' + x.lon.toFixed(4);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      state.loaded = true;
      state.shown = PAGE_SIZE;
      const d = new Date(data.updated);
      setStatus('Новосибирск. Данные OpenStreetMap от ' + d.toLocaleDateString('ru-RU') + '.');
      renderChips();
      render();
      if (mapReady) map.fitBounds([[b.w, b.s], [b.e, b.n]], { padding: 10, duration: 0 });
    } catch (e) {
      clearInterval(timer);
      setStatus('Серверы OpenStreetMap не ответили. Нажмите «Искать» ещё раз через минуту.');
    } finally {
      state.loading = false;
      btn.disabled = false;
      btn.textContent = state.loaded ? 'Обновить' : 'Искать';
    }
  }

  // ---------- Карта ----------

  let map = null;
  let mapReady = false;

  function initMap() {
    if (!window.maplibregl) { $('#map').innerHTML = '<p class="empty">Карта не загрузилась. Обновите страницу.</p>'; return; }
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: CITY.center,
      zoom: CITY.zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      for (const layer of map.getStyle().layers) {
        if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
          map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ru'], ['get', 'name']]);
        }
      }
      map.addSource('biz', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // Зум должен быть снаружи выражения: interpolate по зуму, внутри — размер по типу точки.
      const sized = (big, small) => ['case', ['get', 'target'], big, small];
      const radius = (base) => ['interpolate', ['linear'], ['zoom'], 10, base * 0.6, 13, base, 17, base * 1.8];
      map.addLayer({
        id: 'biz-dots', type: 'circle', source: 'biz',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, sized(2.4, 1.6), 13, sized(4, 2.6), 17, sized(7, 4.5)],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#121316',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'biz-sel', type: 'circle', source: 'biz',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-radius': radius(8), 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#E9EAEC', 'circle-stroke-width': 2 },
      });
      // Точки маленькие, поэтому ловим клик в радиусе 10 пикселей и берём ближайшую.
      map.on('click', (e) => {
        const { x, y } = e.point;
        const found = map.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], { layers: ['biz-dots'] });
        if (!found.length) return;
        let best = found[0], bestD = Infinity;
        for (const f of found) {
          const p = map.project(f.geometry.coordinates);
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d < bestD) { bestD = d; best = f; }
        }
        select(best.properties.id, 'map');
      });
      map.on('mouseenter', 'biz-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'biz-dots', () => { map.getCanvas().style.cursor = ''; });
      mapReady = true;
      if (state.all.length) drawMap(visibleList());
    });
  }

  function drawMap(list) {
    if (!mapReady) return;
    const features = list.map((b) => {
      const st = statusOf(b.id);
      const color = b._target ? COLORS[DOT[st]] : COLORS.off;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [b.lon, b.lat] }, properties: { id: b.id, color, target: b._target } };
    });
    map.getSource('biz').setData({ type: 'FeatureCollection', features });
    map.setFilter('biz-sel', ['==', ['get', 'id'], state.selected || '']);
  }

  // ---------- Статусы и лиды ----------

  const statusOf = (id) => (leads[id] && leads[id].status) || 'new';

  function isTarget(b) {
    const st = statusOf(b.id);
    if (st === 'hassite') return false;
    if (st === 'checked') return true;
    return b.site.kind === 'none' || b.site.kind === 'page';
  }

  const findBiz = (id) => state.all.find((b) => b.id === id) || (leads[id] && leads[id].biz) || null;

  function updateLead(id, patch) {
    const biz = findBiz(id);
    if (!biz) return;
    const prev = leads[id] || { status: 'new', note: '' };
    const next = Object.assign({}, prev, patch, { updated: Date.now() });
    const { _target, ...plain } = biz;
    next.biz = plain;
    if (next.status === 'new' && !next.note) delete leads[id];
    else leads[id] = next;
    saveLeads();
    renderLeadCount();
  }

  // ---------- Отрисовка ----------

  // Всё, что проходит фильтры, кроме видов бизнеса (по ним считаем числа на кнопках).
  function baseList() {
    const f = state.filters;
    const q = f.name.trim().toLowerCase();
    return state.all.filter((b) => {
      b._target = isTarget(b);
      const st = statusOf(b.id);
      if (!f.sites && !b._target) return false;
      if (f.chains && b.chain) return false;
      if (f.phone && !b.phones.length) return false;
      if (f.status === 'new' && st !== 'new') return false;
      if (f.status === 'work' && !WORK.includes(st)) return false;
      if (q && !b.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function visibleList() {
    return baseList()
      .filter((b) => !state.cats.size || state.cats.has(b.catId))
      .sort((a, b) => (b._target - a._target)
        || ((b.phones.length > 0) - (a.phones.length > 0))
        || a.name.localeCompare(b.name, 'ru'));
  }

  const yandexUrl = (b) => `https://yandex.ru/maps/?ll=${b.lon.toFixed(6)},${b.lat.toFixed(6)}&z=18&text=${encodeURIComponent(b.name)}`;
  const gisUrl = (b) => `https://2gis.ru/search/${encodeURIComponent(b.name)}?m=${b.lon.toFixed(6)}%2C${b.lat.toFixed(6)}%2F18`;
  const webSearchUrl = (b) => `https://yandex.ru/search/?text=${encodeURIComponent(`${b.name} ${CITY.name} сайт`)}`;
  const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '');

  function badgeOf(b, st) {
    if (st === 'hassite') return { kind: 'own', text: 'Сайт есть' };
    if (st === 'checked') return { kind: 'none', text: 'Сайта нет, проверено' };
    return { kind: b.site.kind, text: b.site.label };
  }

  function rowHtml(b) {
    const lead = leads[b.id];
    const st = statusOf(b.id);
    const badge = badgeOf(b, st);
    const meta = [b.cat, b.addr || 'адрес не указан'].filter(Boolean).join(', ');
    const contacts = [];
    b.phones.forEach((p) => contacts.push(`<a href="${esc(telHref(p))}">${esc(p)}</a>`));
    if (b.email && /^[^\s@]+@[^\s@]+$/.test(b.email)) contacts.push(`<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`);
    b.socials.forEach((s) => contacts.push(`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`));
    if ((b.site.kind === 'own' || b.site.kind === 'weak') && b.site.url) {
      contacts.push(`<a href="${esc(b.site.url)}" target="_blank" rel="noopener">${esc(hostOf(b.site.url))}</a>`);
    }
    const options = STATUSES.map((s) => `<option value="${s.id}"${s.id === st ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    const note = lead && lead.note ? lead.note : '';
    const hasSite = !isTarget(b);

    return `<li class="biz${b.id === state.selected ? ' is-selected' : ''}${hasSite ? ' has-site' : ''}" data-id="${esc(b.id)}" data-status="${st}">
      <div class="biz-head">
        <h3 class="biz-name"><button type="button" data-act="locate">${esc(b.name)}</button></h3>
        <span class="badge badge-${badge.kind}">${esc(badge.text)}</span>
      </div>
      <p class="biz-meta">${esc(meta)}</p>
      ${contacts.length ? `<p class="biz-contacts">${contacts.join('')}</p>` : ''}
      ${b.hours ? `<p class="biz-hours">${esc(b.hours)}</p>` : ''}
      <div class="biz-actions">
        <a class="act" href="${esc(yandexUrl(b))}" target="_blank" rel="noopener">Яндекс Карты</a>
        <a class="act" href="${esc(gisUrl(b))}" target="_blank" rel="noopener">2ГИС</a>
        <a class="act" href="${esc(webSearchUrl(b))}" target="_blank" rel="noopener">Найти сайт</a>
        <a class="act" href="https://www.openstreetmap.org/${esc(b.osm)}" target="_blank" rel="noopener">OSM</a>
      </div>
      <div class="biz-work">
        <select class="status-select" data-act="status" aria-label="Статус">${options}</select>
        <button class="act" type="button" data-act="note">${note ? 'Изменить заметку' : 'Заметка'}</button>
      </div>
      ${note ? `<p class="note-text">${esc(note)}</p>` : ''}
    </li>`;
  }

  function renderChips() {
    const base = state.loaded ? baseList() : [];
    const counts = {};
    base.forEach((b) => { counts[b.catId] = (counts[b.catId] || 0) + 1; });
    const all = `<button type="button" class="chip" data-cat="" aria-pressed="${!state.cats.size}">Все${state.loaded ? `<span class="n">${base.length}</span>` : ''}</button>`;
    $('#cats').innerHTML = all + CATS.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${state.cats.has(c.id)}">${esc(c.chip)}${state.loaded ? `<span class="n">${counts[c.id] || 0}</span>` : ''}</button>`).join('');
  }

  function render() {
    const list = visibleList();
    $('#results').hidden = false;

    const targets = list.filter((b) => b._target).length;
    const phones = list.filter((b) => b._target && b.phones.length).length;
    $('#summary').innerHTML = state.filters.sites
      ? `<b>${list.length}</b> бизнесов, без своего сайта ${targets}, из них с телефоном ${phones}`
      : `<b>${targets}</b> без своего сайта, с телефоном ${phones}`;

    const ul = $('#list');
    ul.innerHTML = list.length
      ? list.slice(0, state.shown).map(rowHtml).join('')
      : '<li class="empty">Под фильтры никто не подходит.</li>';
    const rest = list.length - state.shown;
    const more = $('#moreBtn');
    more.hidden = rest <= 0;
    more.textContent = `Ещё ${Math.min(rest, PAGE_SIZE)} из ${Math.max(rest, 0)}`;
    drawMap(list);
  }

  function renderLeadCount() {
    const n = Object.keys(leads).length;
    const el = $('#leadCount');
    el.textContent = n;
    el.classList.toggle('has', n > 0);
  }

  function leadsSummary() {
    const list = Object.values(leads).filter((l) => l && l.biz);
    if (!list.length) return '';
    const counts = {};
    list.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
    const parts = STATUSES.filter((s) => counts[s.id]).map((s) => `${SUMMARY_LABELS[s.id]} ${counts[s.id]}`);
    return `<b>${list.length}</b> ${parts.join(', ')}`;
  }

  function renderLeads() {
    const arr = Object.values(leads).filter((l) => l && l.biz).sort((a, b) => b.updated - a.updated);
    $('#leadsSum').innerHTML = leadsSummary();
    $('#exportBtn').disabled = !arr.length;
    $('#leadsEmpty').hidden = arr.length > 0;
    $('#leadList').innerHTML = arr.map((l) => rowHtml(l.biz)).join('');
    renderLeadCount();
  }

  // ---------- Выбор бизнеса и карточка на карте ----------

  let popup = null;
  let popupId = null;

  function select(id, from) {
    state.selected = id;
    if (mapReady) map.setFilter('biz-sel', ['==', ['get', 'id'], id]);

    const listEl = state.view === 'leads' ? $('#leadList') : $('#list');
    if (state.view === 'search') {
      const idx = visibleList().findIndex((b) => b.id === id);
      if (idx >= state.shown) { state.shown = idx + 1; render(); }
    }
    listEl.querySelectorAll('.biz.is-selected').forEach((el) => el.classList.remove('is-selected'));
    const row = listEl.querySelector(`.biz[data-id="${CSS.escape(id)}"]`);
    if (row) row.classList.add('is-selected');

    const b = findBiz(id);
    if (from === 'map' && row && !isNarrow()) row.scrollIntoView({ block: 'nearest' });
    if (from === 'list' && b && mapReady) {
      if (isNarrow()) $('#mapWrap').scrollIntoView({ block: 'start' });
      map.easeTo({ center: [b.lon, b.lat], zoom: Math.max(map.getZoom(), 16), duration: reduceMotion ? 0 : 600 });
    }
    if (from !== 'popup' && b) openPopup(b);
  }

  function openPopup(b) {
    if (!mapReady) return;
    if (popup) popup.remove();
    const ul = document.createElement('ul');
    ul.className = 'list popup-list';
    ul.innerHTML = rowHtml(b);
    bindList(ul);
    popupId = b.id;
    const p = new maplibregl.Popup({ offset: 12, maxWidth: '340px', className: 'biz-popup', focusAfterOpen: false })
      .setLngLat([b.lon, b.lat]).setDOMContent(ul).addTo(map);
    p.on('close', () => { if (popup === p) { popup = null; popupId = null; } });
    popup = p;
  }

  function refreshPopup() {
    const b = popupId && findBiz(popupId);
    if (popup && b) openPopup(b);
  }

  // ---------- Выгрузка CSV для Excel ----------

  function exportCsv() {
    const head = ['Название', 'Вид', 'Адрес', 'Телефон', 'Почта', 'Соцсети', 'Сайт по OpenStreetMap', 'Статус', 'Заметка', 'Яндекс Карты', 'Изменено'];
    const rows = Object.values(leads).filter((l) => l && l.biz).map((l) => {
      const b = l.biz;
      return [
        b.name, b.cat, b.addr, b.phones.join(', '), b.email || '',
        b.socials.map((s) => s.url).join(' '),
        b.site.url || b.site.label,
        (STATUSES.find((s) => s.id === l.status) || {}).label || '',
        l.note || '', yandexUrl(b),
        new Date(l.updated).toLocaleDateString('ru-RU'),
      ];
    });
    // Excel считает формулой всё, что начинается с = + - @.
    const cell = (v) => {
      let s = String(v == null ? '' : v);
      if (/^\+?[\d\s()\-,+]+$/.test(s) && /^[+\-]/.test(s)) s = ' ' + s;
      else if (/^[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `otves-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- События ----------

  function bindList(ul) {
    const inPopup = ul.classList.contains('popup-list');
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('.biz');
      if (!li) return;
      const actEl = e.target.closest('[data-act]');
      const act = actEl && actEl.dataset.act;
      if (act === 'locate') select(li.dataset.id, inPopup ? 'popup' : 'list');
      if (act === 'note') toggleNote(li, actEl);
    });
    ul.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-act="status"]');
      if (!sel) return;
      const id = sel.closest('.biz').dataset.id;
      updateLead(id, { status: sel.value });
      if (state.view === 'leads') renderLeads(); else if (state.loaded) { renderChips(); render(); }
      if (!inPopup && popupId === id) refreshPopup();
      if (inPopup) refreshPopup();
    });
  }

  function toggleNote(li, btn) {
    let area = li.querySelector('textarea.note');
    if (area) { saveNote(li, area.value); return; }
    const id = li.dataset.id;
    const text = li.querySelector('.note-text');
    if (text) text.hidden = true;
    area = document.createElement('textarea');
    area.className = 'note';
    area.value = (leads[id] && leads[id].note) || '';
    area.placeholder = 'Например: позвонить в среду';
    area.setAttribute('aria-label', 'Заметка');
    li.appendChild(area);
    btn.textContent = 'Сохранить';
    area.focus();
  }

  function saveNote(li, value) {
    const id = li.dataset.id;
    const note = value.trim();
    updateLead(id, { note, status: statusOf(id) });
    const area = li.querySelector('textarea.note');
    if (area) area.remove();
    let text = li.querySelector('.note-text');
    if (note) {
      if (!text) { text = document.createElement('p'); text.className = 'note-text'; li.appendChild(text); }
      text.textContent = note;
      text.hidden = false;
    } else if (text) text.remove();
    li.querySelector('[data-act="note"]').textContent = note ? 'Изменить заметку' : 'Заметка';
    if (state.view === 'leads') $('#leadsSum').innerHTML = leadsSummary();
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.view === view;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    $('#viewSearch').hidden = view !== 'search';
    $('#viewLeads').hidden = view !== 'leads';
    $('#controls').hidden = view !== 'search';
    if (view === 'leads') renderLeads();
    else if (state.loaded) render();
    if (map) map.resize();
  }

  function bind() {
    $('#searchBtn').addEventListener('click', search);

    $('#cats').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const id = chip.dataset.cat;
      if (!id) state.cats.clear();
      else if (state.cats.has(id)) state.cats.delete(id);
      else state.cats.add(id);
      saveState();
      state.shown = PAGE_SIZE;
      renderChips();
      if (state.loaded) render();
    });

    const refilter = () => { state.shown = PAGE_SIZE; saveState(); if (state.loaded) { renderChips(); render(); } };
    [['fPhone', 'phone'], ['fChains', 'chains'], ['fSites', 'sites']].forEach(([elId, key]) => {
      const el = $('#' + elId);
      el.checked = Boolean(state.filters[key]);
      el.addEventListener('change', () => { state.filters[key] = el.checked; refilter(); });
    });
    const fStatus = $('#fStatus');
    fStatus.value = state.filters.status;
    fStatus.addEventListener('change', () => { state.filters.status = fStatus.value; refilter(); });
    let nameTimer = 0;
    $('#fName').addEventListener('input', (e) => {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => { state.filters.name = e.target.value; refilter(); }, 200);
    });

    $('#moreBtn').addEventListener('click', () => { state.shown += PAGE_SIZE; render(); });

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
    $('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = state.view === 'search' ? 'leads' : 'search';
      switchView(next);
      document.querySelector(`.tab[data-view="${next}"]`).focus();
    });

    $('#exportBtn').addEventListener('click', exportCsv);
    bindList($('#list'));
    bindList($('#leadList'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('textarea.note')) {
        saveNote(e.target.closest('.biz'), e.target.value);
      }
    });

    window.addEventListener('storage', (e) => {
      if (e.key !== 'otves.leads.v1') return;
      leads = store.get('otves.leads.v1', {}) || {};
      renderLeadCount();
      if (state.view === 'leads') renderLeads(); else if (state.loaded) render();
    });
  }

  // ---------- Старт ----------

  renderChips();
  renderLeadCount();
  bind();
  initMap();
})();
