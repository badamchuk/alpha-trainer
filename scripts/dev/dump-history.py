#!/usr/bin/env python3
"""Витягує дані додатка з копії бази телефона у JSON для звітів і тестів.

Копія бази робиться так (додаток має бути debug-збіркою):
    adb exec-out run-as com.alphatrainer.app cat databases/RKStorage > RKStorage

Використання:
    python3 scripts/dev/dump-history.py RKStorage out.json

У JSON потрапляють лише тренування, профіль і журнал ваги — рівно те, що потрібно
звітам. Ключі з API-ключами й чатами не експортуються.
"""
import json
import sqlite3
import sys

KEYS = {
    'workouts': '@alpha_trainer:workouts',
    'profile': '@alpha_trainer:user_profile',
    'weightLog': '@alpha_trainer:weight_log',
}


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    rows = dict(sqlite3.connect(src).execute('select key, value from catalystLocalStorage'))
    out = {}
    for name, key in KEYS.items():
        raw = rows.get(key)
        out[name] = json.loads(raw) if raw else ([] if name != 'profile' else None)
    json.dump(out, open(dst, 'w'), ensure_ascii=False)
    print(f"тренувань: {len(out['workouts'])}, записів ваги: {len(out['weightLog'])} → {dst}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
