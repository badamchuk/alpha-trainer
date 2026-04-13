/**
 * Google Drive Backup Service
 *
 * Backs up / restores all AsyncStorage data to a file in the user's
 * Google Drive appDataFolder (app-private, not visible in Drive UI).
 *
 * Setup required (see README or onboarding):
 *   1. Create Google Cloud project
 *   2. Enable Google Drive API
 *   3. Create OAuth 2.0 credentials (Android + Web)
 *   4. Download google-services.json → android/app/
 *   5. Set WEB_CLIENT_ID below
 */

import {
  GoogleSignin,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Replace with your OAuth 2.0 Web Client ID from Google Cloud Console
export let WEB_CLIENT_ID = '';

export function setGoogleClientId(id: string) {
  WEB_CLIENT_ID = id;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_FILENAME = 'alpha_trainer_backup.json';
const BACKUP_VERSION = 2;

// ─── ALL KEYS TO BACKUP ───────────────────────────────────────────────────────
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
];

// ─── INIT ─────────────────────────────────────────────────────────────────────
export function initGoogleSignIn(webClientId: string) {
  WEB_CLIENT_ID = webClientId;
  GoogleSignin.configure({
    webClientId,
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    offlineAccess: false,
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export async function signIn(): Promise<User> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();
  return userInfo.data!;
}

export async function signOut(): Promise<void> {
  await GoogleSignin.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const user = await GoogleSignin.getCurrentUser();
    return user;
  } catch {
    return null;
  }
}

export async function isSignedIn(): Promise<boolean> {
  try {
    return await GoogleSignin.hasPreviousSignIn();
  } catch {
    return false;
  }
}

async function getAccessToken(): Promise<string> {
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

// ─── BACKUP DATA ──────────────────────────────────────────────────────────────
export interface BackupData {
  version: number;
  createdAt: string;
  deviceInfo: string;
  data: Record<string, string | null>;
}

export async function collectBackupData(): Promise<BackupData> {
  const pairs = await AsyncStorage.multiGet(ALL_KEYS);
  const data: Record<string, string | null> = {};
  for (const [key, value] of pairs) {
    data[key] = value;
  }
  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    deviceInfo: 'android',
    data,
  };
}

export async function restoreBackupData(backup: BackupData): Promise<void> {
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(backup.data)) {
    if (value !== null && value !== undefined) {
      pairs.push([key, value]);
    }
  }
  if (pairs.length > 0) {
    await AsyncStorage.multiSet(pairs);
  }
}

// ─── DRIVE FILE OPS ──────────────────────────────────────────────────────────
async function findBackupFile(token: string): Promise<string | null> {
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const json = await res.json();
  return json.files?.[0]?.id ?? null;
}

async function deleteFile(token: string, fileId: string): Promise<void> {
  await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function uploadBackup(token: string, backup: BackupData, existingFileId?: string | null): Promise<string> {
  const content = JSON.stringify(backup);
  const metadata = {
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
    ...(!existingFileId ? { parents: ['appDataFolder'] } : {}),
  };

  // Multipart upload
  const boundary = '-------314159265358979323846';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  const url = existingFileId
    ? `${UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${err}`);
  }
  const json = await res.json();
  return json.id;
}

async function downloadBackup(token: string, fileId: string): Promise<BackupData> {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return await res.json();
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export interface BackupResult {
  success: boolean;
  fileId?: string;
  createdAt?: string;
  error?: string;
}

export async function backupToGoogleDrive(): Promise<BackupResult> {
  try {
    const token = await getAccessToken();
    const backup = await collectBackupData();
    const existingId = await findBackupFile(token);
    const fileId = await uploadBackup(token, backup, existingId);
    return { success: true, fileId, createdAt: backup.createdAt };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

export interface RestoreResult {
  success: boolean;
  createdAt?: string;
  itemCount?: number;
  error?: string;
}

export async function restoreFromGoogleDrive(): Promise<RestoreResult> {
  try {
    const token = await getAccessToken();
    const fileId = await findBackupFile(token);
    if (!fileId) return { success: false, error: 'Резервна копія не знайдена' };
    const backup = await downloadBackup(token, fileId);
    await restoreBackupData(backup);
    return {
      success: true,
      createdAt: backup.createdAt,
      itemCount: Object.values(backup.data).filter(Boolean).length,
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

export async function getBackupInfo(): Promise<{ exists: boolean; modifiedTime?: string } > {
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,modifiedTime)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json();
    const file = json.files?.[0];
    if (!file) return { exists: false };
    return { exists: true, modifiedTime: file.modifiedTime };
  } catch {
    return { exists: false };
  }
}
