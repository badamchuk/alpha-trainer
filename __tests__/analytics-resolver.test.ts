/**
 * Аналітика з резолвером: різні написання однієї вправи зливаються,
 * а кросфіт-об'єм більше не роздуває тижневі підходи (ТЗ F7.3).
 *
 * Пара до analytics-baseline.test.ts: там — що без резолвера нічого не змінилось,
 * тут — що з ним рахує інакше й правильно.
 */
import {
  getExerciseList, getExerciseProgress, getMuscleGroupBalance, getOverloadSuggestion,
  getPersonalRecords, getStrengthScore, getVolumeLandmarks, recentExerciseIds, lastResults, formatLastResult,
} from '../services/analytics';
import { createResolver } from '../services/exerciseMatch';
import { ExerciseLog, WorkoutEntry } from '../types';

const resolver = createResolver();

const w = (date: string, exercises: ExerciseLog[], over: Partial<WorkoutEntry> = {}): WorkoutEntry => ({
  id: date, date, workoutType: 'strength', exercises, notes: '', duration: 60,
  completedAt: `${date}T10:00:00.000Z`, ...over,
});

// та сама вправа трьома написаннями: українською, англійською й через синонім
const SPELLINGS: WorkoutEntry[] = [
  w('2026-09-01', [{ name: 'Присідання зі штангою на спині', sets: 3, reps: 5, weight: 100 }]),
  w('2026-09-03', [{ name: 'back squat', sets: 3, reps: 5, weight: 102.5 }]),
  w('2026-09-05', [{ name: 'Присідання зі штангою', sets: 3, reps: 5, weight: 105 }]),
];

describe('прогрес по вправі', () => {
  it('без резолвера бачить лише один запис із трьох', () => {
    expect(getExerciseProgress(SPELLINGS, 'Присідання зі штангою на спині')).toHaveLength(1);
  });

  it('з резолвером зводить усі написання в один графік', () => {
    const points = getExerciseProgress(SPELLINGS, 'back squat', resolver);
    expect(points.map((p) => p.weight)).toEqual([100, 102.5, 105]);
  });

  it('підказка прогресії бачить попередній раз з іншим написанням', () => {
    const s = getOverloadSuggestion(SPELLINGS, 'Присідання зі штангою на спині', resolver);
    expect(s).not.toBeNull();
    expect(s!.lastWeight).toBe(105);   // найсвіжіший запис — 5 вересня
    expect(s!.lastDate).toBe('2026-09-05');
  });

  it('крок ваги для штанги — 2.5 кг', () => {
    // три однакові тренування поспіль без прогресу → підказка додати вагу
    const same = ['2026-09-01', '2026-09-03', '2026-09-05'].map((d) =>
      w(d, [{ name: 'back squat', sets: 3, reps: 5, weight: 100 }]));
    const s = getOverloadSuggestion(same, 'back squat', resolver)!;
    expect([100, 102.5]).toContain(s.suggestedWeight);
  });
});

describe('перелік вправ і рекорди', () => {
  it('перелік зводить написання в один рядок з назвою бібліотеки', () => {
    const list = getExerciseList(SPELLINGS, resolver);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Присідання зі штангою на спині');
    expect(list[0].records).toBe(3);
    expect(list[0].exerciseId).toBe('back_squat');
  });

  it('без резолвера перелік лишається за назвами', () => {
    expect(getExerciseList(SPELLINGS)).toHaveLength(3);
  });

  it('рекорд по вправі один, а не три', () => {
    const prs = getPersonalRecords(SPELLINGS, resolver);
    expect(prs).toHaveLength(1);
    expect(prs[0].exerciseName).toBe('Присідання зі штангою на спині');
    expect(prs[0].weight).toBe(105);
  });

  it('силовий бал впізнає вправу за id, а не за написанням', () => {
    const score = getStrengthScore(SPELLINGS, 100, resolver);
    expect(score.lifts.map((l) => l.name)).toEqual(['Squat']);
    expect(score.score).toBeGreaterThan(0);
  });
});

