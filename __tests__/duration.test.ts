/**
 * Тривалість вправи: секунди, хвилини, «1:30» — одне поле, одне сховище.
 */
import { parseDuration, durationToInput, formatDuration } from '../services/duration';
import { tFor } from '../services/i18n';

const uk = tFor('uk');
const en = tFor('en');

describe('розбір поля тривалості', () => {
  it.each([
    ['45с', 0.75], ['45 с', 0.75], ['45 сек', 0.75], ['45s', 0.75], ['30 sec', 0.5],
    ['1:30', 1.5], ['0:45', 0.75], ['10:00', 10],
    ['2м', 2], ['2 хв', 2], ['5 min', 5],
    ['25', 25], ['0.75', 0.75], ['1,5', 1.5],
  ])('%s → %s хв', (input, min) => {
    expect(parseDuration(input)).toBeCloseTo(min, 5);
  });

  it('порожнє й незрозуміле — не заповнене', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration('1:75')).toBeUndefined();
    expect(parseDuration('-5')).toBeUndefined();
  });
});

describe('показ тривалості', () => {
  it('менше хвилини — секундами', () => {
    expect(formatDuration(0.75, uk)).toBe('45 с');
    expect(formatDuration(0.75, en)).toBe('45 s');
  });
  it('цілі хвилини — хвилинами', () => {
    expect(formatDuration(25, uk)).toBe('25 хв');
    expect(formatDuration(25, en)).toBe('25 min');
  });
  it('дробові — як на таймері', () => {
    expect(formatDuration(1.5, uk)).toBe('1:30');
  });
  it('поле при редагуванні показує те, що зрозуміє розбір', () => {
    for (const min of [0.75, 1.5, 25, 0.5]) {
      expect(parseDuration(durationToInput(min, uk))).toBeCloseTo(min, 5);
      expect(parseDuration(durationToInput(min, en))).toBeCloseTo(min, 5);
    }
  });
});
