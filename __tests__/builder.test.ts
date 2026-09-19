/**
 * Конструктор тренування (ТЗ F5).
 *
 * Перевіряється не «щось згенерувалось», а чи це грамотне заняття: великий рух
 * на початку, протилежні патерни, розминка не з спринтів, схема відповідає
 * наміру вправи, і все вкладається в обраний час.
 */
import {
  BuilderInput, StoredDraft, WorkoutDraft, blockTitleText, draftFromStored, draftToExercises,
  estimateMinutes, generateWorkout, recentMainIds, replaceInDraft,
} from '../services/builder';
import { tFor } from '../services/i18n';
import { formatPrescription } from '../services/prescriptions';
import { getExercise } from '../services/library';
import { CROSSFIT_PRESET, GYM_PRESET } from '../services/equipment';
import { WorkoutEntry } from '../types';

const gym = (over: Partial<BuilderInput> = {}): BuilderInput => ({
  format: 'fullbody', durationMin: 60, focus: 'hypertrophy', equipment: GYM_PRESET, ...over,
});

const ids = (d: WorkoutDraft) => d.blocks.flatMap((b) => b.exercises.map((e) => e.exercise.id));
const block = (d: WorkoutDraft, kind: string) => d.blocks.find((b) => b.title.kind === kind);

describe('структура', () => {
  it('фулбоді 60 має розминку, дві основні, суперсет, кор і заминку', () => {
    const d = generateWorkout(gym());
    const roles = d.blocks.map((b) => b.role);
    expect(roles[0]).toBe('warmup');
    expect(roles).toContain('strength');
    expect(roles).toContain('accessory');
    expect(roles).toContain('core');
    expect(roles[roles.length - 1]).toBe('cooldown');
  });

  it('30 хвилин — коротша структура, але кор лишається', () => {
    const d = generateWorkout(gym({ durationMin: 30 }));
    expect(d.blocks.filter((b) => b.role === 'strength')).toHaveLength(2);
    expect(d.blocks.some((b) => b.role === 'core')).toBe(true);
    expect(d.blocks.filter((b) => b.role === 'accessory')).toHaveLength(0);
  });

  it('кросфіт має силову частину й метокон суперсетом', () => {
    const d = generateWorkout({ format: 'crossfit', durationMin: 45, equipment: CROSSFIT_PRESET });
    const metcon = d.blocks.find((b) => b.role === 'metcon')!;
    expect(metcon.exercises.length).toBeGreaterThanOrEqual(2);
    const ss = new Set(metcon.exercises.map((e) => e.supersetId));
    expect(ss.size).toBe(1);
    expect(metcon.note).toBeTruthy();
  });

  it('вправи не повторюються в межах тренування', () => {
    const all = ids(generateWorkout(gym()));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('осмисленість вибору', () => {
  it('основна вправа — силова, а не метокон', () => {
    const d = generateWorkout(gym());
    for (const b of d.blocks.filter((x) => x.role === 'strength')) {
      for (const e of b.exercises) {
        expect(['max_strength', 'hypertrophy']).toContain(e.exercise.intent);
      }
    }
  });

  it('у розминці немає спринтів, стрибків і плавання', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const d = generateWorkout(gym(), seed);
      for (const b of d.blocks.filter((x) => x.role === 'warmup')) {
        for (const e of b.exercises) {
          expect(['sprint', 'explosive', 'swim']).not.toContain(e.exercise.metKind);
        }
      }
    }
  });

  it('у залі основним стає рух зі штангою, а не відтискання', () => {
    const d = generateWorkout(gym());
    const main = block(d, 'mainUpper')!.exercises[0].exercise;
    expect(main.equipment.length).toBeGreaterThan(0);
  });

  it('верх і низ не дублюються: A — ноги, B — верх', () => {
    const d = generateWorkout(gym());
    const a = block(d, 'mainLegs')!.exercises[0].exercise;
    const b = block(d, 'mainUpper')!.exercises[0].exercise;
    expect(['squat', 'hinge']).toContain(a.pattern);
    expect(['push_horizontal', 'pull_vertical']).toContain(b.pattern);
  });

  it('схема відповідає фокусу', () => {
    const strength = generateWorkout(gym({ focus: 'strength' }));
    const p = block(strength, 'mainLegs')!.exercises[0].prescription;
    expect(p.repsLabel).toBe('3–5');
    expect(p.restSec).toBeGreaterThanOrEqual(150);
  });

  it('підпис повторів не суперечить самим повторам', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const e of generateWorkout(gym(), seed).blocks.flatMap((b) => b.exercises)) {
        const { reps, repsLabel } = e.prescription;
        if (reps === undefined || !repsLabel) continue;
        const bounds = repsLabel.split(/[–\-]/).map(Number).filter((n) => !Number.isNaN(n));
        if (bounds.length < 2) continue;
        expect(reps).toBeGreaterThanOrEqual(Math.min(...bounds));
        expect(reps).toBeLessThanOrEqual(Math.max(...bounds));
      }
    }
  });
});

