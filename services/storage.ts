import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, Goal, WorkoutEntry, TrainingPlan, ChatMessage } from '../types';

const KEYS = {
  USER_PROFILE: '@alpha_trainer:user_profile',
  GOALS: '@alpha_trainer:goals',
  WORKOUTS: '@alpha_trainer:workouts',
  TRAINING_PLAN: '@alpha_trainer:training_plan',
  CHAT_HISTORY: '@alpha_trainer:chat_history',
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

  const weeklyWorkouts = workouts.filter((w) => new Date(w.date) >= weekAgo).length;
  const monthlyWorkouts = workouts.filter((w) => new Date(w.date) >= monthAgo).length;
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);

  // Calculate streak
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  const workoutDates = new Set(workouts.map((w) => w.date));
  let checkDate = new Date();
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (workoutDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dateStr === today) {
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
