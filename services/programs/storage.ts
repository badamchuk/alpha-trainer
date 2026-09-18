// Стан активної програми в сховищі.
//
// Активна програма одна: дві одночасні — це вірний спосіб не пройти жодної.
// Робочі ваги зберігаються тут же, бо програма має пам'ятати, від чого вона
// рахує прогресію, навіть якщо історія тренувань потім зміниться.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readJSON, withLock } from '../storage';
import { ActiveProgram, dayKey } from './types';
import { getProgram } from './data';
import { nextDay } from './engine';
import { WorkoutEntry } from '../../types';
import type { ExerciseResolver } from '../exerciseMatch';

export const ACTIVE_PROGRAM_KEY = '@alpha_trainer:active_program';

export async function getActiveProgram(): Promise<ActiveProgram | null> {
  const p = await readJSON<ActiveProgram | null>(ACTIVE_PROGRAM_KEY, null);
  // програму могли прибрати з додатку між версіями — тоді стан недійсний
  return p && getProgram(p.templateId) ? p : null;
}

export async function startProgram(
  templateId: string,
  baseWeights: Record<string, number>
): Promise<ActiveProgram> {
  const active: ActiveProgram = {
    templateId,
    startedAt: new Date().toISOString(),
    baseWeights,
    done: [],
  };
  await AsyncStorage.setItem(ACTIVE_PROGRAM_KEY, JSON.stringify(active));
  return active;
}

export async function stopProgram(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_PROGRAM_KEY);
}

/** Позначити день пройденим — викликається після збереження тренування. */
export async function markDayDone(week: number, day: number): Promise<void> {
  await withLock(ACTIVE_PROGRAM_KEY, async () => {
    const active = await getActiveProgram();
    if (!active) return;
    const key = dayKey(week, day);
    if (active.done.includes(key)) return;
    await AsyncStorage.setItem(ACTIVE_PROGRAM_KEY, JSON.stringify({
      ...active,
      done: [...active.done, key],
    }));
  });
}

/**
 * «Не вийшло»: тиждень повторюється з меншою вагою.
 *
 * Прибираємо позначки пройдених днів цього тижня й запам'ятовуємо відкат —
 * застрягти нормально, а ламати через це програму не варто.
 */
export async function repeatWeek(week: number): Promise<void> {
  await withLock(ACTIVE_PROGRAM_KEY, async () => {
    const active = await getActiveProgram();
    if (!active) return;
    const prefix = `w${week}d`;
    await AsyncStorage.setItem(ACTIVE_PROGRAM_KEY, JSON.stringify({
      ...active,
      done: active.done.filter((k) => !k.startsWith(prefix)),
      repeated: { ...(active.repeated ?? {}), [week]: (active.repeated?.[week] ?? 0) + 1 },
    }));
  });
}

/** Оновити робочу вагу однієї вправи (користувач виправив на старті чи потім). */
export async function setBaseWeight(exerciseId: string, kg: number): Promise<void> {
  await withLock(ACTIVE_PROGRAM_KEY, async () => {
    const active = await getActiveProgram();
    if (!active) return;
    await AsyncStorage.setItem(ACTIVE_PROGRAM_KEY, JSON.stringify({
      ...active,
      baseWeights: { ...active.baseWeights, [exerciseId]: kg },
    }));
  });
}

/**
 * Пропозиція робочих ваг на старті програми: беремо найважчий підхід із історії
 * по кожній вправі програми. Те, чого людина ще не робила, лишається порожнім —
 * вписати нулі за неї було б гірше, ніж спитати.
 */
export function suggestBaseWeights(
  templateId: string,
  workouts: WorkoutEntry[],
  resolver: ExerciseResolver
): Record<string, number> {
  const template = getProgram(templateId);
  if (!template) return {};
  const wanted = new Set(
    template.days.flatMap((d) => d.slots.filter((s) => s.role === 'main').map((s) => s.exerciseId))
  );

  const out: Record<string, number> = {};
  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      const id = resolver(e);
      if (!id || !wanted.has(id)) continue;
      const sets = e.setsDetail?.length ? e.setsDetail : [{ weight: e.weight }];
      for (const s of sets) {
        if (s.weight && s.weight > (out[id] ?? 0)) out[id] = s.weight;
      }
    }
  }
  return out;
}

/** Що робити далі — для головного екрана. */
export async function currentDay() {
  const active = await getActiveProgram();
  if (!active) return null;
  const template = getProgram(active.templateId)!;
  const next = nextDay(template, active);
  return next ? { active, ...next } : { active, finished: true as const, template };
}
