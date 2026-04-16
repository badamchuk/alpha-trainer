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
};

// --- User Profile ---
export async function getUserProfile(): Promise<UserProfile | null> {
  const json = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  return json ? JSON.parse(json) : null;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
}

// --- Goals ---
export async function getGoals(): Promise<Goal[]> {
  const json = await AsyncStorage.getItem(KEYS.GOALS);
  return json ? JSON.parse(json) : [];
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(goals));
}

export async function addGoal(goal: Goal): Promise<void> {
  const goals = await getGoals();
  goals.push(goal);
  await saveGoals(goals);
}

export async function updateGoal(updated: Goal): Promise<void> {
  const goals = await getGoals();
  const idx = goals.findIndex((g) => g.id === updated.id);
  if (idx !== -1) goals[idx] = updated;
  await saveGoals(goals);
}

export async function deleteGoal(id: string): Promise<void> {
  const goals = await getGoals();
  await saveGoals(goals.filter((g) => g.id !== id));
}

// --- Workouts ---
export async function getWorkouts(): Promise<WorkoutEntry[]> {
  const json = await AsyncStorage.getItem(KEYS.WORKOUTS);
  return json ? JSON.parse(json) : [];
}

export async function saveWorkouts(workouts: WorkoutEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.WORKOUTS, JSON.stringify(workouts));
}

export async function addWorkout(workout: WorkoutEntry): Promise<void> {
  const workouts = await getWorkouts();
  workouts.unshift(workout); // newest first
  await saveWorkouts(workouts);
}

export async function updateWorkout(updated: WorkoutEntry): Promise<void> {
  const workouts = await getWorkouts();
  const idx = workouts.findIndex((w) => w.id === updated.id);
  if (idx !== -1) workouts[idx] = updated;
  await saveWorkouts(workouts);
}

export async function deleteWorkout(id: string): Promise<void> {
  const workouts = await getWorkouts();
  await saveWorkouts(workouts.filter((w) => w.id !== id));
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
  const json = await AsyncStorage.getItem(KEYS.TRAINING_PLAN);
  return json ? JSON.parse(json) : null;
}

export async function saveTrainingPlan(plan: TrainingPlan): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRAINING_PLAN, JSON.stringify(plan));
}

// --- Chat History ---
export async function getChatHistory(): Promise<ChatMessage[]> {
  const json = await AsyncStorage.getItem(KEYS.CHAT_HISTORY);
  return json ? JSON.parse(json) : [];
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
  const json = await AsyncStorage.getItem(KEYS.NUTRITIONIST_CHAT_HISTORY);
  return json ? JSON.parse(json) : [];
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
  const json = await AsyncStorage.getItem(KEYS.DAILY_ADVICE);
  if (!json) return null;
  const cache: DailyAdviceCache = JSON.parse(json);
  const today = getLocalDateString(new Date());
  return cache.date === today ? cache.text : null;
}

export async function saveDailyAdviceCache(text: string): Promise<void> {
  const cache: DailyAdviceCache = { date: getLocalDateString(new Date()), text };
  await AsyncStorage.setItem(KEYS.DAILY_ADVICE, JSON.stringify(cache));
}

// --- Weight Log ---
export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weight: number; // kg
}

export async function getWeightLog(): Promise<WeightEntry[]> {
  const json = await AsyncStorage.getItem(KEYS.WEIGHT_LOG);
  return json ? JSON.parse(json) : [];
}

export async function addWeightEntry(entry: WeightEntry): Promise<void> {
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
}

// --- Personal Records ---
export interface PersonalRecord {
  exerciseName: string;
  maxWeight: number; // kg
  maxWeightReps?: number;
  maxReps: number;
  date: string; // when max was set
}

export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const workouts = await getWorkouts();
  const map = new Map<string, PersonalRecord>();

  for (const workout of workouts) {
    for (const ex of workout.exercises) {
      if (!ex.name) continue;
      const key = ex.name.toLowerCase().trim();
      const existing = map.get(key);

      const newRecord: PersonalRecord = existing
        ? { ...existing }
        : { exerciseName: ex.name, maxWeight: 0, maxReps: 0, date: workout.date };

      if (ex.weight && ex.weight > newRecord.maxWeight) {
        newRecord.maxWeight = ex.weight;
        newRecord.maxWeightReps = ex.reps;
        newRecord.date = workout.date;
      }
      if (ex.reps && ex.reps > newRecord.maxReps) {
        newRecord.maxReps = ex.reps;
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
  const json = await AsyncStorage.getItem(KEYS.MEASUREMENTS);
  return json ? JSON.parse(json) : [];
}

export async function addMeasurement(entry: BodyMeasurement): Promise<void> {
  const log = await getMeasurements();
  const idx = log.findIndex((e) => e.date === entry.date);
  if (idx !== -1) {
    log[idx] = { ...log[idx], ...entry }; // merge fields for same date
  } else {
    log.push(entry);
  }
  log.sort((a, b) => a.date.localeCompare(b.date));
  await AsyncStorage.setItem(KEYS.MEASUREMENTS, JSON.stringify(log));
}

// --- Helpers ---
export function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Stats ---
export async function getStats(): Promise<{
  totalWorkouts: number;
  weeklyWorkouts: number;
  monthlyWorkouts: number;
  totalDuration: number;
  streak: number;
}> {
  const workouts = await getWorkouts();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const weeklyWorkouts = workouts.filter((w) => w.date >= getLocalDateString(weekAgo)).length;
  const monthlyWorkouts = workouts.filter((w) => w.date >= getLocalDateString(monthAgo)).length;
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);

  // Calculate streak using local dates (not UTC)
  let streak = 0;
  const today = getLocalDateString(new Date());
  const workoutDates = new Set(workouts.map((w) => w.date));
  let checkDate = new Date();
  while (true) {
    const dateStr = getLocalDateString(checkDate);
    if (workoutDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dateStr === today) {
      // Allow today to not have a workout yet without breaking streak
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
