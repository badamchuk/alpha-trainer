import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';

// Оновлення через GitHub Releases.
//
// scripts/release.js збирає APK і публікує його як реліз з тегом vX.Y.Z.
// Додаток на старті (і коли в нього повертаєшся) питає GitHub про
// останній реліз і, якщо той новіший, пропонує завантажити APK.
// Репозиторій публічний — токен не потрібен; ліміт API (60 запитів на
// годину з однієї IP) з великим запасом покриває перевірку раз на 6 годин.

export const REPO = 'badamchuk/alpha-trainer';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const KEY = '@alpha_trainer:update_check';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** Після «Пізніше» не нагадувати про ту саму версію добу */
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;   // '1.2.0'
  notes: string;     // опис релізу
  apkUrl: string | null;
  pageUrl: string;
}

interface UpdateState {
  lastCheck: number;
  latest: UpdateInfo | null;
  promptedVersion?: string;
  promptedAt?: number;
}

/** 'v1.2.3' → [1, 2, 3]; суфікси на кшталт '-beta' ігноруються. */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** > 0 — a новіша за b. Нерозбірлива версія вважається найстарішою. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a) ?? [0, 0, 0];
  const pb = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** Відповідь GitHub API → UpdateInfo; чернетки й пре-релізи не пропонуємо. */
export function parseRelease(json: any): UpdateInfo | null {
  if (!json || typeof json.tag_name !== 'string' || json.draft || json.prerelease) return null;
  const parsed = parseVersion(json.tag_name);
  if (!parsed) return null;
  const apk = Array.isArray(json.assets)
    ? json.assets.find((a: any) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'))
    : undefined;
  return {
    version: parsed.join('.'),
    notes: typeof json.body === 'string' ? json.body.trim() : '',
    apkUrl: typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : null,
    pageUrl: typeof json.html_url === 'string'
      ? json.html_url
      : `https://github.com/${REPO}/releases/latest`,
  };
}

export function currentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

function newerThanCurrent(info: UpdateInfo | null): UpdateInfo | null {
  return info && compareVersions(info.version, currentVersion()) > 0 ? info : null;
}

async function readState(): Promise<UpdateState> {
  const empty: UpdateState = { lastCheck: 0, latest: null };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? { ...empty, ...parsed } : empty;
  } catch {
    return empty; // це лише кеш — пошкоджений просто перечитаємо з мережі
  }
}

async function writeState(state: UpdateState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

async function fetchLatest(): Promise<UpdateInfo | null> {
  const res = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null; // релізів ще немає
  if (!res.ok) throw new Error(`GitHub відповів ${res.status}`);
  return parseRelease(await res.json());
}

/**
 * Новіша за встановлену версія або null.
 *
 * `force` — ручна перевірка з налаштувань: іде в мережу завжди й не ковтає
 * помилку, щоб її можна було показати. Автоматична перевірка бере кеш,
 * якщо з минулої не минуло 6 годин.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const state = await readState();
  if (!force && Date.now() - state.lastCheck < CHECK_EVERY_MS) {
    return newerThanCurrent(state.latest);
  }
  const latest = await fetchLatest();
  await writeState({ ...state, lastCheck: Date.now(), latest });
  return newerThanCurrent(latest);
}

/**
 * Браузер завантажує APK, тап по завантаженню відкриває встановлення.
 * Ставиться поверх наявного — дані лишаються, бо ключ підпису той самий.
 */
export function openUpdate(info: UpdateInfo): void {
  Linking.openURL(info.apkUrl ?? info.pageUrl).catch(() => {
    Linking.openURL(info.pageUrl).catch(() => {});
  });
}

export function showUpdateAlert(info: UpdateInfo): void {
  const notes = info.notes.length > 600 ? `${info.notes.slice(0, 600).trimEnd()}…` : info.notes;
  Alert.alert(
    `Доступна версія ${info.version}`,
    `Зараз у тебе ${currentVersion()}.${notes ? `\n\nЩо нового:\n${notes}` : ''}`,
    [
      { text: 'Пізніше', style: 'cancel' },
      { text: 'Оновити', onPress: () => openUpdate(info) },
    ],
  );
}

let inFlight: Promise<void> | null = null;

/**
 * Автоматична перевірка — на старті й при поверненні в додаток.
 * Помилки мережі мовчки ігнорує: без інтернету тренуватись теж треба.
 */
export function promptIfUpdateAvailable(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve(); // APK — лише для Android
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const info = await checkForUpdate();
        if (!info) return;
        const state = await readState();
        const remindedRecently = state.promptedVersion === info.version
          && Date.now() - (state.promptedAt ?? 0) < REMIND_EVERY_MS;
        if (remindedRecently) return;
        await writeState({ ...state, promptedVersion: info.version, promptedAt: Date.now() });
        showUpdateAlert(info);
      } catch {
        // наступна спроба — при наступному поверненні в додаток
      }
    })().finally(() => { inFlight = null; });
  }
  return inFlight;
}
