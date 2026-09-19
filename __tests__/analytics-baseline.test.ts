import { tFor } from '../services/i18n';
/**
 * Зліпок поточної поведінки функцій аналітики ДО появи резолвера вправ.
 *
 * Ці сім функцій не мали жодного тесту, тому фраза «наявні тести зелені» нічого
 * про них не доводила. Знімки нижче — сітка безпеки: якщо додавання резолвера
 * змінить поведінку без резолвера, тест впаде.
 */
import {
  getAllExerciseNames, getExerciseProgress, getMuscleGroupBalance, getOverloadSuggestion,
  getPersonalRecords, getStrengthScore, getVolumeLandmarks, overloadText,
} from '../services/analytics';
import { ExerciseLog, WorkoutEntry } from '../types';

const w = (date: string, exercises: ExerciseLog[], over: Partial<WorkoutEntry> = {}): WorkoutEntry => ({
  id: date, date, workoutType: 'strength', exercises, notes: '', duration: 60,
  completedAt: `${date}T10:00:00.000Z`, ...over,
});

const WORKOUTS: WorkoutEntry[] = [
  w('2026-09-01', [
    { name: 'Присідання зі штангою на спині', sets: 3, reps: 5, weight: 100 },
    { name: 'Жим штанги лежачи', sets: 3, reps: 8, weight: 80 },
    { name: 'Бурпі', sets: 3, reps: 10 },
  ]),
  w('2026-09-03', [
    { name: 'Станова тяга', sets: 5, reps: 3, weight: 140 },
    { name: 'Підтягування', sets: 4, reps: 8 },
    { name: 'Планка', sets: 3, duration: 1 },
    { name: 'Гребля', sets: 3, calories: 15 },
  ], { workoutType: 'crossfit' }),
  w('2026-09-05', [
    // те саме, що й 1 вересня, але з іншим написанням і більшою вагою
    { name: 'присідання зі штангою на спині', sets: 3, reps: 5, weight: 105 },
    { name: 'Тяга штанги в нахилі', sets: 3, reps: 10, weight: 60 },
  ]),
];

describe('аналітика без резолвера — зліпок поведінки', () => {
  it('прогрес по вправі', () => {
    expect(getExerciseProgress(WORKOUTS, 'Присідання зі штангою на спині')).toMatchSnapshot();
  });

  it('перелік назв вправ', () => {
    expect(getAllExerciseNames(WORKOUTS)).toMatchSnapshot();
  });

  it('персональні рекорди', () => {
    expect(getPersonalRecords(WORKOUTS)).toMatchSnapshot();
  });

  it('підказка прогресії', () => {
    expect(getOverloadSuggestion(WORKOUTS, 'Присідання зі штангою на спині')).toMatchSnapshot();
  });

  it('підказка прогресії словами — та сама, що й була', () => {
    const s = getOverloadSuggestion(WORKOUTS, 'Присідання зі штангою на спині')!;
    expect(overloadText(s.message, tFor('uk'))).toBe('Збільш кількість повторів до 6–7');
    expect(overloadText(s.message, tFor('en'))).toBe('Push the reps up to 6–7');
  });

  it('баланс груп м’язів', () => {
    expect(getMuscleGroupBalance(WORKOUTS)).toMatchSnapshot();
  });

  it('об’ємні орієнтири за тиждень', () => {
    expect(getVolumeLandmarks(WORKOUTS, '2026-08-31', '2026-09-06')).toMatchSnapshot();
  });

  it('силовий бал', () => {
    expect(getStrengthScore(WORKOUTS, 100)).toMatchSnapshot();
  });
});
