// Зв'язки «назва користувача → вправа бібліотеки» і власні вправи (ТЗ F2.5–F2.8).
//
// Записи тренувань НЕ переписуються: користувач далі бачить свою назву, а
// аналітика через зв'язок знає, що «front squad» і «фронтальні присідання» —
// та сама вправа. Тому зв'язок можна зняти, і історія лишиться цілою.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readJSON, withLock } from './storage';
import {
  LibraryExercise, allExercises, getExercise, registerCustomExercises,
} from './library';
import { normalizeName } from './library/normalize';
import { ExerciseLinks, ExerciseResolver, createResolver } from './exerciseMatch';
import { WorkoutEntry } from '../types';

export const LINKS_KEY = '@alpha_trainer:exercise_links';
export const CUSTOM_KEY = '@alpha_trainer:custom_exercises';

export interface CustomExercise {
  id: string;          // 'custom_…'
  name: string;
  /** «Схожа на»: звідки взяти патерн, м'язи, обладнання, stress (F2.8). */
  baseId?: string;
  createdAt: string;
}

// ─── Зв'язки ─────────────────────────────────────────────────────────────────

export async function getLinks(): Promise<ExerciseLinks> {
  return readJSON<ExerciseLinks>(LINKS_KEY, {});
}

/** Зв'язок зберігається за нормалізованою назвою — регістр і зайві пробіли не мають значення. */
export async function linkName(name: string, exerciseId: string): Promise<void> {
  const key = normalizeName(name);
  if (!key) return;
  await withLock(LINKS_KEY, async () => {
    const links = await getLinks();
    links[key] = exerciseId;
    await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
  });
}

export async function unlinkName(name: string): Promise<void> {
  const key = normalizeName(name);
  await withLock(LINKS_KEY, async () => {
    const links = await getLinks();
    if (!(key in links)) return;
    delete links[key];
    await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
  });
}

// ─── Власні вправи ───────────────────────────────────────────────────────────

export async function getCustomExercises(): Promise<CustomExercise[]> {
  return readJSON<CustomExercise[]>(CUSTOM_KEY, []);
}

export async function addCustomExercise(name: string, baseId?: string): Promise<CustomExercise> {
  const ex: CustomExercise = {
    id: `custom_${Date.now().toString(36)}`,
    name: name.trim(),
    baseId,
    createdAt: new Date().toISOString(),
  };
  await withLock(CUSTOM_KEY, async () => {
    const list = await getCustomExercises();
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify([...list, ex]));
  });
  return ex;
}

export async function removeCustomExercise(id: string): Promise<void> {
  await withLock(CUSTOM_KEY, async () => {
    const list = await getCustomExercises();
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(list.filter((e) => e.id !== id)));
  });
}

/**
 * Власна вправа у вигляді бібліотечної.
 *
 * З `baseId` успадковує все, крім назви: так «жим Сергія» рахується як жим і
 * бере участь у замінах. Без нього — нейтральний силовий запис, який свідомо
 * не потрапляє ні в заміни, ні в конструктор (F2.8).
 */
export function toLibraryExercise(c: CustomExercise): LibraryExercise {
  const base = c.baseId ? getExercise(c.baseId) : undefined;
  if (base) {
    return {
      ...base,
      id: c.id,
      nameUk: c.name,
      nameEn: c.name,
      aliases: [],
      imageSlug: base.imageSlug,
      custom: true,
      baseId: base.id,
    };
  }
  return {
    id: c.id,
    nameUk: c.name,
    nameEn: c.name,
    aliases: [],
    pattern: 'monostructural',
    family: c.id,
    level: 1,
    intent: 'hypertrophy',
    metKind: 'strength',
    metrics: ['weight_reps', 'reps'],
    equipment: [],
    muscles: { primary: [] },
    displayGroup: 'fullbody',
    cues: [],
    custom: true,
  };
}

/** Кладе власні вправи в реєстр бібліотеки. Викликається перед побудовою резолвера. */
export async function loadCustomExercises(): Promise<LibraryExercise[]> {
  const list = await getCustomExercises();
  const mapped = list.map(toLibraryExercise);
  registerCustomExercises(mapped);
  return mapped;
}

// ─── Резолвер ────────────────────────────────────────────────────────────────

/**
 * Резолвер для екранів: один раз читає зв'язки й власні вправи, далі працює
 * синхронно і з кешем. Екран будує його раз, а не на кожен запис.
 */
export async function buildResolver(): Promise<ExerciseResolver> {
  await loadCustomExercises();
  const links = await getLinks();
  return createResolver(links);
}

// ─── Для екрана «Нерозпізнані вправи» (F2.6) ─────────────────────────────────

export interface UnresolvedName {
  name: string;          // як написав користувач (найчастіше написання)
  records: number;       // скільки записів зачепить прив'язка
  lastDate: string;
}

/** Скільки записів історії має кожна назва — щоб показати «вплине на N записів». */
export function countByName(workouts: WorkoutEntry[]): Map<string, UnresolvedName> {
  const out = new Map<string, UnresolvedName>();
  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      if (!e.name) continue;
      const key = normalizeName(e.name);
      if (!key) continue;
      const prev = out.get(key);
      out.set(key, {
        name: prev?.name ?? e.name.trim(),
        records: (prev?.records ?? 0) + 1,
        lastDate: prev && prev.lastDate > w.date ? prev.lastDate : w.date,
      });
    }
  }
  return out;
}

/** Чинні зв'язки з назвами вправ — для журналу F2.7. «Сирітський» = id більше немає. */
export function describeLinks(
  links: ExerciseLinks,
  counts: Map<string, UnresolvedName>
): { key: string; name: string; target?: LibraryExercise; records: number; orphan: boolean }[] {
  return Object.entries(links).map(([key, id]) => {
    const target = getExercise(id);
    return {
      key,
      name: counts.get(key)?.name ?? key,
      target,
      records: counts.get(key)?.records ?? 0,
      orphan: !target,
    };
  }).sort((a, b) => b.records - a.records);
}

/** Усі вправи бібліотеки для вибору вручну — власні включно. */
export function pickableExercises(): LibraryExercise[] {
  return allExercises();
}
