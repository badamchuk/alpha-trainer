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

// ─── Strength Score ───────────────────────────────────────────────────────────

// Key compound lifts used for score — matches by keywords
const KEY_LIFTS = [
  { name: 'Squat',      keywords: ['squat', 'присідан', 'back squat', 'front squat', 'паузове присідання'],  weight: 1.2 },
  { name: 'Deadlift',   keywords: ['deadlift', 'станова', 'rdl', 'rack pull', 'румунська'],                  weight: 1.3 },
  { name: 'Bench',      keywords: ['bench', 'жим лежачи', 'жим леж'],                                       weight: 1.0 },
  { name: 'OHP',        keywords: ['overhead', 'жим стоячи', 'military press', 'ohp', 'жим сидячи'],        weight: 0.8 },
  { name: 'Row',        keywords: ['barbell row', 'тяга штанги', 'bent over', 'pendlay'],                   weight: 0.7 },
];

export interface StrengthScoreResult {
  score: number;          // 0–1000
  level: 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';
  lifts: { name: string; estimated1RM: number; lastDate: string }[];
}

export function getStrengthScore(
  workouts: WorkoutEntry[],
  bodyWeightKg: number
): StrengthScoreResult {
  const lifts: StrengthScoreResult['lifts'] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const lift of KEY_LIFTS) {
    let best1RM = 0;
    let lastDate = '';
    for (const w of workouts) {
      for (const e of w.exercises) {
        const n = e.name.toLowerCase();
        if (lift.keywords.some((k) => n.includes(k))) {
          const rm = estimate1RM(e.weight || 0, e.reps || 1);
          if (rm > best1RM) { best1RM = rm; lastDate = w.date; }
        }
      }
    }
    if (best1RM > 0) {
      lifts.push({ name: lift.name, estimated1RM: best1RM, lastDate });
      weightedSum += (best1RM / (bodyWeightKg || 75)) * lift.weight;
      weightTotal += lift.weight;
    }
  }

  if (lifts.length === 0) return { score: 0, level: 'beginner', lifts: [] };

  const avgRatio = weightedSum / weightTotal;
  // avgRatio: ~0.5 = beginner, ~1.0 = novice, ~1.5 = intermediate, ~2.0 = advanced, ~2.5+ = elite
  const score = Math.min(1000, Math.round(avgRatio * 400));

  const level: StrengthScoreResult['level'] =
    score < 200 ? 'beginner' :
    score < 400 ? 'novice' :
    score < 600 ? 'intermediate' :
    score < 800 ? 'advanced' : 'elite';

  return { score, level, lifts };
}

// ─── Volume Landmarks ─────────────────────────────────────────────────────────

// Evidence-based weekly set ranges (RP Strength / Mike Israetel)
const VOLUME_TARGETS: Record<string, { mev: number; mav: number; mrv: number; label: string; color: string }> = {
  chest:      { mev: 6,  mav: 12, mrv: 20, label: 'Груди',    color: '#E63946' },
  back:       { mev: 8,  mav: 16, mrv: 25, label: 'Спина',    color: '#3498DB' },
  shoulders:  { mev: 6,  mav: 14, mrv: 22, label: 'Плечі',    color: '#9B59B6' },
  biceps:     { mev: 6,  mav: 12, mrv: 20, label: 'Біцепс',   color: '#F4A261' },
  triceps:    { mev: 4,  mav: 10, mrv: 18, label: 'Трицепс',  color: '#2ECC71' },
  legs:       { mev: 6,  mav: 14, mrv: 22, label: 'Квадри',   color: '#2EC4B6' },
  hamstrings: { mev: 4,  mav: 10, mrv: 16, label: 'Задня ст.', color: '#E67E22' },
  glutes:     { mev: 4,  mav: 10, mrv: 16, label: 'Сідниці',  color: '#FF6B6B' },
  core:       { mev: 4,  mav: 12, mrv: 20, label: 'Прес/Кор', color: '#1ABC9C' },
  calves:     { mev: 4,  mav: 8,  mrv: 16, label: 'Литки',    color: '#F1C40F' },
};

// Map exercise muscle group (from exercises.ts MuscleGroup) to volume target key
const MG_TO_VT: Record<string, string> = {
  chest: 'chest', back: 'back', shoulders: 'shoulders',
  biceps: 'biceps', triceps: 'triceps', legs: 'legs',
  hamstrings: 'hamstrings', glutes: 'glutes', core: 'core', calves: 'calves',
};

export type VolumeLandmarkStatus = 'low' | 'optimal' | 'high' | 'overreaching';

export interface VolumeLandmark {
  group: string;
  label: string;
  color: string;
  weeklySets: number;
  mev: number;
  mav: number;
  mrv: number;
  status: VolumeLandmarkStatus;
  pct: number; // 0–100 fill for bar
}

