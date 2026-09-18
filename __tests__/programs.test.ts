/**
 * Багатотижневі програми (docs/06-plan-programs.md).
 *
 * Найважливіше: прогресія має бути передбачуваною наперед — людина довіряє їй
 * два місяці свого життя. Тому тести рахують ваги на всі тижні, а не «чи щось
 * повернулось».
 */
import { PROGRAMS, getProgram } from '../services/programs/data';
import {
  backoffsFor, isDeloadWeek, nextDay, prescriptionFor, programDayToExercises,
  progressionPreview,
} from '../services/programs/engine';
import { ActiveProgram, dayKey } from '../services/programs/types';
import { getExercise } from '../services/library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createResolver } from '../services/exerciseMatch';
import {
  currentDay, getActiveProgram, markDayDone, repeatWeek, startProgram, suggestBaseWeights,
} from '../services/programs/storage';

const linear = getProgram('linear_strength')!;
const volume = getProgram('volume_mass')!;
const cycle = getProgram('crossfit_cycle')!;
const bodyweight = getProgram('bodyweight_base')!;

const active = (over: Partial<ActiveProgram> = {}): ActiveProgram => ({
  templateId: linear.id, startedAt: '2026-09-01T10:00:00.000Z',
  baseWeights: { back_squat: 100, bench_press: 80, deadlift: 120 },
  done: [], ...over,
});

