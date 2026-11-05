# Добавляет к данным OpenStreetMap места из Overture Maps (открытая база мест
# от Meta, Microsoft, Amazon, TomTom; лицензия CDLA Permissive / ODbL).
# Вход:  data/<город>.osm.json  (делает scripts/fetch-data.mjs)
# Выход: data/<город>.json      (его читает сайт)
# Дубли (похожее название в пределах 200 м) склеиваются в одну запись.

import json, math, re, subprocess, sys
import pyarrow.parquet as pq
from shapely import wkb

# Должно совпадать с CITIES в app.js и scripts/fetch-data.mjs (юг, запад, север, восток).
CITIES = {
    'novosibirsk': (54.80, 82.72, 55.20, 83.16),
    'volgograd': (48.42, 44.20, 48.90, 44.68),
}

# Категория Overture -> вид бизнеса на сайте (id из CATS в app.js).
CAT_MAP = {
    'hair_salon': 'hair', 'barber': 'hair',
    'beauty_salon': 'beauty', 'nail_salon': 'beauty', 'tanning_salon': 'beauty', 'eyelash_service': 'beauty', 'makeup_artist': 'beauty',
    'tattoo_and_piercing': 'tattoo', 'tattoo': 'tattoo',
    'spa': 'massage', 'massage': 'massage', 'massage_therapy': 'massage',
    'cafe': 'cafe', 'coffee_shop': 'cafe', 'tea_room': 'cafe', 'internet_cafe': 'cafe',
    'fast_food_restaurant': 'fast', 'burger_restaurant': 'fast', 'pizza_delivery_service': 'fast',
    'sandwich_shop': 'fast', 'food_delivery_service': 'fast', 'hot_dog_restaurant': 'fast', 'shawarma_restaurant': 'fast',
    'bakery': 'bakery', 'candy_store': 'bakery', 'cupcake_shop': 'bakery', 'dessert_shop': 'bakery', 'patisserie_cake_shop': 'bakery',
    'flowers_and_gifts_store': 'flowers', 'florist': 'flowers',
    'automotive_repair': 'car', 'automotive_service': 'car', 'auto_detailing': 'car', 'auto_body_shop': 'car', 'auto_glass_service': 'car',
    'tire_dealer_and_repair': 'tyres', 'tire_shop': 'tyres',
    'car_wash': 'wash',
    'dental_clinic': 'dent', 'general_dentistry': 'dent', 'dentist': 'dent', 'orthodontist': 'dent',
    'veterinarian': 'vet', 'animal_hospital': 'vet',
    'pet_store': 'pet', 'animal_or_pet_service': 'pet', 'pet_groomer': 'pet',
    'gym': 'fit', 'yoga_studio': 'fit', 'sport_or_fitness_facility': 'fit', 'fitness_trainer': 'fit', 'pilates_studio': 'fit',
    'it_service_and_computer_repair': 'repair', 'mobile_phone_repair': 'repair', 'electronics_repair_shop': 'repair',
    'sewing_and_alterations': 'shoe', 'shoe_repair': 'shoe',
    'dry_cleaning': 'clean', 'laundromat': 'clean', 'laundry_service': 'clean',
    'photographer': 'photo', 'event_photography_service': 'photo', 'photography_studio': 'photo',
    'dance_studio': 'dance', 'dance_school': 'dance',
    'martial_arts_club': 'sport', 'sport_league': 'sport', 'sports_club_and_league': 'sport', 'swimming_pool': 'sport',
}
NOT_RESTAURANT = {'fast_food_restaurant', 'burger_restaurant', 'hot_dog_restaurant', 'shawarma_restaurant'}
# «танц» без «с» перед ним: иначе ловятся все «станции».
DANCE_NAME = re.compile(r'(^|[^сc])танц|dance|хореограф|балет|pole|хип-?хоп|сальс|бачат|зумба|zumba', re.I)


def category(row):
    tax = row.get('taxonomy') or {}
    primary = tax.get('primary') or ''
    hierarchy = tax.get('hierarchy') or []
    name = (row.get('names') or {}).get('primary') or ''
    if primary in ('dance_studio', 'dance_school') or (DANCE_NAME.search(name) and primary not in ('dance_club', 'shoe_store', 'clothing_store', 'sporting_goods_store')):
        return 'dance'
    if primary in CAT_MAP:
        return CAT_MAP[primary]
    if primary not in NOT_RESTAURANT and (primary == 'restaurant' or primary.endswith('_restaurant') or primary in ('diner', 'steakhouse', 'pancake_house', 'gastropub')):
        return 'rest'
    for h in hierarchy:
        if h in CAT_MAP:
            return CAT_MAP[h]
    return None


