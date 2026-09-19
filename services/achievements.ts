import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutEntry } from '../types';
import { exerciseTonnage } from './analytics';

const KEY = '@alpha_trainer:achievements';

export interface Achievement {
  id: string;
  /** Ключі i18n: назву й опис збирає екран. */
  titleKey: string;
  descKey: string;
  icon: string;
  category: 'workout' | 'strength' | 'cardio' | 'nutrition' | 'consistency';
  unlockedAt?: string;
  current: number;
  target: number;
}

const DEFINITIONS: Omit<Achievement, 'current' | 'unlockedAt'>[] = [
  { id: 'first_workout',   titleKey: 'achFirstWorkout',    descKey: 'achFirstWorkoutDesc',         icon: 'barbell-outline',       category: 'workout',      target: 1 },
  { id: 'workouts_10',     titleKey: 'achWorkouts10',         descKey: 'achWorkouts10Desc',             icon: 'flame-outline',         category: 'workout',      target: 10 },
  { id: 'workouts_50',     titleKey: 'achWorkouts50',         descKey: 'achWorkouts50Desc',             icon: 'trophy-outline',        category: 'workout',      target: 50 },
  { id: 'workouts_100',    titleKey: 'achWorkouts100',        descKey: 'achWorkouts100Desc',            icon: 'ribbon-outline',        category: 'workout',      target: 100 },
  { id: 'streak_7',        titleKey: 'achStreak7',    descKey: 'achStreak7Desc', icon: 'calendar-outline', category: 'consistency', target: 7 },
  { id: 'streak_30',       titleKey: 'achStreak30',     descKey: 'achStreak30Desc', icon: 'medal-outline',  category: 'consistency',  target: 30 },
  { id: 'first_run',       titleKey: 'achFirstRun',        descKey: 'achFirstRunDesc',               icon: 'walk-outline',          category: 'cardio',       target: 1 },
  { id: 'run_50km',        titleKey: 'achRun50km',    descKey: 'achRun50kmDesc',              icon: 'footsteps-outline',     category: 'cardio',       target: 50 },
  { id: 'first_pr',        titleKey: 'achFirstPr',        descKey: 'achFirstPrDesc', icon: 'star-outline',          category: 'strength',     target: 1 },
  { id: 'pr_5',            titleKey: 'achPr5',           descKey: 'achPr5Desc',              icon: 'podium-outline',        category: 'strength',     target: 5 },
  { id: 'heavy_session',   titleKey: 'achHeavySession',          descKey: 'achHeavySessionDesc', icon: 'fitness-outline', category: 'strength', target: 5000 },
  { id: 'variety_5',       titleKey: 'achVariety5',      descKey: 'achVariety5Desc',  icon: 'shuffle-outline',      category: 'workout',      target: 5 },
  { id: 'early_bird',      titleKey: 'achEarlyBird',       descKey: 'achEarlyBirdDesc',       icon: 'sunny-outline',         category: 'consistency',  target: 1 },
  { id: 'long_session',    titleKey: 'achLongSession',           descKey: 'achLongSessionDesc',               icon: 'timer-outline',         category: 'workout',      target: 120 },
];

function countPRs(workouts: WorkoutEntry[]): number {
  // A PR is an IMPROVEMENT over a previous result — the first logged weight
  // for an exercise is just a baseline, not a record.
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  const bestSoFar = new Map<string, number>();
  let count = 0;
  for (const w of sorted) {
    const workoutBest = new Map<string, number>();
    for (const ex of w.exercises) {
      if (!ex.name) continue;
      const key = ex.name.toLowerCase();
      const maxWeight = ex.setsDetail && ex.setsDetail.length > 0
        ? Math.max(...ex.setsDetail.map((s) => s.weight || 0))
        : ex.weight || 0;
      if (maxWeight <= 0) continue;
      workoutBest.set(key, Math.max(workoutBest.get(key) || 0, maxWeight));
    }
    for (const [key, weight] of workoutBest) {
      const prev = bestSoFar.get(key);
      if (prev === undefined) {
        bestSoFar.set(key, weight); // baseline
      } else if (weight > prev) {
        bestSoFar.set(key, weight);
        count++;
      }
    }
  }
  return count;
}

