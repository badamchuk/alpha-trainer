import {
  estimate1RM, exerciseTonnage, exerciseSetCount,
  classifyExercise, computePace, formatPace, getRunStats,
} from '../services/analytics';
import { WorkoutEntry, ExerciseLog } from '../types';

const run = (id: string, date: string, over: Partial<WorkoutEntry> = {}): WorkoutEntry => ({
  id, date, workoutType: 'run', exercises: [], notes: '', duration: 30,
  completedAt: `${date}T10:00:00.000Z`, ...over,
});

describe('estimate1RM (Epley)', () => {
  it('на одному повторі повертає саму вагу', () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it('рахує за формулою: 100кг × 5 → 117', () => {
    expect(estimate1RM(100, 5)).toBe(117); // 100 * (1 + 5/30)
  });

  it('обмежує 12 повтореннями — далі формула бреше', () => {
    // 20 повторів мають дати те саме, що й 12, а не роздутий результат
    expect(estimate1RM(100, 20)).toBe(estimate1RM(100, 12));
  });

  it('віддає 0 на некоректних вхідних даних', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(100, -3)).toBe(0);
  });
});

describe('exerciseTonnage', () => {
  it('рахує зі зведених полів', () => {
    expect(exerciseTonnage({ name: 'Жим', sets: 3, reps: 10, weight: 50 })).toBe(1500);
  });

  it('політні підходи рахуються по кожному окремо', () => {
    // 80×5 + 85×5 + 90×3 = 400 + 425 + 270
    const e: ExerciseLog = {
      name: 'Присід', sets: 3, reps: 3, weight: 90,
      setsDetail: [{ weight: 80, reps: 5 }, { weight: 85, reps: 5 }, { weight: 90, reps: 3 }],
    };
    expect(exerciseTonnage(e)).toBe(1095);
  });

  it('вправа без ваги дає 0, а не NaN', () => {
    expect(exerciseTonnage({ name: 'Планка', duration: 2 })).toBe(0);
  });
});

describe('exerciseSetCount', () => {
  it('бере довжину setsDetail, коли він є', () => {
    expect(exerciseSetCount({
      name: 'Присід', sets: 99,
      setsDetail: [{ reps: 5 }, { reps: 5 }],
    })).toBe(2);
  });

  it('інакше бере sets', () => {
    expect(exerciseSetCount({ name: 'Жим', sets: 4 })).toBe(4);
  });

  it('без даних вважає за один підхід', () => {
    expect(exerciseSetCount({ name: 'Щось' })).toBe(1);
  });
});

describe('classifyExercise', () => {
  it('розрізняє групи мʼязів українською', () => {
    expect(classifyExercise('Присідання зі штангою')).toBe('legs');
    expect(classifyExercise('Жим лежачи')).toBe('chest');
    expect(classifyExercise('Підтягування')).toBe('back');
    expect(classifyExercise('Планка')).toBe('core');
  });

  it('розрізняє групи англійською', () => {
    expect(classifyExercise('Bench press')).toBe('chest');
    expect(classifyExercise('Deadlift')).toBe('back');
  });

  it('специфічні патерни виграють у загальних', () => {
    // "згинання ніг" — біцепс стегна, а не квадрицепс
    expect(classifyExercise('Згинання ніг лежачи')).toBe('hamstrings');
    expect(classifyExercise('Розгинання ніг')).toBe('legs');
  });

  it('не залежить від регістру й пробілів', () => {
    expect(classifyExercise('  ПЛАНКА  ')).toBe('core');
  });

  it('повертає null для невідомого', () => {
    expect(classifyExercise('фыва123')).toBeNull();
  });
});

describe('темп бігу', () => {
  it('computePace: 10 км за 50 хв = 300 с/км', () => {
    expect(computePace(10, 50)).toBe(300);
  });

  it('formatPace форматує як хв:сс', () => {
    expect(formatPace(300)).toBe('5:00/км');
    expect(formatPace(330)).toBe('5:30/км');
  });
});

describe('getRunStats', () => {
  it('рахує дистанцію з рівня тренування', () => {
    const s = getRunStats([run('1', '2026-08-01', { totalDistance: 10, duration: 50 })]);
    expect(s.totalRuns).toBe(1);
    expect(s.totalDistanceKm).toBe(10);
  });

  it('бачить дистанцію, записану у вправі', () => {
    // форма дозволяє обидва способи — раніше цей варіант давав нулі
    const s = getRunStats([
      run('1', '2026-08-01', {
        duration: 50,
        exercises: [{ name: 'Біг', distance: 7 }],
      }),
    ]);
    expect(s.totalDistanceKm).toBe(7);
  });

  it('рівень тренування має пріоритет над вправами', () => {
    const s = getRunStats([
      run('1', '2026-08-01', {
        totalDistance: 10, duration: 50,
        exercises: [{ name: 'Біг', distance: 7 }],
      }),
    ]);
    expect(s.totalDistanceKm).toBe(10);
  });

  it('ігнорує тренування інших типів', () => {
    const s = getRunStats([
      { ...run('1', '2026-08-01', { totalDistance: 10 }), workoutType: 'strength' },
    ]);
    expect(s.totalRuns).toBe(0);
  });
});
