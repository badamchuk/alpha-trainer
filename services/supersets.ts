import { ExerciseLog } from '../types';

// Спільна логіка суперсетів для log.tsx і workout/[id].tsx.
// Тут тільки чисті функції — UI лишається в екранах.

const SUPERSET_COLORS = ['#E63946', '#2EC4B6', '#F4A261', '#9B59B6', '#2ECC71', '#E91E63'];

export function getSupersetColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return SUPERSET_COLORS[hash % SUPERSET_COLORS.length];
}

export function newSupersetId(): string {
  return `ss_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Розпускає групи, у яких лишилось менше двох вправ — суперсет із однієї
 * вправи не має сенсу (таке буває після видалення або перегрупування).
 */
export function normalizeSupersets(exercises: ExerciseLog[]): ExerciseLog[] {
  const counts = new Map<string, number>();
  for (const e of exercises) {
    if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) ?? 0) + 1);
  }
  return exercises.map((e) =>
    e.supersetId && (counts.get(e.supersetId) ?? 0) < 2 ? { ...e, supersetId: undefined } : e
  );
}

/**
 * Об'єднує вибрані вправи (за індексами) в один суперсет.
 *
 * Вправи фізично переміщуються так, щоб стояти поруч — на позицію найпершої
 * з вибраних. Інакше група малювалась би в одному місці, а порядок у масиві
 * лишався б іншим, і при наступному редагуванні це збивало б з пантелику.
 *
 * Якщо серед вибраних є вправи з інших суперсетів — вони переходять у новий,
 * а групи-залишки з однієї вправи розпускаються.
 */
export function groupIntoSuperset(exercises: ExerciseLog[], indices: number[]): ExerciseLog[] {
  const idx = [...new Set(indices)]
    .filter((i) => i >= 0 && i < exercises.length)
    .sort((a, b) => a - b);
  if (idx.length < 2) return exercises;

  const ssId = newSupersetId();
  const pickedSet = new Set(idx);
  const picked = idx.map((i) => ({ ...exercises[i], supersetId: ssId }));
  const rest = exercises.filter((_, i) => !pickedSet.has(i));

  // idx[0] — найменший з вибраних, тому жоден вибраний не стоїть перед ним:
  // позиція вставки в rest збігається з idx[0] і не виходить за межі масиву.
  const insertAt = Math.min(idx[0], rest.length);
  const merged = [...rest.slice(0, insertAt), ...picked, ...rest.slice(insertAt)];
  return normalizeSupersets(merged);
}

/** Розгруповує суперсет — вправи лишаються на місці, зв'язок знімається. */
export function ungroupSuperset(exercises: ExerciseLog[], ssId: string): ExerciseLog[] {
  return exercises.map((e) => (e.supersetId === ssId ? { ...e, supersetId: undefined } : e));
}

/**
 * Розбиває список на блоки в тому вигляді, як він показується:
 * окрема вправа — це блок, цілий суперсет — теж один блок.
 */
function buildBlocks(exercises: ExerciseLog[]): number[][] {
  const blocks: number[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < exercises.length; i++) {
    const ss = exercises[i].supersetId;
    if (!ss) {
      blocks.push([i]);
      continue;
    }
    if (seen.has(ss)) continue;
    seen.add(ss);
    const group: number[] = [];
    for (let j = 0; j < exercises.length; j++) {
      if (exercises[j].supersetId === ss) group.push(j);
    }
    blocks.push(group);
  }
  return blocks;
}

/**
 * Переміщує вправу на одну позицію вгору (dir = -1) або вниз (dir = 1).
 *
 * Рухається БЛОК, а не окремий рядок: якщо вправа в суперсеті, переїжджає
 * вся група. Інакше переміщення розривало б її навпіл.
 *
 * Повертає той самий масив, якщо рухати нікуди — так UI розуміє, що
 * стрілку треба вимкнути.
 */
export function moveExercise(
  exercises: ExerciseLog[],
  index: number,
  dir: -1 | 1,
): ExerciseLog[] {
  if (index < 0 || index >= exercises.length) return exercises;
  const blocks = buildBlocks(exercises);
  const from = blocks.findIndex((b) => b.includes(index));
  const to = from + dir;
  if (from < 0 || to < 0 || to >= blocks.length) return exercises;

  const swapped = [...blocks];
  [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
  return swapped.flat().map((i) => exercises[i]);
}

/** Чи можна рухати вправу в цей бік — для вимкнення стрілок в UI. */
export function canMoveExercise(
  exercises: ExerciseLog[],
  index: number,
  dir: -1 | 1,
): boolean {
  if (index < 0 || index >= exercises.length) return false;
  const blocks = buildBlocks(exercises);
  const from = blocks.findIndex((b) => b.includes(index));
  const to = from + dir;
  return from >= 0 && to >= 0 && to < blocks.length;
}

/** Прибирає одну вправу з її суперсету (решта групи лишається). */
export function removeFromSuperset(exercises: ExerciseLog[], index: number): ExerciseLog[] {
  if (index < 0 || index >= exercises.length) return exercises;
  const next = exercises.map((e, i) => (i === index ? { ...e, supersetId: undefined } : e));
  return normalizeSupersets(next);
}
