/**
 * Ілюстрації вправ (ТЗ F6, критерій A6).
 *
 * Мапу читаємо як ТЕКСТ, а не імпортуємо: інакше тест потягнув би самі .webp
 * (F6.6 — ассети лишаються справою UI). Заразом це ловить розсинхрон, коли
 * слаг у бібліотеці є, а файлу для нього ніхто не збирав.
 */
import fs from 'fs';
import path from 'path';
import { allExercises } from '../services/library';

const ROOT = path.join(__dirname, '..');
const MAP_FILE = path.join(ROOT, 'services', 'exerciseImages.ts');
const ASSETS = path.join(ROOT, 'assets', 'exercises');

const mapSource = fs.readFileSync(MAP_FILE, 'utf8');
const mappedSlugs = new Set([...mapSource.matchAll(/^ {2}'([a-z0-9-]+)':/gm)].map((m) => m[1]));
const librarySlugs = allExercises()
  .map((e) => e.imageSlug)
  .filter((s): s is string => !!s);

describe('мапа ілюстрацій', () => {
  it('кожен слаг бібліотеки має кадри в мапі', () => {
    const missing = [...new Set(librarySlugs)].filter((s) => !mappedSlugs.has(s));
    expect(missing).toEqual([]);
  });

  it('усі файли з мапи є на диску', () => {
    const files = [...mapSource.matchAll(/assets\/exercises\/([a-z0-9-]+\.webp)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(300);
    const absent = files.filter((f) => !fs.existsSync(path.join(ASSETS, f)));
    expect(absent).toEqual([]);
  });

  it('покриття бібліотеки ілюстраціями — не менше 70% (A6)', () => {
    const all = allExercises();
    const ratio = librarySlugs.length / all.length;
    expect(ratio).toBeGreaterThanOrEqual(0.7);
  });

  it('ассети вкладаються в бюджет +5 МБ', () => {
    const bytes = fs.readdirSync(ASSETS)
      .filter((f) => f.endsWith('.webp'))
      .reduce((sum, f) => sum + fs.statSync(path.join(ASSETS, f)).size, 0);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });

  it('є файл авторства з ліцензією і ShareAlike', () => {
    const attribution = fs.readFileSync(path.join(ASSETS, 'ATTRIBUTION.md'), 'utf8');
    expect(attribution).toContain('CC BY-SA 4.0');
    expect(attribution).toContain('Bryl Lim');
    expect(attribution).toContain('Everkinetic');
    expect(attribution).toContain('Що ми змінили');
  });

  it('сервіси не імпортують мапу ассетів (F6.6)', () => {
    const offenders = fs.readdirSync(path.join(ROOT, 'services'))
      .filter((f) => f.endsWith('.ts') && f !== 'exerciseImages.ts')
      .filter((f) => fs.readFileSync(path.join(ROOT, 'services', f), 'utf8').includes('exerciseImages'));
    expect(offenders).toEqual([]);
  });
});