export function getVolumeLandmarks(
  workouts: WorkoutEntry[],
  weekStartDate: string, // YYYY-MM-DD
  weekEndDate: string,
): VolumeLandmark[] {
  const weekWorkouts = workouts.filter((w) => w.date >= weekStartDate && w.date <= weekEndDate);
  const setCounts: Record<string, number> = {};

  for (const w of weekWorkouts) {
    for (const e of w.exercises) {
      // Try to match via exercise library (muscleGroup in name keywords)
      const name = e.name.toLowerCase();
      // Keyword-based fallback matching
      let matched = '';
      if (/bench|жим леж|грудн|chest|зведення/.test(name)) matched = 'chest';
      else if (/squat|присідан|leg press|жим ногами|квадр/.test(name)) matched = 'legs';
      else if (/deadlift|станов|row|тяга|rdl|rack pull|підтягуван|lat/.test(name)) matched = 'back';
      else if (/shoulder|плеч|ohp|military|lateral|arnold|жим сто/.test(name)) matched = 'shoulders';
      else if (/bicep|біцепс|curl|hammer|згинан/.test(name)) matched = 'biceps';
      else if (/tricep|трицепс|розгинан|pushdown|skull/.test(name)) matched = 'triceps';
      else if (/rdl|romanian|nordic|curl|leg curl|hamstring|задня|підколін/.test(name)) matched = 'hamstrings';
      else if (/glute|сідниц|hip thrust|гіперекстен/.test(name)) matched = 'glutes';
      else if (/abs|прес|crunch|plank|планка|core|підйом ніг/.test(name)) matched = 'core';
      else if (/calf|литк|gastro/.test(name)) matched = 'calves';

      if (matched) {
        setCounts[matched] = (setCounts[matched] || 0) + (e.sets || 1);
      }
    }
  }

  return Object.entries(VOLUME_TARGETS)
    .map(([group, target]) => {
      const sets = setCounts[group] || 0;
      const status: VolumeLandmarkStatus =
        sets < target.mev ? 'low' :
        sets <= target.mav ? 'optimal' :
        sets <= target.mrv ? 'high' : 'overreaching';
      const pct = Math.min(100, Math.round((sets / target.mrv) * 100));
      return { group, label: target.label, color: target.color, weeklySets: sets, mev: target.mev, mav: target.mav, mrv: target.mrv, status, pct };
    })
    .filter((v) => v.weeklySets > 0 || true) // show all groups
    .sort((a, b) => b.weeklySets - a.weeklySets);
}

// ─── Recovery Score ───────────────────────────────────────────────────────────

export interface RecoveryScoreResult {
  score: number; // 0–100
  level: 'rest' | 'easy' | 'moderate' | 'hard' | 'peak';
  color: string;
  factors: { label: string; impact: number }[];
}

