// Розпізнавання назв вправ (ТЗ F2).
//
// Користувач пише назви вільно: «мази гирею», «front squad», «крокуючий випадок».
// Тут вони перетворюються на id бібліотечної вправи — без переписування самих записів.
//
// Порядок: зв'язок, який користувач підтвердив → точна назва → синонім → нечіткий збіг.
// Нечіткий збіг ніколи не застосовується автоматично: він лише підказка для екрана
// прив'язки, бо помилка тут тихо зіпсує прогрес і рекорди.

import { ExerciseLog } from '../types';
import {
  AMBIGUOUS_NAMES, LibraryExercise, ambiguousCandidates, findNameHit, getExercise,
  looksLikeHeading, looseKey, nameIndex, normalizeName,
} from './library';

export type MatchConfidence = 'link' | 'exact' | 'alias' | 'fuzzy' | 'ambiguous' | 'none';

export interface MatchResult {
  id: string | null;
  confidence: MatchConfidence;
  /** Для неоднозначних назв і нечітких збігів — що саме пропонуємо. */
  candidates: string[];
}

/** Зв'язки, підтверджені користувачем: нормалізована назва → id вправи. */
export type ExerciseLinks = Record<string, string>;

const NONE: MatchResult = { id: null, confidence: 'none', candidates: [] };

/**
 * Відстань Дамерау-Левенштейна (варіант OSA) — скільки правок треба, щоб з одного
 * слова зробити інше. Рахується лише для коротких слів, тож простої матриці досить.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  // Три рухомі рядки замість повної матриці: попередній-попередній потрібен
  // лише для перестановки сусідніх літер. На телефоні це різниця між
  // тисячами масивів на кожне порівняння і трьома.
  const w = b.length + 1;
  let prev2 = new Uint16Array(w);
  let prev = new Uint16Array(w);
  let curr = new Uint16Array(w);
  for (let j = 0; j < w; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < w; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1
        && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, prev2[j - 2] + cost);
      }
      curr[j] = v;
    }
    const spare = prev2;
    prev2 = prev;
    prev = curr;
    curr = spare;
  }
  return prev[b.length];
}

/** Поріг на слово: коротким словам прощаємо одну помилку, довшим — дві. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const limit = Math.max(a.length, b.length) <= 5 ? 1 : 2;
  // Правок потрібно щонайменше стільки, на скільки різняться довжини, —
  // отже різні за довжиною слова можна відкинути без самого підрахунку.
  if (Math.abs(a.length - b.length) > limit) return false;
  return editDistance(a, b) <= limit;
}

/**
 * Схожість двох назв за множиною слів: «крокуючий випадок» і «крокуючі випади»
 * збігаються двома словами з двох, хоча жодне не написане однаково.
 */
export function nameSimilarity(a: string, b: string): number {
  return tokenSimilarity(tokensOf(a), tokensOf(b));
}

function tokensOf(name: string): string[] {
  return looseKey(name).split(' ').filter(Boolean);
}

/**
 * Частка слів, які знайшли собі пару. Приймає вже розібрані слова, щоб при
 * пошуку по всій бібліотеці не розбирати ту саму назву тисячу разів.
 */
function tokenSimilarity(at: string[], bt: string[], minScore = 0): number {
  if (!at.length || !bt.length) return 0;
  const maxTokens = Math.max(at.length, bt.length);
  // Більше за кількість слів у коротшій назві збігтись не може: якщо навіть
  // повний збіг не дотягне до порога, рахувати відстані немає сенсу.
  if (Math.min(at.length, bt.length) / maxTokens < minScore) return 0;

  const used = new Set<number>();
  let matched = 0;
  for (const token of at) {
    const i = bt.findIndex((other, idx) => !used.has(idx) && tokensMatch(token, other));
    if (i !== -1) {
      used.add(i);
      matched++;
    }
  }
  return matched / maxTokens;
}

const FUZZY_THRESHOLD = 0.6;

