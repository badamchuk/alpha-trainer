import {
  BodyParams, bodyParamsFor, estimateWorkoutCalories, exerciseKind,
  restingKcalPerHour, roundKcal, weightOnDate,
} from '../services/calories';
import { ExerciseLog, UserProfile, WorkoutEntry } from '../types';

// Чоловік 80 кг, 180 см, 30 р. → Mifflin-St Jeor 1780 ккал/добу = 74.17 ккал/год
const MAN: BodyParams = { weightKg: 80, heightCm: 180, age: 30, gender: 'male' };

type W = Pick<WorkoutEntry, 'workoutType' | 'duration' | 'exercises' | 'totalDistance' | 'totalCalories'>;
const workout = (over: Partial<W>): W => ({ workoutType: 'strength', duration: 0, exercises: [], ...over });
const bench = (over: Partial<ExerciseLog> = {}): ExerciseLog =>
  ({ name: 'Жим штанги лежачи', sets: 3, reps: 10, ...over });

describe('restingKcalPerHour', () => {
  it('рахує базовий обмін за Mifflin-St Jeor', () => {
    expect(restingKcalPerHour(MAN)).toBeCloseTo(1780 / 24, 5);
  });

  it('у жінки з тими самими параметрами він нижчий', () => {
    expect(restingKcalPerHour({ ...MAN, gender: 'female' })).toBeCloseTo(1614 / 24, 5);
  });

  it('без зросту чи віку — класичний 1 ккал/кг/год', () => {
    expect(restingKcalPerHour({ weightKg: 80 })).toBe(80);
  });
});

describe('exerciseKind', () => {
  it('розрізняє силові за бібліотекою', () => {
    expect(exerciseKind('Жим штанги лежачи')).toBe('strength');
    expect(exerciseKind('Присідання зі штангою на спині')).toBe('heavy');
    expect(exerciseKind('Станова тяга')).toBe('heavy');
    expect(exerciseKind('Підйом штанги на біцепс')).toBe('isolation');
    expect(exerciseKind('Планка')).toBe('core');
    expect(exerciseKind('Берпі')).toBe('explosive');
  });

  it('розрізняє кардіо', () => {
    expect(exerciseKind('Біг на доріжці')).toBe('run');
    expect(exerciseKind('Гребний тренажер')).toBe('row');
    expect(exerciseKind('Скакалка')).toBe('rope');
  });

  it('«прогулянка фермера» — перенесення ваги, а не ходьба', () => {
    expect(exerciseKind('Прогулянка фермера')).toBe('carry');
    expect(exerciseKind("farmer's walk")).toBe('carry');
  });

  it('вільні назви не плутаються через спільні слова', () => {
    expect(exerciseKind('walking lunges')).toBe('heavy');
    expect(exerciseKind('скручування велосипед')).toBe('core');
  });

  it('«Велосипед» — прес у силовому, але їзда у вело-тренуванні', () => {
    expect(exerciseKind('Велосипед', 'strength')).toBe('core');
    expect(exerciseKind('Велосипед', 'cycling')).toBe('bike');
  });

  it('розпізнає кросфіт-назви', () => {
    expect(exerciseKind('Бурпі')).toBe('explosive');
    expect(exerciseKind('Девіл прес (борпі + гантелі над головою)')).toBe('explosive');
    expect(exerciseKind('Концепт')).toBe('row');
    expect(exerciseKind('Лижі концепт')).toBe('row');
    expect(exerciseKind('Байк')).toBe('bike');
    expect(exerciseKind('Кардіо')).toBe('cardio');
    expect(exerciseKind('Стільчик під стінкою')).toBe('core');
  });

  it('«Велосипед» з хвилинами — байк, а не скручування', () => {
    expect(exerciseKind('Велосипед', 'crossfit', true)).toBe('bike');
    expect(exerciseKind('Велосипед', 'crossfit')).toBe('core');
  });

  it('невідома назва бере вид з типу тренування', () => {
    expect(exerciseKind('Щось своє', 'run')).toBe('run');
    expect(exerciseKind('Щось своє', 'strength')).toBe('strength');
  });
});

