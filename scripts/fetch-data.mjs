// Скачивает из OpenStreetMap все бизнесы Новосибирска нужных видов
// и сохраняет в data/novosibirsk.json. Запускается GitHub Actions раз в день.
// Сайт читает этот файл, поэтому кнопка «Искать» срабатывает сразу.

import { writeFile, mkdir } from 'node:fs/promises';

// Новосибирск: юг, запад, север, восток.
const BBOX = [54.80, 82.72, 55.20, 83.16];

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
];

// Оставляем только поля, которые нужны сайту, чтобы файл был маленьким.
const KEEP = new Set([
  'name', 'shop', 'amenity', 'craft', 'leisure',
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

const bbox = BBOX.join(',');
const query = `[out:json][timeout:180];(${TAGS.map(([k, v]) => `nwr["${k}"="${v}"]["name"](${bbox});`).join('')});out center tags qt;`;

async function ask(url) {
  const r = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'User-Agent': 'otves-data-updater (github.com/dima1playnsk-bot/otves)' },
    signal: AbortSignal.timeout(240000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.elements) || j.elements.length < 500) throw new Error(`мало данных: ${j.elements?.length}, ${j.remark || ''}`);
  return j.elements;
}

let elements = null;
for (let round = 0; round < 3 && !elements; round++) {
  for (const url of ENDPOINTS) {
    try {
      console.log('Спрашиваю', url);
      elements = await ask(url);
      console.log('Получено', elements.length);
      break;
    } catch (e) {
      console.log('Не вышло:', e.message);
    }
  }
  if (!elements) await new Promise((r) => setTimeout(r, 30000));
}
if (!elements) {
  console.error('Все серверы не ответили, файл не меняю.');
  process.exit(1);
}

const out = elements.map((el) => {
  const tags = {};
  for (const [k, v] of Object.entries(el.tags || {})) if (KEEP.has(k)) tags[k] = v;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  return { type: el.type, id: el.id, lat: +lat.toFixed(6), lon: +lon.toFixed(6), tags };
}).filter((e) => Number.isFinite(e.lat));

await mkdir('data', { recursive: true });
await writeFile('data/novosibirsk.json', JSON.stringify({ updated: new Date().toISOString(), bbox: BBOX, elements: out }));
console.log('Сохранено', out.length);