/**
 * Усі показники рахуються за один прохід.
 *
 * Раніше кожна ачівка рахувалась окремо, і `countPRs` (із сортуванням усієї
 * історії) виконувався двічі на виклик — а екран прогресу викликає і
 * `getAchievements`, і `checkAndUnlock`, тобто чотири рази поспіль.
 */
interface AchStats {
  workoutCount: number;
  streak: number;
  runCount: number;
  runKm: number;
  prCount: number;
  heaviestSession: number;
  varietyCount: number;
  earlyBirdCount: number;
  longestSession: number;
}

function computeStats(workouts: WorkoutEntry[], streak: number): AchStats {
  let runCount = 0;
  let runKm = 0;
  let heaviestSession = 0;
  let earlyBirdCount = 0;
  let longestSession = 0;
  const types = new Set<string>();

  for (const w of workouts) {
    types.add(w.workoutType);
    if (w.workoutType === 'run') {
      runCount++;
      // дистанція може бути записана на рівні тренування або в самій вправі
      runKm += w.totalDistance || w.exercises.reduce((s, e) => s + (e.distance || 0), 0);
    }
    // Math.max(...array) розгортає масив в аргументи і на кількох тисячах
    // записів переповнює стек — тому накопичуємо в циклі
    const tonnage = w.exercises.reduce((s, ex) => s + exerciseTonnage(ex), 0);
    if (tonnage > heaviestSession) heaviestSession = tonnage;
    if ((w.duration || 0) > longestSession) longestSession = w.duration || 0;

    const h = new Date(w.completedAt).getHours();
    if (!Number.isNaN(h) && h < 8) earlyBirdCount++;
  }

  return {
    workoutCount: workouts.length,
    streak,
    runCount,
    runKm: Math.round(runKm * 10) / 10,
    prCount: countPRs(workouts),
    heaviestSession,
    varietyCount: types.size,
    earlyBirdCount,
    longestSession,
  };
}

function calcCurrent(id: string, s: AchStats): number {
  switch (id) {
    case 'first_workout':
    case 'workouts_10':
    case 'workouts_50':
    case 'workouts_100':
      return s.workoutCount;

    case 'streak_7':
    case 'streak_30':
      return s.streak;

    case 'first_run':
      return s.runCount;

    case 'run_50km':
      return s.runKm;

    case 'first_pr':
    case 'pr_5':
      return s.prCount;

    case 'heavy_session':
      return s.heaviestSession;

    case 'variety_5':
      return s.varietyCount;

    case 'early_bird':
      return s.earlyBirdCount;

    case 'long_session':
      return s.longestSession;

    default:
      return 0;
  }
}

type StoredMap = Record<string, string>; // id → unlockedAt ISO

/** Пошкоджений запис не має ронити екран — повертаємо порожню мапу. */
async function readStored(): Promise<StoredMap> {
  try {
    const json = await AsyncStorage.getItem(KEY);
    return json ? (JSON.parse(json) ?? {}) : {};
  } catch {
    return {};
  }
}

/**
 * Перевіряє нові розблокування і одразу повертає повний список ачівок.
 * Один прохід замість пари `checkAndUnlock` + `getAchievements`.
 */
export async function syncAchievements(
  workouts: WorkoutEntry[],
  streak: number,
): Promise<{ achievements: Achievement[]; newlyUnlocked: string[] }> {
  const stored = await readStored();
  const stats = computeStats(workouts, streak);
  const newlyUnlocked: string[] = [];

  const achievements = DEFINITIONS.map((def) => {
    const current = calcCurrent(def.id, stats);
    if (!stored[def.id] && current >= def.target) {
      stored[def.id] = new Date().toISOString();
      newlyUnlocked.push(def.id);
    }
    return {
      ...def,
      current: Math.min(current, def.target),
      unlockedAt: stored[def.id],
    };
  });

  if (newlyUnlocked.length > 0) {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      // не критично — розблокується наступного разу
    }
  }
  return { achievements, newlyUnlocked };
}

// Returns newly unlocked achievement ids
export async function checkAndUnlock(
  workouts: WorkoutEntry[],
  streak: number,
): Promise<string[]> {
  const { newlyUnlocked } = await syncAchievements(workouts, streak);
  return newlyUnlocked;
}

export function getAchievementDef(id: string) {
  return DEFINITIONS.find((d) => d.id === id);
}
