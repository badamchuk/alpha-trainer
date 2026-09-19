/**
 * Заміни вправ (ТЗ F4) і приписи (F5.4).
 *
 * Найважливіше тут — те, чого користувач боявся: щоб список замін не був
 * «що попало». Тому тести перевіряють не лише «щось повернулось», а й що
 * саме не повернулось: інша частина тіла, недоступне обладнання, рух, який
 * б'є по зоні, яку просили берегти.
 */
import { tFor } from '../services/i18n';
import {
  applySubstitution, familiarityFrom, findSubstitutions, substitutionsFor,
} from '../services/substitutions';
import {
  cardioAmountText, convertCardio, formatPrescription, needsNewScheme, prescribe,
} from '../services/prescriptions';
import { getExercise, muscleGroupOf } from '../services/library';

const ex = (id: string) => getExercise(id)!;

describe('заміни: спорідненість', () => {
  it('до підтягувань пропонує саме підтягування, а не «щось на спину»', () => {
    const r = substitutionsFor('pull_up')!;
    const ids = [...r.easier, ...r.variations].map((o) => o.exercise.id);
    expect(ids).toContain('banded_pull_up');
    expect(ids).toContain('inverted_row');
    expect(ids).not.toContain('barbell_row');   // інший патерн — горизонтальна тяга
    expect(ids).not.toContain('bicep_curl');
  });

  it('усі варіанти — з тієї самої групи м’язів або споріднені за рухом', () => {
    const from = ex('bench_press');
    const r = findSubstitutions({ exercise: from });
    for (const o of [...r.easier, ...r.variations]) {
      const sameGroup = muscleGroupOf(o.exercise) === muscleGroupOf(from);
      const samePattern = o.exercise.pattern === from.pattern
        || o.exercise.secondaryPattern === from.pattern;
      expect(sameGroup || samePattern).toBe(true);
    }
  });

  it('у «простіше» не потрапляє складніша вправа', () => {
    const from = ex('push_up');
    const r = findSubstitutions({ exercise: from });
    for (const o of r.easier) {
      const explicitly = o.exercise.easierThan?.includes(from.id) ?? false;
      expect(explicitly || o.exercise.level < from.level).toBe(true);
    }
  });

  it('трастер не замінюється звичайним присіданням', () => {
    const ids = allIds('thruster');
    expect(ids).not.toContain('air_squat');
    expect(ids).not.toContain('back_squat');
  });
});

describe('заміни: обмеження', () => {
  it('без обладнання лишаються лише вправи з власною вагою', () => {
    const r = findSubstitutions({ exercise: ex('bench_press'), availableEquipment: [] });
    const all = [...r.easier, ...r.variations];
    expect(all.length).toBeGreaterThan(0);
    for (const o of all) expect(o.exercise.equipment).toEqual([]);
  });

  it('«берегти плече» прибирає вправи з сильним навантаженням на плече', () => {
    const r = findSubstitutions({ exercise: ex('bench_press'), protectZones: ['shoulder'] });
    for (const o of [...r.easier, ...r.variations]) {
      expect(o.exercise.stress?.shoulder ?? 0).toBeLessThan(3);
    }
  });

  it('помірне навантаження лишається, але з позначкою й нижче в списку', () => {
    const r = findSubstitutions({ exercise: ex('back_squat'), protectZones: ['knee'] });
    const all = [...r.easier, ...r.variations];
    const cautioned = all.filter((o) => o.cautionCode);
    for (const o of cautioned) expect(o.exercise.stress?.knee).toBe(2);
    // з позначкою — не перший у своєму блоці, якщо є чистіші варіанти
    if (r.easier.length > 1 && r.easier.some((o) => !o.cautionCode)) {
      expect(r.easier[0].cautionCode).toBeUndefined();
    }
  });

  it('присідання зі штангою під забороненим попереком зводяться до власної ваги', () => {
    // це не «нічого не знайшли», а правильна відповідь: без штанги й з бережним
    // попереком присідання з власною вагою — саме те, що треба
    const r = findSubstitutions({
      exercise: ex('back_squat'),
      availableEquipment: [],
      protectZones: ['lower_back'],
    });
    const ids = [...r.easier, ...r.variations].map((o) => o.exercise.id);
    expect(ids).toContain('air_squat');
    for (const o of [...r.easier, ...r.variations]) {
      expect(o.exercise.equipment).toEqual([]);
      expect(o.exercise.stress?.lower_back ?? 0).toBeLessThan(3);
    }
  });

  it('коли підібрати нічого — каже чому, а не показує випадкове', () => {
    const r = findSubstitutions({
      exercise: ex('air_squat'),
      availableEquipment: [],
      protectZones: ['knee', 'lower_back', 'impact', 'shoulder', 'wrist'],
    });
    expect(r.easier).toEqual([]);
    expect(r.variations).toEqual([]);
    expect(r.emptyReason).toBeTruthy();
  });

  it('порожній список ЗАВЖДИ супроводжується поясненням', () => {
    for (const from of ['back_squat', 'bench_press', 'run', 'plank', 'burpee']) {
      const r = findSubstitutions({
        exercise: ex(from), availableEquipment: [], protectZones: ['knee', 'shoulder'],
      });
      const total = r.easier.length + r.variations.length;
      expect(total > 0 || !!r.emptyReason).toBe(true);
    }
  });

  it('знайома вправа стоїть вище за незнайому', () => {
    const familiarity = familiarityFrom(
      Array.from({ length: 20 }, () => ({ name: 'Відтискання' })),
      () => 'push_up',
    );
    const withFam = findSubstitutions({ exercise: ex('bench_press'), familiarity });
    const plain = findSubstitutions({ exercise: ex('bench_press') });
    const pos = (r: typeof plain) => r.easier.findIndex((o) => o.exercise.id === 'push_up');
    expect(pos(withFam)).toBeLessThanOrEqual(pos(plain));
  });

  it('власні вправи без «схожа на» в заміни не йдуть', () => {
    const r = findSubstitutions({ exercise: ex('bench_press') });
    expect([...r.easier, ...r.variations].every((o) => !o.exercise.custom || o.exercise.baseId))
      .toBe(true);
  });
});

