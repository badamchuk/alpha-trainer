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
