import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExerciseLog, WorkoutType } from '../types';
import { readJSON, withLock } from './storage';

const TEMPLATES_KEY = '@alpha_trainer:workout_templates';

export interface WorkoutTemplate {
  id: string;
  name: string;
  workoutType: WorkoutType;
  exercises: ExerciseLog[];
  createdAt: string;
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  return readJSON<WorkoutTemplate[]>(TEMPLATES_KEY, []);
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await withLock(TEMPLATES_KEY, async () => {
    const templates = await getTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx !== -1) {
      templates[idx] = template;
    } else {
      templates.unshift(template);
    }
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await withLock(TEMPLATES_KEY, async () => {
    const templates = await getTemplates();
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.filter((t) => t.id !== id)));
  });
}
