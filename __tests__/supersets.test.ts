import {
  groupIntoSuperset,
  ungroupSuperset,
  normalizeSupersets,
  removeFromSuperset,
  getSupersetColor,
} from '../services/supersets';
import { ExerciseLog } from '../types';

const ex = (name: string, supersetId?: string): ExerciseLog =>
  ({ name, ...(supersetId ? { supersetId } : {}) });

const names = (a: ExerciseLog[]) => a.map((e) => e.name).join(',');
const ssOf = (a: ExerciseLog[], n: string) => a.find((e) => e.name === n)?.supersetId;

describe('groupIntoSuperset', () => {
  it('групує сусідні вправи, не змінюючи порядок', () => {
    const r = groupIntoSuperset([ex('A'), ex('B'), ex('C')], [0, 1]);
    expect(names(r)).toBe('A,B,C');
    expect(ssOf(r, 'A')).toBeDefined();
    expect(ssOf(r, 'A')).toBe(ssOf(r, 'B'));
    expect(ssOf(r, 'C')).toBeUndefined();
  });

  it('підтягує несусідні вправи одна до одної', () => {
    // головний кейс: групуємо 1-шу і 3-тю — C має стати поруч з A,
    // інакше група малювалась би в одному місці, а порядок був іншим
    const r = groupIntoSuperset([ex('A'), ex('B'), ex('C'), ex('D')], [0, 2]);
    expect(names(r)).toBe('A,C,B,D');
    expect(ssOf(r, 'A')).toBe(ssOf(r, 'C'));
    expect(ssOf(r, 'B')).toBeUndefined();
    expect(ssOf(r, 'D')).toBeUndefined();
  });

  it('групує останні вправи без зайвих переміщень', () => {
    const r = groupIntoSuperset([ex('A'), ex('B'), ex('C'), ex('D')], [2, 3]);
    expect(names(r)).toBe('A,B,C,D');
    expect(ssOf(r, 'C')).toBe(ssOf(r, 'D'));
  });

  it('не залежить від порядку індексів у виборі', () => {
    const r = groupIntoSuperset([ex('A'), ex('B'), ex('C')], [2, 0]);
    expect(names(r)).toBe('A,C,B');
    expect(ssOf(r, 'A')).toBe(ssOf(r, 'C'));
  });

  it('перетягує вправу з наявної групи і розпускає залишок з однієї вправи', () => {
    const r = groupIntoSuperset([ex('X', 's1'), ex('Y', 's1'), ex('Z')], [1, 2]);
    expect(ssOf(r, 'Y')).toBe(ssOf(r, 'Z'));
    expect(ssOf(r, 'Y')).not.toBe('s1');
    expect(ssOf(r, 'X')).toBeUndefined();
  });

  it('ігнорує вибір з менш ніж двох вправ', () => {
    const src = [ex('A'), ex('B')];
    expect(groupIntoSuperset(src, [0])).toBe(src);
    expect(groupIntoSuperset(src, [])).toBe(src);
    expect(groupIntoSuperset(src, [0, 0])).toBe(src); // дублі — це один індекс
  });

  it('ігнорує індекси поза межами масиву', () => {
    const r = groupIntoSuperset([ex('A'), ex('B')], [0, 1, 99]);
    expect(names(r)).toBe('A,B');
    expect(ssOf(r, 'A')).toBe(ssOf(r, 'B'));
  });

  it('не мутує вхідний масив', () => {
    const src = [ex('A'), ex('B'), ex('C')];
    const snapshot = JSON.stringify(src);
    groupIntoSuperset(src, [0, 2]);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

describe('ungroupSuperset', () => {
  it('знімає лише вказану групу', () => {
    const r = ungroupSuperset([ex('A', 's1'), ex('B', 's1'), ex('C', 's2')], 's1');
    expect(ssOf(r, 'A')).toBeUndefined();
    expect(ssOf(r, 'B')).toBeUndefined();
    expect(ssOf(r, 'C')).toBe('s2');
  });
});

describe('normalizeSupersets', () => {
  it('розпускає групу, у якій лишилась одна вправа', () => {
    const r = normalizeSupersets([ex('A', 's1'), ex('B', 's2'), ex('C', 's2')]);
    expect(ssOf(r, 'A')).toBeUndefined();
    expect(ssOf(r, 'B')).toBe('s2');
    expect(ssOf(r, 'C')).toBe('s2');
  });
});

describe('removeFromSuperset', () => {
  it('виводить одну вправу, лишаючи решту групи', () => {
    const r = removeFromSuperset([ex('A', 's1'), ex('B', 's1'), ex('C', 's1')], 0);
    expect(ssOf(r, 'A')).toBeUndefined();
    expect(ssOf(r, 'B')).toBe('s1');
    expect(ssOf(r, 'C')).toBe('s1');
  });

  it('розпускає групу повністю, якщо в ній лишалась пара', () => {
    const r = removeFromSuperset([ex('A', 's1'), ex('B', 's1')], 0);
    expect(ssOf(r, 'A')).toBeUndefined();
    expect(ssOf(r, 'B')).toBeUndefined();
  });

  it('ігнорує індекс поза межами', () => {
    const src = [ex('A', 's1'), ex('B', 's1')];
    expect(removeFromSuperset(src, 99)).toBe(src);
  });
});

describe('getSupersetColor', () => {
  it('дає стабільний колір для того самого id', () => {
    expect(getSupersetColor('ss_1')).toBe(getSupersetColor('ss_1'));
  });

  it('повертає валідний hex', () => {
    expect(getSupersetColor('ss_abc')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
