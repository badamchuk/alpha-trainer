import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, Goal, WorkoutEntry, TrainingPlan, ChatMessage, BodyMeasurement } from '../types';

const KEYS = {
  USER_PROFILE: '@alpha_trainer:user_profile',
  GOALS: '@alpha_trainer:goals',
  WORKOUTS: '@alpha_trainer:workouts',
  TRAINING_PLAN: '@alpha_trainer:training_plan',
  CHAT_HISTORY: '@alpha_trainer:chat_history',
  NUTRITIONIST_CHAT_HISTORY: '@alpha_trainer:nutritionist_chat_history',
  DAILY_ADVICE: '@alpha_trainer:daily_advice',
  WEIGHT_LOG: '@alpha_trainer:weight_log',
  MEASUREMENTS: '@alpha_trainer:measurements',
  TRAINER_CONTEXT: '@alpha_trainer:trainer_context',
};

// ─── Безпечне читання/запис ──────────────────────────────────────────────────

/**
 * Читає JSON зі сховища так, щоб пошкоджений запис не ронив додаток.
 *
 * Бекенду немає — усе живе локально, тож один битий байт у ключі workouts
 * інакше клав би кожен екран, який його читає, без способу відновитись
 * зсередини додатку.
 *
 * Биті дані НЕ видаляються: вони відкладаються під окремий ключ, бо інакше
 * наступний же запис (`addWorkout` поверх порожнього масиву) стер би всю
 * історію остаточно. Відкладене можна дістати експортом бекапу.
 */
async function readJSON<T>(key: string, fallback: T): Promise<T> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    if (raw != null) {
      // не через readJSON — інакше рекурсія на пошкодженому ключі
      AsyncStorage.setItem(`${key}:corrupt:${Date.now()}`, raw).catch(() => {});
    }
    return fallback;
  }
}

/**
 * Черга операцій «прочитати → змінити → записати» для одного ключа.
 *
 * Без неї два одночасні виклики (подвійний тап на «Зберегти», паралельне
 * збереження ваги й вимірів) читають однаковий масив, і другий запис
 * перетирає перший.
 */
const writeQueues = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  // fn запускається і після успіху, і після помилки попередньої операції —
  // одна невдача не має заблокувати чергу назавжди
  const next = prev.then(fn, fn);
  writeQueues.set(key, next.catch(() => undefined));
  return next;
}

// --- User Profile ---
export async function getUserProfile(): Promise<UserProfile | null> {
  return readJSON<UserProfile | null>(KEYS.USER_PROFILE, null);
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
}

// --- Goals ---
export async function getGoals(): Promise<Goal[]> {
  return readJSON<Goal[]>(KEYS.GOALS, []);
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(goals));
}

export async function addGoal(goal: Goal): Promise<void> {
  await withLock(KEYS.GOALS, async () => {
    const goals = await getGoals();
    goals.push(goal);
    await saveGoals(goals);
  });
}

export async function updateGoal(updated: Goal): Promise<void> {
  await withLock(KEYS.GOALS, async () => {
    const goals = await getGoals();
    const idx = goals.findIndex((g) => g.id === updated.id);
    if (idx !== -1) goals[idx] = updated;
    await saveGoals(goals);
  });
}

export async function deleteGoal(id: string): Promise<void> {
  await withLock(KEYS.GOALS, async () => {
    const goals = await getGoals();
    await saveGoals(goals.filter((g) => g.id !== id));
  });
}

// --- Workouts ---
export async function getWorkouts(): Promise<WorkoutEntry[]> {
  return readJSON<WorkoutEntry[]>(KEYS.WORKOUTS, []);
}

export async function saveWorkouts(workouts: WorkoutEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.WORKOUTS, JSON.stringify(workouts));
}

export async function addWorkout(workout: WorkoutEntry): Promise<void> {
  await withLock(KEYS.WORKOUTS, async () => {
    const workouts = await getWorkouts();
    workouts.unshift(workout); // newest first
    await saveWorkouts(workouts);
  });
}

export async function updateWorkout(updated: WorkoutEntry): Promise<void> {
  await withLock(KEYS.WORKOUTS, async () => {
    const workouts = await getWorkouts();
    const idx = workouts.findIndex((w) => w.id === updated.id);
    if (idx !== -1) workouts[idx] = updated;
    await saveWorkouts(workouts);
  });
}

