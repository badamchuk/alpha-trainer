import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDateString } from './storage';
import { UserProfile } from '../types';

const WATER_KEY = '@alpha_trainer:water';
const DEFAULT_GOAL = 8;

interface DailyWater {
  date: string;
  glasses: number;
  goal: number;
}

/**
 * Computes personalized daily water goal (in glasses of 250ml) based on user profile.
 *
 * Formula:
 *   base = weight_kg × activityFactor  (ml)
 *   activityFactor = 30..40 ml/kg depending on workout days per week
 *   age >55 → ×0.92 reduction
 *   result clamped to [6, 12] glasses
 */
export function computeWaterGoal(profile: UserProfile): number {
  const weightKg = profile.weight || 70;
  const workoutDays = (profile.availableDays || []).length;

  // 30 ml/kg sedentary → 40 ml/kg very active (5+ days)
  const activityFactor = 30 + Math.min(10, workoutDays * 1.5);
  let ml = weightKg * activityFactor;

  // Age-based reduction for 55+
  const age = profile.age || 25;
  if (age > 55) ml *= 0.92;

  const glasses = Math.round(ml / 250);
  return Math.max(6, Math.min(12, glasses));
}

async function getToday(): Promise<DailyWater> {
  const today = getLocalDateString(new Date());
  const json = await AsyncStorage.getItem(WATER_KEY);
  if (!json) return { date: today, glasses: 0, goal: DEFAULT_GOAL };
  const data: DailyWater = JSON.parse(json);
  // Reset if new day (preserve goal)
  if (data.date !== today) return { date: today, glasses: 0, goal: data.goal || DEFAULT_GOAL };
  return data;
}

export async function getWaterData(): Promise<DailyWater> {
  return getToday();
}

export async function addGlass(): Promise<DailyWater> {
  const data = await getToday();
  const updated = { ...data, glasses: data.glasses + 1 };
  await AsyncStorage.setItem(WATER_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeGlass(): Promise<DailyWater> {
  const data = await getToday();
  const updated = { ...data, glasses: Math.max(0, data.glasses - 1) };
  await AsyncStorage.setItem(WATER_KEY, JSON.stringify(updated));
  return updated;
}

export async function setWaterGoal(goal: number): Promise<void> {
  const data = await getToday();
  await AsyncStorage.setItem(WATER_KEY, JSON.stringify({ ...data, goal }));
}
