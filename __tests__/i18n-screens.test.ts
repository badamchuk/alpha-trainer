/**
 * Перекладені екрани не мають «зашитих» українських рядків.
 *
 * Тест читає самі файли: коли хтось додасть на такий екран текст напряму,
 * замість t('ключ'), він впаде — і English-режим не поїде тихцем.
 *
 * Список файлів росте разом із перекладом: додав екран — додай сюди.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

/** Екрани й компоненти, переведені на i18n повністю. */
const TRANSLATED = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/_layout.tsx',
  'app/plan.tsx',
  'app/programs/index.tsx',
  'app/programs/[id].tsx',
  'app/exercises/[id].tsx',
  'app/exercises/unresolved.tsx',
  'app/workout/builder.tsx',
  'app/about/attribution.tsx',
  'components/SubstitutionSheet.tsx',
  'components/LibraryPicker.tsx',
  'components/ExerciseHowTo.tsx',
  'components/SupersetBar.tsx',
  'components/DatePickerField.tsx',
];

const CYRILLIC = /[А-Яа-яЇїІіЄєҐґ]/;

/**
 * Прибрати коментарі. Українською в коді написані саме вони, тож без цього
 * тест сварився б на кожен пояснювальний рядок.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // «//» всередині URL не коментар, тому перед ним вимагаємо пробіл або початок рядка
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function ukrainianLiterals(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  const literal = /(['"`])((?:(?!\1)[^\\\n]){0,200}?[А-Яа-яЇїІіЄєҐґ](?:(?!\1)[^\\\n])*?)\1/g;
  for (const m of code.matchAll(literal)) out.push(m[2]);
  // текст просто в розмітці: <Text>Зберегти</Text>
  const jsx = />\s*([^<>{}\n]*[А-Яа-яЇїІіЄєҐґ][^<>{}\n]*?)\s*</g;
  for (const m of code.matchAll(jsx)) out.push(m[1].trim());
  return out;
}

describe('перекладені екрани', () => {
  for (const file of TRANSLATED) {
    it(`${file} — без зашитого українського тексту`, () => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(ukrainianLiterals(src)).toEqual([]);
    });
  }

  it('сам сканер працює — знаходить підкинутий рядок', () => {
    const fake = `const x = <Text>Зберегти</Text>;\nconst y = 'Привіт';\n// коментар українською\n`;
    expect(ukrainianLiterals(fake).sort()).toEqual(['Зберегти', 'Привіт']);
  });

  it('коментарі й англійський код тест не чіпає', () => {
    const fake = `// це коментар\n/* і цей */\nconst url = 'https://example.com/шлях';\n`;
    // рядок із кирилицею всередині URL усе одно знайдеться — це навмисно:
    // адреси з кирилицею в коді теж краще вимести
    expect(ukrainianLiterals("const a = 'Save';\n// пояснення\n")).toEqual([]);
    expect(ukrainianLiterals(fake).length).toBe(1);
  });
});
