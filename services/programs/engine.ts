// Рушій прогресії: що саме робити на конкретному тижні програми.
//
// Головна ідея — вага рахується від РОБОЧОЇ ваги користувача, а не від
// абстрактних відсотків у вакуумі. Робочу вагу беремо з його ж історії, а
// якщо вправа нова — питаємо один раз на старті.
//
// Модуль чистий: ніякого сховища й UI, лише числа. Через це прогресію легко
// перевірити тестами на всі тижні наперед.

import { LibraryExercise } from '../library/types';
import { getExercise } from '../library';
import { Prescription } from '../prescriptions';
import { ActiveProgram, ProgramDay, ProgramSlot, ProgramTemplate, dayKey } from './types';
import { ExerciseLog } from '../../types';

/** Крок округлення ваги: менші диски в залі рідко бувають. */
const PLATE_STEP = 2.5;

/** Наскільки легшим має бути тиждень розвантаження. */
const DELOAD_FACTOR = 0.6;

/** На скільки відкочується вага, коли тиждень «не вийшов». */
const BACKOFF = 0.9;

const REST_BY_ROLE: Record<ProgramSlot['role'], number> = {
  main: 150,
  accessory: 90,
  core: 45,
  conditioning: 60,
};

function roundWeight(kg: number): number {
  return Math.max(PLATE_STEP, Math.round(kg / PLATE_STEP) * PLATE_STEP);
}

export function isDeloadWeek(template: ProgramTemplate, week: number): boolean {
  const p = template.progression;
  if (p.kind === 'wave') {
    // у хвилі розвантаження — найлегший тиждень циклу
    const i = (week - 1) % p.intensities.length;
    return p.intensities[i] === Math.min(...p.intensities);
  }
  return (p.deloadWeeks ?? []).includes(week);
}

/**
 * Скільки додати до робочої ваги на цьому тижні.
 * Повертає множник і надбавку окремо: хвиля працює відсотками, лінійна — кілограмами.
 */
function loadFor(
  template: ProgramTemplate,
  slot: ProgramSlot,
  week: number,
  backoffs: number,
): { factor: number; addKg: number } {
  const p = template.progression;
  const deload = isDeloadWeek(template, week);
  const backoff = BACKOFF ** backoffs;

  if (p.kind === 'linear') {
    // до розвантаження додаємо крок щотижня; сам тиждень розвантаження — легкий
    const grown = slot.role === 'main' ? p.stepKg * (week - 1) : 0;
    return {
      factor: (slot.intensity ?? 1) * (deload ? DELOAD_FACTOR : 1) * backoff,
      addKg: deload ? 0 : grown,
    };
  }
  if (p.kind === 'volume') {
    return {
      factor: (slot.intensity ?? 1) * (deload ? DELOAD_FACTOR : 1) * backoff,
      addKg: 0,
    };
  }
  const wave = p.intensities[(week - 1) % p.intensities.length];
  return { factor: (slot.intensity ?? wave) * backoff, addKg: 0 };
}

export interface SlotPrescription extends Prescription {
  /** Кілограми, якщо вправа з обтяженням і відома робоча вага. */
  weight?: number;
  /** Чому саме стільки — для підпису під схемою. */
  hint?: string;
}

/**
 * Припис для слота на конкретному тижні.
 *
 * `baseWeight` — робоча вага саме цієї вправи. Без неї повертаємо схему без
 * кілограмів: людина працює за відчуттям, як і в конструкторі.
 */
export function prescriptionFor(
  template: ProgramTemplate,
  slot: ProgramSlot,
  week: number,
  baseWeight?: number,
  backoffs = 0,
): SlotPrescription {
  const p = template.progression;
  const deload = isDeloadWeek(template, week);
  const { factor, addKg } = loadFor(template, slot, week, backoffs);

  // обсяг: у volume-прогресії кількість підходів росте
  let sets = slot.sets;
  if (p.kind === 'volume' && !deload) {
    sets += Math.floor((week - 1) / p.addSetEveryWeeks);
  }
  if (deload) sets = Math.max(2, slot.sets - 1);

  const out: SlotPrescription = {
    sets,
    reps: slot.reps,
    restSec: slot.restSec ?? REST_BY_ROLE[slot.role],
  };

  if (baseWeight && baseWeight > 0) {
    out.weight = roundWeight(baseWeight * factor + addKg);
  } else if (slot.role === 'main') {
    out.rpe = deload ? 6 : 8;
  }

  if (deload) out.hint = 'тиждень розвантаження — легше навмисно';
  else if (backoffs > 0) out.hint = 'вага відкочена після невдалого тижня';

  return out;
}

/** Скільки разів цей тиждень довелось повторити. */
export function backoffsFor(active: ActiveProgram | null, week: number): number {
  return active?.repeated?.[week] ?? 0;
}

/**
 * День програми у вправи для форми запису.
 *
 * `substitute` дозволяє підмінити вправу, якої немає під обладнання, —
 * рішення про заміну ухвалює екран через звичайний рушій замін.
 */
export function programDayToExercises(
  template: ProgramTemplate,
  day: ProgramDay,
  week: number,
  baseWeights: Record<string, number>,
  substitute?: (ex: LibraryExercise) => LibraryExercise,
  backoffs = 0,
): ExerciseLog[] {
  const out: ExerciseLog[] = [];
  for (const slot of day.slots) {
    const original = getExercise(slot.exerciseId);
    if (!original) continue;
    const ex = substitute ? substitute(original) : original;
    // вага прив'язана до вправи: після заміни снаряда стара вага не має сенсу
    const base = ex.id === original.id ? baseWeights[original.id] : undefined;
    const p = prescriptionFor(template, slot, week, base, backoffs);
    out.push({
      name: ex.nameUk,
      exerciseId: ex.id,
      sets: p.sets,
      reps: p.reps,
      weight: p.weight,
    });
  }
  return out;
}

export interface NextDay {
  week: number;
  day: number;
  dayIndex: number;
  template: ProgramTemplate;
  programDay: ProgramDay;
  /** Скільки днів пройдено з усієї програми. */
  doneCount: number;
  totalDays: number;
}

/**
 * Наступний непройдений день.
 *
 * Пропущений день не ламає програму: беремо перший, якого ще немає в `done`,
 * а не «наступний за календарем».
 */
export function nextDay(template: ProgramTemplate, active: ActiveProgram): NextDay | null {
  const perWeek = template.days.length;
  const total = template.weeks * perWeek;
  for (let week = 1; week <= template.weeks; week++) {
    for (let d = 1; d <= perWeek; d++) {
      if (active.done.includes(dayKey(week, d))) continue;
      return {
        week,
        day: d,
        dayIndex: (week - 1) * perWeek + d,
        template,
        programDay: template.days[d - 1],
        doneCount: active.done.length,
        totalDays: total,
      };
    }
  }
  return null;   // програму пройдено
}

/** Прев'ю прогресії для картки програми: як росте головна вправа. */
export function progressionPreview(
  template: ProgramTemplate,
  baseWeight = 100,
): { week: number; label: string; deload: boolean }[] {
  const mainSlot = template.days[0]?.slots.find((s) => s.role === 'main');
  if (!mainSlot) return [];
  return Array.from({ length: template.weeks }, (_, i) => {
    const week = i + 1;
    const p = prescriptionFor(template, mainSlot, week, baseWeight);
    const amount = p.weight ? `${p.weight} кг` : `RPE ${p.rpe ?? 8}`;
    return {
      week,
      label: `${p.sets}×${p.reps} · ${amount}`,
      deload: isDeloadWeek(template, week),
    };
  });
}
