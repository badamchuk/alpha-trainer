/**
 * Переклади нових екранів (docs/06-plan-programs.md, частина B).
 *
 * Найдешевший спосіб зламати двомовність — додати ключ лише в одну мову.
 * Тест звіряє набори ключів, а не окремі рядки.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'services', 'i18n.ts'), 'utf8');

function keysOf(section: 'uk' | 'en'): string[] {
  const start = SRC.indexOf(`\n  ${section}: {`);
  const end = SRC.indexOf('\n  },', start);
  return [...SRC.slice(start, end).matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
}

describe('двомовність', () => {
  const uk = keysOf('uk');
  const en = keysOf('en');

  it('кожен ключ має обидві мови', () => {
    expect([...uk].filter((k) => !en.includes(k))).toEqual([]);
    expect([...en].filter((k) => !uk.includes(k))).toEqual([]);
  });

  it('ключі не дублюються всередині мови', () => {
    expect(new Set(uk).size).toBe(uk.length);
    expect(new Set(en).size).toBe(en.length);
  });

  it('нові екрани мають переклади', () => {
    for (const key of [
      'howTo', 'video', 'substituteTitle', 'easierBlock', 'variationsBlock',
      'buildWorkout', 'programs', 'programWorkingWeights', 'reasonSameFamily',
      'painDisclaimer', 'recentExercises',
    ]) {
      expect(uk).toContain(key);
      expect(en).toContain(key);
    }
  });

  it('англійські рядки справді англійські', () => {
    // назва мови пишеться самою мовою — це не недогляд
    const ALLOWED = ['ukrainian'];
    const enBlock = SRC.slice(SRC.indexOf('\n  en: {'));
    const cyrillic = [...enBlock.matchAll(/^\s{4}(\w+): '([^']*[а-яіїєґА-ЯІЇЄҐ][^']*)'/gm)]
      .filter((m) => !ALLOWED.includes(m[1]));
    expect(cyrillic.map((m) => `${m[1]}: ${m[2]}`)).toEqual([]);
  });
});
