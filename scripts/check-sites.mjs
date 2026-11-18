#!/usr/bin/env node
// Проверяет, живы ли сайты у бизнесов в data/<город>.json.
//
// Зачем: сайт считает бизнес "с сайтом", если в данных есть поле website. Но часто
// там мёртвая страница, парковка домена или ссылка на соцсеть. Для такого бизнеса
// сайта фактически нет — а значит это лид. Скрипт переносит адрес из website
// в dead_website, и бизнес начинает показываться как лид, не теряя информации.
//
// Запуск:
//   node scripts/check-sites.mjs                      # все города
//   node scripts/check-sites.mjs --city=novosibirsk   # один город
//   node scripts/check-sites.mjs --dry-run            # только отчёт, файлы не менять
//   node scripts/check-sites.mjs --limit=200          # первые 200 сайтов, для пробы
//
// Зависимостей нет, работает на встроенном fetch (Node 18+).

import { readdir, readFile, writeFile } from 'node:fs/promises';

const argv = new Map();
for (const raw of process.argv.slice(2)) {
  const [k, v] = raw.replace(/^--/, '').split('=');
  argv.set(k, v ?? '1');
}
const DRY = argv.has('dry-run');
const ONLY = argv.get('city') || null;
const LIMIT = Number(argv.get('limit') || 0);
const CONC = Math.max(1, Number(argv.get('concurrency') || 8));
const TIMEOUT = Number(argv.get('timeout') || 9000);
const DATA = 'data';

// Ссылки на соцсети и конструкторы сайтов не проверяем: это не "свой сайт",
// но и не мёртвая ссылка — такие записи сайт и так показывает как лиды.
const SOCIAL_RE = /(^|\.)(vk\.(com|ru)|t\.me|telegram\.me|wa\.me|whatsapp\.com|instagram\.com|ok\.ru|taplink\.(cc|ws|at|ru)|linktr\.ee|dikidi\.(net|ru|app)|yclients\.com|2gis\.(ru|com)|yandex\.(ru|com)|zoon\.ru|flamp\.ru|avito\.ru|profi\.ru)$/i;

const PARKED_RE = [
  /купить\s+(этот\s+)?домен/i,
  /домен\s+(продан|продаётся|свободен|припаркован|зарегистрирован)/i,
  /\bdomain\s+(is\s+)?(for\s+sale|parked)/i,
  /\bthis\s+domain\s+(may\s+be\s+)?for\s+sale/i,
  /\bsedo\b|\bdan\.com\b|\bparkingcrew\b/i,
  /сайт\s+(на\s+)?(реконструкции|обслуживании|заблокирован)/i,
];

const WEBSITE_KEYS = ['website', 'contact:website', 'url', 'contact:url'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_BODY = 25000;

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return 'https:' + s;
  return 'https://' + s;
}

async function readCapped(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8', { fatal: false });
  let out = '';
  try {
    while (out.length < MAX_BODY) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  return out.slice(0, MAX_BODY);
}

function looksParked(body) {
  const head = body.slice(0, 8000);
  return PARKED_RE.some((rx) => rx.test(head));
}

// Возвращает: ok | dead | parked | social | blocked
async function probe(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const host = hostOf(url);
  if (!host) return 'dead';
  if (SOCIAL_RE.test(host)) return 'social';

  let softFailure = null; // 403/429/5xx — не доказательство смерти сайта

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'ru-RU,ru;q=0.9,en;q=0.7',
        },
        signal: AbortSignal.timeout(TIMEOUT + attempt * 6000),
      });
      const status = res.status;

      if (status === 404 || status === 410 || status === 451) {
        try { await res.body?.cancel(); } catch {}
        return 'dead';
      }
      if (status === 401 || status === 403 || status === 429 || status === 407) {
        try { await res.body?.cancel(); } catch {}
        return 'blocked';
      }
      if (status >= 500) {
        try { await res.body?.cancel(); } catch {}
        softFailure = 'blocked';
        continue;
      }
      if (status >= 200 && status < 400) {
        const type = res.headers.get('content-type') || '';
        // PDF/картинка по адресу "сайта" — это не сайт.
        if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
          try { await res.body?.cancel(); } catch {}
          return 'dead';
        }
        const body = await readCapped(res);
        if (looksParked(body)) return 'parked';
        if (body.trim().length < 40) return 'dead';
        return 'ok';
      }
      try { await res.body?.cancel(); } catch {}
      return 'blocked';
    } catch (e) {
      // Node прячет реальную причину в e.cause: e.message всего лишь "fetch failed".
      const parts = [e?.name, e?.message, e?.cause?.name, e?.cause?.code, e?.cause?.message]
        .filter(Boolean).join(' ');

      if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(parts)) {
        return 'dead'; // домен не резолвится или порт закрыт — сайта нет
      }
      if (/CERT|SSL|self.signed|UNABLE_TO_VERIFY|ERR_TLS/i.test(parts)) {
        // Битый сертификат браузер тоже покажет предупреждением. Проверим http:
        // если по http отвечает — сайт живой, просто сломан сертификат.
        const plain = url.replace(/^https:/i, 'http:');
        if (plain !== url) {
          try {
            const res = await fetch(plain, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
            try { await res.body?.cancel(); } catch {}
            if (res.status < 500) return 'blocked';
          } catch {}
        }
        return 'dead';
      }
      if (/ECONNRESET|EPROTO|socket hang up/i.test(parts)) {
        // Часто это защита от ботов (Cloudflare/DDoS-Guard), а не мёртвый сайт.
        softFailure = 'blocked';
        continue;
      }
      softFailure = 'timeout';
    }
  }
  // Не смогли ни подтвердить, ни опровергнуть: считаем живым, чтобы не врать в лидах.
  return softFailure === 'timeout' ? 'blocked' : softFailure || 'blocked';
}

