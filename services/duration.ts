// Тривалість вправи: людина думає секундами й хвилинами, сховище — хвилинами.
//
// Планка на 45 секунд, інтервал 1:30, біг 25 хвилин — усе це одне поле. Тому
// поле приймає будь-який із записів, а в сховищі лишаються хвилини (з дробом),
// як і було: історія, калорії й темп рахуються від них і нічого не ламається.

import type { TFn } from './i18n';

/**
 * Рядок із поля → хвилини.
 *
 *   «45с», «45 s», «45 сек»  → 0.75
 *   «1:30»                   → 1.5
 *   «2м», «2 хв», «2 min»    → 2
 *   «0.75», «25»             → як є, хвилини
 *
 * Порожнє чи незрозуміле → undefined (поле не заповнене).
 */
export function parseDuration(raw: string): number | undefined {
  const v = raw.trim().toLowerCase().replace(',', '.');
  if (!v) return undefined;

  const colon = v.match(/^(\d+):(\d{1,2})$/);
  if (colon) {
    const sec = Number(colon[2]);
    if (sec >= 60) return undefined;
    return round(Number(colon[1]) + sec / 60);
  }

  const withUnit = v.match(/^(\d+(?:\.\d+)?)\s*([a-zа-яії]+)\.?$/);
  if (withUnit) {
    const n = Number(withUnit[1]);
    const unit = withUnit[2];
    if (/^(s|sec|secs|с|сек)$/.test(unit)) return round(n / 60);
    if (/^(m|min|mins|м|хв|хвил)$/.test(unit)) return round(n);
    return undefined;
  }

  const n = Number(v);
  return isNaN(n) || n < 0 ? undefined : round(n);
}

/** Хвилини → що показати в полі при редагуванні: «45с», «1:30», «25». */
export function durationToInput(min: number | undefined, t: TFn): string {
  if (min === undefined || min === null) return '';
  const totalSec = Math.round(min * 60);
  if (totalSec < 60) return t('secCompact', totalSec);
  if (totalSec % 60 === 0) return String(totalSec / 60);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

/** Хвилини → підпис у списку: «45 с», «1:30», «25 хв». */
export function formatDuration(min: number, t: TFn): string {
  const totalSec = Math.round(min * 60);
  if (totalSec < 60) return t('secondsShort', totalSec);
  if (totalSec % 60 === 0) return t('minValue', totalSec / 60);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

// до секунди: 0.7499999 хв у сховищі — це теж 45 с
function round(min: number): number {
  return Math.round(min * 60) / 60;
}