describe('приписи', () => {
  it('фокус визначає схему основної вправи', () => {
    expect(prescribe(ex('back_squat'), 'strength', 'main')).toMatchObject({ sets: 5, restSec: 150 });
    expect(prescribe(ex('back_squat'), 'hypertrophy', 'main')).toMatchObject({ sets: 4, restSec: 120 });
    expect(prescribe(ex('back_squat'), 'endurance', 'main')).toMatchObject({ sets: 3, restSec: 60 });
  });

  it('планка рахується часом, а не повторами', () => {
    const p = prescribe(ex('plank'), 'strength', 'main');
    expect(p.seconds).toBeGreaterThan(0);
    expect(p.reps).toBeUndefined();
  });

  it('вибуховий рух не отримує 15 повторів', () => {
    const p = prescribe(ex('box_jump'), 'endurance', 'main');
    expect(p.reps).toBeLessThanOrEqual(5);
  });

  it('схема оновлюється лише коли змінився намір вправи', () => {
    expect(needsNewScheme(ex('back_squat'), ex('front_squat'))).toBe(false);
    expect(needsNewScheme(ex('back_squat'), ex('box_jump'))).toBe(true);
  });

  it('підпис читається людиною', () => {
    expect(formatPrescription(prescribe(ex('back_squat'), 'strength', 'main'), tFor('uk')))
      .toBe('5×3–5, відпочинок 2:30');
    expect(formatPrescription(prescribe(ex('back_squat'), 'strength', 'main'), tFor('en')))
      .toBe('5×3–5, rest 2:30');
  });
});

describe('конверсія кардіо (F4.8)', () => {
  it('400 м бігу ≈ 500 м гребного', () => {
    const c = convertCardio(ex('run'), ex('row_erg'), { distanceKm: 0.4 })!;
    expect(c.distanceKm).toBeCloseTo(0.5, 2);
  });

  it('1000 м BikeErg ≈ 400 м бігу', () => {
    const c = convertCardio(ex('bike_erg'), ex('run'), { distanceKm: 1 })!;
    expect(c.distanceKm).toBeCloseTo(0.4, 2);
  });

  it('калорії гребного переводяться в повтори скакалки', () => {
    const c = convertCardio(ex('row_erg'), ex('jump_rope'), { calories: 25 })!;
    expect(c.reps).toBe(200);
  });

  it('підпис чесно каже, що це орієнтир — обома мовами', () => {
    const c = convertCardio(ex('run'), ex('row_erg'), { distanceKm: 0.8 })!;
    expect(cardioAmountText(c.amount, tFor('uk'))).toContain('орієнтовно');
    expect(cardioAmountText(c.amount, tFor('en'))).toContain('rough guide');
  });

  it('для силової вправи конверсії немає', () => {
    expect(convertCardio(ex('run'), ex('back_squat'), { distanceKm: 1 })).toBeNull();
  });
});

function allIds(id: string): string[] {
  const r = substitutionsFor(id)!;
  return [...r.easier, ...r.variations].map((o) => o.exercise.id);
}

describe('застосування заміни (F4.5–F4.6)', () => {
  const log = {
    name: 'Присідання зі штангою на спині', exerciseId: 'back_squat',
    sets: 5, reps: 5, weight: 100, supersetId: 'ss1', rpe: 8,
  };

  it('зберігає суперсет і позначку зусилля', () => {
    const next = applySubstitution(log, ex('back_squat'), ex('front_squat'));
    expect(next.supersetId).toBe('ss1');
    expect(next.rpe).toBe(8);
    expect(next.exerciseId).toBe('front_squat');
    expect(next.name).toBe('Фронтальні присідання');
  });

  it('за того самого наміру схема лишається як була', () => {
    const next = applySubstitution(log, ex('back_squat'), ex('front_squat'));
    expect(next.sets).toBe(5);
    expect(next.reps).toBe(5);
    expect(next.weight).toBe(100);   // снаряд той самий — вага має сенс
  });

  it('інший снаряд стирає вагу, але лишає повтори', () => {
    const withDetail = { ...log, setsDetail: [{ reps: 5, weight: 100 }, { reps: 5, weight: 105 }] };
    const next = applySubstitution(withDetail, ex('back_squat'), ex('goblet_squat'));
    expect(next.weight).toBeUndefined();
    expect(next.setsDetail).toEqual([{ reps: 5 }, { reps: 5 }]);
  });

  it('вага з історії підставляється, якщо вправа вже була', () => {
    const next = applySubstitution(log, ex('back_squat'), ex('goblet_squat'), 32);
    expect(next.weight).toBe(32);
  });

  it('зміна наміру оновлює схему підходів', () => {
    const next = applySubstitution(log, ex('back_squat'), ex('box_jump'));
    expect(next.sets).toBe(5);
    expect(next.reps).toBe(3);       // вибуховий рух — мало повторів
    expect(next.weight).toBeUndefined();
  });

  it('кардіо перераховується, а кількість підходів не змінюється', () => {
    const rowing = { name: 'Гребля', exerciseId: 'row_erg', sets: 6, calories: 25 };
    const next = applySubstitution(rowing, ex('row_erg'), ex('run'));
    expect(next.sets).toBe(6);
    expect(next.distance).toBeCloseTo(0.4, 2);
    expect(next.calories).toBeUndefined();
  });
});
