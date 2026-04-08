import { WorkoutEntry } from '../types';
import { getLocalDateString } from './storage';

export function formatPace(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm <= 0) return '–';
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')}/км`;
}

export function computePace(distanceKm: number, durationMin: number): number {
  if (!distanceKm || !durationMin || distanceKm <= 0) return 0;
  return (durationMin * 60) / distanceKm; // seconds per km
}

// ─── Run stats ────────────────────────────────────────────────────────────────

export interface RunStats {
  totalRuns: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  avgDistanceKm: number;
  avgPaceSec: number;       // seconds/km
  bestPaceSec: number;      // seconds/km (fastest)
  longestRunKm: number;
  monthlyDistanceKm: number;
  recentRuns: { date: string; distanceKm: number; paceSec: number; durationMin: number }[];
}

export function getRunStats(workouts: WorkoutEntry[]): RunStats {
  const runs = workouts
    .filter((w) => w.workoutType === 'run')
    .sort((a, b) => b.date.localeCompare(a.date));

  const monthCutoff = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  let totalDist = 0;
  let totalDur = 0;
  let bestPace = 0;
  let longestRun = 0;
  let monthDist = 0;
  const recentRuns: RunStats['recentRuns'] = [];

  for (const run of runs) {
    const dist = run.totalDistance || 0;
    const dur = run.duration || 0;
    const pace = run.avgPace || (dist > 0 && dur > 0 ? computePace(dist, dur) : 0);

    totalDist += dist;
    totalDur += dur;

    if (dist > longestRun) longestRun = dist;
    if (pace > 0 && (bestPace === 0 || pace < bestPace)) bestPace = pace;
    if (run.date >= monthCutoff) monthDist += dist;

    if (recentRuns.length < 10) {
      recentRuns.push({ date: run.date, distanceKm: dist, paceSec: pace, durationMin: dur });
    }
  }

  const validPaceRuns = runs.filter(
    (r) => (r.avgPace || 0) > 0 || (r.totalDistance && r.duration)
  );
  const avgPace =
    validPaceRuns.length > 0
      ? validPaceRuns.reduce((s, r) => {
          const p = r.avgPace || computePace(r.totalDistance || 0, r.duration);
          return s + p;
        }, 0) / validPaceRuns.length
      : 0;

  return {
    totalRuns: runs.length,
    totalDistanceKm: Math.round(totalDist * 10) / 10,
    totalDurationMin: totalDur,
    avgDistanceKm: runs.length > 0 ? Math.round((totalDist / runs.length) * 10) / 10 : 0,
    avgPaceSec: Math.round(avgPace),
    bestPaceSec: Math.round(bestPace),
    longestRunKm: Math.round(longestRun * 10) / 10,
    monthlyDistanceKm: Math.round(monthDist * 10) / 10,
    recentRuns,
  };
}

// ─── Strength stats ───────────────────────────────────────────────────────────

export interface StrengthStats {
  totalSessions: number;
  totalSets: number;
  totalReps: number;
  avgDurationMin: number;
  monthSessions: number;
  avgRating: number;
}

export function getStrengthStats(workouts: WorkoutEntry[]): StrengthStats {
  const sessions = workouts.filter((w) =>
    ['strength', 'crossfit', 'hiit'].includes(w.workoutType)
  );
  const monthCutoff = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  let totalSets = 0;
  let totalReps = 0;
  let totalDur = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let monthSessions = 0;

  for (const s of sessions) {
    s.exercises.forEach((e) => {
      totalSets += e.sets || 0;
      totalReps += (e.sets || 0) * (e.reps || 0);
    });
    totalDur += s.duration || 0;
    if (s.rating) { ratingSum += s.rating; ratingCount++; }
    if (s.date >= monthCutoff) monthSessions++;
  }

  return {
    totalSessions: sessions.length,
    totalSets,
    totalReps,
    avgDurationMin: sessions.length > 0 ? Math.round(totalDur / sessions.length) : 0,
    monthSessions,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0,
  };
}

// ─── Cardio stats (cycling, swimming, rowing-style cardio) ────────────────────

export interface CardioStats {
  totalSessions: number;
  totalDistanceKm: number;
  totalCalories: number;
  avgDurationMin: number;
  monthSessions: number;
  types: { type: string; count: number }[];
}

