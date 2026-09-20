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

describe('вибір мови переживає перезапуск', () => {
  // Баг, знайдений на емуляторі: loadLanguage() мовчки міняв _lang, а екрани
  // вже були змонтовані з типовою мовою — і лишались українськими до кінця
  // сесії. Тепер завантаження будить підписників так само, як і перемикач.
  it('loadLanguage повідомляє підписників', async () => {
    const i18n = require('../services/i18n');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('@alpha_trainer:language', 'en');
    await i18n.loadLanguage();
    expect(i18n.getCurrentLang()).toBe('en');

    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../services/i18n.ts'), 'utf8');
    const body = src.slice(src.indexOf('export async function loadLanguage'));
    const end = body.indexOf('\n}\n');
    expect(body.slice(0, end)).toContain('_subscribers.forEach');
  });
});
