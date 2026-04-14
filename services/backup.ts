/**
 * Backup / Restore via JSON file
 * Export → shares a .json file via system share sheet (user can save to Drive, email, Telegram, etc.)
 * Import → user picks a .json file from storage, data is restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths, writeAsStringAsync, readAsStringAsync } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const BACKUP_VERSION = 1;

const ALL_KEYS = [
  '@alpha_trainer:user_profile',
  '@alpha_trainer:goals',
  '@alpha_trainer:workouts',
  '@alpha_trainer:training_plan',
  '@alpha_trainer:weight_log',
  '@alpha_trainer:measurements',
  '@alpha_trainer:water',
  '@alpha_trainer:workout_templates',
  '@alpha_trainer:language',
  '@alpha_trainer:exercise_language',
  '@alpha_trainer:wellbeing',
  '@alpha_trainer:nutrition',
  '@alpha_trainer:nutrition_goals',
  '@alpha_trainer:nutrition_library',
  '@alpha_trainer:water_reminders',
  '@alpha_trainer:water_reminder_range',
];

export interface BackupFile {
  version: number;
  createdAt: string;
  appId: 'alpha_trainer';
  data: Record<string, string | null>;
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<{ success: boolean; error?: string }> {
  try {
    const pairs = await AsyncStorage.multiGet(ALL_KEYS);
    const data: Record<string, string | null> = {};
    for (const [key, value] of pairs) {
      data[key] = value;
    }

    const backup: BackupFile = {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      appId: 'alpha_trainer',
      data,
    };

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `alpha_trainer_backup_${date}.json`;
    const cacheDir = Paths.cache.uri;
    const filePath = `${cacheDir}${cacheDir.endsWith('/') ? '' : '/'}${fileName}`;

    await writeAsStringAsync(filePath, JSON.stringify(backup, null, 2));

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { success: false, error: 'Sharing не підтримується на цьому пристрої' };
    }

    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Зберегти резервну копію',
      UTI: 'public.json',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

// ─── IMPORT ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  createdAt?: string;
  itemCount?: number;
  error?: string;
}

export async function importBackup(): Promise<ImportResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return { success: false, error: 'Скасовано' };
    }

    const asset = result.assets[0];
    const content = await readAsStringAsync(asset.uri);

    const backup: BackupFile = JSON.parse(content);

    if (backup.appId !== 'alpha_trainer') {
      return { success: false, error: 'Невірний файл резервної копії' };
    }

    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(backup.data)) {
      if (value !== null && value !== undefined) {
        pairs.push([key, value]);
      }
    }

    if (pairs.length === 0) {
      return { success: false, error: 'Файл порожній або пошкоджений' };
    }

    await AsyncStorage.multiSet(pairs);

    return {
      success: true,
      createdAt: backup.createdAt,
      itemCount: pairs.length,
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
