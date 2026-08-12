import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutEntry } from '../types';
import { exerciseTonnage } from './analytics';

const KEY = '@alpha_trainer:achievements';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'workout' | 'strength' | 'cardio' | 'nutrition' | 'consistency';
  unlockedAt?: string;
  current: number;
  target: number;
}

const DEFINITIONS: Omit<Achievement, 'current' | 'unlockedAt'>[] = [
  { id: 'first_workout',   title: 'Перше тренування',    description: 'Заверши перше тренування',         icon: 'barbell-outline',       category: 'workout',      target: 1 },
  { id: 'workouts_10',     title: '10 тренувань',         description: 'Заверши 10 тренувань',             icon: 'flame-outline',         category: 'workout',      target: 10 },
  { id: 'workouts_50',     title: '50 тренувань',         description: 'Заверши 50 тренувань',             icon: 'trophy-outline',        category: 'workout',      target: 50 },
  { id: 'workouts_100',    title: '100 тренувань',        description: 'Заверши 100 тренувань',            icon: 'ribbon-outline',        category: 'workout',      target: 100 },
  { id: 'streak_7',        title: 'Тиждень за планом',    description: 'Серія 7 днів — тренуйся у свої дні, відпочинок за планом не розриває серію', icon: 'calendar-outline', category: 'consistency', target: 7 },
  { id: 'streak_30',       title: 'Місяць за планом',     description: 'Серія 30 днів без пропущених тренувальних днів', icon: 'medal-outline',  category: 'consistency',  target: 30 },
  { id: 'first_run',       title: 'Перший пробіг',        description: 'Заверши перший біг',               icon: 'walk-outline',          category: 'cardio',       target: 1 },
  { id: 'run_50km',        title: '50 км в кросівках',    description: 'Набіг загалом 50 км',              icon: 'footsteps-outline',     category: 'cardio',       target: 50 },
  { id: 'first_pr',        title: 'Перший рекорд',        description: 'Встанови перший особистий рекорд', icon: 'star-outline',          category: 'strength',     target: 1 },
  { id: 'pr_5',            title: '5 рекордів',           description: 'Встанови 5 рекордів',              icon: 'podium-outline',        category: 'strength',     target: 5 },
  { id: 'heavy_session',   title: 'Важкий день',          description: 'Підніми 5 000 кг загального тоннажу за одне тренування', icon: 'fitness-outline', category: 'strength', target: 5000 },
  { id: 'variety_5',       title: 'Різноманітність',      description: 'Виконай 5 різних типів тренувань',  icon: 'shuffle-outline',      category: 'workout',      target: 5 },
  { id: 'early_bird',      title: 'Ранкова пташка',       description: 'Заверши тренування до 8:00',       icon: 'sunny-outline',         category: 'consistency',  target: 1 },
  { id: 'long_session',    title: 'Марафонець',           description: 'Тренуйся 2+ години',               icon: 'timer-outline',         category: 'workout',      target: 120 },
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

function calcCurrent(id: string, workouts: WorkoutEntry[], streak: number): number {
  switch (id) {
    case 'first_workout':
    case 'workouts_10':
    case 'workouts_50':
    case 'workouts_100':
      return workouts.length;

    case 'streak_7':
    case 'streak_30':
      return streak;

    case 'first_run':
      return workouts.filter((w) => w.workoutType === 'run').length;

    case 'run_50km':
      return Math.round(
        workouts
          .filter((w) => w.workoutType === 'run')
          .reduce((s, w) => s + (w.totalDistance || 0), 0) * 10
      ) / 10;

    case 'first_pr':
    case 'pr_5':
      return countPRs(workouts);

    case 'heavy_session':
      return Math.max(
        0,
        ...workouts.map((w) =>
          w.exercises.reduce((s, ex) => s + exerciseTonnage(ex), 0)
        )
      );

    case 'variety_5':
      return new Set(workouts.map((w) => w.workoutType)).size;

    case 'early_bird':
      return workouts.filter((w) => {
        const h = new Date(w.completedAt).getHours();
        return h < 8;
      }).length;

    case 'long_session':
      return Math.max(0, ...workouts.map((w) => w.duration || 0));

    default:
      return 0;
  }
}

type StoredMap = Record<string, string>; // id → unlockedAt ISO

export async function getAchievements(
  workouts: WorkoutEntry[],
  streak: number,
): Promise<Achievement[]> {
  const json = await AsyncStorage.getItem(KEY);
  const stored: StoredMap = json ? JSON.parse(json) : {};

  return DEFINITIONS.map((def) => {
    const current = calcCurrent(def.id, workouts, streak);
    return {
      ...def,
      current: Math.min(current, def.target),
      unlockedAt: stored[def.id],
    };
  });
}

// Returns newly unlocked achievement ids
export async function checkAndUnlock(
  workouts: WorkoutEntry[],
  streak: number,
): Promise<string[]> {
  const json = await AsyncStorage.getItem(KEY);
  const stored: StoredMap = json ? JSON.parse(json) : {};
  const newlyUnlocked: string[] = [];

  for (const def of DEFINITIONS) {
    if (stored[def.id]) continue; // already unlocked
    const current = calcCurrent(def.id, workouts, streak);
    if (current >= def.target) {
      stored[def.id] = new Date().toISOString();
      newlyUnlocked.push(def.id);
    }
  }

  if (newlyUnlocked.length > 0) {
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  }
  return newlyUnlocked;
}

export function getAchievementDef(id: string) {
  return DEFINITIONS.find((d) => d.id === id);
}
