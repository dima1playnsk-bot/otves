# Разведка: случайные «свежие» места Foursquare (проверены с 2024) по Волгограду
# для сверки с 2ГИС, и сколько таких мест в наших видах бизнеса по каждому городу.
import random, re
import duckdb

SRC = 's3://us-west-2.opendata.source.coop/fused/fsq-os-places/2025-02-06/places/*.parquet'
CITIES = {
    'volgograd': (48.42, 44.20, 48.90, 44.68),
    'novosibirsk': (54.80, 82.72, 55.20, 83.16),
}
OURS = re.compile(r'Hair|Beauty|Nail|Barber|Tattoo|Massage|Spa|Café|Cafe|Coffee|Restaurant|Fast Food|Bakery|Florist|Flower|Auto|Car Wash|Tire|Dentist|Dental|Veterinar|Pet|Gym|Fitness|Yoga|Dance|Repair|Tailor|Laundry|Dry Clean|Photograph|Sports Club|Martial', re.I)

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET s3_url_style='path';")
for cid, (s, w, n, e) in CITIES.items():
    rows = con.execute(f"""
        SELECT name, tel, address, date_refreshed, fsq_category_labels
        FROM read_parquet('{SRC}', union_by_name=true)
        WHERE latitude BETWEEN {s} AND {n} AND longitude BETWEEN {w} AND {e}
          AND date_closed IS NULL AND date_refreshed >= '2024-01-01'
    """).fetchall()
    ours = [r for r in rows if r[4] and any(OURS.search(c or '') for c in r[4])]
    print(f'===== {cid}: свежих {len(rows)}, в наших видах {len(ours)}, из них с телефоном {sum(1 for r in ours if r[1])}')
    if cid == 'volgograd':
        random.seed(3)
        for r in random.sample([r for r in ours if r[1]], min(12, len([r for r in ours if r[1]]))):
            print('FSQ|' + re.sub(r'\D', '', r[1])[-10:] + '|' + r[0] + '|' + str(r[3]) + '|' + (r[4][0] if r[4] else ''))
