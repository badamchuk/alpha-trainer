import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';

const KEY = '@alpha_trainer:nutrition';
const GOALS_KEY = '@alpha_trainer:nutrition_goals';
const LIBRARY_KEY = '@alpha_trainer:nutrition_library';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedFoodItem {
  name: string;
  qty: string;     // "2 шт", "30г", "1 порція"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface MealEntry {
  id: string;
  time: string;      // "HH:MM"
  name: string;      // user-given name or auto-generated
  rawText: string;   // what user typed
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  items: ParsedFoodItem[];
}

export interface DailyNutrition {
  date: string;      // YYYY-MM-DD
  meals: MealEntry[];
}

export type NutritionMode = 'cut' | 'maintain' | 'bulk';

export interface NutritionGoals {
  calories: number;
  protein: number;   // г
  carbs: number;     // г
  fat: number;       // г
  mode: NutritionMode;
}

// ─── Goal Calculation ─────────────────────────────────────────────────────────

export function calculateNutritionGoals(
  profile: UserProfile,
  mode: NutritionMode = 'maintain',
): NutritionGoals {
  const { weight, height, age } = profile;

  // Mifflin-St Jeor BMR: male +5, female −161
  const genderOffset = profile.gender === 'female' ? -161 : 5;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;

  // Activity multiplier based on training days + fitness level
  const days = profile.availableDays?.length ?? 3;
  const baseMultiplier =
    days <= 2 ? 1.375 :
    days <= 4 ? 1.55 :
    days <= 6 ? 1.725 : 1.9;
  // Advanced athletes burn slightly more at rest (higher muscle mass, metabolic efficiency)
  const levelOffset = profile.fitnessLevel === 'advanced' ? 0.05 : profile.fitnessLevel === 'intermediate' ? 0.025 : 0;
  const activityMultiplier = baseMultiplier + levelOffset;

  const tdee = Math.round(bmr * activityMultiplier);

  const calorieAdjust = mode === 'cut' ? -350 : mode === 'bulk' ? 275 : 0;
  const calories = Math.round(tdee + calorieAdjust);

  // Protein: 2.0g per kg for active person
  const protein = Math.round(weight * 2.0);
  // Fat: ~25% of calories
  const fat = Math.round((calories * 0.25) / 9);
  // Carbs: remainder
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);

  return { calories, protein, carbs, fat, mode };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function getNutritionGoals(): Promise<NutritionGoals | null> {
  const json = await AsyncStorage.getItem(GOALS_KEY);
  return json ? JSON.parse(json) : null;
}

export async function saveNutritionGoals(goals: NutritionGoals): Promise<void> {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

async function getAllNutrition(): Promise<DailyNutrition[]> {
  const json = await AsyncStorage.getItem(KEY);
  return json ? JSON.parse(json) : [];
}

export async function getDailyNutrition(date: string): Promise<DailyNutrition> {
  const all = await getAllNutrition();
  return all.find((d) => d.date === date) ?? { date, meals: [] };
}

export async function saveDailyNutrition(entry: DailyNutrition): Promise<void> {
  const all = await getAllNutrition();
  const idx = all.findIndex((d) => d.date === entry.date);
  if (idx !== -1) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }
  // Keep only last 90 days
  all.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = all.slice(-90);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
}

export async function addMeal(date: string, meal: MealEntry): Promise<DailyNutrition> {
  const daily = await getDailyNutrition(date);
  daily.meals.push(meal);
  await saveDailyNutrition(daily);
  return daily;
}

export async function removeMeal(date: string, mealId: string): Promise<DailyNutrition> {
  const daily = await getDailyNutrition(date);
  daily.meals = daily.meals.filter((m) => m.id !== mealId);
  await saveDailyNutrition(daily);
  return daily;
}

export async function updateMeal(date: string, meal: MealEntry): Promise<DailyNutrition> {
  const daily = await getDailyNutrition(date);
  const idx = daily.meals.findIndex((m) => m.id === meal.id);
  if (idx !== -1) daily.meals[idx] = meal;
  await saveDailyNutrition(daily);
  return daily;
}

export async function getNutritionHistory(days = 7): Promise<DailyNutrition[]> {
  const all = await getAllNutrition();
  return all.slice(-days);
}

// ─── Food Library (frequently eaten items) ────────────────────────────────────

export interface SavedMeal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  items: ParsedFoodItem[];
  usageCount: number;
}

export async function getFoodLibrary(): Promise<SavedMeal[]> {
  const json = await AsyncStorage.getItem(LIBRARY_KEY);
  const items: SavedMeal[] = json ? JSON.parse(json) : [];
  return items.sort((a, b) => b.usageCount - a.usageCount);
}

export async function saveToFoodLibrary(meal: Omit<SavedMeal, 'id' | 'usageCount'>): Promise<void> {
  const lib = await getFoodLibrary();
  const existing = lib.find(
    (m) => m.name.toLowerCase() === meal.name.toLowerCase()
  );
  if (existing) {
    existing.usageCount++;
    existing.calories = meal.calories;
    existing.protein = meal.protein;
    existing.carbs = meal.carbs;
    existing.fat = meal.fat;
    if (meal.fiber !== undefined) existing.fiber = meal.fiber;
  } else {
    lib.push({ ...meal, id: Date.now().toString(), usageCount: 1 });
  }
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(lib.slice(0, 50)));
}

export async function removeFromFoodLibrary(id: string): Promise<void> {
  const lib = await getFoodLibrary();
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(lib.filter((m) => m.id !== id)));
}

// ─── Daily totals helper ──────────────────────────────────────────────────────

export function getDailyTotals(daily: DailyNutrition) {
  return daily.meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      fiber: acc.fiber + (m.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}
