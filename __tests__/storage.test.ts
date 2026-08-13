import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWorkouts, addWorkout, updateWorkout, deleteWorkout,
  getGoals, getUserProfile, getWeightLog, addWeightEntry,
  getPersonalRecords, getStats,
} from '../services/storage';
import { WorkoutEntry, ExerciseLog } from '../types';

const KEY_WORKOUTS = '@alpha_trainer:workouts';

const W = (id: string, date: string, exercises: ExerciseLog[] = []): WorkoutEntry => ({
  id, date, workoutType: 'strength', exercises, notes: '', duration: 60,
  completedAt: `${date}T10:00:00.000Z`,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('стійкість до пошкоджених даних', () => {
  // Бекенду немає — усе локально. Один битий байт не має класти додаток,
  // бо відновитись зсередини буде неможливо.

  it('getWorkouts повертає [] замість винятку', async () => {
    await AsyncStorage.setItem(KEY_WORKOUTS, '{"це":не валідний JSON');
    await expect(getWorkouts()).resolves.toEqual([]);
  });

  it('пошкоджені дані не знищуються, а відкладаються під окремий ключ', async () => {
    const broken = '{"це":не валідний JSON';
    await AsyncStorage.setItem(KEY_WORKOUTS, broken);
    await getWorkouts();

    const keys = await AsyncStorage.getAllKeys();
    const corrupt = keys.filter((k) => k.includes(':corrupt:'));
    expect(corrupt).toHaveLength(1);
    // вміст має лишитись цілим — інакше наступний addWorkout зітре історію
    await expect(AsyncStorage.getItem(corrupt[0])).resolves.toBe(broken);
  });

  it('профіль, цілі й вага теж не падають', async () => {
    await AsyncStorage.multiSet([
      ['@alpha_trainer:user_profile', 'зламано'],
      ['@alpha_trainer:goals', '[[['],
      ['@alpha_trainer:weight_log', '}{'],
    ]);
    await expect(getUserProfile()).resolves.toBeNull();
    await expect(getGoals()).resolves.toEqual([]);
    await expect(getWeightLog()).resolves.toEqual([]);
  });

  it('рядок "null" у сховищі дає дефолт, а не null', async () => {
    await AsyncStorage.setItem('@alpha_trainer:goals', 'null');
    await expect(getGoals()).resolves.toEqual([]);
  });

  it('валідні дані читаються як завжди', async () => {
    await AsyncStorage.setItem(KEY_WORKOUTS, JSON.stringify([W('1', '2026-08-01')]));
    const r = await getWorkouts();
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('1');
  });
});

describe('одночасні записи не перетирають один одного', () => {
  // Без черги операцій read-modify-write з 5 паралельних addWorkout
  // виживав один — решта губилась.

  it('усі паралельні addWorkout зберігаються', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((id, i) => addWorkout(W(id, `2026-08-0${i + 1}`)))
    );
    const after = await getWorkouts();
    expect(after).toHaveLength(5);
    expect(after.map((w) => w.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('паралельні видалення й оновлення застосовуються коректно', async () => {
    for (const id of ['a', 'b', 'c']) await addWorkout(W(id, '2026-08-01'));
    await Promise.all([
      deleteWorkout('a'),
      updateWorkout({ ...W('c', '2026-08-01'), notes: 'змінено' }),
    ]);
    const after = await getWorkouts();
    expect(after).toHaveLength(2);
    expect(after.find((w) => w.id === 'c')?.notes).toBe('змінено');
  });

  it('паралельні записи ваги не губляться', async () => {
    await Promise.all([
      addWeightEntry({ date: '2026-08-01', weight: 80 }),
      addWeightEntry({ date: '2026-08-02', weight: 81 }),
      addWeightEntry({ date: '2026-08-03', weight: 82 }),
    ]);
    await expect(getWeightLog()).resolves.toHaveLength(3);
  });
});

describe('getPersonalRecords з політними підходами', () => {
  const pyramid = W('p', '2026-08-01', [{
    name: 'Присід', sets: 3, reps: 3, weight: 90,
    setsDetail: [{ weight: 80, reps: 5 }, { weight: 85, reps: 5 }, { weight: 90, reps: 3 }],
  }]);

  it('бере максимум повторів по всіх підходах, а не з найважчого', async () => {
    // 80×5 / 85×5 / 90×3 — максимум повторів 5, а не 3
    const prs = await getPersonalRecords([pyramid]);
    expect(prs[0].maxWeight).toBe(90);
    expect(prs[0].maxReps).toBe(5);
  });

  it('працює зі старим форматом без setsDetail', async () => {
    const plain = W('x', '2026-08-01', [{ name: 'Жим', sets: 3, reps: 10, weight: 60 }]);
    const prs = await getPersonalRecords([plain]);
    expect(prs[0].maxWeight).toBe(60);
    expect(prs[0].maxReps).toBe(10);
  });
});

describe('передача готового масиву замість повторного читання', () => {
  it('getStats рахує з переданих даних', async () => {
    // у сховищі навмисно сміття — якщо функція полізе туди, тест впаде
    await AsyncStorage.setItem(KEY_WORKOUTS, '"НЕ ЧИТАТИ"');
    const s = await getStats([W('x', '2026-08-01'), W('y', '2026-08-02')]);
    expect(s.totalWorkouts).toBe(2);
  });
});
