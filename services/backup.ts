/**
 * Backup / Restore via JSON file
 * Export → shares a .json file via system share sheet (user can save to Drive, email, Telegram, etc.)
 * Import → user picks a .json file from storage, data is restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// Новий об'єктний API expo-file-system: writeAsStringAsync/readAsStringAsync
// лишились для сумісності, але вже позначені застарілими й шумлять у консоль.
import { Directory, File, Paths } from 'expo-file-system';
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
  '@alpha_trainer:chat_history',
  '@alpha_trainer:nutritionist_chat_history',
  '@alpha_trainer:ai_memory',
  '@alpha_trainer:daily_advice',
  '@alpha_trainer:achievements',
  '@alpha_trainer:timer_prefs',
  '@alpha_trainer:update_check',
  '@alpha_trainer:exercise_links',
  '@alpha_trainer:custom_exercises',
  '@alpha_trainer:builder_draft',
  '@alpha_trainer:active_program',
];

export interface BackupFile {
  version: number;
  createdAt: string;
  appId: 'alpha_trainer';
  data: Record<string, string | null>;
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

/** Знімок усього сховища. Один для ручного експорту й для автокопії — щоб не розходились. */
async function collectBackup(): Promise<BackupFile> {
  const pairs = await AsyncStorage.multiGet(ALL_KEYS);
  const data: Record<string, string | null> = {};
  for (const [key, value] of pairs) {
    data[key] = value;
  }
  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appId: 'alpha_trainer',
    data,
  };
}

export async function exportBackup(): Promise<{ success: boolean; error?: string }> {
  try {
    const backup = await collectBackup();
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `alpha_trainer_backup_${date}.json`;
    const cacheDir = Paths.cache.uri;
    const filePath = `${cacheDir}${cacheDir.endsWith('/') ? '' : '/'}${fileName}`;

    new File(filePath).write(JSON.stringify(backup, null, 2));

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
    const content = await new File(asset.uri).text();

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

// ─── АВТОМАТИЧНА КОПІЯ ───────────────────────────────────────────────────────
//
// Історія тренувань живе в одному екземплярі на телефоні. Ручний експорт є, але
// його треба пам'ятати робити. Автокопія прикриває найчастіший випадок втрати:
// зламаний імпорт, випадкове очищення, збій при оновленні.
//
// Чого вона НЕ рятує: втрату чи заміну телефона — файл лежить у теці додатку й
// зникає разом із ним. Для цього потрібен ручний експорт «кудись назовні»,
// і саме так написано в Профілі.

const AUTO_KEY = '@alpha_trainer:auto_backup';
const AUTO_PREFIX = 'alpha_trainer_auto_';
const AUTO_INTERVAL_DAYS = 7;
const AUTO_KEEP = 3;

export interface AutoBackupState {
  lastAt: string;          // ISO
  lastFile: string;
}

export async function getAutoBackupState(): Promise<AutoBackupState | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_KEY);
    return raw ? (JSON.parse(raw) as AutoBackupState) : null;
  } catch {
    return null;
  }
}

function autoDir(): string {
  const dir = Paths.document.uri;
  return dir.endsWith('/') ? dir : `${dir}/`;
}

/** Файли автокопій, найновіший перший. */
export async function listAutoBackups(): Promise<string[]> {
  try {
    const dir = new Directory(autoDir());
    if (!dir.exists) return [];
    return dir.list()
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(AUTO_PREFIX) && name.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Пише копію, якщо з останньої минуло більше тижня.
 *
 * Тихо: помилка запису не має заважати відкрити додаток, тому все загорнуте.
 * `force` — для кнопки «Зберегти зараз».
 */
export async function autoBackup(force = false): Promise<AutoBackupState | null> {
  try {
    const state = await getAutoBackupState();
    if (!force && state) {
      const ageDays = (Date.now() - new Date(state.lastAt).getTime()) / 86_400_000;
      // Позначка може брехати: користувач почистив сховище додатку, а запис
      // лишився. Тоді копії фактично немає — пишемо заново, не чекаючи тижня.
      const stillThere = new File(`${autoDir()}${state.lastFile}`).exists;
      if (ageDays < AUTO_INTERVAL_DAYS && stillThere) return state;
    }

    const backup = await collectBackup();
    const stamp = backup.createdAt.slice(0, 10);
    const fileName = `${AUTO_PREFIX}${stamp}.json`;
    new File(`${autoDir()}${fileName}`).write(JSON.stringify(backup));

    // лишаємо три останні: більше не має сенсу, а місце на телефоні не гумове
    const files = await listAutoBackups();
    for (const old of files.slice(AUTO_KEEP)) {
      try { new File(`${autoDir()}${old}`).delete(); } catch { /* уже немає */ }
    }

    const next: AutoBackupState = { lastAt: backup.createdAt, lastFile: fileName };
    await AsyncStorage.setItem(AUTO_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

/** Поділитись останньою автокопією (Профіль). */
export async function shareAutoBackup(): Promise<{ success: boolean; error?: string }> {
  const state = await getAutoBackupState();
  if (!state) return { success: false, error: 'Автокопії ще немає' };
  try {
    const path = `${autoDir()}${state.lastFile}`;
    if (!new File(path).exists) return { success: false, error: 'Файл копії не знайдено' };
    if (!(await Sharing.isAvailableAsync())) {
      return { success: false, error: 'Sharing не підтримується на цьому пристрої' };
    }
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: 'Зберегти резервну копію',
      UTI: 'public.json',
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