export async function deleteWorkout(id: string): Promise<void> {
  await withLock(KEYS.WORKOUTS, async () => {
    const workouts = await getWorkouts();
    await saveWorkouts(workouts.filter((w) => w.id !== id));
  });
}

export async function getWorkoutsForDate(date: string): Promise<WorkoutEntry[]> {
  const workouts = await getWorkouts();
  return workouts.filter((w) => w.date === date);
}

export async function getRecentWorkouts(limit = 7): Promise<WorkoutEntry[]> {
  const workouts = await getWorkouts();
  return workouts.slice(0, limit);
}

// --- Training Plan ---
export async function getTrainingPlan(): Promise<TrainingPlan | null> {
  return readJSON<TrainingPlan | null>(KEYS.TRAINING_PLAN, null);
}

export async function saveTrainingPlan(plan: TrainingPlan): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRAINING_PLAN, JSON.stringify(plan));
}

// --- Chat History ---
export async function getChatHistory(): Promise<ChatMessage[]> {
  return readJSON<ChatMessage[]>(KEYS.CHAT_HISTORY, []);
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  // Keep only last 100 messages to avoid bloat
  const trimmed = messages.slice(-100);
  await AsyncStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
}

export async function clearChatHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CHAT_HISTORY);
}

// --- Nutritionist Chat History ---
export async function getNutritionistChatHistory(): Promise<ChatMessage[]> {
  return readJSON<ChatMessage[]>(KEYS.NUTRITIONIST_CHAT_HISTORY, []);
}

export async function saveNutritionistChatHistory(messages: ChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.NUTRITIONIST_CHAT_HISTORY, JSON.stringify(messages.slice(-100)));
}

export async function clearNutritionistChatHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.NUTRITIONIST_CHAT_HISTORY);
}

// --- Daily Advice Cache ---
interface DailyAdviceCache {
  date: string; // YYYY-MM-DD
  text: string;
}

export async function getCachedDailyAdvice(): Promise<string | null> {
  const cache = await readJSON<DailyAdviceCache | null>(KEYS.DAILY_ADVICE, null);
  if (!cache) return null;
  const today = getLocalDateString(new Date());
  return cache.date === today ? cache.text : null;
}

export async function saveDailyAdviceCache(text: string): Promise<void> {
  const cache: DailyAdviceCache = { date: getLocalDateString(new Date()), text };
  await AsyncStorage.setItem(KEYS.DAILY_ADVICE, JSON.stringify(cache));
}

// --- Trainer Context Cache (2-hour TTL) ---
const TRAINER_CONTEXT_TTL = 2 * 60 * 60 * 1000; // 2 hours

export async function getCachedTrainerContext(): Promise<{ text: string; ts: number } | null> {
  const cache = await readJSON<{ text: string; ts: number } | null>(KEYS.TRAINER_CONTEXT, null);
  if (!cache) return null;
  if (Date.now() - cache.ts > TRAINER_CONTEXT_TTL) return null;
  return cache;
}

export async function saveTrainerContextCache(text: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRAINER_CONTEXT, JSON.stringify({ text, ts: Date.now() }));
}

export async function clearTrainerContextCache(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.TRAINER_CONTEXT);
}

// --- Weight Log ---
export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weight: number; // kg
}

export async function getWeightLog(): Promise<WeightEntry[]> {
  return readJSON<WeightEntry[]>(KEYS.WEIGHT_LOG, []);
}

export async function addWeightEntry(entry: WeightEntry): Promise<void> {
  await withLock(KEYS.WEIGHT_LOG, async () => {
    const log = await getWeightLog();
    // Replace entry for same date if exists
    const idx = log.findIndex((e) => e.date === entry.date);
    if (idx !== -1) {
      log[idx] = entry;
    } else {
      log.push(entry);
    }
    log.sort((a, b) => a.date.localeCompare(b.date));
    await AsyncStorage.setItem(KEYS.WEIGHT_LOG, JSON.stringify(log));
  });
}

// --- Personal Records ---
export interface PersonalRecord {
  exerciseName: string;
  maxWeight: number; // kg
  maxWeightReps?: number;
  maxReps: number;
  date: string; // when max was set
}

/**
 * Найбільша вага і найбільше повторів по кожній вправі.
 *
 * Це НЕ те саме, що `analytics.getPersonalRecords` — та рахує найкращий
 * розрахунковий 1RM. Тут — сирі максимуми для показу й пам'яті AI.
 *
 * `workouts` можна передати, якщо масив уже завантажено, — інакше
 * екран прогресу перечитував би всю історію ще раз.
 */