export function getCardioStats(workouts: WorkoutEntry[]): CardioStats {
  const sessions = workouts.filter((w) =>
    ['cardio', 'cycling', 'swimming', 'rowing'].includes(w.workoutType)
  );
  const monthCutoff = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  let totalDist = 0;
  let totalCal = 0;
  let totalDur = 0;
  let monthSessions = 0;
  const typeCounts: Record<string, number> = {};

  for (const s of sessions) {
    totalDist += s.totalDistance || 0;
    totalCal += s.totalCalories || s.exercises.reduce((sum, e) => sum + (e.calories || 0), 0);
    totalDur += s.duration || 0;
    if (s.date >= monthCutoff) monthSessions++;
    typeCounts[s.workoutType] = (typeCounts[s.workoutType] || 0) + 1;
  }

  return {
    totalSessions: sessions.length,
    totalDistanceKm: Math.round(totalDist * 10) / 10,
    totalCalories: Math.round(totalCal),
    avgDurationMin: sessions.length > 0 ? Math.round(totalDur / sessions.length) : 0,
    monthSessions,
    types: Object.entries(typeCounts).map(([type, count]) => ({ type, count })),
  };
}

// ─── Tonnage (volume load) ────────────────────────────────────────────────────

export interface WeeklyTonnage {
  weekLabel: string; // "dd.MM"
  tonnage: number;   // kg
}

export function getWeeklyTonnage(workouts: WorkoutEntry[], weeks = 12): WeeklyTonnage[] {
  const today = new Date();
  return Array.from({ length: weeks }, (_, i) => {
    const weekEnd = new Date(today.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    const wStart = getLocalDateString(weekStart);
    const wEnd = getLocalDateString(weekEnd);
    const tonnage = workouts
      .filter((w) => w.date >= wStart && w.date <= wEnd)
      .reduce((sum, w) =>
        sum + w.exercises.reduce((s, e) => s + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0), 0);
    const dd = String(weekEnd.getDate()).padStart(2, '0');
    const mm = String(weekEnd.getMonth() + 1).padStart(2, '0');
    return { weekLabel: `${dd}.${mm}`, tonnage: Math.round(tonnage) };
  }).reverse();
}

// ─── 1RM estimate (Epley formula) ────────────────────────────────────────────

export function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps <= 0 || weight <= 0) return 0;
  return Math.round(weight * (1 + reps / 30));
}

// ─── Per-exercise progress ────────────────────────────────────────────────────

export interface ExerciseProgressPoint {
  date: string;
  weight: number;
  reps: number;
  sets: number;
  estimated1RM: number;
  tonnage: number; // sets * reps * weight
}

export function getExerciseProgress(
  workouts: WorkoutEntry[],
  exerciseName: string
): ExerciseProgressPoint[] {
  const key = exerciseName.toLowerCase().trim();
  const points: ExerciseProgressPoint[] = [];

  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    const matches = w.exercises.filter((e) => e.name.toLowerCase().trim() === key);
    if (matches.length === 0) continue;
    // Best set in this workout (by weight, then by reps)
    const best = matches.reduce((b, e) => {
      const score = (e.weight || 0) * 1000 + (e.reps || 0);
      const bScore = (b.weight || 0) * 1000 + (b.reps || 0);
      return score > bScore ? e : b;
    });
    const weight = best.weight || 0;
    const reps = best.reps || 0;
    const sets = best.sets || 1;
    points.push({
      date: w.date,
      weight,
      reps,
      sets,
      estimated1RM: estimate1RM(weight, reps),
      tonnage: sets * reps * weight,
    });
  }
  return points;
}

