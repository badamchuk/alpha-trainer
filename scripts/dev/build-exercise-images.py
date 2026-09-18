#!/usr/bin/env python3
"""Збирає ілюстрації вправ із Workout Guide у WebP для додатку (ТЗ F6).

Джерело: https://github.com/bryllim/workout-guide — графіка під CC BY-SA 4.0,
похідна від Everkinetic. Ліцензія вимагає вказати автора, ліцензію, джерело й
перелік змін, а похідні поширювати теж під CC BY-SA 4.0 — усе це пишеться в
assets/exercises/ATTRIBUTION.md, і на нього спирається екран «Джерела ілюстрацій».

Що робить:
  1. збирає слаги з services/library/data/*.ts (поле imageSlug);
  2. качає PNG-кадри 512×512 з raw.githubusercontent;
  3. переганяє у WebP 256 px (cwebp -q 80, з прозорістю);
  4. пише ATTRIBUTION.md і services/exerciseImages.ts (мапа require).

Запуск:  python3 scripts/dev/build-exercise-images.py [--frames 3] [--size 256]
Мережа потрібна лише тут; сам додаток картинки не качає.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / 'services' / 'library' / 'data'
OUT_DIR = ROOT / 'assets' / 'exercises'
MAP_FILE = ROOT / 'services' / 'exerciseImages.ts'

REPO = 'bryllim/workout-guide'
RAW = f'https://raw.githubusercontent.com/{REPO}/main/packages/workout-guide'
MANIFEST_URL = f'{RAW}/manifest.json'


def used_slugs() -> list[str]:
    slugs: set[str] = set()
    for path in sorted(DATA_DIR.glob('*.ts')):
        slugs |= set(re.findall(r"imageSlug: '([a-z0-9\-]+)'", path.read_text(encoding='utf8')))
    return sorted(slugs)


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def build_frame(slug: str, frame: int, size: int) -> tuple[str, int] | None:
    """Качає один кадр і кладе його як <slug>-<frame>.webp. Повертає (файл, байти)."""
    out = OUT_DIR / f'{slug}-{frame}.webp'
    tmp = OUT_DIR / f'.{slug}-{frame}.png'
    try:
        tmp.write_bytes(fetch(f'{RAW}/assets/{slug}/frame-{frame}.png'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None          # у частини вправ лише один-два кадри
        raise
    # -resize 0 N зберігає пропорції; -alpha_q 100 лишає чисту прозорість на темному тлі
    subprocess.run(
        ['cwebp', '-quiet', '-q', '80', '-alpha_q', '100', '-resize', '0', str(size),
         str(tmp), '-o', str(out)],
        check=True,
    )
    tmp.unlink()
    return out.name, out.stat().st_size


def write_attribution(slugs: list[str], manifest: list[dict], frames_built: dict[str, int]) -> None:
    by_slug = {m['slug']: m for m in manifest}
    lines = [
        '# Джерела ілюстрацій',
        '',
        'Ілюстрації вправ у цій теці — похідні від **Workout Guide**',
        f'(https://github.com/{REPO}), автор **Bryl Lim** (https://bryllim.com),',
        'ліцензія **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/).',
        '',
        'Основа графіки — **Everkinetic** (https://github.com/everkinetic/data),',
        'теж CC BY-SA 4.0.',
        '',
        '## Що ми змінили',
        '',
        '- PNG 512×512 перетворено у WebP 256 px (cwebp -q 80) для розміру застосунку;',
        '- залишено лише кадри вправ, які є в бібліотеці AlphaTrainer;',
        '- файли перейменовано за схемою `<слаг>-<номер кадру>.webp`.',
        '',
        '## ShareAlike',
        '',
        'Ці похідні поширюються на тих самих умовах — **CC BY-SA 4.0**.',
        '',
        '## Перелік',
        '',
        '| Вправа (джерело) | Слаг | Кадрів | Автор | Ліцензія |',
        '|---|---|---|---|---|',
    ]
    for slug in slugs:
        m = by_slug.get(slug, {})
        frame = (m.get('frames') or [{}])[0]
        attr = frame.get('attribution', {})
        lines.append(
            f"| {m.get('name', slug)} | `{slug}` | {frames_built.get(slug, 0)} "
            f"| {attr.get('creator', 'Bryl Lim')} | {attr.get('license', 'CC BY-SA 4.0')} |"
        )
    lines.append('')
    (OUT_DIR / 'ATTRIBUTION.md').write_text('\n'.join(lines), encoding='utf8')


def write_map(frames_built: dict[str, int]) -> None:
    """Мапа require — єдине місце, де ассети згадуються (F6.6: лише UI її імпортує)."""
    rows = []
    for slug in sorted(frames_built):
        frames = ', '.join(
            f"require('../assets/exercises/{slug}-{i}.webp')"
            for i in range(1, frames_built[slug] + 1)
        )
        rows.append(f"  '{slug}': [{frames}],")
    MAP_FILE.write_text(
        '// ЗГЕНЕРОВАНО scripts/dev/build-exercise-images.py — не редагувати руками.\n'
        '//\n'
        '// Metro вимагає статичних require(), тож мапа саме така. Імпортувати її\n'
        '// можна ЛИШЕ з UI-компонентів: сервіси й тести не мають тягнути ассети (ТЗ F6.6).\n'
        '//\n'
        '// Графіка: Workout Guide (Bryl Lim), CC BY-SA 4.0, похідна від Everkinetic.\n'
        '// Повні дані — assets/exercises/ATTRIBUTION.md.\n'
        '\n'
        'export const EXERCISE_IMAGES: Record<string, number[]> = {\n'
        + '\n'.join(rows)
        + '\n};\n'
        '\n'
        '/** Кадри вправи за слагом; порожньо — показуємо запасний варіант (F6.5). */\n'
        'export function framesFor(slug?: string): number[] {\n'
        '  return slug ? EXERCISE_IMAGES[slug] ?? [] : [];\n'
        '}\n',
        encoding='utf8',
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=3)
    ap.add_argument('--size', type=int, default=256)
    args = ap.parse_args()

    if subprocess.run(['which', 'cwebp'], capture_output=True).returncode != 0:
        print('потрібен cwebp: brew install webp', file=sys.stderr)
        return 1

    slugs = used_slugs()
    if not slugs:
        print('у бібліотеці немає imageSlug', file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(fetch(MANIFEST_URL))
    known = {m['slug'] for m in manifest}
    unknown = [s for s in slugs if s not in known]
    if unknown:
        print(f'НЕМАЄ В ДЖЕРЕЛІ ({len(unknown)}): {", ".join(unknown)}', file=sys.stderr)

    jobs = [(s, f) for s in slugs for f in range(1, args.frames + 1)]
    built: dict[str, int] = {}
    total_bytes = 0

    def run(job):
        slug, frame = job
        try:
            return slug, frame, build_frame(slug, frame, args.size)
        except Exception as e:                       # noqa: BLE001 — хочемо звіт, а не стек
            return slug, frame, e

    with ThreadPoolExecutor(max_workers=8) as pool:
        for slug, frame, res in pool.map(run, jobs):
            if isinstance(res, Exception):
                print(f'  ✗ {slug} кадр {frame}: {res}', file=sys.stderr)
            elif res is not None:
                built[slug] = max(built.get(slug, 0), frame)
                total_bytes += res[1]

    # кадри мають іти підряд: якщо середній не завантажився, обрізаємо до першого пропуску
    for slug in list(built):
        n = 0
        while (OUT_DIR / f'{slug}-{n + 1}.webp').exists():
            n += 1
        if n == 0:
            del built[slug]
        else:
            built[slug] = n

    write_attribution(slugs, manifest, built)
    write_map(built)

    frames_total = sum(built.values())
    print(f'вправ з картинками: {len(built)} з {len(slugs)}')
    print(f'кадрів: {frames_total}, разом {total_bytes / 1024 / 1024:.2f} МБ '
          f'({total_bytes / max(1, frames_total) / 1024:.1f} КБ/кадр)')
    print(f'мапа: {MAP_FILE.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
