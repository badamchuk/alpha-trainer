/**
 * Критерії приймання з ТЗ (docs/02-tz.md §8), закріплені тестами.
 *
 * Це не дублювання інших тестів: там перевіряються окремі функції, а тут —
 * обіцянки, дані користувачу. Якщо якась із них зламається, має впасти саме
 * цей файл, з номером критерію в назві.
 */
import { allExercises, getExercise, imageCoverage } from '../services/library';
import { findSubstitutions } from '../services/substitutions';
import { generateWorkout } from '../services/builder';
import { CROSSFIT_PRESET, GYM_PRESET } from '../services/equipment';
import { coverageOf } from '../services/exerciseMatch';
import { JointZone } from '../services/library/types';
import userNames from './fixtures/user-names.json';

const ZONES: JointZone[] = ['shoulder', 'lower_back', 'knee', 'wrist', 'elbow', 'impact'];

describe('A1 — розпізнавання назв історії', () => {
  // Назви — з реальної історії користувача (152 різні назви, 286 записів).
  // Саме на них будувалось розпізнавання, тому саме вони й перевіряються.
  const names = (userNames as { name: string; records: number }[]);
  const total = names.reduce((s, r) => s + r.records, 0);

  it('щонайменше 70% ЗАПИСІВ прив’язується автоматично', () => {
    const cov = coverageOf(names.flatMap((r) => Array(r.records).fill(r.name)));
    expect(cov.auto / total).toBeGreaterThanOrEqual(0.7);
  });

  it('щонайменше 70% РІЗНИХ назв прив’язується автоматично', () => {
    const cov = coverageOf(names.map((r) => r.name));
    expect(cov.auto / names.length).toBeGreaterThanOrEqual(0.7);
  });

  it('те, що лишається, — це неоднозначні назви, а не сміття', () => {
    const cov = coverageOf(names.map((r) => r.name));
    // «присідання», «велосипед», «прес», «махи», «випади» — їх розв'язує
    // екран F2.6; повністю невпізнаних має лишатись одиниці
    expect(cov.none).toBeLessThanOrEqual(3);
  });
});

describe('A2 — заміни для вправ із явними зв’язками', () => {
  const withLinks = allExercises().filter((ex) => (ex.easierThan?.length ?? 0) > 0);

  it('у бібліотеці є вправи з явними зв’язками «простіше»', () => {
    expect(withLinks.length).toBeGreaterThan(20);
  });

  it('кожна така вправа має що запропонувати', () => {
    for (const ex of withLinks) {
      const r = findSubstitutions({ exercise: ex });
      expect(r.easier.length + r.variations.length).toBeGreaterThan(0);
    }
  });

  it('усі варіанти споріднені: сімейство, патерн або явний зв’язок', () => {
    for (const ex of allExercises()) {
      const r = findSubstitutions({ exercise: ex });
      for (const o of [...r.easier, ...r.variations]) {
        const related = o.exercise.family === ex.family
          || o.exercise.pattern === ex.pattern
          || o.exercise.secondaryPattern === ex.pattern
          || (o.exercise.easierThan?.includes(ex.id) ?? false)
          || (ex.easierThan?.includes(o.exercise.id) ?? false);
        expect(related).toBe(true);
      }
    }
  });
});

describe('A3 — обмеження виконуються на всій бібліотеці', () => {
  it('фільтр обладнання не порушується жодного разу', () => {
    for (const ex of allExercises()) {
      const r = findSubstitutions({ exercise: ex, availableEquipment: [] });
      for (const o of [...r.easier, ...r.variations]) {
        expect(o.exercise.equipment).toEqual([]);
      }
    }
  });

  it('вправи з сильним навантаженням на бережену зону не пропонуються', () => {
    for (const zone of ZONES) {
      for (const ex of allExercises()) {
        const r = findSubstitutions({ exercise: ex, protectZones: [zone] });
        for (const o of [...r.easier, ...r.variations]) {
          expect(o.exercise.stress?.[zone] ?? 0).toBeLessThan(3);
        }
      }
    }
  });
});

describe('A4 — конструктор', () => {
  it('усі комбінації формату, часу й фокусу дають коректне тренування', () => {
    const cases = [
      { format: 'fullbody' as const, equipment: GYM_PRESET },
      { format: 'crossfit' as const, equipment: CROSSFIT_PRESET },
    ];
    for (const c of cases) {
      for (const durationMin of [30, 45, 60] as const) {
        for (const focus of ['strength', 'hypertrophy', 'endurance'] as const) {
          const d = generateWorkout({ ...c, durationMin, focus });
          const exercises = d.blocks.flatMap((b) => b.exercises);
          expect(exercises.length).toBeGreaterThan(2);

          // без повторів сімейств
          const families = exercises.map((e) => e.exercise.family);
          expect(new Set(families).size).toBe(families.length);

          // лише доступне обладнання
          for (const e of exercises) {
            for (const eq of e.exercise.equipment) expect(c.equipment).toContain(eq);
          }

          // у межах часу
          expect(d.estimatedMinutes).toBeLessThanOrEqual(durationMin * 1.15);
        }
      }
    }
  });
});

describe('A6 — ілюстрації', () => {
  it('картинки є щонайменше для 60% бібліотеки', () => {
    const { ratio, withImage, total } = imageCoverage();
    expect(ratio).toBeGreaterThanOrEqual(0.6);
    expect(withImage).toBeGreaterThan(100);
    expect(total).toBeGreaterThan(150);
  });

  it('базові рухи мають ілюстрацію', () => {
    const basics = [
      'back_squat', 'deadlift', 'bench_press', 'pull_up', 'push_up', 'plank',
      'burpee', 'kb_swing', 'strict_press', 'barbell_row',
    ];
    for (const id of basics) {
      expect(getExercise(id)?.imageSlug).toBeTruthy();
    }
  });
});