describe('обмеження користувача', () => {
  it('без обладнання всі вправи — з власною вагою', () => {
    const d = generateWorkout(gym({ equipment: [] }));
    for (const e of d.blocks.flatMap((b) => b.exercises)) {
      expect(e.exercise.equipment).toEqual([]);
    }
  });

  it('берегти коліно — жодної вправи з сильним навантаженням на коліно', () => {
    const d = generateWorkout(gym({ protectZones: ['knee'] }));
    for (const e of d.blocks.flatMap((b) => b.exercises)) {
      expect(e.exercise.stress?.knee ?? 0).toBeLessThan(3);
    }
  });

  it('новачку не пропонують вправи третього рівня', () => {
    const d = generateWorkout(gym({ level: 1 }));
    for (const e of d.blocks.flatMap((b) => b.exercises)) {
      expect(e.exercise.level).toBe(1);
    }
  });

  it('порожній слот пояснює причину, решта тренування будується далі', () => {
    const d = generateWorkout(gym({ equipment: [], protectZones: ['wrist', 'knee', 'impact', 'shoulder'] }));
    const empty = d.blocks.filter((b) => b.exercises.length === 0);
    for (const b of empty) expect(b.emptyReason).toBeTruthy();
    expect(d.blocks.some((b) => b.exercises.length > 0)).toBe(true);
  });

  it('вправи з минулих тренувань не повторюються', () => {
    const plain = generateWorkout(gym());
    const repeated = block(plain, 'mainLegs')!.exercises[0].exercise.id;
    const avoided = generateWorkout(gym({ recentIds: [repeated] }));
    expect(block(avoided, 'mainLegs')!.exercises[0].exercise.id).not.toBe(repeated);
  });
});

describe('час', () => {
  it.each([30, 45, 60] as const)('оцінка вкладається в %i хв ±15%%', (duration) => {
    for (let seed = 1; seed <= 8; seed++) {
      const d = generateWorkout(gym({ durationMin: duration }), seed);
      expect(d.estimatedMinutes).toBeGreaterThanOrEqual(duration * 0.75);
      expect(d.estimatedMinutes).toBeLessThanOrEqual(duration * 1.15);
    }
  });

  it('кросфіт теж вкладається у відведений час', () => {
    for (const duration of [30, 45, 60] as const) {
      const d = generateWorkout({ format: 'crossfit', durationMin: duration, equipment: CROSSFIT_PRESET });
      expect(d.estimatedMinutes).toBeLessThanOrEqual(duration * 1.15);
    }
  });

  it('оцінка часу рахує підходи, повтори й відпочинок', () => {
    const d = generateWorkout(gym());
    expect(estimateMinutes(d.blocks)).toBe(d.estimatedMinutes);
    expect(d.estimatedMinutes).toBeGreaterThan(20);
  });
});

describe('детермінованість і перенесення', () => {
  it('той самий seed дає той самий результат', () => {
    expect(ids(generateWorkout(gym(), 42))).toEqual(ids(generateWorkout(gym(), 42)));
  });

  it('«перегенерувати» змінює набір вправ', () => {
    const first = ids(generateWorkout(gym(), 42, 0));
    const second = ids(generateWorkout(gym(), 42, 1));
    expect(second).not.toEqual(first);
  });

  it('чернетка перетворюється на вправи з id і суперсетами', () => {
    const d = generateWorkout(gym());
    const logs = draftToExercises(d);
    expect(logs.length).toBe(ids(d).length);
    expect(logs.every((l) => !!l.exerciseId)).toBe(true);
    expect(logs.some((l) => !!l.supersetId)).toBe(true);
  });

  it('основні вправи минулих тренувань дістаються з історії', () => {
    const workouts: WorkoutEntry[] = [{
      id: '1', date: '2026-09-10', workoutType: 'strength', notes: '', duration: 60,
      completedAt: '2026-09-10T10:00:00.000Z',
      exercises: [{ name: 'Присідання зі штангою на спині', exerciseId: 'back_squat' }],
    }];
    expect(recentMainIds(workouts, 'fullbody', (e) => e.exerciseId ?? null)).toEqual(['back_squat']);
  });
});

describe('заміна вправи в чернетці', () => {
  const draft = () => generateWorkout(gym({ durationMin: 60 }));
  const mainIdx = (d: WorkoutDraft) => d.blocks.findIndex((b) => b.title.kind === 'mainLegs');

  it('нова вправа стає на місце старої', () => {
    const d = draft();
    const i = mainIdx(d);
    const next = getExercise('goblet_squat')!;
    const out = replaceInDraft(d, i, 0, next);
    expect(out.blocks[i].exercises[0].exercise.id).toBe('goblet_squat');
    expect(out.blocks.length).toBe(d.blocks.length);
  });

  it('за іншого наміру схема береться нова цілком, разом із відпочинком', () => {
    const d = draft();
    const i = mainIdx(d);
    const before = d.blocks[i].exercises[0].prescription;
    const out = replaceInDraft(d, i, 0, getExercise('air_squat')!);
    const after = out.blocks[i].exercises[0].prescription;
    expect(before.restSec).toBeGreaterThan(90);
    // присідання з власною вагою не потребують двохвилинного відпочинку
    expect(after.restSec).toBeLessThan(90);
  });

  it('за того самого наміру схема лишається', () => {
    const d = draft();
    const i = mainIdx(d);
    const before = d.blocks[i].exercises[0].prescription;
    const out = replaceInDraft(d, i, 0, getExercise('front_squat')!);
    expect(out.blocks[i].exercises[0].prescription).toEqual(before);
  });

  it('оцінка часу перераховується після заміни', () => {
    const d = draft();
    const out = replaceInDraft(d, mainIdx(d), 0, getExercise('air_squat')!);
    expect(out.estimatedMinutes).toBe(estimateMinutes(out.blocks));
  });
});

