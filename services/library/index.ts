// Реєстр бібліотеки вправ: індекси, пошук, згортка м'язів у групи.
//
// Індекси будуються ліниво — при першому запиті, а не на імпорті модуля, щоб
// екрани, яким бібліотека не потрібна, не платили за неї.

import {
  Equipment, LibraryExercise, Level, MovementPattern, Muscle, MuscleGroup, MUSCLE_TO_GROUP,
} from './types';
import { normalizeName } from './normalize';
import { Lang, getCurrentExerciseLang } from '../i18n';
import { LEG_EXERCISES } from './data/legs';
import { PUSH_EXERCISES } from './data/push';
import { PULL_EXERCISES } from './data/pull';
import { CORE_EXERCISES } from './data/core';
import { CONDITIONING_EXERCISES } from './data/conditioning';
import { MOBILITY_EXERCISES } from './data/mobility';

const BUILTIN: LibraryExercise[] = [
  ...LEG_EXERCISES,
  ...PUSH_EXERCISES,
  ...PULL_EXERCISES,
  ...CORE_EXERCISES,
  ...CONDITIONING_EXERCISES,
  ...MOBILITY_EXERCISES,
];

/**
 * Власні вправи користувача (ТЗ F2.8). Живуть у сховищі, а сюди їх подає
 * `services/exerciseLinks` при старті екрана — бібліотека лишається чистими
 * даними й не знає про AsyncStorage.
 */
let custom: LibraryExercise[] = [];

/** Порожній список прибирає власні вправи з реєстру. Індекси перебудуються ліниво. */
export function registerCustomExercises(list: LibraryExercise[]): void {
  custom = list;
  cache = null;
}

function all(): LibraryExercise[] {
  return custom.length === 0 ? BUILTIN : [...BUILTIN, ...custom];
}

/**
 * Назви, які означають різні вправи. Автоматично не прив'язуються — користувач
 * обирає сам (ТЗ F2.3). «Велосипед» — класичний випадок: у бібліотеці це
 * скручування на прес, а в кросфіті — велотренажер.
 */
export const AMBIGUOUS_NAMES: Record<string, string[]> = {
  'присідання': ['air_squat', 'back_squat', 'goblet_squat'],
  'велосипед': ['bicycle_crunch', 'bike_erg'],
  'прес': ['sit_up', 'crunch', 'plank'],
  'махи': ['kb_swing', 'lateral_raise'],
  'випади': ['forward_lunge', 'reverse_lunge', 'walking_lunge'],
  'жим': ['bench_press', 'strict_press', 'leg_press'],
  'тяга': ['deadlift', 'barbell_row', 'lat_pulldown'],
};

/** Збіг за власною назвою чи за синонімом — різна впевненість при розпізнаванні. */
export interface NameHit {
  ex: LibraryExercise;
  exact: boolean;
}

interface Indexes {
  byId: Map<string, LibraryExercise>;
  byName: Map<string, NameHit>;               // нормалізована назва або синонім → вправа
  byPattern: Map<MovementPattern, LibraryExercise[]>;
  byFamily: Map<string, LibraryExercise[]>;
}

let cache: Indexes | null = null;

function indexes(): Indexes {
  if (cache) return cache;
  const byId = new Map<string, LibraryExercise>();
  const byName = new Map<string, NameHit>();
  const byPattern = new Map<MovementPattern, LibraryExercise[]>();
  const byFamily = new Map<string, LibraryExercise[]>();

  for (const ex of all()) {
    byId.set(ex.id, ex);
    const names = [ex.nameUk, ex.nameEn];
    for (const raw of [...names, ...ex.aliases]) {
      const key = normalizeName(raw);
      // неоднозначні назви в індекс не потрапляють: їх розв'язує користувач
      if (!key || key in AMBIGUOUS_NAMES || byName.has(key)) continue;
      byName.set(key, { ex, exact: names.includes(raw) });
    }
    byPattern.set(ex.pattern, [...(byPattern.get(ex.pattern) ?? []), ex]);
    byFamily.set(ex.family, [...(byFamily.get(ex.family) ?? []), ex]);
  }

  cache = { byId, byName, byPattern, byFamily };
  return cache;
}

/**
 * Назва вправи мовою, яку обрав користувач (Профіль → «Мова вправ»).
 *
 * Багато хто звик до англійських назв у залі («back squat», а не «присідання
 * зі штангою на спині»), тому вибір лишається за людиною. Без явної мови
 * беремо поточну — так сервіси не тягнуть її через усі виклики.
 */
export function exerciseName(ex: LibraryExercise, lang?: Lang): string {
  return (lang ?? getCurrentExerciseLang()) === 'en' ? ex.nameEn : ex.nameUk;
}