describe('estimateWorkoutCalories — силові', () => {
  it('без тривалості рахує з підходів: 3×10 ≈ 6.25 хв роботи з відпочинком', () => {
    // (4.5 − 1) × 80 + 74.17 = 354.17 ккал/год × 6.25/60
    const r = estimateWorkoutCalories(workout({ exercises: [bench()] }), MAN);
    expect(r.perExercise[0].kcal).toBeCloseTo(36.89, 1);
    expect(r.estimated).toBe(true);
  });

  it('розподіляє реальну тривалість тренування між вправами', () => {
    const r = estimateWorkoutCalories(workout({
      duration: 15,
      exercises: [bench(), bench({ name: 'Тяга штанги в нахилі' })],
    }), MAN);
    // 12.5 хв розрахунку → 15 хв факту, по 7.5 хв на вправу
    expect(r.perExercise[0].kcal).toBeCloseTo(44.27, 1);
    expect(r.perExercise[1].kcal).toBeCloseTo(44.27, 1);
    expect(r.total).toBeCloseTo(88.54, 1);
  });

  it('довгий «хвіст» часу рахує як легку активність, а не роботу', () => {
    // три підходи за годину: 9.4 хв на повну + 50.6 хв на MET 2
    const r = estimateWorkoutCalories(workout({ duration: 60, exercises: [bench()] }), MAN);
    expect(r.total).toBeCloseTo(185.4, 0);
    expect(r.total).toBeLessThan(354); // година безперервної роботи
  });

  it('важчий користувач витрачає більше', () => {
    const w = workout({ duration: 45, exercises: [bench(), bench({ name: 'Станова тяга' })] });
    expect(estimateWorkoutCalories(w, { ...MAN, weightKg: 100 }).total)
      .toBeGreaterThan(estimateWorkoutCalories(w, MAN).total);
  });

  it('жінка з тими самими параметрами витрачає трохи менше', () => {
    const w = workout({ duration: 45, exercises: [bench()] });
    expect(estimateWorkoutCalories(w, { ...MAN, gender: 'female' }).total)
      .toBeLessThan(estimateWorkoutCalories(w, MAN).total);
  });

  it('RPE 9 дає більше, розминка — менше', () => {
    const one = (e: ExerciseLog) => estimateWorkoutCalories(workout({ exercises: [e] }), MAN).total;
    expect(one(bench({ rpe: 9 }))).toBeGreaterThan(one(bench()));
    expect(one(bench({ setType: 'warmup' }))).toBeLessThan(one(bench()));
  });

  it('у суперсеті відпочинок один на групу — розрахунковий час коротший', () => {
    const plain = estimateWorkoutCalories(workout({
      exercises: [bench(), bench({ name: 'Тяга штанги в нахилі' })],
    }), MAN);
    const ss = estimateWorkoutCalories(workout({
      exercises: [bench({ supersetId: 's1' }), bench({ name: 'Тяга штанги в нахилі', supersetId: 's1' })],
    }), MAN);
    expect(ss.total).toBeLessThan(plain.total);
  });
});

describe('estimateWorkoutCalories — кардіо', () => {
  it('біг рахує з темпу: 10 км за 50 хв (12 км/год)', () => {
    // ACSM: VO2 = 3.5 + 0.2 × 200 м/хв = 43.5 → 12.43 MET
    const r = estimateWorkoutCalories(workout({
      workoutType: 'run',
      exercises: [{ name: 'Біг', distance: 10, duration: 50 }],
    }), MAN);
    expect(r.total).toBeCloseTo(823.7, 0);
  });

  it('швидший темп за той самий час — більше калорій', () => {
    const at = (km: number) => estimateWorkoutCalories(workout({
      workoutType: 'run', exercises: [{ name: 'Біг', distance: km, duration: 50 }],
    }), MAN).total;
    expect(at(10)).toBeGreaterThan(at(7));
  });

  it('вати на гребному важать більше за таблицю', () => {
    const row = (e: Partial<ExerciseLog>) => estimateWorkoutCalories(workout({
      workoutType: 'cardio', exercises: [{ name: 'Гребний тренажер', duration: 20, ...e }],
    }), MAN).total;
    expect(row({ watts: 150 })).toBeCloseTo(222.8, 0);
    expect(row({ watts: 150 })).toBeGreaterThan(row({}));
  });

  it('час і дистанція записані на підхід: «Планка 3 підх. 1 хв» = 3 хв', () => {
    const one = (e: ExerciseLog) => estimateWorkoutCalories(workout({ workoutType: 'crossfit', exercises: [e] }), MAN).total;
    // (3.8 − 1) × 80 + 74.17 = 298.17 ккал/год × 3/60
    expect(one({ name: 'Планка', sets: 3, duration: 1 })).toBeCloseTo(14.91, 1);
    // 4 × 0.2 км = 0.8 км × 6 хв/км; MET бігу 9 → 714.17 ккал/год × 4.8/60
    expect(one({ name: 'Біг', sets: 4, distance: 0.2 })).toBeCloseTo(57.13, 1);
  });

  it('скакалка підходами — короткі відрізки з відпочинком, а не суцільні хвилини', () => {
    // 8 × 40 стрибків = 160 с на 11.8 MET + 8 × 90 с відпочинку на 2 MET
    const r = estimateWorkoutCalories(workout({
      workoutType: 'crossfit', exercises: [{ name: 'Скакалка', sets: 8, reps: 40 }],
    }), MAN);
    expect(r.total).toBeCloseTo(72.5, 0);
  });

  it('тренування без вправ рахує з дистанції та часу', () => {
    // 5 км за 30 хв = 10 км/год → 10.52 MET
    const r = estimateWorkoutCalories(workout({ workoutType: 'run', duration: 30, totalDistance: 5 }), MAN);
    expect(r.total).toBeCloseTo(418.0, 0);
    expect(r.perExercise).toEqual([]);
  });
});

