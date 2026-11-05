// Скачивает из OpenStreetMap все бизнесы нужных видов по каждому городу
// и сохраняет в data/<город>.osm.json (потом merge-overture.py добавляет Overture → data/<город>.json). Запускается GitHub Actions раз в день.
// Сайт читает эти файлы, поэтому кнопка «Искать» срабатывает сразу.

import { writeFile, mkdir } from 'node:fs/promises';

// Города: юг, запад, север, восток. Должно совпадать с CITIES в app.js.
const CITIES = {
  novosibirsk: [54.80, 82.72, 55.20, 83.16],
  volgograd: [48.42, 44.20, 48.90, 44.68],
};

// Должно совпадать с CATS в app.js.
const TAGS = [
  ['shop', 'hairdresser'], ['shop', 'beauty'], ['shop', 'tattoo'], ['shop', 'massage'],
  ['amenity', 'cafe'], ['amenity', 'restaurant'], ['amenity', 'fast_food'],
  ['shop', 'bakery'], ['shop', 'confectionery'], ['shop', 'florist'],
  ['shop', 'car_repair'], ['shop', 'tyres'], ['amenity', 'car_wash'],
  ['amenity', 'dentist'], ['amenity', 'veterinary'], ['shop', 'pet'], ['shop', 'pet_grooming'],
  ['leisure', 'fitness_centre'], ['craft', 'electronics_repair'], ['shop', 'mobile_phone'],
  ['craft', 'shoemaker'], ['shop', 'shoe_repair'], ['craft', 'tailor'], ['shop', 'tailor'],
  ['shop', 'dry_cleaning'], ['shop', 'laundry'], ['craft', 'photographer'], ['shop', 'photo'],
  ['amenity', 'dancing_school'], ['leisure', 'dance'], ['sport', 'dance'],
  ['leisure', 'sports_centre'], ['leisure', 'sports_hall'], ['club', 'sport'],
];

// Оставляем только поля, которые нужны сайту, чтобы файл был маленьким.
const KEEP = new Set([
  'name', 'shop', 'amenity', 'craft', 'leisure', 'sport', 'club',
  'website', 'contact:website', 'url', 'contact:url',
  'phone', 'contact:phone', 'contact:mobile', 'mobile', 'email', 'contact:email',
  'contact:vk', 'vk', 'contact:telegram', 'telegram', 'contact:whatsapp', 'whatsapp',
  'contact:instagram', 'instagram', 'contact:ok',
  'addr:street', 'addr:housenumber', 'addr:place', 'addr:full', 'addr:city',
  'opening_hours', 'brand', 'brand:wikidata',
]);

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function ask(url, query) {
  const r = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'User-Agent': 'otves-data-updater (github.com/dima1playnsk-bot/otves)' },
    signal: AbortSignal.timeout(240000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.elements) || j.elements.length < 300) throw new Error(`мало данных: ${j.elements?.length}, ${j.remark || ''}`);
  return j.elements;
}

async function fetchCity(id, bboxArr) {
  const bbox = bboxArr.join(',');
  const query = `[out:json][timeout:180];(${TAGS.map(([k, v]) => `nwr["${k}"="${v}"]["name"](${bbox});`).join('')});out center tags qt;`;
  for (let round = 0; round < 3; round++) {
    for (const url of ENDPOINTS) {
      try {
        console.log(`[${id}] Спрашиваю`, url);
        const elements = await ask(url, query);
        console.log(`[${id}] Получено`, elements.length);
        return elements;
      } catch (e) {
        console.log(`[${id}] Не вышло:`, e.message);
      }
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
  return null;
}

await mkdir('data', { recursive: true });
let ok = 0;
for (const [id, bboxArr] of Object.entries(CITIES)) {
  const elements = await fetchCity(id, bboxArr);
  if (!elements) { console.error(`[${id}] Все серверы не ответили, файл не меняю.`); continue; }
  const out = elements.map((el) => {
    const tags = {};
    for (const [k, v] of Object.entries(el.tags || {})) if (KEEP.has(k)) tags[k] = v;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    return { type: el.type, id: el.id, lat: +lat.toFixed(6), lon: +lon.toFixed(6), tags };
  }).filter((e) => Number.isFinite(e.lat));
  await writeFile(`data/${id}.osm.json`, JSON.stringify({ updated: new Date().toISOString(), bbox: bboxArr, elements: out }));
  console.log(`[${id}] Сохранено`, out.length);
  ok++;
}
if (!ok) process.exit(1);
