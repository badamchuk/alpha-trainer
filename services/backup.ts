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
import { TFn, translate } from './i18n';

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

const PROFILE_KEY = '@alpha_trainer:user_profile';
const LANG_KEYS = new Set(['@alpha_trainer:language', '@alpha_trainer:exercise_language']);

/** Ключі, де лежить список: інший тип у файлі зламав би екрани, що роблять .map/.filter. */
const ARRAY_KEYS = new Set([
  '@alpha_trainer:goals',
  '@alpha_trainer:workouts',
  '@alpha_trainer:weight_log',
  '@alpha_trainer:measurements',
  '@alpha_trainer:workout_templates',
  '@alpha_trainer:chat_history',
  '@alpha_trainer:nutritionist_chat_history',
  '@alpha_trainer:custom_exercises',
]);

/**
 * Ключі AI вирізаються з будь-якої копії.
 *
 * Файл копії летить у месенджер, пошту чи хмару — ключ від чужого рахунку
 * Groq/Gemini туди потрапляти не повинен. Після відновлення ключ вводиться ще
 * раз (або лишається той, що вже є в додатку: імпорт його не затирає).
 */
export function stripSecrets(rawProfile: string | null): string | null {
  if (!rawProfile) return rawProfile;
  try {
    const profile = JSON.parse(rawProfile);
    if (!profile || typeof profile !== 'object') return rawProfile;
    const { groqApiKey: _g, geminiApiKey: _m, ...rest } = profile;
    return JSON.stringify({ ...rest, geminiApiKey: '' });
  } catch {
    return null;   // зіпсований профіль у копію не кладемо
  }
}

/** Знімок усього сховища. Один для ручного експорту й для автокопії — щоб не розходились. */
async function collectBackup(): Promise<BackupFile> {
  const pairs = await AsyncStorage.multiGet(ALL_KEYS);
  const data: Record<string, string | null> = {};
  for (const [key, value] of pairs) {
    data[key] = key === PROFILE_KEY ? stripSecrets(value) : value;
  }
  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appId: 'alpha_trainer',
    data,
  };
}

/**
 * Чому не вийшло — кодом.
 *
 * Текст показує екран: сервіс не знає мови інтерфейсу. `error` лишається для
 * несподіваних винятків, де є лише повідомлення системи.
 */
export type BackupErrorCode =
  | 'cancelled' | 'sharingUnsupported' | 'badFile' | 'emptyFile' | 'fileMissing';

export interface BackupResult {
  success: boolean;
  errorCode?: BackupErrorCode;
  error?: string;
}

const BACKUP_ERR_KEY: Record<BackupErrorCode, string> = {
  cancelled: 'backupErrCancelled',
  sharingUnsupported: 'backupErrSharing',
  badFile: 'backupErrBadFile',
  emptyFile: 'backupErrEmptyFile',
  fileMissing: 'backupErrFileMissing',
};

/** Повідомлення про збій словами: код перекладаємо, системний текст лишаємо як є. */
export function backupErrorText(r: BackupResult, t: TFn): string {
  if (r.errorCode) return t(BACKUP_ERR_KEY[r.errorCode]);
  return r.error ?? '';
}

export async function exportBackup(): Promise<BackupResult> {
  try {
    const backup = await collectBackup();
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `alpha_trainer_backup_${date}.json`;
    const cacheDir = Paths.cache.uri;
    const filePath = `${cacheDir}${cacheDir.endsWith('/') ? '' : '/'}${fileName}`;

    new File(filePath).write(JSON.stringify(backup, null, 2));

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { success: false, errorCode: 'sharingUnsupported' };
    }

    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: translate('saveBackupDialog'),
      UTI: 'public.json',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

// ─── IMPORT ──────────────────────────────────────────────────────────────────

export interface ImportResult extends BackupResult {
  createdAt?: string;
  itemCount?: number;
}

/**
 * Що з файлу можна пустити в сховище.
 *
 * Лише відомі ключі й лише вміст, який розбирається й має очікуваний тип.
 * Чужий або пошкоджений файл інакше поклав би, скажімо, рядок замість списку
 * тренувань — і журнал падав би при кожному відкритті.
 */
export function sanitizeImport(
  data: Record<string, unknown>,
  currentProfileRaw: string | null,
): [string, string][] {
  const allowed = new Set(ALL_KEYS);
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key) || typeof value !== 'string') continue;

    if (LANG_KEYS.has(key)) {
      if (value === 'uk' || value === 'en') out.push([key, value]);
      continue;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { continue; }
    if (ARRAY_KEYS.has(key) && !Array.isArray(parsed)) continue;

    if (key === PROFILE_KEY) {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      // ключі AI в копії не їздять — лишаємо ті, що вже введені в додатку
      let keys: { groqApiKey?: string; geminiApiKey?: string } = {};
      try {
        const cur = currentProfileRaw ? JSON.parse(currentProfileRaw) : null;
        if (cur && typeof cur === 'object') {
          keys = { groqApiKey: cur.groqApiKey, geminiApiKey: cur.geminiApiKey };
        }
      } catch { /* поточного профілю немає або він зіпсований */ }
      const p = parsed as Record<string, unknown>;
      out.push([key, JSON.stringify({
        ...p,
        groqApiKey: keys.groqApiKey ?? p.groqApiKey,
        geminiApiKey: keys.geminiApiKey || p.geminiApiKey || '',
      })]);
      continue;
    }

    out.push([key, value]);
  }
  return out;
}

export async function importBackup(): Promise<ImportResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return { success: false, errorCode: 'cancelled' };
    }

    const asset = result.assets[0];
    const content = await new File(asset.uri).text();

    let backup: BackupFile;
    try {
      backup = JSON.parse(content);
    } catch {
      return { success: false, errorCode: 'badFile' };
    }

    if (backup?.appId !== 'alpha_trainer' || !backup.data || typeof backup.data !== 'object') {
      return { success: false, errorCode: 'badFile' };
    }

    const current = await AsyncStorage.getItem(PROFILE_KEY);
    const pairs = sanitizeImport(backup.data, current);

    if (pairs.length === 0) {
      return { success: false, errorCode: 'emptyFile' };
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
export async function shareAutoBackup(): Promise<BackupResult> {
  const state = await getAutoBackupState();
  if (!state) return { success: false, error: translate('noAutoBackupYet') };
  try {
    const path = `${autoDir()}${state.lastFile}`;
    if (!new File(path).exists) return { success: false, errorCode: 'fileMissing' };
    if (!(await Sharing.isAvailableAsync())) {
      return { success: false, errorCode: 'sharingUnsupported' };
    }
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: translate('saveBackupDialog'),
      UTI: 'public.json',
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
