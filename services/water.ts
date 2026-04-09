import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDateString } from './storage';

const WATER_KEY = '@alpha_trainer:water';
const DEFAULT_GOAL = 8;

interface DailyWater {
  date: string;
  glasses: number;
  goal: number;
}

async function getToday(): Promise<DailyWater> {
  const today = getLocalDateString(new Date());
  const json = await AsyncStorage.getItem(WATER_KEY);
  if (!json) return { date: today, glasses: 0, goal: DEFAULT_GOAL };
  const data: DailyWater = JSON.parse(json);
  // Reset if new day
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
