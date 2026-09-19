/**
 * Звіт по реальній історії: скільки вправ впізнається, скільки калорій, який об'єм.
 *
 * Це інструмент, а не перевірка: без даних тест пропускається, тому `npm test`
 * поводиться як раніше. Запуск:
 *   python3 scripts/dev/dump-history.py RKStorage /tmp/history.json
 *   HISTORY_JSON=/tmp/history.json npx jest history-report
 *
 * Звіт потрібен, щоб зміни в аналітиці (прив'язка вправ до бібліотеки) можна було
 * порівняти «до/після» на справжніх даних, а не на вигаданих.
 */
import fs from 'fs';
import { EXERCISES } from '../services/exercises';
import {
  classifyExercise, getAllExerciseNames, getExerciseList, getVolumeLandmarks, getMuscleGroupBalance,
} from '../services/analytics';
import { bodyParamsFor, estimateWorkoutCalories } from '../services/calories';
import { coverageOf, createResolver, matchName } from '../services/exerciseMatch';
import { getLocalDateString } from '../services/storage';
import { UserProfile, WorkoutEntry } from '../types';

interface History {
  workouts: WorkoutEntry[];
  profile: UserProfile | null;
  weightLog: { date: string; weight: number }[];
}

const file = process.env.HISTORY_JSON;
const suite = file ? describe : describe.skip;

suite('звіт по реальній історії', () => {
  it("рахує покриття, калорії й об'єм", () => {
    const h: History = JSON.parse(fs.readFileSync(file!, 'utf8'));
    const workouts = h.workouts;
    const records = workouts.flatMap((w) => w.exercises ?? []);

    const libNames = new Set<string>();
    for (const ex of EXERCISES) {
      libNames.add(ex.nameUk.toLowerCase().trim());
      libNames.add(ex.nameEn.toLowerCase().trim());
    }
    const key = (n: string) => n.toLowerCase().trim();
    const names = new Set(records.map((e) => key(e.name)));
    const exact = records.filter((e) => libNames.has(key(e.name)));
    const classified = records.filter((e) => classifyExercise(e.name) !== null);

    const resolver = createResolver();
    const kcalWith = (r?: typeof resolver) => workouts.reduce((sum, w) => {
      const p = bodyParamsFor(h.profile, h.weightLog, w.date);
      return sum + (p ? estimateWorkoutCalories(w, p, r).total : 0);
    }, 0);
    const kcal = kcalWith();
    const kcalResolved = kcalWith(resolver);

    // «типовий тиждень» — тиждень з найбільшою кількістю тренувань
    const byWeek = new Map<string, WorkoutEntry[]>();
    for (const w of workouts) {
      const d = new Date(`${w.date}T12:00:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // понеділок
      const k = getLocalDateString(d);
      byWeek.set(k, [...(byWeek.get(k) ?? []), w]);
    }
    const [weekStart, weekWorkouts] = [...byWeek.entries()]
      .sort((a, b) => b[1].length - a[1].length)[0] ?? ['', []];
    const weekEnd = (() => {
      const d = new Date(`${weekStart}T12:00:00`);
      d.setDate(d.getDate() + 6);
      return getLocalDateString(d);
    })();
    const volume = getVolumeLandmarks(workouts, weekStart, weekEnd);
    const balance = getMuscleGroupBalance(workouts);
    const volumeR = getVolumeLandmarks(workouts, weekStart, weekEnd, resolver);
    const balanceR = getMuscleGroupBalance(workouts, resolver);

    // нова бібліотека: скільки записів прив'язується автоматично (критерій A1)
    const cov = coverageOf(records.map((e) => e.name));
    const covNames = coverageOf([...names]);
    const unresolved = [...names]
      .filter((n) => !['exact', 'alias', 'link'].includes(matchName(n).confidence))
      .map((n) => `${n} [${matchName(n).confidence}${matchName(n).candidates[0] ? ' → ' + matchName(n).candidates[0] : ''}]`);

    const pct = (n: number) => `${Math.round((n / records.length) * 100)}%`;
    console.log([
      '',
      `тренувань: ${workouts.length}, записів вправ: ${records.length}, різних назв: ${names.size}`,
      `точний збіг зі СТАРОЮ бібліотекою: ${exact.length} (${pct(exact.length)})`,
      `класифіковано (стара бібліотека + regex): ${classified.length} (${pct(classified.length)})`,
      `НОВА бібліотека, записи: авто ${cov.auto} (${pct(cov.auto)}), неоднозначні ${cov.ambiguous}, підказка ${cov.fuzzy}, не впізнано ${cov.none}`,
      `НОВА бібліотека, назви: авто ${covNames.auto} з ${names.size}`,
      `не впізнані назви (${unresolved.length}): ${unresolved.slice(0, 40).join(' · ')}`,
      `калорій за всю історію: ${Math.round(kcal)} → з бібліотекою ${Math.round(kcalResolved)}`
        + ` (${kcal ? ((kcalResolved / kcal - 1) * 100).toFixed(1) : 0}%)`,
      `рядків у прогресі (унікальних назв): ${getAllExerciseNames(workouts).length}`,
      `типовий тиждень: ${weekStart} — ${weekEnd}, тренувань ${weekWorkouts.length}`,
      `підходи за тиждень: ${volume.filter((v) => v.weeklySets > 0).map((v) => `${v.labelKey} ${v.weeklySets}`).join(', ') || '—'}`,
      `підходи за тиждень (з бібліотекою): ${volumeR.filter((v) => v.weeklySets > 0).map((v) => `${v.labelKey} ${v.weeklySets}`).join(', ') || '—'}`,
      `баланс м'язів (усього підходів): ${balance.map((b) => `${b.labelKey} ${b.count}`).join(', ') || '—'}`,
      `баланс м'язів (з бібліотекою): ${balanceR.map((b) => `${b.labelKey} ${b.count}`).join(', ') || '—'}`,
      `рядків у прогресі (з бібліотекою): ${getExerciseList(workouts, resolver).length}`,
      '',
    ].join('\n'));

    expect(records.length).toBeGreaterThan(0);
  });
});