SOCIAL = [
    (re.compile(r'(^|\.)vk\.(com|ru)$'), 'contact:vk'),
    (re.compile(r'(^|\.)t\.me$'), 'contact:telegram'),
    (re.compile(r'(^|\.)(wa\.me|whatsapp\.com)$'), 'contact:whatsapp'),
    (re.compile(r'(^|\.)instagram\.com$'), 'contact:instagram'),
    (re.compile(r'(^|\.)ok\.ru$'), 'contact:ok'),
]
PAGE = re.compile(r'(^|\.)(vk\.(com|ru)|t\.me|wa\.me|whatsapp\.com|instagram\.com|ok\.ru|facebook\.com|taplink\.(cc|ws|at|ru)|linktr\.ee|dikidi\.(net|ru|app)|yclients\.com|2gis\.(ru|com)|yandex\.(ru|com)|zoon\.ru|flamp\.ru|avito\.ru)$')


def host(url):
    m = re.match(r'^(?:[a-z]+://)?([^/?#]+)', url.strip(), re.I)
    return (m.group(1).lower() if m else '').removeprefix('www.').removeprefix('m.')


def to_element(row):
    name = (row.get('names') or {}).get('primary')
    cat = category(row)
    if not name or not cat:
        return None
    if (row.get('operating_status') or '') in ('permanently_closed', 'closed'):
        return None
    if (row.get('confidence') or 0) < 0.3:
        return None
    pt = wkb.loads(row['geometry'])
    tags = {'name': name, 'cat': cat, 'src': 'overture'}
    links = list(row.get('websites') or []) + list(row.get('socials') or [])
    own = [u for u in links if not PAGE.search(host(u))]
    pages = [u for u in links if PAGE.search(host(u))]
    for u in links:
        h = host(u)
        for rx, key in SOCIAL:
            if rx.search(h) and key not in tags:
                tags[key] = u
    if own:
        tags['website'] = own[0]
    elif pages:
        tags['website'] = pages[0]
    if row.get('phones'):
        tags['phone'] = ';'.join(row['phones'])
    if row.get('emails'):
        tags['email'] = row['emails'][0]
    addr = (row.get('addresses') or [{}])[0] or {}
    if addr.get('freeform'):
        tags['addr:full'] = addr['freeform']
    brand = row.get('brand') or {}
    if brand.get('wikidata') or ((brand.get('names') or {}).get('primary')):
        tags['brand'] = (brand.get('names') or {}).get('primary') or 'yes'
    return {'type': 'overture', 'id': row['id'], 'lat': round(pt.y, 6), 'lon': round(pt.x, 6), 'tags': tags}


def norm(name):
    return re.sub(r'[^0-9a-zа-яё]', '', name.lower().replace('ё', 'е'))


def dist_m(a, b):
    dy = (a['lat'] - b['lat']) * 111320
    dx = (a['lon'] - b['lon']) * 111320 * math.cos(math.radians(a['lat']))
    return math.hypot(dx, dy)


def merge(osm, extra):
    # Сетка по ~0.005° для быстрого поиска соседей.
    grid = {}
    for el in osm:
        grid.setdefault((round(el['lat'] / 0.005), round(el['lon'] / 0.005)), []).append(el)
    added = merged = 0
    for el in extra:
        n = norm(el['tags']['name'])
        gy, gx = round(el['lat'] / 0.005), round(el['lon'] / 0.005)
        twin = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for o in grid.get((gy + dy, gx + dx), []):
                    on = norm(o['tags'].get('name', ''))
                    if on and n and (on in n or n in on) and dist_m(o, el) < 200:
                        twin = o
                        break
        if twin:
            # Дополняем запись OSM тем, чего в ней нет (сайт, телефон, соцсети).
            t = twin['tags']
            for k, v in el['tags'].items():
                if k in ('name', 'cat', 'src'):
                    continue
                if k == 'website' and (t.get('website') or t.get('contact:website') or t.get('url')):
                    continue
                if k == 'phone' and (t.get('phone') or t.get('contact:phone')):
                    continue
                t.setdefault(k, v)
            merged += 1
        else:
            osm.append(el)
            grid.setdefault((gy, gx), []).append(el)
            added += 1
    return added, merged


ok = 0
for cid, (s, w, n, e) in CITIES.items():
    try:
        with open(f'data/{cid}.osm.json', encoding='utf-8') as f:
            base = json.load(f)
    except FileNotFoundError:
        print(f'[{cid}] нет data/{cid}.osm.json, пропускаю')
        continue
    elements = base['elements']
    try:
        out = f'/tmp/{cid}.parquet'
        subprocess.run(['overturemaps', 'download', f'--bbox={w},{s},{e},{n}', '-f', 'geoparquet', '--type=place', '-o', out], check=True)
        rows = pq.read_table(out).to_pylist()
        extra = [x for x in (to_element(r) for r in rows) if x]
        added, merged = merge(elements, extra)
        print(f'[{cid}] OSM {len(elements) - added}, Overture подходящих {len(extra)}: новых {added}, склеено {merged}')
    except Exception as ex:  # Overture недоступен — оставляем только OSM.
        print(f'[{cid}] Overture не загрузился: {ex}')
    base['elements'] = elements
    base['sources'] = ['OpenStreetMap', 'Overture Maps']
    with open(f'data/{cid}.json', 'w', encoding='utf-8') as f:
        json.dump(base, f, ensure_ascii=False, separators=(',', ':'))
    ok += 1

sys.exit(0 if ok else 1)
