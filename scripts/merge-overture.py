# Добавляет к данным OpenStreetMap места из Overture Maps (открытая база мест
# от Meta, Microsoft, Amazon, TomTom; лицензия CDLA Permissive / ODbL).
# Вход:  data/<город>.osm.json  (делает scripts/fetch-data.mjs)
# Выход: data/<город>.json      (его читает сайт)
# Дубли (похожее название в пределах 200 м) склеиваются в одну запись.

import collections, json, math, re, subprocess, sys
import pyarrow.parquet as pq
from shapely import wkb

# Должно совпадать с CITIES в app.js и scripts/fetch-data.mjs (юг, запад, север, восток).
CITIES = {
    'novosibirsk': (54.80, 82.72, 55.20, 83.16),
    'volgograd': (48.42, 44.20, 48.90, 44.68),
    'saratov': (51.392, 45.805, 51.686, 46.21),
    'tyumen': (57.0, 65.265, 57.283, 65.816),
    'tolyatti': (53.446, 49.147, 53.598, 49.777),
    'makhachkala': (42.859, 47.317, 43.18, 47.621),
    'barnaul': (53.186, 83.532, 53.482, 83.909),
    'izhevsk': (56.716, 53.006, 57.005, 53.392),
    'khabarovsk': (48.326, 134.897, 48.604, 135.222),
    'ulyanovsk': (54.199, 48.25, 54.417, 48.726),
    'irkutsk': (52.209, 104.058, 52.422, 104.449),
    'vladivostok': (43.057, 131.839, 43.29, 132.239),
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
# Танцы по названию — только отдельным словом: иначе ловятся «станции»
# и «ОколоТанцпола» (прокат светового оборудования).
DANCE_NAME = re.compile(r'(^|[^а-яёa-z])(танц|dance|хореограф|балет|pole|хип-?хоп|сальс|бачат|зумба|zumba)', re.I)
# Если в названии есть эти слова — это не школа танцев, даже со словом «танцы».
NOT_DANCE_NAME = re.compile(r'салон|парикмахер|барбер|beauty|nail|маникюр|ногт|бров|ресниц|прокат|аренд|оборудован|магазин|одежд|обув|shop|store', re.I)


def category(row):
    tax = row.get('taxonomy') or {}
    primary = tax.get('primary') or ''
    hierarchy = tax.get('hierarchy') or []
    name = (row.get('names') or {}).get('primary') or ''
    if primary in ('dance_studio', 'dance_school'):
        return 'dance'
    # По названию — только если категория не говорит о другом (кафе «...в танце», мост, магазин).
    other = primary in CAT_MAP or primary.endswith('_restaurant') or primary.endswith('_store') or primary in (
        'restaurant', 'dance_club', 'bridge', 'historic_site', 'monument', 'park', 'landmark_and_historical_building', 'music_venue', 'bar')
    if DANCE_NAME.search(name) and not NOT_DANCE_NAME.search(name) and not other:
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
    # Когда источник последний раз обновлял запись: старые данные (часто из Facebook)
    # бывают с неверным адресом или чужим телефоном. Сайт показывает год в карточке.
    srcs = row.get('sources') or []
    times = [str(s.get('update_time'))[:7] for s in srcs if s and s.get('update_time')]
    if times:
        tags['upd'] = max(times)
    datasets = sorted({str(s.get('dataset')) for s in srcs if s and s.get('dataset')})
    if datasets:
        tags['ds'] = ','.join(datasets)
    tags['conf'] = round(row.get('confidence') or 0, 2)
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
            t['agree'] = 1  # бизнес есть в двух базах — это признак, что он настоящий
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


# ---------- Foursquare Open Source Places (Apache 2.0) ----------
# Публичное зеркало на Source Cooperative, выпуск 2025-02-06. У каждого места есть дата
# последней проверки и дата закрытия. Сверка с 2ГИС (ноябрь 2026, Волгоград) показала:
# OSM ~67% верных телефонов, Foursquare (проверено с 2024) ~50%, Overture из Facebook ~37%.
FSQ_SRC = 's3://us-west-2.opendata.source.coop/fused/fsq-os-places/2025-02-06/places/*.parquet'
FSQ_CAT = [  # порядок важен: сначала узкие категории
    (r'Dance Studio', 'dance'), (r'Barbershop|Hair Salon', 'hair'), (r'Tattoo', 'tattoo'),
    (r'Massage|\bSpa\b', 'massage'), (r'Nail Salon|Beauty Salon|Eyebrow|Waxing|Tanning|Health and Beauty', 'beauty'),
    (r'Car Wash', 'wash'), (r'Tire', 'tyres'), (r'Automotive Repair|Automotive Service|Auto Workshop', 'car'),
    (r'Dentist|Dental', 'dent'), (r'Veterinar', 'vet'), (r'\bPet ', 'pet'), (r'Yoga|Pilates|\bGym\b|Fitness', 'fit'),
    (r'Martial Arts|Boxing|Sports Club|Swimming Pool', 'sport'), (r'Electronics Repair|Phone Repair|Computer Repair', 'repair'),
    (r'Shoe Repair|Tailor', 'shoe'), (r'Laundry|Dry Clean', 'clean'), (r'Photograph', 'photo'), (r'Florist|Flower', 'flowers'),
    (r'Bakery|Dessert|Pastry|Candy|Confection', 'bakery'),
    (r'Fast Food|Burger|Pizzeria|Hot Dog|Shawarma|Food Truck|Sandwich', 'fast'), (r'Café|Coffee|Tea Room', 'cafe'),
    (r'Restaurant|Steakhouse|Diner|Bistro', 'rest'),
]


def phone10(p):
    d = re.sub(r'\D', '', str(p or ''))
    return d[-10:] if len(d) >= 10 else ''


def similar_n(a, b):
    # a, b — уже нормализованные названия
    return bool(a and b and (a in b or b in a or a[:6] == b[:6]))


def fsq_enrich(cid, bbox, elements):
    import duckdb
    s, w, n, e = bbox
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET s3_url_style='path';")
    rows = con.execute(f"""
        SELECT fsq_place_id, name, latitude, longitude, address, tel, website, instagram,
               date_refreshed, date_closed, fsq_category_labels
        FROM read_parquet('{FSQ_SRC}', union_by_name=true)
        WHERE latitude BETWEEN {s} AND {n} AND longitude BETWEEN {w} AND {e} AND name IS NOT NULL
    """).fetchall()
    by_phone, grid = {}, {}
    for el in elements:
        t = el['tags']
        nn = norm(t.get('name') or '')
        for p in re.split(r'[;,]', (t.get('phone') or '') + ';' + (t.get('contact:phone') or '')):
            if phone10(p):
                by_phone.setdefault(phone10(p), []).append((el, nn))
        grid.setdefault((round(el['lat'] / 0.005), round(el['lon'] / 0.005)), []).append((el, nn))
    name_count = collections.Counter(norm(r[1]) for r in rows)
    stats = collections.Counter()
    for fid, name, lat, lon, addr, tel, site, insta, refreshed, closed_at, cats in rows:
        refreshed = str(refreshed or '')[:7]
        closed_at = str(closed_at or '')[:7]
        here = {'lat': lat, 'lon': lon}
        fn = norm(name)
        twins = [o for o, on in by_phone.get(phone10(tel), []) if similar_n(on, fn)] if phone10(tel) else []
        seen_ids = {id(o) for o in twins}
        gy, gx = round(lat / 0.005), round(lon / 0.005)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for o, on in grid.get((gy + dy, gx + dx), []):
                    if id(o) not in seen_ids and similar_n(on, fn) and dist_m(o, here) < 150:
                        twins.append(o)
                        seen_ids.add(id(o))
        if twins:
            for o in twins:
                t = o['tags']
                if closed_at:
                    t['fsq_closed'] = closed_at
                    stats['закрыто'] += 1
                elif refreshed >= '2023':
                    t['seen'] = max(t.get('seen', ''), refreshed)
                    stats['подтверждено'] += 1
            continue
        # Номер совпал, а название другое, и запись свежая: номер, видимо, у другого бизнеса.
        if phone10(tel) and not closed_at and refreshed >= '2023':
            for o, _on in by_phone.get(phone10(tel), []):
                o['tags'].setdefault('phone_owner', f'{name} ({refreshed[:4]})')
                stats['номер у другого'] += 1
        # Новое место: только свежее, открытое и нашего вида.
        if closed_at or refreshed < '2024':
            continue
        label = ' | '.join(c or '' for c in (cats or []))
        cat = next((c for rx, c in FSQ_CAT if re.search(rx, label)), None)
        if not cat:
            continue
        tags = {'name': name, 'cat': cat, 'src': 'foursquare', 'seen': refreshed}
        if tel:
            tags['phone'] = tel
        if site:
            tags['website'] = site
        if insta:
            tags['contact:instagram'] = 'https://instagram.com/' + str(insta).lstrip('@')
        if addr:
            tags['addr:full'] = addr
        if name_count[norm(name)] >= 3:
            tags['brand'] = name  # одно название в 3+ местах города — сеть
        el = {'type': 'foursquare', 'id': fid, 'lat': round(lat, 6), 'lon': round(lon, 6), 'tags': tags}
        elements.append(el)
        stats['новых'] += 1
    print(f'[{cid}] Foursquare: мест {len(rows)}, ' + ', '.join(f'{k} {v}' for k, v in stats.items()))


ok = 0
for cid, (s, w, n, e) in CITIES.items():
    try:
        with open(f'data/{cid}.osm.json', encoding='utf-8') as f:
            base = json.load(f)
    except FileNotFoundError:
        print(f'[{cid}] нет data/{cid}.osm.json, беру только Overture')
        base = {'updated': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'bbox': [s, w, n, e], 'elements': []}
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
    try:
        fsq_enrich(cid, (s, w, n, e), elements)
    except Exception as ex:
        print(f'[{cid}] Foursquare не загрузился: {ex}')
    base['elements'] = elements
    base['sources'] = ['OpenStreetMap', 'Overture Maps', 'Foursquare Open Source Places']
    with open(f'data/{cid}.json', 'w', encoding='utf-8') as f:
        json.dump(base, f, ensure_ascii=False, separators=(',', ':'))
    ok += 1

sys.exit(0 if ok else 1)
