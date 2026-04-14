import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@alpha_trainer:wellbeing';

export interface WellbeingEntry {
  date: string;        // YYYY-MM-DD
  mood: 1 | 2 | 3 | 4 | 5;   // 1=terrible...5=great
  sleep: number;       // hours, 0–12
  stress: 1 | 2 | 3 | 4 | 5; // 1=none...5=high
  notes?: string;
}

export async function getWellbeingLog(): Promise<WellbeingEntry[]> {
  const json = await AsyncStorage.getItem(KEY);
  return json ? JSON.parse(json) : [];
}

export async function saveWellbeingEntry(entry: WellbeingEntry): Promise<void> {
  const log = await getWellbeingLog();
  const idx = log.findIndex((e) => e.date === entry.date);
  if (idx !== -1) {
    log[idx] = entry;
  } else {
    log.push(entry);
  }
  log.sort((a, b) => a.date.localeCompare(b.date));
  await AsyncStorage.setItem(KEY, JSON.stringify(log));
}

export async function getTodayWellbeing(today: string): Promise<WellbeingEntry | null> {
  const log = await getWellbeingLog();
  return log.find((e) => e.date === today) || null;
}

export async function getRecentWellbeing(days = 7): Promise<WellbeingEntry[]> {
  const log = await getWellbeingLog();
  return log.slice(-days);
}