/**
 * Підказки техніки мовою користувача.
 *
 * Якщо англійського перекладу для вправи ще немає — віддаємо український:
 * половина підказок англійською й половина українською читається дивно, але
 * значно корисніше за порожній блок «як робити».
 */
export function cuesOf(ex: LibraryExercise, lang?: Lang): string[] {
  const wanted = lang ?? getCurrentExerciseLang();
  return wanted === 'en' && ex.cuesEn?.length ? ex.cuesEn : ex.cues;
}

export function allExercises(): LibraryExercise[] {
  return all();
}

export function getExercise(id: string): LibraryExercise | undefined {
  return indexes().byId.get(id);
}

/** Точний збіг назви або синоніма. Неоднозначні назви сюди не потрапляють. */
export function findByName(name: string): LibraryExercise | undefined {
  return indexes().byName.get(normalizeName(name))?.ex;
}

/** Те саме, але видно, збіг це за власною назвою чи за синонімом. */
export function findNameHit(name: string): NameHit | undefined {
  return indexes().byName.get(normalizeName(name));
}

/** Усі відомі назви й синоніми — для нечіткого пошуку. */
export function nameIndex(): Map<string, NameHit> {
  return indexes().byName;
}

/** Кандидати для неоднозначної назви або null, якщо назва однозначна. */
export function ambiguousCandidates(name: string): LibraryExercise[] | null {
  const ids = AMBIGUOUS_NAMES[normalizeName(name)];
  if (!ids) return null;
  return ids.map((id) => getExercise(id)).filter((e): e is LibraryExercise => !!e);
}

export function exercisesByPattern(pattern: MovementPattern): LibraryExercise[] {
  return indexes().byPattern.get(pattern) ?? [];
}

export function exercisesByFamily(family: string): LibraryExercise[] {
  return indexes().byFamily.get(family) ?? [];
}

/** Група м'язів для показу й старої аналітики. */
export function muscleGroupOf(ex: LibraryExercise): MuscleGroup {
  if (ex.displayGroup) return ex.displayGroup;
  const first = ex.muscles.primary[0];
  return MUSCLE_TO_GROUP[first] ?? 'fullbody';
}

export interface LibraryFilters {
  query?: string;
  muscleGroup?: MuscleGroup;
  pattern?: MovementPattern;
  equipment?: Equipment;
  level?: Level;
  /** Показувати лише те, що можна зробити цим обладнанням. */
  availableEquipment?: Equipment[];
}

/** Чи можна виконати вправу наявним обладнанням (порожній список обладнання — власна вага). */
export function isAvailable(ex: LibraryExercise, available: Equipment[]): boolean {
  return ex.equipment.every((eq) => available.includes(eq));
}

export function searchLibrary(filters: LibraryFilters = {}): LibraryExercise[] {
  const { query, muscleGroup, pattern, equipment, level, availableEquipment } = filters;
  const q = query ? normalizeName(query) : '';
  const idx = indexes();

  // точний збіг виводимо першим, решта — за входженням підрядка
  const exact = q ? idx.byName.get(q)?.ex : undefined;

  return all().filter((ex) => {
    if (muscleGroup && muscleGroupOf(ex) !== muscleGroup) return false;
    if (pattern && ex.pattern !== pattern && ex.secondaryPattern !== pattern) return false;
    if (equipment && !ex.equipment.includes(equipment)) return false;
    if (level && ex.level !== level) return false;
    if (availableEquipment && !isAvailable(ex, availableEquipment)) return false;
    if (!q) return true;
    if (ex === exact) return true;
    return [ex.nameUk, ex.nameEn, ...ex.aliases]
      .some((n) => normalizeName(n).includes(q));
  }).sort((a, b) => {
    if (a === exact) return -1;
    if (b === exact) return 1;
    return 0;
  });
}

/** Частка вправ бібліотеки, для яких є ілюстрація (критерій A6). */
export function imageCoverage(): { withImage: number; total: number; ratio: number } {
  const withImage = BUILTIN.filter((ex) => ex.imageSlug).length;
  return { withImage, total: BUILTIN.length, ratio: withImage / BUILTIN.length };
}

export * from './types';
export { normalizeName, looseKey, looksLikeHeading } from './normalize';

/**
 * Варіанти виконання мовою інтерфейсу.
 *
 * Українського тексту в English-режимі не показуємо: краще один рядок техніки,
 * ніж підказка мовою, якої людина не читає.
 */
export function modificationsOf(ex: LibraryExercise, lang?: Lang): string[] {
  const wanted = lang ?? getCurrentExerciseLang();
  if (wanted === 'en') return ex.modificationsEn ?? [];
  return ex.modifications ?? [];
}
