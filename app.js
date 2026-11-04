'use strict';

/* Отвес: ищет на карте бизнесы без своего сайта.
   Данные берём из OpenStreetMap через Overpass API, адрес города — через Nominatim.
   Статусы и заметки хранятся только в браузере (localStorage). */

(function () {
  // ---------- Настройки ----------

  // Серверы Overpass. Если один перегружен, пробуем следующий.
  const ENDPOINTS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  // chip — подпись на кнопке, one — как назвать один бизнес, q — теги OpenStreetMap.
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

  // Если в поле «сайт» стоит ссылка на соцсеть или сервис записи, своего сайта нет.
  const PAGE_HOSTS = [
    [/(^|\.)vk\.(com|ru)$/, 'ВКонтакте'],
    [/(^|\.)ok\.ru$/, 'Одноклассники'],
    [/(^|\.)instagram\.com$/, 'Instagram'],
    [/(^|\.)t\.me$/, 'Telegram'],
    [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'],
    [/(^|\.)facebook\.com$/, 'Facebook'],
    [/(^|\.)max\.ru$/, 'Max'],
    [/(^|\.)taplink\.(cc|ws|at|ru)$/, 'Taplink'],
    [/(^|\.)linktr\.ee$/, 'Linktree'],
    [/(^|\.)dikidi\.(net|ru|app)$/, 'DIKIDI'],
    [/(^|\.)yclients\.com$/, 'YCLIENTS'],
    [/(^|\.)booksy\.com$/, 'Booksy'],
    [/(^|\.)2gis\.(ru|com)$/, '2ГИС'],
    [/(^|\.)yandex\.(ru|com)$/, 'Яндекс'],
    [/(^|\.)zoon\.ru$/, 'Zoon'],
    [/(^|\.)flamp\.ru$/, 'Flamp'],
    [/(^|\.)avito\.ru$/, 'Авито'],
    [/(^|\.)youtube\.com$/, 'YouTube'],
    [/(^|\.)tiktok\.com$/, 'TikTok'],
  ];
  // Бесплатные адреса конструкторов: сайт есть, но слабый.
  const WEAK_HOST = /(^|\.)(tilda\.ws|wixsite\.com|ukit\.me|nethouse\.ru|narod\.ru|ucoz\.(ru|net)|tb\.ru|mya5\.ru|webflow\.io|turbo\.site|business\.site|setup\.ru|okis\.ru|github\.io)$/;

  const SOCIAL_TAGS = [
    [['contact:vk', 'vk'], 'ВКонтакте', (v) => 'https://vk.com/' + v.replace(/^@/, '')],
    [['contact:telegram', 'telegram'], 'Telegram', (v) => 'https://t.me/' + v.replace(/^@/, '')],
    [['contact:whatsapp', 'whatsapp'], 'WhatsApp', (v) => 'https://wa.me/' + v.replace(/\D/g, '')],
    [['contact:instagram', 'instagram'], 'Instagram', (v) => 'https://instagram.com/' + v.replace(/^@/, '')],
    [['contact:ok'], 'Одноклассники', (v) => 'https://ok.ru/' + v.replace(/^@/, '')],
  ];

  const DAYS = { Mo: 'Пн', Tu: 'Вт', We: 'Ср', Th: 'Чт', Fr: 'Пт', Sa: 'Сб', Su: 'Вс', PH: 'праздники' };
  const STATUS_ICON = { new: 'bob-new', checked: 'bob-work', contacted: 'bob-work', interested: 'bob-hot', declined: 'bob-off', hassite: 'bob-off' };
  const PAGE_SIZE = 50;
  const DEFAULT_VIEW = { center: [82.9205, 55.0302], zoom: 13 }; // Новосибирск, центр

  // ---------- Мелочи ----------

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;

  function safeUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
    } catch (e) { return ''; }
  }
  const withScheme = (u) => (/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u);
  function hostOf(u) {
    try { return new URL(withScheme(u)).hostname.toLowerCase().replace(/^(www|m)\./, ''); } catch (e) { return ''; }
  }

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* хранилище недоступно — работаем без него */ }
    },
  };

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ---------- Состояние ----------

  const saved = store.get('otves.state.v1', {});
  let leads = store.get('otves.leads.v1', {});
  if (!leads || typeof leads !== 'object') leads = {};

  const state = {
    cats: new Set(Array.isArray(saved.cats) && saved.cats.length ? saved.cats : ['hair']),
    city: saved.city || 'Новосибирск',
    filters: Object.assign({ phone: false, chains: true, sites: false, status: 'all' }, saved.filters || {}),
    all: [],
    shown: PAGE_SIZE,
    selected: null,
    searched: false,
    loading: false,
    userMoved: false,
    view: 'search',
  };

  function saveState() {
    const c = map ? map.getCenter() : null;
    store.set('otves.state.v1', {
      cats: [...state.cats],
      city: state.city,
      filters: state.filters,
      center: c ? [+c.lng.toFixed(5), +c.lat.toFixed(5)] : saved.center,
      zoom: map ? +map.getZoom().toFixed(2) : saved.zoom,
    });
  }

  const saveLeads = () => store.set('otves.leads.v1', leads);

  // ---------- Разбор данных OpenStreetMap ----------

  function classifySite(raw) {
    if (!raw) return { kind: 'none', label: 'Нет сайта', url: '' };
    const first = raw.split(';')[0].trim();
    const url = safeUrl(withScheme(first));
    const host = hostOf(first);
    const page = PAGE_HOSTS.find(([re]) => re.test(host));
    if (page) return { kind: 'page', label: 'Вместо сайта: ' + page[1], via: page[1], url };
    if (WEAK_HOST.test(host)) return { kind: 'weak', label: 'Сайт на бесплатном адресе', url };
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

  function catOf(t) {
    return CATS.find((c) => c.q.some(([k, v]) => t[k] === v));
  }

  function toBiz(el) {
    const t = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    const site = classifySite(t.website || t['contact:website'] || t.url || t['contact:url'] || '');
    const cat = catOf(t);
    const socials = socialsOf(t, site);
    if (site.kind === 'none' && socials.length) site.label = 'Нет сайта, есть ' + socials[0].label;
    return {
      id: el.type[0] + el.id,
      osm: el.type + '/' + el.id,
      name: t.name,
      cat: cat ? cat.one : '',
      addr: addressOf(t),
      city: t['addr:city'] || '',
      phones: phonesOf(t),
      socials,
      hours: prettyHours(t.opening_hours),
      site,
      chain: Boolean(t.brand || t['brand:wikidata']),
      lat, lon,
    };
  }

  // ---------- Запросы к серверам ----------

  function buildQuery(cats, b) {
    const bbox = [b.s, b.w, b.n, b.e].map((x) => x.toFixed(5)).join(',');
    const parts = cats.flatMap((c) => c.q).map(([k, v]) => `nwr["${k}"="${v}"]["name"](${bbox});`).join('');
    return `[out:json][timeout:40];(${parts});out center tags qt;`;
  }

  let goodEndpoint = 0;

  /* Бесплатные серверы часто перегружены: одни сразу отвечают ошибкой, другие молчат минуту.
     Поэтому спрашиваем первый; если он упал — сразу следующий; если молчит 10 секунд —
     параллельно спрашиваем ещё один (не больше трёх одновременно). Берём первый ответ. */
  function overpass(query, outerSignal, onProgress) {
    // Первые два сервера обычно живее, поэтому к ним возвращаемся чаще.
    const base = ENDPOINTS.map((_, i) => (goodEndpoint + i) % ENDPOINTS.length);
    const order = [base[0], base[1], base[2], base[0], base[3], base[1], base[0], base[2], base[1], base[0]];
    const MAX_ATTEMPTS = order.length;
    const MAX_PARALLEL = 3;

    return new Promise((resolve, reject) => {
      const ctrls = [];
      let attempts = 0, pending = 0, done = false, lastError = null, hedgeTimer = 0;

      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(hedgeTimer);
        clearTimeout(deadline);
        ctrls.forEach((c) => c.abort());
        outerSignal.removeEventListener('abort', onAbort);
        fn(value);
      };
      const onAbort = () => finish(reject, new DOMException('Отменено', 'AbortError'));
      outerSignal.addEventListener('abort', onAbort);
      const deadline = setTimeout(() => finish(reject, lastError || new Error('Нет ответа')), 150000);

      const launch = () => {
        if (done) return;
        clearTimeout(hedgeTimer);
        if (attempts >= MAX_ATTEMPTS) {
          if (!pending) finish(reject, lastError || new Error('Нет ответа'));
          return;
        }
        if (pending >= MAX_PARALLEL) { hedgeTimer = setTimeout(launch, 10000); return; }

        const idx = order[attempts % order.length];
        attempts++;
        pending++;
        if (attempts === 2) onProgress('Сервер отвечает медленно, спрашиваю запасной…');
        if (attempts === 5) onProgress('Серверы OpenStreetMap перегружены, продолжаю пробовать…');

        const ctrl = new AbortController();
        ctrls.push(ctrl);
        const timer = setTimeout(() => ctrl.abort(), 60000);
        fetch(ENDPOINTS[idx], { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal })
          .then(async (r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            if (j.remark && /error/i.test(j.remark) && !(j.elements && j.elements.length)) throw new Error(j.remark);
            goodEndpoint = idx;
            finish(resolve, j.elements || []);
          })
          .catch((e) => {
            lastError = e;
            if (!done) setTimeout(launch, Math.min(1000 * attempts, 5000));
          })
          .finally(() => {
            clearTimeout(timer);
            pending--;
            if (!done && attempts >= MAX_ATTEMPTS && !pending) finish(reject, lastError || new Error('Нет ответа'));
          });

        hedgeTimer = setTimeout(launch, 10000);
      };

      launch();
    });
  }

  // Ответы запоминаем на 12 часов: повторный поиск того же места не ждёт серверов.
  const CACHE_KEY = 'otves.cache.v1';
  const CACHE_TTL = 12 * 3600 * 1000;

  function readCache(query) {
    const list = store.get(CACHE_KEY, []);
    const hit = Array.isArray(list) && list.find((x) => x.q === query && Date.now() - x.t < CACHE_TTL);
    return hit ? hit.els : null;
  }

  function writeCache(query, els) {
    let list = store.get(CACHE_KEY, []);
    if (!Array.isArray(list)) list = [];
    list = [{ q: query, t: Date.now(), els }, ...list.filter((x) => x.q !== query && Date.now() - x.t < CACHE_TTL)].slice(0, 5);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(list));
    } catch (e) {
      // Не влезло — оставляем только последний ответ.
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 1))); } catch (e2) { /* без кеша */ }
    }
  }

  async function geocode(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = await r.json();
    return list[0] || null;
  }

  // ---------- Карта ----------

  let map = null;
  let mapReady = false;

  function bobIcon(fill, stroke) {
    const s = 2, w = 22, h = 34;
    const c = document.createElement('canvas');
    c.width = w * s; c.height = h * s;
    const x = c.getContext('2d');
    x.scale(s, s);
    x.strokeStyle = stroke; x.fillStyle = stroke;
    x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(11, 2); x.lineTo(11, 12); x.stroke();
    x.beginPath(); x.arc(11, 2.4, 2, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(2.5, 12); x.lineTo(19.5, 12); x.lineTo(11, 32.5); x.closePath();
    x.fillStyle = fill; x.fill();
    x.lineJoin = 'round'; x.lineWidth = 1.6; x.stroke();
    const img = x.getImageData(0, 0, c.width, c.height);
    return { width: img.width, height: img.height, data: img.data };
  }

  function initMap() {
    if (!window.maplibregl) {
      $('#map').innerHTML = '<p class="empty">Карта не загрузилась. Обновите страницу.</p>';
      return;
    }
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: saved.center || DEFAULT_VIEW.center,
      zoom: saved.zoom || DEFAULT_VIEW.zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // Подписи улиц и районов — по-русски, если в OpenStreetMap есть русское название.
      for (const layer of map.getStyle().layers) {
        if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
          map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ru'], ['get', 'name']]);
        }
      }

      map.addImage('bob-new', bobIcon('#FFB800', '#142B66'), { pixelRatio: 2 });
      map.addImage('bob-work', bobIcon('#1D4596', '#142B66'), { pixelRatio: 2 });
      map.addImage('bob-hot', bobIcon('#17804F', '#0F4D30'), { pixelRatio: 2 });
      map.addImage('bob-off', bobIcon('#C9CFDB', '#8E98AE'), { pixelRatio: 2 });

      map.addSource('biz', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'biz-halo', type: 'circle', source: 'biz',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-radius': 15, 'circle-color': 'rgba(29,69,150,0.16)', 'circle-stroke-color': '#1D4596', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'biz-site', type: 'circle', source: 'biz',
        filter: ['==', ['get', 'target'], false],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 6], 'circle-color': '#8E98AE', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      });
      map.addLayer({
        id: 'biz-target', type: 'symbol', source: 'biz',
        filter: ['==', ['get', 'target'], true],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-anchor': 'bottom',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1],
          'icon-allow-overlap': true,
          'symbol-sort-key': ['get', 'order'],
        },
      });

      for (const layer of ['biz-target', 'biz-site']) {
        map.on('click', layer, (e) => {
          const f = e.features && e.features[0];
          if (f) select(f.properties.id, 'map');
        });
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      mapReady = true;
      updateHint();
      if (state.all.length) drawMap(visibleList());
      else runSearch();
    });

    map.on('movestart', (e) => { if (e.originalEvent) state.userMoved = true; });
    map.on('moveend', () => {
      updateHint();
      saveState();
      $('#hereBtn').hidden = !(state.userMoved && state.searched && !state.loading && areaOk());
    });
  }

  function drawMap(list) {
    if (!mapReady) return;
    const features = list.map((b, i) => {
      const st = statusOf(b.id);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: { id: b.id, target: b._target, icon: STATUS_ICON[st] || 'bob-new', order: st === 'new' ? 1 : 0 },
      };
    });
    map.getSource('biz').setData({ type: 'FeatureCollection', features });
    map.setLayoutProperty('biz-site', 'visibility', state.filters.sites ? 'visible' : 'none');
    map.setFilter('biz-halo', ['==', ['get', 'id'], state.selected || '']);
  }

  // ---------- Область поиска ----------

  function currentBounds() {
    const b = map.getBounds();
    return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
  }

  function areaKm2(b) {
    const h = (b.n - b.s) * 111.32;
    const w = (b.e - b.w) * 111.32 * Math.cos(((b.n + b.s) / 2) * Math.PI / 180);
    return Math.abs(h * w);
  }

  const maxArea = (n) => (n <= 2 ? 2500 : 5000 / n);
  const selectedCats = () => CATS.filter((c) => state.cats.has(c.id));
  const areaOk = () => mapReady && areaKm2(currentBounds()) <= maxArea(selectedCats().length);

  function updateHint() {
    const hint = $('#hint');
    const btn = $('#searchBtn');
    hint.classList.remove('warn');
    if (!state.cats.size) {
      btn.disabled = true;
      hint.textContent = 'Выберите хотя бы один вид бизнеса.';
      hint.classList.add('warn');
      return;
    }
    if (!mapReady) { btn.disabled = true; hint.textContent = 'Загружаю карту…'; return; }
    if (!areaOk()) {
      btn.disabled = true;
      hint.textContent = 'Слишком большая область. Приблизьте карту к нужному району или выберите меньше видов бизнеса.';
      hint.classList.add('warn');
      return;
    }
    btn.disabled = state.loading;
    hint.textContent = state.loading ? '' : 'Ищем там, что видно на карте. Подвиньте её, чтобы искать в другом месте.';
  }

  // ---------- Поиск ----------

  let searchToken = 0;
  let searchAbort = null;

  let loadingTimer = 0;

  function setLoading(on, text) {
    state.loading = on;
    $('#loader').hidden = !on;
    if (text) $('#loaderText').textContent = text;
    // Счётчик секунд: при перегруженных серверах видно, что поиск ещё идёт.
    clearInterval(loadingTimer);
    const secs = $('#loaderSecs');
    secs.textContent = '';
    if (on) {
      const t0 = Date.now();
      loadingTimer = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        secs.textContent = s >= 5 ? s + ' с' : '';
      }, 1000);
    }
    if (on) $('#hereBtn').hidden = true;
    $('#results').classList.toggle('is-stale', on);
    updateHint();
  }

  function showNotice(html, isError) {
    const n = $('#notice');
    n.innerHTML = html;
    n.classList.toggle('error', Boolean(isError));
    n.hidden = !html;
  }

  async function runSearch() {
    if (!mapReady || !state.cats.size) return;
    if (!areaOk()) { updateHint(); return; }
    const cats = selectedCats();
    const bounds = currentBounds();
    const token = ++searchToken;
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    const what = cats.length > 3 ? 'выбранные бизнесы' : cats.map((c) => c.chip.toLowerCase()).join(', ');
    setLoading(true, 'Ищу ' + what + '…');
    showNotice('');
    try {
      const query = buildQuery(cats, bounds);
      let els = readCache(query);
      if (!els) {
        els = await overpass(query, searchAbort.signal, (msg) => {
          if (token === searchToken) $('#loaderText').textContent = msg;
        });
        writeCache(query, els);
      }
      if (token !== searchToken) return;
      const seen = new Set();
      state.all = els.map(toBiz).filter((b) => {
        if (b.lat == null || !b.name) return false;
        const key = b.name.toLowerCase() + '|' + b.lat.toFixed(4) + '|' + b.lon.toFixed(4);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      state.searched = true;
      state.userMoved = false;
      state.shown = PAGE_SIZE;
      state.selected = null;
      render();
    } catch (e) {
      if (token !== searchToken) return;
      showNotice('<p>Серверы OpenStreetMap сейчас перегружены и не ответили. Подождите минуту и попробуйте ещё раз.</p><button class="btn btn-quiet" type="button" data-retry>Искать ещё раз</button>', true);
      $('#results').hidden = true;
    } finally {
      if (token === searchToken) setLoading(false);
    }
  }

  // ---------- Статусы и лиды ----------

  const statusOf = (id) => (leads[id] && leads[id].status) || 'new';

  function isTarget(b) {
    const st = statusOf(b.id);
    if (st === 'hassite') return false;
    if (st === 'checked') return true;
    return b.site.kind === 'none' || b.site.kind === 'page';
  }

  function findBiz(id) {
    return state.all.find((b) => b.id === id) || (leads[id] && leads[id].biz) || null;
  }

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

  function visibleList() {
    const f = state.filters;
    return state.all
      .map((b) => { b._target = isTarget(b); return b; })
      .filter((b) => {
        const st = statusOf(b.id);
        if (!f.sites && !b._target) return false;
        if (f.chains && b.chain) return false;
        if (f.phone && !b.phones.length) return false;
        if (f.status === 'new' && st !== 'new') return false;
        if (f.status === 'work' && !WORK.includes(st)) return false;
        return true;
      })
      .sort((a, b) => (b._target - a._target)
        || ((b.phones.length > 0) - (a.phones.length > 0))
        || a.name.localeCompare(b.name, 'ru'));
  }

  const yandexUrl = (b) => `https://yandex.ru/maps/?ll=${b.lon.toFixed(6)},${b.lat.toFixed(6)}&z=18&text=${encodeURIComponent(b.name)}`;
  const gisUrl = (b) => `https://2gis.ru/search/${encodeURIComponent(b.name)}?m=${b.lon.toFixed(6)}%2C${b.lat.toFixed(6)}%2F18`;
  const webSearchUrl = (b) => `https://yandex.ru/search/?text=${encodeURIComponent(`${b.name} ${b.city || state.city} сайт`)}`;
  const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '');

  function rowHtml(b) {
    const lead = leads[b.id];
    const st = statusOf(b.id);
    const kind = st === 'hassite' ? 'own' : st === 'checked' ? 'none' : b.site.kind;
    const badge = st === 'hassite' ? 'Сайт есть' : st === 'checked' ? 'Сайта нет, проверено' : b.site.label;
    const meta = [b.cat, b.addr || 'адрес не указан'].filter(Boolean).join(', ');

    const contacts = [];
    b.phones.slice(0, 2).forEach((p) => contacts.push(`<a href="${esc(telHref(p))}">${esc(p)}</a>`));
    b.socials.forEach((s) => contacts.push(`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`));
    if ((b.site.kind === 'own' || b.site.kind === 'weak') && b.site.url) {
      contacts.push(`<a href="${esc(b.site.url)}" target="_blank" rel="noopener">${esc(hostOf(b.site.url))}</a>`);
    }

    const options = STATUSES.map((s) => `<option value="${s.id}"${s.id === st ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    const note = lead && lead.note ? lead.note : '';

    return `<li class="biz${b.id === state.selected ? ' is-selected' : ''}" data-id="${esc(b.id)}" data-status="${st}">
      <div class="biz-head">
        <h3 class="biz-name"><button type="button" data-act="locate" title="Показать на карте">${esc(b.name)}</button></h3>
        <span class="badge badge-${kind}">${esc(badge)}</span>
      </div>
      <p class="biz-meta">${esc(meta)}</p>
      ${contacts.length ? `<p class="biz-contacts">${contacts.join('')}</p>` : ''}
      ${b.hours ? `<p class="biz-hours">${esc(b.hours)}</p>` : ''}
      <div class="biz-actions">
        <a class="act" href="${esc(yandexUrl(b))}" target="_blank" rel="noopener">Яндекс Карты</a>
        <a class="act" href="${esc(gisUrl(b))}" target="_blank" rel="noopener">2ГИС</a>
        <a class="act" href="${esc(webSearchUrl(b))}" target="_blank" rel="noopener">Найти сайт</a>
      </div>
      <div class="biz-work">
        <label class="sr-only" for="st-${esc(b.id)}">Статус</label>
        <select class="status-select s-${st}" id="st-${esc(b.id)}" data-act="status">${options}</select>
        <button class="act" type="button" data-act="note" aria-expanded="false">${note ? 'Изменить заметку' : 'Заметка'}</button>
      </div>
      ${note ? `<p class="note-text">${esc(note)}</p>` : ''}
    </li>`;
  }

  function render() {
    const list = visibleList();
    const f = state.filters;

    // Сводка считается без сетей (если они скрыты), чтобы цифры были честными.
    const pool = state.all.filter((b) => !(f.chains && b.chain));
    pool.forEach((b) => { b._target = isTarget(b); });
    const targets = pool.filter((b) => b._target);
    const withPhone = targets.filter((b) => b.phones.length).length;
    const pages = targets.filter((b) => b.socials.length).length;
    const chains = state.all.length - pool.length;

    $('#results').hidden = false;
    $('#sumTargets').textContent = targets.length;
    $('#sumLabel').textContent = `без своего сайта из ${pool.length}`;
    $('#meterFill').style.width = pool.length ? (targets.length / pool.length * 100).toFixed(1) + '%' : '0';
    const sub = [];
    if (targets.length) sub.push(`С телефоном: ${withPhone}.`);
    if (pages) sub.push(`Есть соцсеть или страница записи, но нет сайта: ${pages}.`);
    if (chains) sub.push(`${chains} ${plural(chains, 'точка сети скрыта', 'точки сетей скрыты', 'точек сетей скрыто')}.`);
    $('#sumSub').textContent = sub.join(' ');

    const ul = $('#list');
    if (!state.all.length) {
      ul.innerHTML = '<li class="empty">Здесь ничего не нашлось. Подвиньте карту, отдалите её или выберите другие виды бизнеса.</li>';
    } else if (!list.length) {
      ul.innerHTML = '<li class="empty">Под фильтры никто не подходит. Снимите часть фильтров выше.</li>';
    } else {
      ul.innerHTML = list.slice(0, state.shown).map(rowHtml).join('');
    }
    const rest = list.length - state.shown;
    const more = $('#moreBtn');
    more.hidden = rest <= 0;
    more.textContent = `Показать ещё ${Math.min(rest, PAGE_SIZE)} из ${Math.max(rest, 0)}`;

    drawMap(list);
  }

  function renderLeadCount() {
    const n = Object.keys(leads).length;
    const el = $('#leadCount');
    el.textContent = n;
    el.classList.toggle('has', n > 0);
  }

  const SUMMARY_LABELS = { new: 'Новые', checked: 'Проверено', contacted: 'Связался', interested: 'Интересно', declined: 'Отказ', hassite: 'Сайт есть' };

  function leadsSummary() {
    const list = Object.values(leads).filter((l) => l && l.biz);
    if (!list.length) return 'Пока пусто';
    const counts = {};
    list.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
    const parts = STATUSES.filter((s) => counts[s.id]).map((s) => `${SUMMARY_LABELS[s.id]}: ${counts[s.id]}.`);
    return `Всего ${list.length}. ${parts.join(' ')}`;
  }

  function renderLeads() {
    const arr = Object.entries(leads)
      .filter(([, l]) => l && l.biz)
      .sort((a, b) => b[1].updated - a[1].updated);
    $('#leadsSum').textContent = leadsSummary();
    $('#exportBtn').disabled = !arr.length;
    $('#leadsEmpty').hidden = arr.length > 0;
    $('#leadList').innerHTML = arr.map(([, l]) => rowHtml(l.biz)).join('');
    renderLeadCount();
  }

  // ---------- Выбор бизнеса ----------

  function select(id, from) {
    state.selected = id;
    if (mapReady) map.setFilter('biz-halo', ['==', ['get', 'id'], id]);

    const listEl = state.view === 'leads' ? $('#leadList') : $('#list');
    if (state.view === 'search') {
      const idx = visibleList().findIndex((b) => b.id === id);
      if (idx >= state.shown) { state.shown = idx + 1; render(); }
    }
    listEl.querySelectorAll('.biz.is-selected').forEach((el) => el.classList.remove('is-selected'));
    const row = listEl.querySelector(`.biz[data-id="${CSS.escape(id)}"]`);
    if (row) row.classList.add('is-selected');

    const b = findBiz(id);
    if (from === 'map' && row) {
      row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: isNarrow() ? 'start' : 'nearest' });
    }
    if (from === 'list' && b && mapReady) {
      if (isNarrow()) $('#mapWrap').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      map.easeTo({ center: [b.lon, b.lat], zoom: Math.max(map.getZoom(), 16), duration: reduceMotion ? 0 : 700 });
    }
  }

  // ---------- Выгрузка для Excel ----------

  function exportCsv() {
    const head = ['Название', 'Вид', 'Адрес', 'Город', 'Телефон', 'Соцсети', 'Сайт по OpenStreetMap', 'Статус', 'Заметка', 'Яндекс Карты', 'Изменено'];
    const rows = Object.values(leads).filter((l) => l && l.biz).map((l) => {
      const b = l.biz;
      return [
        b.name, b.cat, b.addr, b.city || '', b.phones.join(', '),
        b.socials.map((s) => s.url).join(' '),
        b.site.url || b.site.label,
        (STATUSES.find((s) => s.id === l.status) || {}).label || '',
        l.note || '', yandexUrl(b),
        new Date(l.updated).toLocaleDateString('ru-RU'),
      ];
    });
    // Excel считает формулой всё, что начинается с = + - @. Телефону хватает пробела впереди,
    // остальному тексту ставим апостроф.
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
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('.biz');
      if (!li) return;
      const actEl = e.target.closest('[data-act]');
      const act = actEl && actEl.dataset.act;
      if (act === 'locate') select(li.dataset.id, 'list');
      if (act === 'note') toggleNote(li, actEl);
    });
    ul.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-act="status"]');
      if (!sel) return;
      const li = sel.closest('.biz');
      const id = li.dataset.id;
      updateLead(id, { status: sel.value });
      li.dataset.status = sel.value;
      sel.className = 'status-select s-' + sel.value;
      const b = findBiz(id);
      if (b) {
        const badge = li.querySelector('.badge');
        const kind = sel.value === 'hassite' ? 'own' : sel.value === 'checked' ? 'none' : b.site.kind;
        badge.className = 'badge badge-' + kind;
        badge.textContent = sel.value === 'hassite' ? 'Сайт есть' : sel.value === 'checked' ? 'Сайта нет, проверено' : b.site.label;
      }
      if (state.all.length) drawMap(visibleList());
      if (state.view === 'leads') renderLeadsSummaryOnly();
    });
  }

  function renderLeadsSummaryOnly() {
    $('#leadsSum').textContent = leadsSummary();
  }

  function toggleNote(li, btn) {
    let area = li.querySelector('textarea.note');
    if (area) {
      saveNote(li, area.value);
      return;
    }
    const id = li.dataset.id;
    const old = (leads[id] && leads[id].note) || '';
    const text = li.querySelector('.note-text');
    if (text) text.hidden = true;
    area = document.createElement('textarea');
    area.className = 'note';
    area.value = old;
    area.placeholder = 'Например: позвонить в среду, хозяйку зовут Анна';
    area.setAttribute('aria-label', 'Заметка');
    li.appendChild(area);
    btn.textContent = 'Сохранить заметку';
    btn.setAttribute('aria-expanded', 'true');
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
      if (!text) {
        text = document.createElement('p');
        text.className = 'note-text';
        li.appendChild(text);
      }
      text.textContent = note;
      text.hidden = false;
    } else if (text) {
      text.remove();
    }
    const btn = li.querySelector('[data-act="note"]');
    btn.textContent = note ? 'Изменить заметку' : 'Заметка';
    btn.setAttribute('aria-expanded', 'false');
    if (state.view === 'leads') renderLeadsSummaryOnly();
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
    else if (state.all.length) render();
    if (map) map.resize();
  }

  function renderChips() {
    $('#cats').innerHTML = CATS.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${state.cats.has(c.id)}">${esc(c.chip)}</button>`).join('');
  }

  function bind() {
    $('#cats').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const id = chip.dataset.cat;
      if (state.cats.has(id)) state.cats.delete(id); else state.cats.add(id);
      chip.setAttribute('aria-pressed', state.cats.has(id));
      saveState();
      updateHint();
      if (state.searched && !state.loading) $('#hereBtn').hidden = !(state.cats.size && areaOk());
    });

    $('#searchBtn').addEventListener('click', runSearch);
    $('#hereBtn').addEventListener('click', runSearch);
    $('#notice').addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) runSearch(); });

    $('#cityForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $('#cityInput').value.trim();
      if (!q || !mapReady) return;
      const hint = $('#hint');
      hint.classList.remove('warn');
      hint.textContent = 'Ищу «' + q + '» на карте…';
      try {
        const place = await geocode(q);
        if (!place) {
          hint.textContent = 'Не нашёл «' + q + '». Проверьте название или добавьте область.';
          hint.classList.add('warn');
          return;
        }
        state.city = q;
        saveState();
        const [s, n, w, ea] = place.boundingbox.map(Number);
        map.once('moveend', () => {
          if (areaOk()) runSearch();
          else {
            updateHint();
            hint.textContent = 'Город большой. Приблизьте нужный район и нажмите «Искать здесь».';
            state.searched = true;
            state.userMoved = true;
          }
        });
        map.fitBounds([[w, s], [ea, n]], { padding: 24, maxZoom: 15, duration: reduceMotion ? 0 : 900 });
      } catch (err) {
        hint.textContent = 'Поиск города не ответил. Попробуйте ещё раз или подвиньте карту вручную.';
        hint.classList.add('warn');
      }
    });

    const filterIds = { fPhone: 'phone', fChains: 'chains', fSites: 'sites' };
    Object.entries(filterIds).forEach(([elId, key]) => {
      const el = $('#' + elId);
      el.checked = Boolean(state.filters[key]);
      el.addEventListener('change', () => {
        state.filters[key] = el.checked;
        state.shown = PAGE_SIZE;
        saveState();
        if (state.all.length) render();
      });
    });
    const fStatus = $('#fStatus');
    fStatus.value = state.filters.status;
    fStatus.addEventListener('change', () => {
      state.filters.status = fStatus.value;
      state.shown = PAGE_SIZE;
      saveState();
      if (state.all.length) render();
    });

    $('#moreBtn').addEventListener('click', () => {
      state.shown += PAGE_SIZE;
      render();
    });

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

    // Заметку сохраняем и по Ctrl+Enter.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('textarea.note')) {
        saveNote(e.target.closest('.biz'), e.target.value);
      }
    });

    // Другие вкладки браузера могли изменить лиды.
    window.addEventListener('storage', (e) => {
      if (e.key !== 'otves.leads.v1') return;
      leads = store.get('otves.leads.v1', {}) || {};
      renderLeadCount();
      if (state.view === 'leads') renderLeads(); else if (state.all.length) render();
    });
  }

  // ---------- Старт ----------

  function start() {
    $('#cityInput').value = saved.city || '';
    renderChips();
    renderLeadCount();
    bind();
    updateHint();
    initMap();
  }

  start();
})();