describe('об’єм рахується за наміром вправи (F7.3)', () => {
  // 3 підходи присідань (сила) + 10 раундів воллболів (метокон, теж на ноги)
  const MIXED = [w('2026-09-01', [
    { name: 'Присідання зі штангою на спині', sets: 3, reps: 5, weight: 100 },
    { name: 'Присідання з викиданням м’яча', sets: 10, reps: 15 },
  ], { workoutType: 'crossfit' })];

  it('без резолвера метокон рахується як 13 підходів на ноги', () => {
    expect(getMuscleGroupBalance(MIXED).find((g) => g.group === 'legs')?.count).toBe(13);
  });

  it('з резолвером у гіпертрофічний об’єм ідуть лише силові підходи', () => {
    const after = getMuscleGroupBalance(MIXED, resolver);
    expect(after.find((g) => g.group === 'legs')?.count).toBe(3);
  });

  it('тижневі орієнтири рахують так само', () => {
    const v = getVolumeLandmarks(MIXED, '2026-08-31', '2026-09-06', resolver);
    expect(v.find((g) => g.group === 'legs')?.weeklySets).toBe(3);
  });

  it('вибухові рухи рахуються за половину підходу', () => {
    const power = [w('2026-09-01', [{ name: 'Махи гирею', sets: 4, reps: 15, weight: 24 }])];
    const v = getVolumeLandmarks(power, '2026-08-31', '2026-09-06', resolver);
    expect(v.find((g) => g.group === 'glutes')?.weeklySets).toBe(2);
  });

  it('«стрибки на тумбу» — це стрибки на ящик', () => {
    const jumps = [w('2026-09-01', [{ name: 'Стрибки на тумбу', sets: 4, reps: 5 }])];
    expect(getExerciseList(jumps, resolver)[0].exerciseId).toBe('box_jump');
  });
});

describe('запис з exerciseId', () => {
  it('прив’язка за id перемагає будь-яку назву', () => {
    const typo = [w('2026-09-01', [
      { name: 'мої улюблені присідки', exerciseId: 'back_squat', sets: 3, reps: 5, weight: 90 },
    ])];
    expect(getExerciseProgress(typo, 'back squat', resolver)).toHaveLength(1);
    expect(getPersonalRecords(typo, resolver)[0].exerciseName).toBe('Присідання зі штангою на спині');
  });
});

describe('нещодавні вправи (для швидкого вибору)', () => {
  it('найсвіжіші йдуть першими', () => {
    const ids = recentExerciseIds(SPELLINGS, resolver);
    expect(ids[0]).toBe('back_squat');   // 5 вересня — останнє тренування
  });

  it('дублі не повторюються', () => {
    const ids = recentExerciseIds(SPELLINGS, resolver);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('невпізнані вправи не потрапляють', () => {
    const w = [{
      id: '1', date: '2026-09-10', workoutType: 'strength', notes: '', duration: 60,
      completedAt: '2026-09-10T10:00:00.000Z',
      exercises: [{ name: 'вигадана вправа' }, { name: 'Станова тяга' }],
    }];
    expect(recentExerciseIds(w, resolver)).toEqual(['deadlift']);
  });

  it('обмеження кількості працює', () => {
    expect(recentExerciseIds(SPELLINGS, resolver, 1)).toHaveLength(1);
  });
});

describe('підказка «минулого разу»', () => {
  it('бере найважчий підхід останнього тренування', () => {
    const last = lastResults(SPELLINGS, resolver).get('back_squat')!;
    expect(last.weight).toBe(105);
    expect(last.date).toBe('2026-09-05');
  });

  it('читається людиною', () => {
    expect(formatLastResult({ weight: 80, reps: 5, date: '2026-09-01' }))
      .toBe('минулого разу 80 кг × 5');
    expect(formatLastResult({ reps: 12, date: '2026-09-01' }))
      .toBe('минулого разу 12 повт.');
    expect(formatLastResult(undefined)).toBeNull();
  });

  it('вправи без результатів не потрапляють у підказки', () => {
    const w = [{
      id: '1', date: '2026-09-10', workoutType: 'strength', notes: '', duration: 60,
      completedAt: '2026-09-10T10:00:00.000Z',
      exercises: [{ name: 'Планка' }],
    }];
    expect(lastResults(w, resolver).size).toBe(0);
  });
});
