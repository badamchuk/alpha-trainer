/**
 * Зв'язки назв і власні вправи (ТЗ F2.5–F2.8).
 *
 * Головне, що тут перевіряється: прив'язка НЕ чіпає записи тренувань —
 * її можна зняти, і історія лишається такою, якою її ввів користувач.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CUSTOM_KEY, LINKS_KEY, addCustomExercise, buildResolver, countByName, describeLinks,
  getLinks, linkName, loadCustomExercises, removeCustomExercise, unlinkName,
} from '../services/exerciseLinks';
import { getExercise, registerCustomExercises } from '../services/library';
import { getExerciseProgress, getPersonalRecords } from '../services/analytics';
import { ExerciseLog, WorkoutEntry } from '../types';

const w = (date: string, exercises: ExerciseLog[]): WorkoutEntry => ({
  id: date, date, workoutType: 'strength', exercises, notes: '', duration: 60,
  completedAt: `${date}T10:00:00.000Z`,
});

const HISTORY = [
  w('2026-09-01', [{ name: 'Присідання', sets: 3, reps: 10, weight: 60 }]),
  w('2026-09-03', [{ name: 'присідання ', sets: 3, reps: 10, weight: 65 }]),
  w('2026-09-05', [{ name: 'Присідання зі штангою на спині', sets: 3, reps: 5, weight: 100 }]),
];

beforeEach(async () => {
  await AsyncStorage.clear();
  registerCustomExercises([]);
});

describe('зв’язки назв', () => {
  it('неоднозначна назва без зв’язку не прив’язується сама', async () => {
    const resolver = await buildResolver();
    expect(resolver({ name: 'Присідання' })).toBeNull();
  });

  it('після прив’язки та сама назва дає id, а записи не змінюються', async () => {
    await linkName('Присідання', 'back_squat');
    const resolver = await buildResolver();

    expect(resolver({ name: 'Присідання' })).toBe('back_squat');
    expect(resolver({ name: 'присідання ' })).toBe('back_squat'); // регістр і пробіл не важать

    // усі три тренування тепер на одному графіку
    expect(getExerciseProgress(HISTORY, 'back squat', resolver).map((p) => p.weight))
      .toEqual([60, 65, 100]);
    // сам запис лишився з назвою користувача
    expect(HISTORY[0].exercises[0].name).toBe('Присідання');
  });

  it('відв’язка повертає все як було', async () => {
    await linkName('Присідання', 'back_squat');
    await unlinkName('присідання');
    expect(await getLinks()).toEqual({});
    const resolver = await buildResolver();
    expect(resolver({ name: 'Присідання' })).toBeNull();
    expect(getExerciseProgress(HISTORY, 'Присідання', resolver)).toHaveLength(2);
  });

  it('журнал зв’язків показує кількість записів і сирітські зв’язки', async () => {
    await linkName('Присідання', 'back_squat');
    await linkName('Щось своє', 'вправа_якої_немає');
    const rows = describeLinks(await getLinks(), countByName(HISTORY));

    const squat = rows.find((r) => r.key === 'присідання')!;
    expect(squat.records).toBe(2);
    expect(squat.target?.nameUk).toBe('Присідання зі штангою на спині');
    expect(squat.orphan).toBe(false);

    expect(rows.find((r) => r.key === 'щось своє')!.orphan).toBe(true);
  });
});

describe('власні вправи', () => {
  it('без «схожа на» не має патерну для замін, але рахується як силова', async () => {
    const ex = await addCustomExercise('Жим Сергія');
    const [lib] = await loadCustomExercises();
    expect(lib.id).toBe(ex.id);
    expect(lib.custom).toBe(true);
    expect(lib.baseId).toBeUndefined();
    expect(lib.metKind).toBe('strength');
    expect(getExercise(ex.id)?.nameUk).toBe('Жим Сергія');
  });

  it('зі «схожа на» успадковує патерн, м’язи й обладнання', async () => {
    const ex = await addCustomExercise('Жим із паузою', 'bench_press');
    await loadCustomExercises();
    const lib = getExercise(ex.id)!;
    const base = getExercise('bench_press')!;

    expect(lib.nameUk).toBe('Жим із паузою');
    expect(lib.pattern).toBe(base.pattern);
    expect(lib.muscles).toEqual(base.muscles);
    expect(lib.equipment).toEqual(base.equipment);
    expect(lib.metKind).toBe(base.metKind);
    expect(lib.baseId).toBe('bench_press');
  });

  it('видалена власна вправа зникає з реєстру', async () => {
    const ex = await addCustomExercise('Тимчасова');
    await loadCustomExercises();
    expect(getExercise(ex.id)).toBeDefined();

    await removeCustomExercise(ex.id);
    await loadCustomExercises();
    expect(getExercise(ex.id)).toBeUndefined();
  });

  it('власна вправа не перебиває назву з бібліотеки', async () => {
    await addCustomExercise('Станова тяга');
    const resolver = await buildResolver();
    expect(resolver({ name: 'Станова тяга' })).toBe('deadlift');
  });

  it('запис із exerciseId власної вправи показується її назвою', async () => {
    const ex = await addCustomExercise('Жим Сергія', 'bench_press');
    const resolver = await buildResolver();
    const hist = [w('2026-09-01', [
      { name: 'жим сергія', exerciseId: ex.id, sets: 3, reps: 8, weight: 70 },
    ])];
    expect(getPersonalRecords(hist, resolver)[0].exerciseName).toBe('Жим Сергія');
  });
});

describe('сховище', () => {
  it('зв’язки й власні вправи лежать під ключами з бекапу', async () => {
    await linkName('Присідання', 'back_squat');
    await addCustomExercise('Жим Сергія');
    expect(await AsyncStorage.getItem(LINKS_KEY)).toContain('back_squat');
    expect(await AsyncStorage.getItem(CUSTOM_KEY)).toContain('Жим Сергія');
  });

  it('пошкоджений ключ не ронить екран', async () => {
    await AsyncStorage.setItem(LINKS_KEY, '{зіпсовано');
    await expect(getLinks()).resolves.toEqual({});
  });
});
