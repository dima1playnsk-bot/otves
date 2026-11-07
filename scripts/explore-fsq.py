# Разведка: что есть в Foursquare Open Source Places (Apache 2.0) по нашим городам.
# Публичное зеркало: Source Cooperative (fused/fsq-os-places), выпуск 2025-02-06.
# Печатает: число мест, свежесть (date_refreshed), закрытые (date_closed),
# частые категории, танцы, и сколько телефонов совпадает с нашими data/<город>.json.
import collections, json, re
import duckdb

SRC = 's3://us-west-2.opendata.source.coop/fused/fsq-os-places/2025-02-06/places/*.parquet'
CITIES = {
    'volgograd': (48.42, 44.20, 48.90, 44.68),
    'novosibirsk': (54.80, 82.72, 55.20, 83.16),
}

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET s3_url_style='path';")
cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{SRC}', union_by_name=true) LIMIT 1").fetchall()]
print('колонки:', cols)


def norm_phone(p):
    d = re.sub(r'\D', '', str(p or ''))
    return d[-10:] if len(d) >= 10 else ''


for cid, (s, w, n, e) in CITIES.items():
    rows = con.execute(f"""
        SELECT name, latitude, longitude, address, tel, website, email, instagram, facebook_id,
               date_created, date_refreshed, date_closed, fsq_category_labels
        FROM read_parquet('{SRC}', union_by_name=true)
        WHERE latitude BETWEEN {s} AND {n} AND longitude BETWEEN {w} AND {e}
    """).fetchall()
    keys = ['name', 'lat', 'lon', 'address', 'tel', 'website', 'email', 'instagram', 'facebook_id',
            'created', 'refreshed', 'closed', 'cats']
    rows = [dict(zip(keys, r)) for r in rows]
    print(f'\n===== {cid}: мест {len(rows)}')
    closed = [r for r in rows if r['closed']]
    print('с датой закрытия:', len(closed))
    years = collections.Counter(str(r['refreshed'])[:4] for r in rows if not r['closed'])
    print('год последней проверки (открытые):', sorted(years.items()))
    print('с телефоном:', sum(1 for r in rows if r['tel']), 'с сайтом:', sum(1 for r in rows if r['website']),
          'с instagram:', sum(1 for r in rows if r['instagram']))
    cats = collections.Counter(c for r in rows if r['cats'] for c in r['cats'])
    print('категории:', cats.most_common(60))
    dance = [r for r in rows if any('Dance' in (c or '') for c in (r['cats'] or []))
             or re.search(r'(^|[^а-яёa-z])(танц|dance)', r['name'] or '', re.I)]
    print(f'танцы: {len(dance)}, из них не закрыты: {sum(1 for r in dance if not r["closed"])}')
    for r in sorted(dance, key=lambda x: str(x['refreshed']), reverse=True)[:40]:
        print('  ', r['name'], '|', r['tel'], '|', r['address'], '| проверено', r['refreshed'], '| закрыто', r['closed'], '|', r['cats'])

    # Совпадение телефонов с нашими данными (OSM + Overture).
    try:
        ours = json.load(open(f'data/{cid}.json', encoding='utf-8'))['elements']
        our_phones = set()
        for el in ours:
            for p in re.split(r'[;,]', el['tags'].get('phone', '') + ';' + el['tags'].get('contact:phone', '')):
                if norm_phone(p):
                    our_phones.add(norm_phone(p))
        fsq_open = [r for r in rows if not r['closed'] and norm_phone(r['tel'])]
        fresh = [r for r in fsq_open if str(r['refreshed']) >= '2024']
        both = [r for r in fsq_open if norm_phone(r['tel']) in our_phones]
        print(f'телефонов у нас: {len(our_phones)}; у FSQ (открытые): {len(fsq_open)}, из них проверены с 2024: {len(fresh)}; совпало с нашими: {len(both)}')
    except Exception as ex:
        print('сравнение не вышло:', ex)