/**
 * Слова назв бібліотеки. Індекс не змінюється під час роботи, тож розбираємо
 * кожну назву один раз — інакше нечіткий пошук робив би це на кожен запит.
 */
const tokenCache = new Map<string, string[]>();

function indexTokens(key: string): string[] {
  let t = tokenCache.get(key);
  if (!t) {
    t = tokensOf(key);
    tokenCache.set(key, t);
  }
  return t;
}

/** Найкращий нечіткий кандидат або null, якщо їх кілька однаково схожих. */
export function fuzzyMatch(name: string): { id: string; score: number } | null {
  const best: { id: string; score: number }[] = [];
  const queryTokens = tokensOf(name);
  for (const [key, hit] of nameIndex()) {
    const score = tokenSimilarity(queryTokens, indexTokens(key), FUZZY_THRESHOLD);
    if (score < FUZZY_THRESHOLD) continue;
    const existing = best.find((b) => b.id === hit.ex.id);
    if (existing) existing.score = Math.max(existing.score, score);
    else best.push({ id: hit.ex.id, score });
  }
  if (!best.length) return null;
  best.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (best.length > 1 && best[1].score === best[0].score) return null; // однаково схожі — не вгадуємо
  return best[0];
}

/**
 * Розпізнає назву. `links` — те, що користувач уже підтвердив вручну.
 * Автоматично довіряти можна лише `link`, `exact` і `alias`.
 */
export function matchName(raw: string, links: ExerciseLinks = {}): MatchResult {
  if (!raw || looksLikeHeading(raw)) return NONE;
  const key = normalizeName(raw);
  if (!key) return NONE;

  const linked = links[key];
  if (linked) return { id: linked, confidence: 'link', candidates: [linked] };

  const ambiguous = ambiguousCandidates(key);
  if (ambiguous) {
    return { id: null, confidence: 'ambiguous', candidates: ambiguous.map((e) => e.id) };
  }

  const hit = findNameHit(key);
  if (hit) return { id: hit.ex.id, confidence: hit.exact ? 'exact' : 'alias', candidates: [hit.ex.id] };

  const fuzzy = fuzzyMatch(key);
  if (fuzzy) return { id: null, confidence: 'fuzzy', candidates: [fuzzy.id] };

  return NONE;
}

/** Вправа за результатом розпізнавання, якщо їй можна довіряти автоматично. */
export function resolveExercise(raw: string, links: ExerciseLinks = {}): LibraryExercise | null {
  const m = matchName(raw, links);
  return m.id ? getExercise(m.id) ?? null : null;
}

/**
 * Функція, яку аналітика отримує як необов'язковий аргумент: за записом повертає id
 * вправи або null. `exerciseId` у записі має безумовний пріоритет (ТЗ F2.5).
 */
export type ExerciseResolver = (log: Pick<ExerciseLog, 'name' | 'exerciseId'>) => string | null;

export function createResolver(links: ExerciseLinks = {}): ExerciseResolver {
  const cache = new Map<string, string | null>();
  return (log) => {
    if (log.exerciseId) return log.exerciseId;
    const key = normalizeName(log.name ?? '');
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const m = matchName(key, links);
    const id = m.confidence === 'link' || m.confidence === 'exact' || m.confidence === 'alias'
      ? m.id
      : null;
    cache.set(key, id);
    return id;
  };
}

/** Скільки назв у переліку розпізнається автоматично — для звітів (критерій A1). */
export function coverageOf(names: string[], links: ExerciseLinks = {}): {
  auto: number; ambiguous: number; fuzzy: number; none: number;
} {
  const out = { auto: 0, ambiguous: 0, fuzzy: 0, none: 0 };
  for (const name of names) {
    const m = matchName(name, links);
    if (m.confidence === 'link' || m.confidence === 'exact' || m.confidence === 'alias') out.auto++;
    else if (m.confidence === 'ambiguous') out.ambiguous++;
    else if (m.confidence === 'fuzzy') out.fuzzy++;
    else out.none++;
  }
  return out;
}

export { AMBIGUOUS_NAMES };
