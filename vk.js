'use strict';

/* Отвес × ВКонтакте: поиск сообществ бизнесов через официальный API ВК.
   Вход — через VK ID один раз; ключ хранится только в этом браузере и продлевается сам.
   Данные уходят только в ВКонтакте (запросы к api.vk.com). */

(function () {
  // ---------- Настройки ----------

  // ID приложения VK ID (публичный, не секрет). 0 — ВК ещё не подключён.
  const VK_APP_ID = 0;
  // Должен совпадать с «Доверенный redirect URL» в настройках приложения VK ID.
  const REDIRECT_URL = 'https://dima1playnsk-bot.github.io/otves/';
  // Права доступа. Пусто — базовые; поиск сообществ и чтение открытых стен работают с ними.
  const SCOPE = '';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@vkid/sdk@2.6.9/dist-sdk/umd/index.js';
  const API_V = '5.199';
  const TOKEN_KEY = 'otves.vk.v1';
  const CACHE_KEY = 'otves.vkcache.v1';
  const CITY_KEY = 'otves.vkcity.v1';
  const CACHE_TTL = 3 * 24 * 3600 * 1000; // найденное в ВК помним 3 дня
  const PER_QUERY = 200;                  // сообществ на один поисковый запрос (максимум ВК — 1000)

  // Что искать во ВКонтакте для каждого вида бизнеса (id из CATS в app.js).
  const QUERIES = {
    hair: ['барбершоп', 'парикмахерская'],
    beauty: ['салон красоты', 'маникюр'],
    tattoo: ['тату'],
    massage: ['массаж'],
    cafe: ['кафе', 'кофейня'],
    rest: ['ресторан'],
    fast: ['шаурма', 'пицца', 'бургерная'],
    bakery: ['пекарня', 'кондитерская'],
    flowers: ['цветы'],
    car: ['автосервис'],
    tyres: ['шиномонтаж'],
    wash: ['автомойка', 'детейлинг'],
    dent: ['стоматология'],
    vet: ['ветклиника'],
    pet: ['груминг', 'зоомагазин'],
    fit: ['фитнес', 'тренажерный зал'],
    repair: ['ремонт телефонов'],
    shoe: ['ремонт обуви', 'ателье'],
    clean: ['химчистка'],
    photo: ['фотостудия'],
    dance: ['школа танцев', 'студия танцев', 'танцы'],
    sport: ['спортивная секция', 'единоборства'],
  };

  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const appId = () => window.__vkAppId || VK_APP_ID; // __vkAppId — только для проверки

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* без хранилища */ }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch (e) { /* без хранилища */ }
    },
  };

  const status = (text) => { $('#vkStatus').textContent = text; };

  // ---------- Запросы к API ВК ----------
  // api.vk.com не разрешает обычные запросы со сторонних сайтов, поэтому — JSONP (тег <script>).

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = '__vk' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('ВК не ответил, попробуйте ещё раз')); }, 20000);
      function cleanup() { clearTimeout(timer); delete window[cb]; s.remove(); }
      window[cb] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('ВК недоступен')); };
      s.src = url + '&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  let lastCall = 0;
  async function api(method, params) {
    if (window.__vkMock) return window.__vkMock(method, params); // только для проверки
    const token = currentToken();
    if (!token) throw new Error('Нужно войти через VK ID');
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = 360 - (Date.now() - lastCall); // не больше трёх запросов в секунду
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      const q = new URLSearchParams(Object.assign({}, params, { access_token: token, v: API_V }));
      const data = await jsonp('https://api.vk.com/method/' + method + '?' + q);
      if (data && data.error) {
        const code = data.error.error_code;
        if (code === 6 || code === 9) { await sleep(1200); continue; } // слишком часто — подождём
        if (code === 5) { store.del(TOKEN_KEY); updateButtons(); throw new Error('Вход в ВК устарел — нажмите «Найти во ВКонтакте» ещё раз.'); }
        throw new Error(`ВК: ${data.error.error_msg} (код ${code})`);
      }
      return data.response;
    }
    throw new Error('ВК просит подождать. Попробуйте через минуту.');
  }

  // ---------- Вход через VK ID ----------

  let sdkReady = null;
  function loadSdk() {
    if (sdkReady) return sdkReady;
    sdkReady = new Promise((resolve, reject) => {
      if (window.VKIDSDK) { resolve(window.VKIDSDK); return; }
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.onload = () => resolve(window.VKIDSDK);
      s.onerror = () => { sdkReady = null; reject(new Error('Не загрузилась библиотека VK ID')); };
      document.head.appendChild(s);
    }).then((VKID) => {
      VKID.Config.init({
        app: appId(),
        redirectUrl: REDIRECT_URL,
        responseMode: VKID.ConfigResponseMode.Callback,
        source: VKID.ConfigSource.LOWCODE,
        scope: SCOPE,
        state: randomString(40),
      });
      return VKID;
    });
    return sdkReady;
  }

  function randomString(n) {
    const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }

  function currentToken() {
    const t = store.get(TOKEN_KEY, null);
    return t && t.access_token && t.expires_at > Date.now() + 60000 ? t.access_token : '';
  }

  function saveToken(r, deviceId) {
    store.set(TOKEN_KEY, {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      device_id: deviceId,
      user_id: r.user_id,
      expires_at: Date.now() + (r.expires_in || 3600) * 1000,
    });
    updateButtons();
  }

  // loginPromise — окно входа, открытое прямо в обработчике нажатия (иначе браузер его заблокирует).
  async function ensureToken(loginPromise) {
    if (window.__vkMock || currentToken()) return;
    const VKID = await loadSdk();
    const t = store.get(TOKEN_KEY, null);
    if (t && t.refresh_token && t.device_id && !loginPromise) {
      status('ВК: продлеваю вход…');
      try {
        const r = await VKID.Auth.refreshToken(t.refresh_token, t.device_id);
        saveToken(r, t.device_id);
        return;
      } catch (e) {
        store.del(TOKEN_KEY);
        updateButtons();
        throw new Error('Вход в ВК устарел — нажмите «Найти во ВКонтакте» ещё раз.');
      }
    }
    if (!loginPromise) throw new Error('Нажмите «Найти во ВКонтакте» ещё раз, чтобы войти.');
    status('ВК: войдите в открывшемся окне VK ID…');
    const res = await loginPromise;
    if (!res || !res.code) throw new Error('Вход через VK ID отменён.');
    const r = await VKID.Auth.exchangeCode(res.code, res.device_id);
    saveToken(r, res.device_id);
  }

  // ---------- Поиск сообществ ----------

  async function vkCityId(city) {
    const cache = store.get(CITY_KEY, {});
    if (cache[city.id]) return cache[city.id];
    const r = await api('database.getCities', { country_id: 1, q: city.name, count: 1 });
    const id = r && r.items && r.items[0] && r.items[0].id;
    if (!id) throw new Error(`ВК не нашёл город «${city.name}»`);
    cache[city.id] = id;
    store.set(CITY_KEY, cache);
    return id;
  }

  // Один запрос execute = до 25 вызовов API: на каждое сообщество адрес и два последних поста.
  function buildExecute(items) {
    return 'var g=' + JSON.stringify(items) + ';var r=[];var i=0;'
      + 'while(i<g.length){var a=null;'
      + 'if(g[i].addr){var ad=API.groups.getAddresses({"group_id":g[i].id,"count":1});if(ad){if(ad.count>0){a=ad.items[0];}}}'
      + 'var w=API.wall.get({"owner_id":-g[i].id,"count":2,"filter":"owner"});var d=null;if(w){d=w.items@.date;}'
      + 'r.push({"id":g[i].id,"a":a,"d":d});i=i+1;}return r;';
  }

  // Часы работы из ВК → формат OpenStreetMap («Mo-Fr 09:00-21:00»), его понимает сайт.
  function hoursFrom(a) {
    if (a.work_info_status === 'always_opened') return '24/7';
    const tt = a.timetable;
    if (!tt) return '';
    const days = [['mon', 'Mo'], ['tue', 'Tu'], ['wed', 'We'], ['thu', 'Th'], ['fri', 'Fr'], ['sat', 'Sa'], ['sun', 'Su']];
    const hm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const val = days.map(([k]) => (tt[k] ? hm(tt[k].open_time) + '-' + hm(tt[k].close_time) : 'off'));
    const parts = [];
    for (let i = 0; i < 7;) {
      let j = i;
      while (j + 1 < 7 && val[j + 1] === val[i]) j++;
      parts.push((i === j ? days[i][1] : days[i][1] + '-' + days[j][1]) + ' ' + val[i]);
      i = j + 1;
    }
    return parts.join('; ');
  }

  // Сообщество ВК → запись в формате, который понимает сайт (как у OpenStreetMap).
  function toElement(g, catId, x, city) {
    const a = x && x.a;
    let lat = a ? +a.latitude : null;
    let lon = a ? +a.longitude : null;
    const b = city.bbox;
    if (!(lat >= b.s - 0.15 && lat <= b.n + 0.15 && lon >= b.w - 0.2 && lon <= b.e + 0.2)) { lat = null; lon = null; }
    const dates = (x && x.d) || [];
    const last = dates.length ? Math.max.apply(null, dates) : 0;
    const phones = [];
    if (a && a.phone) phones.push(a.phone);
    (g.contacts || []).forEach((c) => { if (c && c.phone && phones.length < 3) phones.push(c.phone); });
    const vkUrl = 'https://vk.com/' + (g.screen_name || 'club' + g.id);
    const site = String(g.site || '').split(/[\s,;]+/).find(Boolean) || '';
    const tags = { name: g.name, cat: catId, src: 'vk', 'contact:vk': vkUrl, website: site || vkUrl, vk_members: g.members_count || 0 };
    if (last) tags.vk_last = new Date(last * 1000).toISOString().slice(0, 10);
    if (phones.length) tags.phone = phones.join(';');
    if (a && a.address) tags['addr:full'] = a.address;
    if (a) { const h = hoursFrom(a); if (h) tags.opening_hours = h; }
    return { type: 'vk', id: g.id, lat, lon, tags };
  }

  // ---------- Запоминание найденного ----------

  function cacheLoad(cityId) {
    const all = store.get(CACHE_KEY, {});
    const c = all[cityId];
    return c && Date.now() - c.t < CACHE_TTL ? c.els : [];
  }

  function cacheSave(cityId, els) {
    const all = store.get(CACHE_KEY, {});
    const old = all[cityId] && Date.now() - all[cityId].t < CACHE_TTL ? all[cityId].els : [];
    const byId = new Map(old.map((e) => [e.id, e]));
    els.forEach((e) => byId.set(e.id, e));
    all[cityId] = { t: Date.now(), els: [...byId.values()] };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ [cityId]: all[cityId] })); } catch (e2) { /* не влезло */ }
    }
  }

  // ---------- Главное: найти во ВКонтакте ----------

  let busy = false;

  async function run() {
    const O = window.OTVES;
    if (busy || !O) return;
    if (!appId()) {
      status('ВКонтакте ещё не подключён: нужен ID приложения VK ID. Как его получить — в заметке «Отвес» в Obsidian.');
      return;
    }
    if (!O.loaded()) { status('Сначала нажмите «Искать», чтобы загрузить город.'); return; }
    const cats = O.cats();
    if (!cats.length) { status('Выберите вид бизнеса (например, «Школы танцев»), затем нажмите «Найти во ВКонтакте».'); return; }
    if (cats.length > 3) { status('Выберите не больше трёх видов бизнеса за раз — иначе поиск будет долгим.'); return; }

    // Окно входа открываем сразу в обработчике нажатия, до любых ожиданий.
    let loginPromise = null;
    const t = store.get(TOKEN_KEY, null);
    if (!window.__vkMock && !currentToken() && !(t && t.refresh_token)) {
      if (!window.VKIDSDK) { status('Загружаю вход VK ID, нажмите кнопку ещё раз через пару секунд.'); loadSdk(); return; }
      loginPromise = window.VKIDSDK.Auth.login();
    }

    busy = true;
    const btn = $('#vkBtn');
    btn.disabled = true;
    try {
      await ensureToken(loginPromise);
      const city = O.city();
      const cityId = await vkCityId(city);
      const found = new Map(); // id сообщества → вид бизнеса
      for (const c of cats) {
        for (const q of QUERIES[c.id] || [c.find || c.chip.toLowerCase()]) {
          status(`ВК: ищу «${q}» в городе ${city.name}…`);
          const r = await api('groups.search', { q, city_id: cityId, count: PER_QUERY });
          ((r && r.items) || []).forEach((g) => { if (!found.has(g.id)) found.set(g.id, c.id); });
        }
      }
      const ids = [...found.keys()];
      if (!ids.length) { status('ВК: ничего не нашлось.'); return; }

      status(`ВК: нашлось ${ids.length} сообществ, смотрю подробности…`);
      const groups = [];
      for (let i = 0; i < ids.length; i += 400) {
        const r = await api('groups.getById', {
          group_ids: ids.slice(i, i + 400).join(','),
          fields: 'addresses,site,members_count,city,contacts,activity,verified',
        });
        groups.push(...(Array.isArray(r) ? r : (r && r.groups) || []));
      }
      // Открытые, не удалённые и хоть немного живые сообщества.
      const live = groups.filter((g) => !g.deactivated && !g.is_closed && (g.members_count || 0) >= 10);

      const extra = {};
      for (let i = 0; i < live.length; i += 12) {
        const chunk = live.slice(i, i + 12);
        status(`ВК: адреса и посты ${Math.min(i + 12, live.length)} из ${live.length}…`);
        const r = await api('execute', { code: buildExecute(chunk.map((g) => ({ id: g.id, addr: Boolean(g.addresses && g.addresses.is_enabled) }))) });
        (r || []).forEach((x) => { if (x) extra[x.id] = x; });
      }

      const els = live.map((g) => toElement(g, found.get(g.id), extra[g.id], city));
      cacheSave(city.id, els);
      const res = O.addExternal(els);
      const fresh = els.filter((e) => e.tags.vk_last && Date.now() - Date.parse(e.tags.vk_last) < 183 * 86400000).length;
      const noAddr = els.filter((e) => e.lat == null).length;
      status(`ВК: сообществ найдено ${els.length}, живых (посты за полгода) ${fresh}. Новых в списке ${res.added}, дополнено уже известных ${res.merged}.`
        + (noAddr ? ` Без адреса ${noAddr}: они только в списке, не на карте.` : ''));
    } catch (e) {
      status(e.message || 'ВК: что-то пошло не так.');
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  function updateButtons() {
    const t = store.get(TOKEN_KEY, null);
    $('#vkOut').hidden = !(t && (t.access_token || t.refresh_token));
  }

  function init() {
    if (!$('#vkBtn')) return;
    $('#vkBtn').addEventListener('click', run);
    $('#vkOut').addEventListener('click', () => {
      store.del(TOKEN_KEY);
      updateButtons();
      status('Вы вышли из ВК на этом сайте.');
    });
    updateButtons();
    if (appId()) loadSdk().catch(() => { /* загрузим при нажатии */ });
    // Город загружен — возвращаем то, что уже нашли в ВК за последние 3 дня.
    document.addEventListener('otves:loaded', (e) => {
      const els = cacheLoad(e.detail.city);
      if (els.length && window.OTVES) {
        window.OTVES.addExternal(els);
        status(`ВК: добавлены сообщества, найденные раньше (${els.length}).`);
      }
    });
  }

  init();
})();