export async function getPersonalRecords(workouts?: WorkoutEntry[]): Promise<PersonalRecord[]> {
  const all = workouts ?? await getWorkouts();
  const map = new Map<string, PersonalRecord>();

  for (const workout of all) {
    for (const ex of workout.exercises) {
      if (!ex.name) continue;
      const key = ex.name.toLowerCase().trim();
      const existing = map.get(key);

      const newRecord: PersonalRecord = existing
        ? { ...existing }
        : { exerciseName: ex.name, maxWeight: 0, maxReps: 0, date: workout.date };

      // Політні підходи: сумарні поля описують лише найважчий підхід, тому
      // максимум повторів треба шукати по всіх підходах, інакше піраміда
      // 80×5 / 85×5 / 90×3 давала б "максимум повторів: 3".
      const sets = ex.setsDetail && ex.setsDetail.length > 0
        ? ex.setsDetail
        : [{ weight: ex.weight, reps: ex.reps }];

      for (const set of sets) {
        if (set.weight && set.weight > newRecord.maxWeight) {
          newRecord.maxWeight = set.weight;
          newRecord.maxWeightReps = set.reps;
          newRecord.date = workout.date;
        }
        if (set.reps && set.reps > newRecord.maxReps) {
          newRecord.maxReps = set.reps;
        }
      }

      map.set(key, newRecord);
    }
  }

  return Array.from(map.values())
    .filter((r) => r.maxWeight > 0 || r.maxReps > 0)
    .sort((a, b) => b.maxWeight - a.maxWeight || b.maxReps - a.maxReps)
    .slice(0, 10);
}

// --- Body Measurements ---
export async function getMeasurements(): Promise<BodyMeasurement[]> {
  return readJSON<BodyMeasurement[]>(KEYS.MEASUREMENTS, []);
}

export async function addMeasurement(entry: BodyMeasurement): Promise<void> {
  await withLock(KEYS.MEASUREMENTS, async () => {
    const log = await getMeasurements();
    const idx = log.findIndex((e) => e.date === entry.date);
    if (idx !== -1) {
      log[idx] = { ...log[idx], ...entry }; // merge fields for same date
    } else {
      log.push(entry);
    }
    log.sort((a, b) => a.date.localeCompare(b.date));
    await AsyncStorage.setItem(KEYS.MEASUREMENTS, JSON.stringify(log));
  });
}

// --- Helpers ---
export function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Stats ---
/** `preloaded` — щоб не читати історію тренувань удруге, коли її вже завантажено. */
export async function getStats(preloaded?: WorkoutEntry[]): Promise<{
  totalWorkouts: number;
  weeklyWorkouts: number;
  monthlyWorkouts: number;
  totalDuration: number;
  streak: number;
}> {
  const [workouts, profile] = await Promise.all([
    preloaded ? Promise.resolve(preloaded) : getWorkouts(),
    getUserProfile(),
  ]);
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Current calendar week (Mon–Sun) — consistent with the weekly tracker on Home
  const weekStart = new Date(now);
  const dow = weekStart.getDay(); // 0=Sun
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekStartStr = getLocalDateString(weekStart);

  const weeklyWorkouts = workouts.filter((w) => w.date >= weekStartStr).length;
  const monthlyWorkouts = workouts.filter((w) => w.date >= getLocalDateString(monthAgo)).length;
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);

  // Streak using local dates. Planned rest days (not in profile.availableDays)
  // don't break the streak — training 3×/week by plan keeps the series alive.
  let streak = 0;
  const today = getLocalDateString(new Date());
  const workoutDates = new Set(workouts.map((w) => w.date));
  const plannedDays = profile?.availableDays?.length ? new Set(profile.availableDays) : null;
  const earliest = workouts.reduce((min, w) => (w.date < min ? w.date : min), today);
  let checkDate = new Date();
  while (true) {
    const dateStr = getLocalDateString(checkDate);
    if (dateStr < earliest) break; // nothing logged before this point
    if (workoutDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dateStr === today) {
      // Allow today to not have a workout yet without breaking streak
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (plannedDays && !plannedDays.has(checkDate.getDay())) {
      // Planned rest day — skip without breaking
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    totalWorkouts: workouts.length,
    weeklyWorkouts,
    monthlyWorkouts,
    totalDuration,
    streak,
  };
}
