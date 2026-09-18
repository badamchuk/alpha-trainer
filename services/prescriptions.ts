// Приписи: скільки підходів, повторів і відпочинку давати вправі (ТЗ F5.4).
//
// Живе окремо від конструктора, бо потрібне й заміні: коли зміщується намір
// вправи (важка станова → махи гирею), схему треба перерахувати, а не тягнути
// 5×3 на вибуховий рух.
//
// Числа — звичайна практика силової підготовки: сила 3–5 повторів з довгим
// відпочинком, маса 6–12, витривалість 12–20; кор і мобільність рахуються часом.

import { Intent, LibraryExercise, Metric } from './library/types';

export type Focus = 'strength' | 'hypertrophy' | 'endurance';

export interface Prescription {
  sets: number;
  /** Повтори; для вправ на час — undefined. */
  reps?: number;
  repsLabel?: string;     // «3–5», «12–15» — що показати користувачу
  seconds?: number;       // для планок, утримань, кардіо-інтервалів
  restSec: number;
  /** Цільове зусилля, коли ваги з історії ще немає. */
  rpe?: number;
  /** Чому саме так — для підпису під схемою. */
  note?: string;
}

const FOCUS_MAIN: Record<Focus, Prescription> = {
  strength:  { sets: 5, reps: 4, repsLabel: '3–5',   restSec: 150, rpe: 8 },
  hypertrophy: { sets: 4, reps: 7, repsLabel: '6–8', restSec: 120, rpe: 7 },
  endurance: { sets: 3, reps: 13, repsLabel: '12–15', restSec: 60, rpe: 7 },
};

/** Допоміжна вправа — однаково за будь-якого фокусу: середній діапазон, менший відпочинок. */
const ACCESSORY: Prescription = { sets: 3, reps: 10, repsLabel: '8–12', restSec: 75, rpe: 7 };

const CORE: Prescription = { sets: 3, reps: 15, repsLabel: '12–20', restSec: 45 };
const CORE_TIMED: Prescription = { sets: 3, seconds: 40, restSec: 45 };
const MOBILITY: Prescription = { sets: 1, seconds: 40, restSec: 0 };
const POWER: Prescription = { sets: 5, reps: 3, repsLabel: '3', restSec: 90, rpe: 7,
  note: 'вибухові рухи роблять свіжими — мало повторів, повний відпочинок' };
const CONDITIONING: Prescription = { sets: 3, reps: 12, repsLabel: '10–15', restSec: 60 };

function isTimed(ex: LibraryExercise): boolean {
  const first: Metric | undefined = ex.metrics[0];
  return first === 'time' || first === 'distance' || first === 'calories';
}

/**
 * Схема для вправи в ролі основної або допоміжної.
 *
 * `role: 'main'` — великий рух на початку (присід, жим, тяга): схема від фокусу.
 * `role: 'accessory'` — усе інше: середній діапазон.
 * Намір вправи має пріоритет над фокусом там, де інакше вийде дурня: планці не
 * можна дати 5×3, а стрибкам — 3×15.
 */
export function prescribe(
  ex: LibraryExercise,
  focus: Focus = 'hypertrophy',
  role: 'main' | 'accessory' = 'accessory'
): Prescription {
  const base = ((): Prescription => {
    switch (ex.intent) {
      case 'mobility':
        return ex.defaultReps
          ? { sets: 1, reps: ex.defaultReps, restSec: 0 }
          : { ...MOBILITY, seconds: ex.defaultSeconds ?? MOBILITY.seconds };
      case 'isometric':
        return { ...CORE_TIMED, seconds: ex.defaultSeconds ?? CORE_TIMED.seconds };
      case 'power':
        return POWER;
      case 'conditioning':
        if (isTimed(ex)) return { sets: 3, seconds: ex.defaultSeconds ?? 120, restSec: 60 };
        // власні повтори вправи перебивають діапазон за замовчуванням — тоді й
        // підпис має бути її власний, інакше «3×20» підписано як «10–15»
        return ex.defaultReps
          ? { ...CONDITIONING, reps: ex.defaultReps, repsLabel: undefined }
          : CONDITIONING;
      case 'max_strength':
      case 'hypertrophy':
      default:
        if (ex.displayGroup === 'core' || ex.pattern.startsWith('core_')) {
          if (isTimed(ex)) return { ...CORE_TIMED, seconds: ex.defaultSeconds ?? CORE_TIMED.seconds };
          return ex.defaultReps
            ? { ...CORE, reps: ex.defaultReps, repsLabel: undefined }
            : CORE;
        }
        return role === 'main' ? FOCUS_MAIN[focus] : ACCESSORY;
    }
  })();

  // Вправу на час не можна описати повторами, навіть якщо схема прийшла з фокусу
  if (isTimed(ex) && base.reps !== undefined && ex.defaultSeconds) {
    return { ...base, reps: undefined, repsLabel: undefined, seconds: ex.defaultSeconds };
  }
  return base;
}

