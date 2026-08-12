import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@alpha_trainer:timer_prefs';

export interface TimerScheme {
  id: string;
  name: string;
  mode: 'rest' | 'interval';
  restSecs: number;
  rounds: number;
  workSecs: number;
  breakSecs: number;
}

interface TimerPrefs {
  recentRest: number[];
  recentWork: number[];
  recentBreak: number[];
  schemes: TimerScheme[];
}

const DEFAULT: TimerPrefs = {
  recentRest: [60, 90, 120],
  recentWork: [40, 30, 20],
  recentBreak: [20, 15, 10],
  schemes: [],
};

export async function getTimerPrefs(): Promise<TimerPrefs> {
  try {
    const json = await AsyncStorage.getItem(KEY);
    if (!json) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT };
  }
}

async function savePrefs(prefs: TimerPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}

function push5(arr: number[], val: number): number[] {
  return [val, ...arr.filter((v) => v !== val)].slice(0, 5);
}

export async function recordRestUsed(secs: number): Promise<void> {
  const p = await getTimerPrefs();
  await savePrefs({ ...p, recentRest: push5(p.recentRest, secs) });
}

export async function recordWorkUsed(secs: number): Promise<void> {
  const p = await getTimerPrefs();
  await savePrefs({ ...p, recentWork: push5(p.recentWork, secs) });
}

export async function recordBreakUsed(secs: number): Promise<void> {
  const p = await getTimerPrefs();
  await savePrefs({ ...p, recentBreak: push5(p.recentBreak, secs) });
}

export async function saveScheme(scheme: TimerScheme): Promise<void> {
  const p = await getTimerPrefs();
  const idx = p.schemes.findIndex((s) => s.id === scheme.id);
  if (idx !== -1) p.schemes[idx] = scheme;
  else p.schemes = [scheme, ...p.schemes].slice(0, 20);
  await savePrefs(p);
}

export async function deleteScheme(id: string): Promise<void> {
  const p = await getTimerPrefs();
  await savePrefs({ ...p, schemes: p.schemes.filter((s) => s.id !== id) });
}