describe('перенесення у форму запису', () => {
  it('тривалість не тягне хвіст із дробів', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const log of draftToExercises(generateWorkout(gym(), seed))) {
        if (log.duration === undefined) continue;
        expect(log.duration).toBe(Math.round(log.duration * 10) / 10);
      }
    }
  });
});

describe('здоровий глузд (знайдено на телефоні)', () => {
  it('плавання не потрапляє в зал — для нього потрібен басейн', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const format of ['fullbody', 'crossfit'] as const) {
        const d = generateWorkout({
          format, durationMin: 45, equipment: CROSSFIT_PRESET,
        }, seed);
        const ids = d.blocks.flatMap((b) => b.exercises.map((e) => e.exercise.id));
        expect(ids).not.toContain('swimming');
      }
    }
  });

  it('з басейном плавання знову можливе', () => {
    const ex = getExercise('swimming')!;
    expect(ex.equipment).toContain('pool');
  });

  it('розминка й заминка не тривають по 5 хвилин однією вправою', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const d = generateWorkout(gym(), seed);
      for (const b of d.blocks.filter((x) => x.role === 'warmup' || x.role === 'cooldown')) {
        for (const e of b.exercises) {
          if (e.prescription.seconds) expect(e.prescription.seconds).toBeLessThanOrEqual(180);
          // мобільність — не довше хвилини
          if (!e.exercise.cardio && e.prescription.seconds) {
            expect(e.prescription.seconds).toBeLessThanOrEqual(60);
          }
        }
      }
    }
  });
});

describe('сумісність зі старими чернетками', () => {
  // до 1.5.0 назва блоку зберігалась готовим рядком; оновлення не має
  // викидати чернетку, над якою людина вже посиділа
  const legacy = {
    workoutType: 'strength',
    format: 'fullbody',
    durationMin: 60,
    seed: 1,
    attempt: 0,
    blocks: [
      {
        role: 'strength',
        title: 'A. Основна — ноги',
        note: 'AMRAP 12 хв',
        exercises: [{ id: 'back_squat', prescription: { sets: 5, reps: 5, restSec: 150 } }],
      },
      {
        role: 'core',
        title: 'Кор',
        emptyReason: 'Немає підхожої вправи під твоє обладнання',
        exercises: [],
      },
    ],
  } as unknown as StoredDraft;

  it('назва-рядок стає текстовим кодом і показується як була', () => {
    const d = draftFromStored(legacy);
    expect(d.blocks[0].title).toEqual({ kind: 'text', text: 'A. Основна — ноги' });
    expect(blockTitleText(d.blocks[0].title, tFor('en'))).toBe('A. Основна — ноги');
    expect(d.blocks[0].exercises).toHaveLength(1);
  });

  it('примітка й причина порожнечі теж не ламаються', () => {
    const d = draftFromStored(legacy);
    expect(d.blocks[0].note).toEqual({ kind: 'text', text: 'AMRAP 12 хв' });
    expect(d.blocks[1].emptyReason?.kind).toBe('text');
    expect(d.estimatedMinutes).toBeGreaterThan(0);
  });
});

describe('кардіо в метоконі', () => {
  const uk = tFor('uk');

  it('схема показує метри, а не «1×120 с»', () => {
    expect(formatPrescription({ sets: 1, seconds: 120, restSec: 0, distanceM: 500 }, uk))
      .toBe('500 м');
    expect(formatPrescription({ sets: 3, seconds: 120, restSec: 0, calories: 20 }, uk))
      .toBe('3×20 ккал');
  });

  it('у чернетці кардіо несе відстань у вправу форми', () => {
    // шукаємо метокон із кардіо серед кількох сідів — вони різні за складом
    let found = false;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const d = generateWorkout({ format: 'crossfit', durationMin: 60 }, seed);
      const metcon = d.blocks.find((b) => b.role === 'metcon');
      const cardio = metcon?.exercises.find((e) => e.prescription.distanceM);
      if (!cardio) continue;
      found = true;
      const log = draftToExercises(d).find((l) => l.exerciseId === cardio.exercise.id)!;
      expect(log.distance).toBeCloseTo(cardio.prescription.distanceM! / 1000, 3);
    }
    expect(found).toBe(true);
  });
});