describe('estimateWorkoutCalories — ручні значення', () => {
  it('ккал з тренажера — на підхід: «Гребля 6 підх. 16 ккал» = 96', () => {
    const r = estimateWorkoutCalories(workout({
      workoutType: 'crossfit', exercises: [{ name: 'Гребля', sets: 6, calories: 16 }],
    }), MAN);
    expect(r.perExercise[0]).toEqual({ kcal: 96, estimated: false });
    expect(r.estimated).toBe(false);
  });

  it('загальні ккал з годинника розкладає по вправах пропорційно', () => {
    const r = estimateWorkoutCalories(workout({
      duration: 30,
      totalCalories: 300,
      exercises: [{ name: 'Гребля', calories: 50 }, bench({ name: 'Тяга штанги в нахилі' })],
    }), MAN);
    expect(r.total).toBe(300);
    expect(r.estimated).toBe(false);
    expect(r.perExercise[0].kcal).toBe(50);
    expect(r.perExercise[1].kcal).toBeCloseTo(250, 5);
  });
});

describe('weightOnDate', () => {
  const log = [{ date: '2026-08-01', weight: 82 }, { date: '2026-09-01', weight: 80 }];

  it('бере останній замір не пізніше дати', () => {
    expect(weightOnDate(log, '2026-09-10')).toBe(80);
    expect(weightOnDate(log, '2026-08-15')).toBe(82);
  });

  it('до першого заміру — нічого', () => {
    expect(weightOnDate(log, '2026-07-01')).toBeUndefined();
  });

  it('застарілий замір ігнорує', () => {
    expect(weightOnDate([{ date: '2026-01-01', weight: 90 }], '2026-09-01')).toBeUndefined();
  });
});

describe('bodyParamsFor', () => {
  const profile: UserProfile = {
    name: 'Тест', age: 30, weight: 85, height: 180, gender: 'male',
    fitnessLevel: 'intermediate', availableDays: [1, 3, 5], equipment: [],
    geminiApiKey: '', onboardingComplete: true,
  };

  it('без заміру бере вагу з профілю', () => {
    expect(bodyParamsFor(profile, [], '2026-09-10'))
      .toEqual({ weightKg: 85, heightCm: 180, age: 30, gender: 'male' });
  });

  it('свіжий замір важливіший за профіль', () => {
    expect(bodyParamsFor(profile, [{ date: '2026-09-01', weight: 80 }], '2026-09-10')?.weightKg).toBe(80);
  });

  it('без ваги оцінити нічого не можна', () => {
    expect(bodyParamsFor(null, [], '2026-09-10')).toBeNull();
  });
});

describe('roundKcal', () => {
  it('не вдає точності, якої немає', () => {
    expect(roundKcal(0)).toBe(0);
    expect(roundKcal(3.4)).toBe(3);
    expect(roundKcal(37)).toBe(35);
    expect(roundKcal(38)).toBe(40);
    expect(roundKcal(418)).toBe(420);
  });
});
