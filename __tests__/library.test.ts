/**
 * Цілісність бібліотеки вправ (ТЗ F1.2, F1.3).
 *
 * Це не «тест заради тесту»: заміни й конструктор повністю стоять на цій розмітці,
 * тож одна забута кома в `easierThan` або дубльований синонім тихо зіпсують поради.
 */
import fs from 'fs';
import {
  allExercises, ambiguousCandidates, AMBIGUOUS_NAMES, findByName, getExercise,
  imageCoverage, isAvailable, muscleGroupOf, normalizeName, searchLibrary,
} from '../services/library';

const ALL = allExercises();

describe('структура бібліотеки', () => {
  it('має щонайменше 100 вправ', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(100);
  });

  it('усі id унікальні', () => {
    const ids = ALL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('обов’язкові поля заповнені', () => {
    const problems: string[] = [];
    for (const ex of ALL) {
      if (ex.nameUk.length < 2) problems.push(`${ex.id}: порожня nameUk`);
      if (ex.nameEn.length < 2) problems.push(`${ex.id}: порожня nameEn`);
      if (ex.muscles.primary.length < 1) problems.push(`${ex.id}: немає основних м’язів`);
      if (ex.cues.length < 2) problems.push(`${ex.id}: підказок менше двох`);
      if (!Array.isArray(ex.equipment)) problems.push(`${ex.id}: немає обладнання`);
    }
    expect(problems).toEqual([]);
  });

  it('назви й синоніми не конфліктують між вправами', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const ex of ALL) {
      for (const raw of [ex.nameUk, ex.nameEn, ...ex.aliases]) {
        const key = normalizeName(raw);
        const owner = seen.get(key);
        if (owner && owner !== ex.id) conflicts.push(`«${key}»: ${owner} vs ${ex.id}`);
        else seen.set(key, ex.id);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('неоднозначні назви не використані як синоніми', () => {
    const bad: string[] = [];
    for (const ex of ALL) {
      for (const raw of ex.aliases) {
        if (normalizeName(raw) in AMBIGUOUS_NAMES) bad.push(`${ex.id}: ${raw}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('усі кандидати неоднозначних назв існують', () => {
    for (const [name, ids] of Object.entries(AMBIGUOUS_NAMES)) {
      expect(ids.length).toBeGreaterThanOrEqual(2);
      for (const id of ids) expect(getExercise(id)).toBeDefined();
      expect(normalizeName(name)).toBe(name);
    }
  });

  it('easierThan посилається на наявні вправи, без себе й без циклів', () => {
    const problems: string[] = [];
    for (const ex of ALL) {
      for (const id of ex.easierThan ?? []) {
        const target = getExercise(id);
        if (!target) problems.push(`${ex.id} → неіснуюча ${id}`);
        else if (id === ex.id) problems.push(`${ex.id} → сама на себе`);
        // якщо A простіша за B, то B не може бути простішою за A
        else if ((target.easierThan ?? []).includes(ex.id)) problems.push(`цикл: ${ex.id} ↔ ${id}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('кардіо-параметри задані рівно для monostructural', () => {
    for (const ex of ALL) {
      if (ex.pattern === 'monostructural') expect(ex.cardio).toBeDefined();
      else expect(ex.cardio).toBeUndefined();
    }
  });

  it('складені рухи мають другий патерн', () => {
    for (const id of ['thruster', 'dumbbell_thruster', 'devil_press', 'wall_ball', 'kb_swing_overhead']) {
      expect(getExercise(id)?.secondaryPattern).toBeDefined();
    }
  });

  it('усі imageSlug існують у наборі ілюстрацій', () => {
    const available = new Set<string>(
      JSON.parse(fs.readFileSync(`${__dirname}/fixtures/image-slugs.json`, 'utf8')),
    );
    const missing = ALL.filter((e) => e.imageSlug && !available.has(e.imageSlug)).map((e) => e.id);
    expect(missing).toEqual([]);
  });
});

describe('пошук і згортки', () => {
  it('знаходить вправу за назвою й синонімом', () => {
    expect(findByName('Підтягування')?.id).toBe('pull_up');
    expect(findByName('бурпі')?.id).toBe('burpee');
    expect(findByName('мази гирею')?.id).toBe('kb_swing');
    expect(findByName('front squad')?.id).toBe('front_squat');
    expect(findByName('sit up')?.id).toBe('sit_up');
  });

  it('не вгадує неоднозначні назви, а повертає кандидатів', () => {
    expect(findByName('присідання')).toBeUndefined();
    expect(ambiguousCandidates('присідання')?.map((e) => e.id))
      .toEqual(['air_squat', 'back_squat', 'goblet_squat']);
    expect(ambiguousCandidates('велосипед')?.map((e) => e.id))
      .toEqual(['bicycle_crunch', 'bike_erg']);
    expect(ambiguousCandidates('станова тяга')).toBeNull();
  });

  it('ігнорує числа й одиниці в назві', () => {
    expect(findByName('Біг 400м')?.id).toBe('run');
    expect(findByName('Планка 1 хв')?.id).toBe('plank');
  });

  it('групи м’язів: складені рухи — «все тіло», кардіо — «кардіо»', () => {
    expect(muscleGroupOf(getExercise('burpee')!)).toBe('fullbody');
    expect(muscleGroupOf(getExercise('row_erg')!)).toBe('cardio');
    expect(muscleGroupOf(getExercise('bench_press')!)).toBe('chest');
    expect(muscleGroupOf(getExercise('deadlift')!)).toBe('hamstrings');
  });

  it('фільтрує за доступним обладнанням', () => {
    const bodyweightOnly = searchLibrary({ availableEquipment: [] });
    expect(bodyweightOnly.every((e) => e.equipment.length === 0)).toBe(true);
    expect(bodyweightOnly.map((e) => e.id)).toContain('push_up');
    expect(bodyweightOnly.map((e) => e.id)).not.toContain('bench_press');

    expect(isAvailable(getExercise('pull_up')!, ['pullup_bar'])).toBe(true);
    expect(isAvailable(getExercise('banded_pull_up')!, ['pullup_bar'])).toBe(false);
  });

  it('пошук за підрядком знаходить варіації', () => {
    const found = searchLibrary({ query: 'присідання' }).map((e) => e.id);
    expect(found).toContain('back_squat');
    expect(found).toContain('goblet_squat');
  });
});

describe('покриття', () => {
  it('ілюстрації є щонайменше в 60% вправ', () => {
    const { ratio, withImage, total } = imageCoverage();
    console.log(`ілюстрації: ${withImage} з ${total} (${Math.round(ratio * 100)}%)`);
    expect(ratio).toBeGreaterThanOrEqual(0.6);
  });

  it('кросфіт-рухи користувача є в бібліотеці', () => {
    const must = ['burpee', 'thruster', 'wall_ball', 'box_jump', 'sit_up', 'kb_swing', 'devil_press',
      'db_snatch', 'row_erg', 'ski_erg', 'bike_erg', 'jump_rope', 'wall_sit', 'farmer_carry',
      'toes_to_bar', 'pull_up', 'push_up', 'deadlift', 'back_squat', 'front_squat'];
    for (const id of must) expect(getExercise(id)).toBeDefined();
  });
});