export function getAllExerciseNames(workouts: WorkoutEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (!e.name) continue;
      const key = e.name.trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

// ─── Calorie estimation (MET-based) ──────────────────────────────────────────

const MET: Record<string, number> = {
  strength: 5,
  crossfit: 9,
  hiit: 10,
  cardio: 7,
  run: 9,
  cycling: 7,
  swimming: 7,
  yoga: 2.5,
  recovery: 2,
  custom: 5,
};

export function estimateCalories(
  workoutType: string,
  durationMin: number,
  bodyWeightKg: number
): number {
  const met = MET[workoutType] || 5;
  return Math.round(met * bodyWeightKg * (durationMin / 60));
}

// ─── HR zones ─────────────────────────────────────────────────────────────────

export type HRZone = 1 | 2 | 3 | 4 | 5;

const HR_ZONE_LABELS: Record<HRZone, string> = {
  1: 'Відновлення',
  2: 'Жироспалення',
  3: 'Аеробна',
  4: 'Анаеробна',
  5: 'Максимум',
};
const HR_ZONE_COLORS: Record<HRZone, string> = {
  1: '#3498DB',
  2: '#2ECC71',
  3: '#F4A261',
  4: '#E67E22',
  5: '#E63946',
};

export function getHRZone(avgHR: number, maxHREstimate: number): HRZone {
  const pct = avgHR / maxHREstimate;
  if (pct < 0.57) return 1;
  if (pct < 0.64) return 2;
  if (pct < 0.77) return 3;
  if (pct < 0.96) return 4;
  return 5;
}

export { HR_ZONE_LABELS, HR_ZONE_COLORS };

export interface HRZoneSummary {
  zone: HRZone;
  label: string;
  color: string;
  count: number;
  totalMinutes: number;
}

export function getHRZoneSummary(workouts: WorkoutEntry[], age: number): HRZoneSummary[] {
  const maxHR = 220 - age;
  const map = new Map<HRZone, HRZoneSummary>();

  for (const w of workouts) {
    if (!w.avgHeartRate) continue;
    const zone = getHRZone(w.avgHeartRate, maxHR);
    const existing = map.get(zone) || {
      zone, label: HR_ZONE_LABELS[zone], color: HR_ZONE_COLORS[zone],
      count: 0, totalMinutes: 0,
    };
    existing.count++;
    existing.totalMinutes += w.duration || 0;
    map.set(zone, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.zone - b.zone);
}

// ─── Muscle group balance ─────────────────────────────────────────────────────

export interface MuscleGroupData {
  group: string;
  label: string;
  count: number; // total exercise sets logged
  color: string;
}

const MUSCLE_KEYWORDS: { group: string; label: string; color: string; keywords: string[] }[] = [
  { group: 'chest',     label: 'Груди',    color: '#E63946', keywords: ['жим', 'грудн', 'bench', 'chest', 'зведення', 'розведення'] },
  { group: 'back',      label: 'Спина',    color: '#3498DB', keywords: ['тяга', 'підтягуван', 'row', 'спин', 'deadlift', 'станов', 'lat', 'широчайш'] },
  { group: 'legs',      label: 'Ноги',     color: '#2ECC71', keywords: ['присідан', 'випад', 'squat', 'lunge', 'ноги', 'квадр', 'стегн', 'литк', 'leg press', 'жим ногами'] },
  { group: 'shoulders', label: 'Плечі',    color: '#9B59B6', keywords: ['плечі', 'плечов', 'shoulder', 'жим стоячи', 'жим сид', 'arnold', 'lateral', 'розведен'] },
  { group: 'arms',      label: 'Руки',     color: '#F4A261', keywords: ['біцепс', 'трицепс', 'bicep', 'tricep', 'curl', 'згинан', 'розгинан', 'hammer'] },
  { group: 'core',      label: 'Прес/Кор', color: '#1ABC9C', keywords: ['прес', 'планка', 'core', 'abs', 'скручуван', 'підйом ніг', 'bicycle', 'crunch'] },
];

export function getMuscleGroupBalance(workouts: WorkoutEntry[]): MuscleGroupData[] {
  const counts: Record<string, number> = {};
  for (const group of MUSCLE_KEYWORDS) counts[group.group] = 0;

  for (const w of workouts) {
    for (const e of w.exercises) {
      const name = e.name.toLowerCase();
      for (const mg of MUSCLE_KEYWORDS) {
        if (mg.keywords.some((k) => name.includes(k))) {
          counts[mg.group] += e.sets || 1;
          break;
        }
      }
    }
  }

  return MUSCLE_KEYWORDS
    .map((mg) => ({ group: mg.group, label: mg.label, color: mg.color, count: counts[mg.group] }))
    .filter((mg) => mg.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ─── Generic per-type summary ─────────────────────────────────────────────────

export interface TypeSummary {
  type: string;
  count: number;
  totalDurationMin: number;
  avgDurationMin: number;
  avgRating: number;
  monthCount: number;
  lastDate: string;
}

export function getTypeSummaries(workouts: WorkoutEntry[]): TypeSummary[] {
  const monthCutoff = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const map = new Map<string, TypeSummary>();

  for (const w of workouts) {
    const existing = map.get(w.workoutType) || {
      type: w.workoutType, count: 0, totalDurationMin: 0,
      avgDurationMin: 0, avgRating: 0, monthCount: 0, lastDate: '',
    };
    existing.count++;
    existing.totalDurationMin += w.duration || 0;
    if (w.rating) existing.avgRating = (existing.avgRating * (existing.count - 1) + w.rating) / existing.count;
    if (w.date >= monthCutoff) existing.monthCount++;
    if (!existing.lastDate || w.date > existing.lastDate) existing.lastDate = w.date;
    existing.avgDurationMin = Math.round(existing.totalDurationMin / existing.count);
    map.set(w.workoutType, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