export function getRecoveryScore(workouts: WorkoutEntry[], today: string): RecoveryScoreResult {
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, 10);

  let score = 70;
  const factors: { label: string; impact: number }[] = [];

  // Factor 1: days since last workout
  if (recent.length === 0) {
    factors.push({ label: 'Давно не тренувався', impact: +5 });
    score += 5;
  } else {
    const lastDate = recent[0].date;
    const daysDiff = Math.floor(
      (new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff === 0) {
      factors.push({ label: 'Тренування сьогодні', impact: -20 });
      score -= 20;
    } else if (daysDiff === 1) {
      factors.push({ label: 'Тренування вчора', impact: -10 });
      score -= 10;
    } else if (daysDiff >= 2 && daysDiff <= 3) {
      factors.push({ label: '2–3 дні відпочинку', impact: +10 });
      score += 10;
    } else {
      factors.push({ label: '4+ дні відпочинку', impact: +5 });
      score += 5;
    }
  }

  // Factor 2: workouts this week (Mon–Sun)
  const weekStart = today.slice(0, 8) + '01'; // rough cutoff — last 7 days
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const weekCount = sorted.filter((w) => w.date >= cutoffStr).length;
  if (weekCount >= 6) {
    factors.push({ label: '6+ тренувань за тиждень', impact: -15 });
    score -= 15;
  } else if (weekCount === 5) {
    factors.push({ label: '5 тренувань за тиждень', impact: -5 });
    score -= 5;
  } else if (weekCount <= 2) {
    factors.push({ label: 'Мало тренувань цього тижня', impact: +5 });
    score += 5;
  }

  // Factor 3: last workout intensity (rating + duration)
  if (recent.length > 0) {
    const last = recent[0];
    if (last.duration && last.duration > 90) {
      factors.push({ label: 'Довге тренування (>90хв)', impact: -8 });
      score -= 8;
    }
    if (last.rating) {
      if (last.rating <= 2) {
        factors.push({ label: 'Погане самопочуття минулого разу', impact: -5 });
        score -= 5;
      } else if (last.rating >= 5) {
        factors.push({ label: 'Відмінне самопочуття', impact: +5 });
        score += 5;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  const level: RecoveryScoreResult['level'] =
    score < 30 ? 'rest' :
    score < 50 ? 'easy' :
    score < 70 ? 'moderate' :
    score < 85 ? 'hard' : 'peak';

  const color =
    score < 30 ? '#E63946' :
    score < 50 ? '#E67E22' :
    score < 70 ? '#F4A261' :
    score < 85 ? '#2ECC71' : '#1ABC9C';

  return { score, level, color, factors };
}

// ─── Progressive Overload Suggestion ─────────────────────────────────────────

export interface OverloadSuggestion {
  lastWeight: number;
  lastReps: number;
  lastSets: number;
  lastDate: string;
  suggestedWeight: number;
  suggestedReps: number | string;
  message: string; // short hint
}

export function getOverloadSuggestion(
  workouts: WorkoutEntry[],
  exerciseName: string
): OverloadSuggestion | null {
  const key = exerciseName.toLowerCase().trim();
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));

  // Find last two appearances
  const appearances: Array<{ date: string; weight: number; reps: number; sets: number }> = [];
  for (const w of sorted) {
    const match = w.exercises.find((e) => e.name.toLowerCase().trim() === key);
    if (match && match.weight && match.reps) {
      appearances.push({
        date: w.date,
        weight: match.weight,
        reps: match.reps,
        sets: match.sets || 1,
      });
      if (appearances.length >= 2) break;
    }
  }

  if (appearances.length === 0) return null;

  const last = appearances[0];
  const prev = appearances[1];

  // Determine increment based on movement type
  const isCompound = /squat|deadlift|bench|press|row|станов|присід|жим|тяга/.test(key);
  const increment = isCompound ? 2.5 : 1.25;

  let suggestedWeight = last.weight;
  let suggestedReps: number | string = last.reps;
  let message = '';

  if (!prev) {
    // Only one session — suggest slight increase
    suggestedWeight = last.weight + increment;
    message = `Минулого разу: ${last.weight}кг × ${last.reps}. Спробуй +${increment}кг`;
  } else {
    const sameWeight = last.weight === prev.weight;
    const moreReps = last.reps > prev.reps;
    const moreWeight = last.weight > prev.weight;

    if (moreWeight) {
      // Already progressing on weight — keep going if reps were good
      if (last.reps >= 6) {
        suggestedWeight = last.weight + increment;
        message = `Прогресуєш (+${increment}кг від ${last.weight}кг)`;
      } else {
        suggestedWeight = last.weight;
        suggestedReps = `${last.reps + 1}–${last.reps + 2}`;
        message = `Збільш кількість повторів до ${last.reps + 1}–${last.reps + 2}`;
      }
    } else if (sameWeight && moreReps) {
      // Same weight, more reps — time to increase weight
      suggestedWeight = last.weight + increment;
      message = `Готовий до +${increment}кг (повтори зросли)`;
    } else if (sameWeight && last.reps >= 10) {
      // Hit 10+ reps at same weight — definitely increase
      suggestedWeight = last.weight + increment;
      message = `${last.reps} повт. @ ${last.weight}кг → +${increment}кг`;
    } else {
      // Same or less — hold weight, focus on reps
      suggestedWeight = last.weight;
      suggestedReps = `${last.reps + 1}`;
      message = `Утримуй ${last.weight}кг, цільуйся в ${last.reps + 1} повт.`;
    }
  }

  return {
    lastWeight: last.weight,
    lastReps: last.reps,
    lastSets: last.sets,
    lastDate: last.date,
    suggestedWeight,
    suggestedReps,
    message,
  };
}

// ─── Personal Records ─────────────────────────────────────────────────────────

export interface PersonalRecord {
  exerciseName: string;
  weight: number;
  reps: number;
  estimated1RM: number;
  date: string;
}

export function getPersonalRecords(workouts: WorkoutEntry[]): PersonalRecord[] {
  const records = new Map<string, PersonalRecord>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (!e.weight || !e.reps) continue;
      const key = e.name.trim().toLowerCase();
      const rm = estimate1RM(e.weight, e.reps);
      const existing = records.get(key);
      if (!existing || rm > existing.estimated1RM) {
        records.set(key, {
          exerciseName: e.name.trim(),
          weight: e.weight,
          reps: e.reps,
          estimated1RM: rm,
          date: w.date,
        });
      }
    }
  }
  return Array.from(records.values()).sort((a, b) => b.estimated1RM - a.estimated1RM);
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
