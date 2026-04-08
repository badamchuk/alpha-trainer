import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutEntry } from '../types';
import { WeightEntry, PersonalRecord, getLocalDateString } from './storage';

const MEMORY_KEY = '@alpha_trainer:ai_memory';
const RETENTION_DAYS = 30;

export interface MemoryEntry {
  date: string; // YYYY-MM-DD
  note: string;
}

export async function getMemoryEntries(): Promise<MemoryEntry[]> {
  const json = await AsyncStorage.getItem(MEMORY_KEY);
  return json ? JSON.parse(json) : [];
}

export async function addMemoryEntry(note: string): Promise<void> {
  const trimmed = note.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return;

  let entries = await getMemoryEntries();
  const today = getLocalDateString(new Date());

  const idx = entries.findIndex((e) => e.date === today);
  if (idx !== -1) {
    // Append to today's entry, cap at 400 chars
    entries[idx].note = (entries[idx].note + ' | ' + trimmed).slice(0, 400);
  } else {
    entries.push({ date: today, note: trimmed.slice(0, 300) });
  }

  // Prune entries older than RETENTION_DAYS
  const cutoff = getLocalDateString(
    new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );
  entries = entries.filter((e) => e.date >= cutoff);

  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(entries));
}

export async function clearMemory(): Promise<void> {
  await AsyncStorage.removeItem(MEMORY_KEY);
}

export function buildMemoryContext(
  entries: MemoryEntry[],
  workouts: WorkoutEntry[],
  weightLog: WeightEntry[],
  records: PersonalRecord[]
): string {
  const parts: string[] = [];

  // --- Computed stats: last 30 days of workouts ---
  const cutoff = getLocalDateString(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const recent = workouts.filter((w) => w.date >= cutoff);

  if (recent.length > 0) {
    const typeCounts: Record<string, number> = {};
    let totalDuration = 0;
    recent.forEach((w) => {
      typeCounts[w.workoutType] = (typeCounts[w.workoutType] || 0) + 1;
      totalDuration += w.duration || 0;
    });
    const topEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const avgDuration = Math.round(totalDuration / recent.length);
    const typeBreakdown = topEntries
      .slice(0, 4)
      .map(([t, c]) => `${t}(${c})`)
      .join(', ');

    const ratedWorkouts = recent.filter((w) => w.rating);
    const avgRating =
      ratedWorkouts.length > 0
        ? (ratedWorkouts.reduce((s, w) => s + (w.rating || 0), 0) / ratedWorkouts.length).toFixed(1)
        : null;

    parts.push(
      `АКТИВНІСТЬ (30 днів): ${recent.length} тренувань, сер. тривалість ${avgDuration} хв` +
      (avgRating ? `, сер. оцінка ${avgRating}/5` : '') +
      `, типи: ${typeBreakdown}`
    );
  }

  // --- Weight trend ---
  if (weightLog.length >= 2) {
    const last = weightLog.slice(-3);
    const latest = last[last.length - 1];
    const oldest = last[0];
    const diff = parseFloat((latest.weight - oldest.weight).toFixed(1));
    const trend = diff > 0 ? `+${diff}` : String(diff);
    parts.push(`ВАГА: ${latest.weight} кг (${trend} кг з ${oldest.date})`);
  } else if (weightLog.length === 1) {
    parts.push(`ВАГА: ${weightLog[0].weight} кг (${weightLog[0].date})`);
  }

  // --- Personal records ---
  if (records.length > 0) {
    const top4 = records.slice(0, 4).map((r) => {
      const bits = [r.exerciseName];
      if (r.maxWeight > 0) bits.push(`${r.maxWeight}кг`);
      if (r.maxReps > 0) bits.push(`${r.maxReps}повт.`);
      return bits.join(' ');
    });
    parts.push(`РЕКОРДИ: ${top4.join(' | ')}`);
  }

  // --- Conversation memory notes ---
  if (entries.length > 0) {
    const notes = entries
      .slice(-14) // last ~2 weeks of daily notes
      .map((e) => `[${e.date}] ${e.note}`)
      .join('\n');
    parts.push(`НОТАТКИ З РОЗМОВ:\n${notes}`);
  }

  if (parts.length === 0) return '';

  return `\n\nПАМ'ЯТЬ (останній місяць):\n${parts.join('\n')}`;
}