function pickWebsite(tags) {
  for (const k of WEBSITE_KEYS) {
    const v = tags[k];
    if (v && String(v).trim()) return { key: k, url: String(v).trim() };
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const files = (await readdir(DATA))
  .filter((f) => f.endsWith('.json') && !f.endsWith('.osm.json'))
  .filter((f) => !ONLY || f === `${ONLY}.json`)
  .sort();

if (!files.length) {
  console.error('Нет файлов data/*.json — нечего проверять.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 7); // YYYY-MM
let totalProbed = 0;

for (const file of files) {
  const path = `${DATA}/${file}`;
  const city = file.replace(/\.json$/, '');
  const base = JSON.parse(await readFile(path, 'utf8'));
  const elements = Array.isArray(base.elements) ? base.elements : [];

  // Собираем уникальные сайты: у сетей один домен на десятки точек.
  // Заодно перепроверяем те, что мы в прошлые разы признали мёртвыми: домен мог ожить.
  const tasks = new Map();
  const addTask = (raw) => {
    const host = hostOf(normalizeUrl(raw));
    if (!host || SOCIAL_RE.test(host)) return;
    if (!tasks.has(host)) tasks.set(host, normalizeUrl(raw));
  };
  for (const el of elements) {
    const tags = el.tags || {};
    const w = pickWebsite(tags);
    if (w) addTask(w.url);
    else if (tags.dead_website) addTask(tags.dead_website);
  }

  let pairs = [...tasks.entries()];
  if (LIMIT) pairs = pairs.slice(0, LIMIT);
  if (!pairs.length) {
    console.log(`[${city}] сайтов для проверки нет`);
    continue;
  }

  console.log(`[${city}] проверяю доменов: ${pairs.length}`);
  totalProbed += pairs.length;
  const results = await mapLimit(pairs, CONC, async ([host, url]) => {
    const status = await probe(url);
    console.log(`  ${status.padEnd(8)} ${host}`);
    return [host, status];
  });
  const byHost = new Map(results);

  const stats = { ok: 0, dead: 0, parked: 0, blocked: 0, social: 0 };
  let saved = 0;
  let restored = 0;

  for (const el of elements) {
    const tags = el.tags || {};
    const w = pickWebsite(tags);

    // Домен, который раньше был мёртвым, снова отвечает — возвращаем сайт на место.
    if (!w && tags.dead_website) {
      const host = hostOf(normalizeUrl(tags.dead_website));
      if (host && byHost.get(host) === 'ok') {
        tags.website = tags.dead_website;
        delete tags.dead_website;
        tags.site_status = 'ok';
        tags.site_checked = today;
        restored++;
      }
      continue;
    }
    if (!w) continue;
    const host = hostOf(normalizeUrl(w.url));
    if (!host) continue;
    if (SOCIAL_RE.test(host)) {
      stats.social++;
      tags.site_status = 'social';
      continue;
    }

    const known = byHost.get(host);
    if (known === undefined) {
      // Домен попал в список, но не проверялся из-за --limit: ничего не трогаем.
      continue;
    }
    stats[known] = (stats[known] || 0) + 1;

    if (known === 'dead' || known === 'parked') {
      tags.dead_website = w.url;
      tags.site_status = known;
      tags.site_checked = today;
      for (const k of WEBSITE_KEYS) delete tags[k];
      saved++;
    } else if (known === 'ok') {
      tags.site_status = 'ok';
      tags.site_checked = today;
    }
  }

  console.log(
    `[${city}] живых ${stats.ok}, мёртвых ${stats.dead}, парковок ${stats.parked}, ` +
    `не проверить ${stats.blocked}, соцсетей ${stats.social} → новых лидов ${saved}` +
    (restored ? `, восстановлено сайтов ${restored}` : '')
  );

  if (!DRY && (saved > 0 || restored > 0)) {
    base.sites_checked = new Date().toISOString().slice(0, 10);
    base.elements = elements;
    await writeFile(path, JSON.stringify(base), 'utf8');
  }
}

console.log(`Готово. Всего доменов проверено: ${totalProbed || '—'}${DRY ? ' (dry-run, файлы не изменены)' : ''}`);
