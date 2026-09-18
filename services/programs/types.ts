// Багатотижневі програми: модель даних (докладніше — docs/06-plan-programs.md).
//
// Програма відповідає на питання, якого досі не було в додатку: «куди я йду
// наступні два місяці». Конструктор складає одне заняття, програма веде за
// руку тижнями — і сама піднімає навантаження.
//
// Назви програм власні, описові. Методи (лінійна прогресія, хвиля відсотків,
// накопичення обсягу) — загальновідома практика, а не чиясь торгова марка.

import { Equipment, Level } from '../library/types';
import { Focus } from '../prescriptions';

export type SlotRole = 'main' | 'accessory' | 'core' | 'conditioning';

export interface ProgramSlot {
  /** Основний рух програми. Якщо обладнання немає — підбереться заміна. */
  exerciseId: string;
  role: SlotRole;
  sets: number;
  reps: number;
  /**
   * Частка робочої ваги (0.6–0.95). Без неї вага береться як робоча,
   * а для вправ без обтяження не рахується взагалі.
   */
  intensity?: number;
  /** Відпочинок, якщо він відрізняється від типового для ролі. */
  restSec?: number;
}

export interface ProgramDay {
  /** «День A — присід і жим». Коротко, щоб влізло в рядок на головній. */
  titleUk: string;
  titleEn: string;
  slots: ProgramSlot[];
}

/**
 * Як росте навантаження від тижня до тижня.
 *
 * `linear` — класика для тих, хто ще може додавати вагу щотижня.
 * `volume` — коли вага та сама, а росте кількість роботи.
 * `wave` — хвиля відсотків: два-три тижні вгору, потім легший.
 */
export type Progression =
  | { kind: 'linear'; stepKg: number; deloadWeeks?: number[] }
  | { kind: 'volume'; addSetEveryWeeks: number; deloadWeeks?: number[] }
  | { kind: 'wave'; intensities: number[] };

export interface ProgramTemplate {
  id: string;
  nameUk: string;
  nameEn: string;
  weeks: number;
  focus: Focus;
  /** Для кого програма: рівень вправ, які в ній є. */
  level: Level;
  /** Потрібне обладнання; порожньо — власна вага. */
  equipment: Equipment[];
  summaryUk: string;
  summaryEn: string;
  days: ProgramDay[];
  progression: Progression;
}

/** Що відбувається з програмою в конкретного користувача. */
export interface ActiveProgram {
  templateId: string;
  startedAt: string;             // ISO
  /** Робоча вага на старті: id вправи → кг. Порожньо — працюємо за відчуттям. */
  baseWeights: Record<string, number>;
  /** Пройдені дні у вигляді 'w2d1'. */
  done: string[];
  /**
   * Тижні, які довелось повторити («не вийшло»). Вага на них відкочується,
   * бо застрягти — нормально, а ламати програму через це — ні.
   */
  repeated?: Record<number, number>;   // тиждень → скільки разів відкотили
}

export function dayKey(week: number, day: number): string {
  return `w${week}d${day}`;
}