describe('цілісність даних', () => {
  it('усі вправи програм існують у бібліотеці', () => {
    const missing: string[] = [];
    for (const p of PROGRAMS) {
      for (const d of p.days) {
        for (const s of d.slots) if (!getExercise(s.exerciseId)) missing.push(`${p.id}/${s.exerciseId}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('кожна програма має обидві мови й опис', () => {
    for (const p of PROGRAMS) {
      expect(p.nameUk.length).toBeGreaterThan(2);
      expect(p.nameEn.length).toBeGreaterThan(2);
      expect(p.summaryUk.length).toBeGreaterThan(40);
      expect(p.summaryEn.length).toBeGreaterThan(40);
      for (const d of p.days) {
        expect(d.titleUk).toBeTruthy();
        expect(d.titleEn).toBeTruthy();
      }
    }
  });

  it('програма без обладнання справді обходиться без нього', () => {
    for (const d of bodyweight.days) {
      for (const s of d.slots) {
        expect(getExercise(s.exerciseId)!.equipment).toEqual([]);
      }
    }
  });

  it('назви не використовують чужих торгових марок', () => {
    const forbidden = /5\/3\/1|stronglifts|starting strength|wendler|nsuns/i;
    for (const p of PROGRAMS) {
      expect(p.nameUk + p.nameEn + p.summaryUk + p.summaryEn).not.toMatch(forbidden);
    }
  });
});

describe('лінійна прогресія', () => {
  const squat = linear.days[0].slots[0];

  it('вага росте на крок щотижня', () => {
    const w1 = prescriptionFor(linear, squat, 1, 100);
    const w2 = prescriptionFor(linear, squat, 2, 100);
    const w4 = prescriptionFor(linear, squat, 4, 100);
    expect(w1.weight).toBe(100);
    expect(w2.weight).toBe(102.5);
    expect(w4.weight).toBe(107.5);
  });

  it('тиждень розвантаження легший за попередній', () => {
    const w7 = prescriptionFor(linear, squat, 7, 100)!;
    const w8 = prescriptionFor(linear, squat, 8, 100)!;
    expect(isDeloadWeek(linear, 8)).toBe(true);
    expect(w8.weight!).toBeLessThan(w7.weight!);
    expect(w8.hint).toContain('розвантаження');
  });

  it('розвантаження рахується від поточної ваги, а не від стартової', () => {
    // після семи тижнів працюємо з 115 кг; розвантаження має бути ~60–70%
    // саме від неї, інакше це вже інша вправа
    const w7 = prescriptionFor(linear, squat, 7, 100).weight!;
    const w8 = prescriptionFor(linear, squat, 8, 100).weight!;
    expect(w8).toBeGreaterThan(w7 * 0.5);
    expect(w8).toBeLessThan(w7 * 0.75);
  });

  it('вага округлюється до дисків', () => {
    for (let week = 1; week <= linear.weeks; week++) {
      const p = prescriptionFor(linear, squat, week, 97);
      expect((p.weight! * 10) % 25).toBe(0);
    }
  });

  it('без робочої ваги дає цільове зусилля, а не порожнечу', () => {
    const p = prescriptionFor(linear, squat, 1);
    expect(p.weight).toBeUndefined();
    expect(p.rpe).toBeGreaterThan(6);
  });

  it('допоміжні вправи не ростуть щотижня разом з основними', () => {
    const accessory = linear.days[0].slots[2];
    expect(prescriptionFor(linear, accessory, 1, 60).weight)
      .toBe(prescriptionFor(linear, accessory, 5, 60).weight);
  });
});

describe('обʼємна прогресія', () => {
  const main = volume.days[0].slots[0];

  it('підходи додаються кожні два тижні, вага та сама', () => {
    expect(prescriptionFor(volume, main, 1, 100).sets).toBe(4);
    expect(prescriptionFor(volume, main, 3, 100).sets).toBe(5);
    expect(prescriptionFor(volume, main, 5, 100).sets).toBe(6);
    expect(prescriptionFor(volume, main, 1, 100).weight)
      .toBe(prescriptionFor(volume, main, 5, 100).weight);
  });

  it('на розвантаженні обсяг падає', () => {
    const d = prescriptionFor(volume, main, 6, 100);
    expect(d.sets).toBeLessThan(prescriptionFor(volume, main, 5, 100).sets);
  });
});

describe('хвиля відсотків', () => {
  const main = cycle.days[0].slots[0];

  it('три тижні вгору, четвертий легший', () => {
    const w = [1, 2, 3, 4].map((n) => prescriptionFor(cycle, main, n, 100).weight!);
    expect(w[0]).toBeLessThan(w[1]);
    expect(w[1]).toBeLessThan(w[2]);
    expect(w[3]).toBeLessThan(w[0]);
  });

  it('цикл повторюється з пʼятого тижня', () => {
    expect(prescriptionFor(cycle, main, 5, 100).weight)
      .toBe(prescriptionFor(cycle, main, 1, 100).weight);
  });
});

describe('коли не вийшло', () => {
  const squat = linear.days[0].slots[0];

  it('вага відкочується приблизно на десяту', () => {
    const normal = prescriptionFor(linear, squat, 3, 100).weight!;
    const after = prescriptionFor(linear, squat, 3, 100, 1).weight!;
    expect(after).toBeLessThan(normal);
    expect(after).toBeGreaterThan(normal * 0.85);
    expect(prescriptionFor(linear, squat, 3, 100, 1).hint).toContain('відкочена');
  });

  it('другий відкат ще нижчий', () => {
    const one = prescriptionFor(linear, squat, 3, 100, 1).weight!;
    const two = prescriptionFor(linear, squat, 3, 100, 2).weight!;
    expect(two).toBeLessThan(one);
  });

  it('стан програми памʼятає відкати', () => {
    expect(backoffsFor(active({ repeated: { 3: 2 } }), 3)).toBe(2);
    expect(backoffsFor(active(), 3)).toBe(0);
  });
});

describe('рух програмою', () => {
  it('перший день — тиждень 1, день 1', () => {
    const n = nextDay(linear, active())!;
    expect(n.week).toBe(1);
    expect(n.day).toBe(1);
    expect(n.totalDays).toBe(linear.weeks * linear.days.length);
  });

  it('пропущений день не ламає нумерацію', () => {
    // зроблено другий день першого тижня, перший пропущено
    const n = nextDay(linear, active({ done: [dayKey(1, 2)] }))!;
    expect(n.week).toBe(1);
    expect(n.day).toBe(1);
  });

  it('після останнього дня програма завершується', () => {
    const all: string[] = [];
    for (let w = 1; w <= linear.weeks; w++) {
      for (let d = 1; d <= linear.days.length; d++) all.push(dayKey(w, d));
    }
    expect(nextDay(linear, active({ done: all }))).toBeNull();
  });

  it('прогрес рахується днями', () => {
    const n = nextDay(linear, active({ done: [dayKey(1, 1), dayKey(1, 2)] }))!;
    expect(n.doneCount).toBe(2);
  });
});

describe('день програми у форму запису', () => {
  it('вправи мають id, підходи й вагу', () => {
    const logs = programDayToExercises(linear, linear.days[0], 2, { back_squat: 100 });
    expect(logs[0].exerciseId).toBe('back_squat');
    expect(logs[0].sets).toBe(5);
    expect(logs[0].weight).toBe(102.5);
  });

  it('після заміни вправи вага не переноситься', () => {
    const swap = () => getExercise('goblet_squat')!;
    const logs = programDayToExercises(linear, linear.days[0], 2, { back_squat: 100 }, swap);
    expect(logs[0].exerciseId).toBe('goblet_squat');
    expect(logs[0].weight).toBeUndefined();
  });

  it('вправи без відомої ваги все одно потрапляють у запис', () => {
    const logs = programDayToExercises(bodyweight, bodyweight.days[0], 1, {});
    expect(logs.length).toBe(bodyweight.days[0].slots.length);
    expect(logs.every((l) => !!l.exerciseId)).toBe(true);
  });
});

describe('прев’ю прогресії', () => {
  it('показує всі тижні з позначкою розвантаження', () => {
    const preview = progressionPreview(linear, 100);
    expect(preview).toHaveLength(linear.weeks);
    expect(preview[0].label).toContain('кг');
    expect(preview[linear.weeks - 1].deload).toBe(true);
  });

  it('працює для програми без обтяжень', () => {
    const preview = progressionPreview(bodyweight);
    expect(preview.length).toBe(bodyweight.weeks);
  });
});

describe('стан програми у сховищі', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('починається порожньою і зберігається', async () => {
    expect(await getActiveProgram()).toBeNull();
    await startProgram('linear_strength', { back_squat: 100 });
    const a = (await getActiveProgram())!;
    expect(a.templateId).toBe('linear_strength');
    expect(a.baseWeights.back_squat).toBe(100);
    expect(a.done).toEqual([]);
  });

  it('пройдений день позначається один раз', async () => {
    await startProgram('linear_strength', {});
    await markDayDone(1, 1);
    await markDayDone(1, 1);
    expect((await getActiveProgram())!.done).toEqual(['w1d1']);
  });

  it('«не вийшло» повертає тиждень і памʼятає відкат', async () => {
    await startProgram('linear_strength', {});
    await markDayDone(1, 1);
    await markDayDone(1, 2);
    await markDayDone(2, 1);
    await repeatWeek(2);
    const a = (await getActiveProgram())!;
    expect(a.done).toEqual(['w1d1', 'w1d2']);   // другий тиждень скинуто
    expect(a.repeated![2]).toBe(1);
  });

  it('програма, якої більше немає в додатку, не ламає екран', async () => {
    await AsyncStorage.setItem('@alpha_trainer:active_program',
      JSON.stringify({ templateId: 'зникла', startedAt: '', baseWeights: {}, done: [] }));
    expect(await getActiveProgram()).toBeNull();
  });

  it('робочі ваги пропонуються з історії', () => {
    const workouts = [{
      id: '1', date: '2026-09-01', workoutType: 'strength', notes: '', duration: 60,
      completedAt: '2026-09-01T10:00:00.000Z',
      exercises: [
        { name: 'Присідання зі штангою на спині', sets: 3, reps: 5, weight: 95 },
        { name: 'front squad', sets: 3, reps: 5, weight: 70 },
      ],
    }];
    const suggested = suggestBaseWeights('linear_strength', workouts, createResolver());
    expect(suggested.back_squat).toBe(95);
    expect(suggested.front_squat).toBeUndefined();   // цієї вправи в програмі немає
  });

  it('ключ програми входить у резервну копію', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'backup.ts'), 'utf8');
    expect(src).toContain('@alpha_trainer:active_program');
  });
});

describe('наскрізний прохід програми', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('від старту до завершення: дні йдуть по черзі, вага росте', async () => {
    await startProgram('linear_strength', { back_squat: 100, bench_press: 80 });

    // перший день першого тижня
    let state = (await currentDay())!;
    expect('finished' in state).toBe(false);
    if ('finished' in state) return;
    expect(state.week).toBe(1);
    expect(state.programDay.titleUk).toContain('День A');

    const firstDay = programDayToExercises(
      state.template, state.programDay, state.week, state.active.baseWeights,
    );
    expect(firstDay[0].weight).toBe(100);

    // проходимо весь перший тиждень
    for (let d = 1; d <= state.template.days.length; d++) await markDayDone(1, d);

    // другий тиждень: та сама вправа, але важча
    state = (await currentDay())!;
    if ('finished' in state) throw new Error('програма не мала завершитись');
    expect(state.week).toBe(2);
    const secondWeek = programDayToExercises(
      state.template, state.programDay, state.week, state.active.baseWeights,
    );
    expect(secondWeek[0].weight).toBe(102.5);
  });

  it('після невдалого тижня вага падає, а день повертається', async () => {
    await startProgram('linear_strength', { back_squat: 100 });
    for (let d = 1; d <= 3; d++) await markDayDone(1, d);
    await markDayDone(2, 1);

    await repeatWeek(2);
    const state = (await currentDay())!;
    if ('finished' in state) throw new Error('несподіване завершення');
    expect(state.week).toBe(2);
    expect(state.day).toBe(1);   // день повернувся

    const logs = programDayToExercises(
      state.template, state.programDay, state.week, state.active.baseWeights,
      undefined, backoffsFor(state.active, state.week),
    );
    // другий тиждень без відкату дав би 102.5
    expect(logs[0].weight!).toBeLessThan(102.5);
  });

  it('пройдена програма повідомляє про завершення, а не мовчить', async () => {
    await startProgram('bodyweight_base', {});
    const template = getProgram('bodyweight_base')!;
    for (let w = 1; w <= template.weeks; w++) {
      for (let d = 1; d <= template.days.length; d++) await markDayDone(w, d);
    }
    const state = (await currentDay())!;
    expect('finished' in state).toBe(true);
  });
});
