/**
 * Контекст бібліотеки для AI (план §3).
 *
 * Перевіряємо ФАКТИ, а не формулювання: які вправи потрапили в перелік, чи є
 * там заборонене, чи не роздувся блок. Текст промпту можна переписувати скільки
 * завгодно — тести від цього падати не мають.
 */
import {
  availableExercises, buildAIContext, buildExerciseContext, describeToday, describeWorkout,
  parseExerciseIds, stripExerciseIds,
} from '../services/aiContext';
import { getExercise } from '../services/library';
import { createResolver } from '../services/exerciseMatch';
import { UserProfile, WorkoutEntry } from '../types';

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  name: 'Тест', age: 40, weight: 100, height: 190, fitnessLevel: 'intermediate',
  availableDays: [2, 4], equipment: ['Тренажерний зал'], geminiApiKey: '',
  onboardingComplete: true, ...over,
});

describe('перелік доступних вправ', () => {
  it('поважає обладнання користувача', () => {
    const list = availableExercises({ profile: profile({ equipment: ['Лише власна вага'] }) });
    expect(list.length).toBeGreaterThan(10);
    for (const ex of list) expect(ex.equipment).toEqual([]);
  });

  it('прибирає вправи, що б’ють по береженій зоні', () => {
    const list = availableExercises({ profile: profile({ protectZones: ['knee'] }) });
    for (const ex of list) expect(ex.stress?.knee ?? 0).toBeLessThan(3);
  });

  it('новачку не показує складні вправи', () => {
    const list = availableExercises({ profile: profile({ fitnessLevel: 'beginner' }) });
    for (const ex of list) expect(ex.level).toBe(1);
  });

  it('знайома вправа потрапляє в перелік навіть якщо складніша за рівень', () => {
    // станова тяга — «складно», але якщо людина робить її щотижня, ховати
    // її від тренера безглуздо
    const w: WorkoutEntry = {
      id: '1', date: '2026-09-01', workoutType: 'strength', notes: '', duration: 60,
      completedAt: '2026-09-01T10:00:00.000Z',
      exercises: Array.from({ length: 5 }, () => ({ name: 'Станова тяга' })),
    };
    const ids = availableExercises({
      profile: profile(), workouts: [w], resolver: createResolver(),
    }).map((e) => e.id);
    expect(ids).toContain('deadlift');
    expect(ids[0]).toBe('deadlift');   // ще й першою, бо найзнайоміша
  });

  it('незнайома складна вправа лишається прихованою', () => {
    const ids = availableExercises({ profile: profile() }).map((e) => e.id);
    for (const id of ids) {
      const ex = getExercise(id)!;
      expect(ex.level).toBeLessThanOrEqual(2);
    }
  });

  it('знайомі вправи йдуть першими', () => {
    const w: WorkoutEntry = {
      id: '1', date: '2026-09-01', workoutType: 'strength', notes: '', duration: 60,
      completedAt: '2026-09-01T10:00:00.000Z',
      exercises: Array.from({ length: 5 }, () => ({ name: 'Станова тяга' })),
    };
    const list = availableExercises({
      profile: profile(), workouts: [w], resolver: createResolver(),
    });
    expect(list[0].id).toBe('deadlift');
  });

  it('не перевищує ліміт', () => {
    expect(availableExercises({ profile: profile() }).length).toBeLessThanOrEqual(80);
    expect(availableExercises({ profile: profile(), maxExercises: 10 }).length).toBe(10);
  });
});

describe('блок для промпту', () => {
  const text = buildExerciseContext({ profile: profile({ protectZones: ['shoulder'] }) });

  it('містить id вправ, щоб на них можна було послатись', () => {
    expect(text).toContain('back_squat');
    expect(text).toMatch(/\[back_squat\]|back_squat —/);
  });

  it('називає обмеження словами', () => {
    expect(text).toContain('плече');
  });

  it('не тягне в промпт усю бібліотеку', () => {
    // 80 вправ по рядку — приблизно 6 КБ; більше означає, що ліміт зламався
    expect(text.length).toBeLessThan(9000);
  });

  it('без профілю все одно дає перелік', () => {
    expect(buildExerciseContext({ profile: null }).length).toBeGreaterThan(100);
  });
});

describe('історія очима бібліотеки', () => {
  const w: WorkoutEntry = {
    id: '1', date: '2026-09-01', workoutType: 'strength', notes: '', duration: 60,
    completedAt: '2026-09-01T10:00:00.000Z',
    exercises: [
      { name: 'front squad', sets: 3, reps: 5, weight: 80 },
      { name: 'Щось своє', sets: 3, reps: 10 },
    ],
  };

  it('впізнану вправу подає канонічно з id', () => {
    const text = describeWorkout(w, createResolver());
    expect(text).toContain('Фронтальні присідання [front_squat]');
    expect(text).toContain('3×5 @ 80кг');
  });

  it('невпізнану лишає як написав користувач', () => {
    expect(describeWorkout(w, createResolver())).toContain('Щось своє');
  });

  it('без резолвера — старий вигляд', () => {
    expect(describeWorkout(w)).toContain('front squad');
  });
});

describe('розбір відповіді AI', () => {
  it('витягує вправи з дужок', () => {
    const found = parseExerciseIds('Роби Присідання [back_squat] і Тяга [deadlift].');
    expect(found.map((e) => e.id)).toEqual(['back_squat', 'deadlift']);
  });

  it('вигадані id відкидає', () => {
    expect(parseExerciseIds('Спробуй [super_mega_lift]')).toEqual([]);
  });

  it('не дублює однакові вправи', () => {
    expect(parseExerciseIds('[back_squat] і ще раз [back_squat]')).toHaveLength(1);
  });

  it('прибирає технічні дужки з тексту для показу', () => {
    const shown = stripExerciseIds('Присідання [back_squat] — 5×5.');
    expect(shown).toBe('Присідання — 5×5.');
  });

  it('чужі дужки лишає як є', () => {
    const shown = stripExerciseIds('Це просто [примітка] у тексті.');
    expect(shown).toContain('[примітка]');
  });

  it('вправа з відповіді має все для показу', () => {
    const [ex] = parseExerciseIds('[pull_up]');
    expect(ex.nameUk).toBe('Підтягування');
    expect(getExercise('pull_up')?.cues.length).toBeGreaterThan(1);
  });
});

describe('сьогоднішній день у контексті', () => {
  it('називає день тижня й дату', () => {
    // 18 вересня 2026 — п'ятниця
    const text = describeToday(profile(), new Date('2026-09-18T10:00:00'));
    expect(text).toContain('п’ятниця');
    expect(text).toContain('18 вересня 2026');
  });

  it('каже, чи це тренувальний день за розкладом', () => {
    const p = profile({ availableDays: [2, 4] });   // вівторок і четвер
    expect(describeToday(p, new Date('2026-09-15T10:00:00'))).toContain('тренувальний день');
    expect(describeToday(p, new Date('2026-09-18T10:00:00'))).toContain('день відпочинку');
  });

  it('без розкладу не вигадує', () => {
    const text = describeToday(profile({ availableDays: [] }), new Date('2026-09-18T10:00:00'));
    expect(text).not.toContain('розклад');
  });

  it('потрапляє у зібраний контекст', () => {
    const blocks = buildAIContext({ profile: profile() });
    expect(blocks.today).toContain('СЬОГОДНІ');
    expect(blocks.exercises.length).toBeGreaterThan(100);
  });
});
