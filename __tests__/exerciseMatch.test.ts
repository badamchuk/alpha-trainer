/**
 * Розпізнавання назв вправ (ТЗ F2, N6).
 *
 * Набір випадків узятий з реальної історії користувача: саме на цих назвах
 * підбирались пороги, а не навпаки.
 */
import {
  coverageOf, createResolver, editDistance, fuzzyMatch, matchName, nameSimilarity,
} from '../services/exerciseMatch';

describe('нормалізація й відстань', () => {
  it('рахує правки між словами', () => {
    expect(editDistance('front squad', 'front squat')).toBe(1);
    expect(editDistance('випадок', 'випади')).toBe(2);
    expect(editDistance('планка', 'планка')).toBe(0);
    expect(editDistance('мази', 'махи')).toBe(1);
  });

  it('схожість за множиною слів', () => {
    expect(nameSimilarity('крокуючий випадок', 'крокуючі випади')).toBe(1);
    expect(nameSimilarity('станова тяга', 'жим лежачи')).toBe(0);
  });
});

describe('точні збіги й синоніми', () => {
  it('власна назва вправи', () => {
    expect(matchName('Підтягування')).toMatchObject({ id: 'pull_up', confidence: 'exact' });
    expect(matchName('Бурпі')).toMatchObject({ id: 'burpee', confidence: 'exact' });
  });

  it('синоніми з реальних записів', () => {
    const cases: [string, string][] = [
      ['мази гирею', 'kb_swing'],
      ['махи гирою', 'kb_swing'],
      ['front squad', 'front_squat'],
      ['sit up', 'sit_up'],
      ['сітап', 'sit_up'],
      ['бьорпі', 'burpee'],
      ['гребля', 'row_erg'],
      ['концепт', 'row_erg'],
      ['лижі', 'ski_erg'],
      ['байк', 'bike_erg'],
      ['стільчик під стінкою', 'wall_sit'],
      ['присідання під стіною', 'wall_sit'],
      ['крокуючий випадок', 'walking_lunge'],
      ['відтискання з відриванням долонь', 'hand_release_push_up'],
      ['випади назад', 'reverse_lunge'],
      ['прес на брусах', 'hanging_knee_raise'],
      ['розтягування резинки перед собою', 'band_pull_apart'],
      ['проворот резинки', 'band_pass_through'],
      ['стрибки на бокс', 'box_jump'],
      ['девіл прес', 'devil_press'],
      ['трастери', 'thruster'],
      ['коліна до турніку', 'knees_to_bar'],
      ['взяття штанги на груди', 'barbell_clean'],
      ['строгий жим штанги над головою', 'strict_press'],
      ['поштовх гантель', 'db_push_press'],
      ['стрейчинг', 'stretching'],
    ];
    for (const [name, id] of cases) {
      expect({ name, ...matchName(name) }).toMatchObject({ name, id });
    }
  });

  it('ігнорує числа й одиниці', () => {
    expect(matchName('Біг 400м').id).toBe('run');
    expect(matchName('Планка 1 хв').id).toBe('plank');
    expect(matchName('Жим штанги лежачи 100 кг').id).toBe('bench_press');
  });
});

describe('неоднозначні назви', () => {
  it('не вгадуються автоматично', () => {
    for (const name of ['присідання', 'велосипед', 'прес', 'махи', 'випади']) {
      const m = matchName(name);
      expect(m.confidence).toBe('ambiguous');
      expect(m.id).toBeNull();
      expect(m.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('після ручної прив’язки працюють', () => {
    const m = matchName('присідання', { 'присідання': 'air_squat' });
    expect(m).toMatchObject({ id: 'air_squat', confidence: 'link' });
  });
});

describe('нечіткий збіг', () => {
  it('підказує, але не прив’язує сам', () => {
    const m = matchName('крокуючі випадки');
    expect(m.confidence).toBe('fuzzy');
    expect(m.id).toBeNull();
    expect(m.candidates).toEqual(['walking_lunge']);
  });

  it('не вигадує збіг для чужих слів', () => {
    expect(fuzzyMatch('фыва123')).toBeNull();
    expect(matchName('фыва123').confidence).toBe('none');
  });
});

describe('сміття з AI-плану', () => {
  it('не стає вправами', () => {
    for (const junk of ['17:00 - Кросфіту', 'Тренування верхньої частини тіла:',
      'Розминка (10-15 хвилин): легка кардіо-тренування на біговій доріжці або велотренажері']) {
      expect(matchName(junk).id).toBeNull();
    }
  });
});

describe('резолвер', () => {
  it('id у записі має пріоритет над назвою', () => {
    const resolve = createResolver({ 'присідання': 'air_squat' });
    expect(resolve({ name: 'присідання', exerciseId: 'back_squat' })).toBe('back_squat');
    expect(resolve({ name: 'присідання' })).toBe('air_squat');
  });

  it('не повертає здогадки', () => {
    const resolve = createResolver();
    expect(resolve({ name: 'крокуючі випадки' })).toBeNull();
    expect(resolve({ name: 'присідання' })).toBeNull();
    expect(resolve({ name: 'Гребний тренажер' })).toBe('row_erg');
  });

  it('рахує покриття переліку назв', () => {
    const c = coverageOf(['бурпі', 'гребля', 'присідання', 'фыва123']);
    expect(c).toEqual({ auto: 2, ambiguous: 1, fuzzy: 0, none: 1 });
  });
});
