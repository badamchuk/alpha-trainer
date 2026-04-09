import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExerciseLog, WorkoutType } from '../types';

const TEMPLATES_KEY = '@alpha_trainer:workout_templates';

export interface WorkoutTemplate {
  id: string;
  name: string;
  workoutType: WorkoutType;
  exercises: ExerciseLog[];
  createdAt: string;
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const json = await AsyncStorage.getItem(TEMPLATES_KEY);
  return json ? JSON.parse(json) : [];
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  const templates = await getTemplates();
  const idx = templates.findIndex((t) => t.id === template.id);
  if (idx !== -1) {
    templates[idx] = template;
  } else {
    templates.unshift(template);
  }
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await getTemplates();
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.filter((t) => t.id !== id)));
}
