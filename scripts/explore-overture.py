# Разведка: что есть в Overture Maps (открытая база мест) по нашим городам.
# Печатает число мест, самые частые категории и всё, что похоже на танцы.
import collections, json, subprocess
import pyarrow.parquet as pq

CITIES = {
    'novosibirsk': (54.80, 82.72, 55.20, 83.16),
    'volgograd': (48.42, 44.20, 48.90, 44.68),
}

for cid, (s, w, n, e) in CITIES.items():
    out = f'/tmp/{cid}.parquet'
    subprocess.run(['overturemaps', 'download', f'--bbox={w},{s},{e},{n}', '-f', 'geoparquet', '--type=place', '-o', out], check=True)
    rows = pq.read_table(out).to_pylist()
    print(f'===== {cid}: мест {len(rows)}')
    print('колонки:', list(rows[0].keys()))
    print('пример:', json.dumps({k: v for k, v in rows[0].items() if k not in ('geometry', 'bbox', 'sources')}, ensure_ascii=False, default=str)[:1500])
    cats = collections.Counter((r.get('taxonomy') or {}).get('primary') for r in rows)
    print('КАТ:', cats.most_common(300))
    print('БАЗ:', collections.Counter(r.get('basic_category') for r in rows).most_common(80))
    if 'operating_status' in rows[0]:
        print('статусы:', collections.Counter(r.get('operating_status') for r in rows))
    dance = [r for r in rows if 'danc' in json.dumps(r.get('taxonomy') or {}) or 'танц' in ((r.get('names') or {}).get('primary') or '').lower()]
    print(f'танцы: {len(dance)}')
    for r in dance[:60]:
        print('  ', (r.get('names') or {}).get('primary'), '|', (r.get('taxonomy') or {}).get('hierarchy'), '|', r.get('websites'), '|', r.get('phones'), '|', r.get('confidence'), '|', r.get('operating_status'))
    web = sum(1 for r in rows if r.get('websites'))
    print(f'с сайтом: {web}, с телефоном: {sum(1 for r in rows if r.get("phones"))}, с соцсетями: {sum(1 for r in rows if r.get("socials"))}')