/** Коротко для UI: «5×3–5, відпочинок 2:30» або «3×40 с». */
export function formatPrescription(p: Prescription): string {
  const amount = p.repsLabel ?? (p.reps !== undefined ? String(p.reps) : `${p.seconds} с`);
  const rest = p.restSec >= 60
    ? `${Math.floor(p.restSec / 60)}:${String(p.restSec % 60).padStart(2, '0')}`
    : `${p.restSec} с`;
  const main = p.sets > 1 ? `${p.sets}×${amount}` : amount;
  return p.restSec > 0 ? `${main}, відпочинок ${rest}` : main;
}

/**
 * Чи треба міняти схему при заміні вправи (F4.5).
 * Однаковий намір — лишаємо як було: користувач міг свідомо поставити свої цифри.
 */
export function needsNewScheme(from: LibraryExercise, to: LibraryExercise): boolean {
  return from.intent !== to.intent;
}

// ─── Конверсія кардіо (ТЗ F4.8) ──────────────────────────────────────────────

/**
 * Якір — 2 хвилини роботи в помірно-важкому темпі. Цифри взяті з кросфіт-практики
 * (біг 400 м ≈ гребний 500 м ≈ BikeErg 1000 м ≈ 200 стрибків) і нормовані на
 * чоловіка ~80 кг: це орієнтир для заміни снаряда, а не фізіологічна модель.
 */
export const CARDIO_ANCHOR: Record<string, { distanceM?: number; calories?: number; reps?: number }> = {
  run:        { distanceM: 400 },
  treadmill:  { distanceM: 400 },
  row:        { distanceM: 500, calories: 25 },
  ski:        { distanceM: 500, calories: 25 },
  bike_erg:   { distanceM: 1000, calories: 25 },
  air_bike:   { calories: 22 },
  rope:       { reps: 200 },
  walk:       { distanceM: 200 },
  stairs:     { distanceM: 150 },
  elliptical: { distanceM: 500 },
  swim:       { distanceM: 100 },
};

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

export interface CardioConversion {
  /** Що вписати в поле «дистанція» (км) або «калорії»/«повтори». */
  distanceKm?: number;
  calories?: number;
  reps?: number;
  label: string;
}

/**
 * Перерахунок роботи ОДНОГО підходу з однієї модальності в іншу.
 * Кількість підходів не змінюється — правило F4.8.
 */
export function convertCardio(
  from: LibraryExercise,
  to: LibraryExercise,
  set: { distanceKm?: number; calories?: number; reps?: number; minutes?: number }
): CardioConversion | null {
  const a = from.cardio && CARDIO_ANCHOR[from.cardio.modality];
  const b = to.cardio && CARDIO_ANCHOR[to.cardio.modality];
  if (!a || !b) return null;

  // скільки «двохвилинних блоків» роботи записано
  let blocks: number | null = null;
  if (set.distanceKm && a.distanceM) blocks = (set.distanceKm * 1000) / a.distanceM;
  else if (set.calories && a.calories) blocks = set.calories / a.calories;
  else if (set.reps && a.reps) blocks = set.reps / a.reps;
  else if (set.minutes) blocks = set.minutes / 2;
  if (!blocks || blocks <= 0) return null;

  if (b.distanceM) {
    const meters = roundTo(blocks * b.distanceM, b.distanceM >= 500 ? 100 : 50);
    return {
      distanceKm: meters / 1000,
      label: `${meters} м (орієнтовно, для чоловіка ~80 кг)`,
    };
  }
  if (b.calories) {
    const cal = roundTo(blocks * b.calories, 5);
    return { calories: cal, label: `${cal} ккал (орієнтовно, для чоловіка ~80 кг)` };
  }
  if (b.reps) {
    const reps = roundTo(blocks * b.reps, 10);
    return { reps, label: `${reps} повторів (орієнтовно, для чоловіка ~80 кг)` };
  }
  return null;
}
