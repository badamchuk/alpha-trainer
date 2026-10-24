/**
 * Безпека резервних копій.
 *
 * Копія летить у месенджер чи хмару — ключам AI там не місце. А імпорт читає
 * файл, який міг прийти звідки завгодно: пускаємо лише те, що розбирається й
 * має очікуваний тип.
 */
import { sanitizeImport, stripSecrets } from '../services/backup';

const P = '@alpha_trainer:user_profile';
const W = '@alpha_trainer:workouts';
const L = '@alpha_trainer:language';

describe('ключі AI не потрапляють у копію', () => {
  it('вирізає обидва ключі, решту профілю лишає', () => {
    const raw = JSON.stringify({ name: 'Тест', weight: 80, groqApiKey: 'gsk_secret', geminiApiKey: 'AIza_secret' });
    const out = stripSecrets(raw)!;
    expect(out).not.toContain('secret');
    expect(JSON.parse(out)).toMatchObject({ name: 'Тест', weight: 80, geminiApiKey: '' });
  });

  it('зіпсований профіль у копію не кладе', () => {
    expect(stripSecrets('{oops')).toBeNull();
    expect(stripSecrets(null)).toBeNull();
  });
});

describe('імпорт пускає лише відоме й цілісне', () => {
  it('невідомі ключі відкидаються', () => {
    const out = sanitizeImport({ '@evil:key': '1', 'random': '[]' }, null);
    expect(out).toEqual([]);
  });

  it('список тренувань мусить бути списком', () => {
    expect(sanitizeImport({ [W]: '"рядок"' }, null)).toEqual([]);
    expect(sanitizeImport({ [W]: '{oops' }, null)).toEqual([]);
    expect(sanitizeImport({ [W]: '[]' }, null)).toEqual([[W, '[]']]);
  });

  it('мова — лише uk або en, без JSON', () => {
    expect(sanitizeImport({ [L]: 'en' }, null)).toEqual([[L, 'en']]);
    expect(sanitizeImport({ [L]: 'de' }, null)).toEqual([]);
  });

  it('значення-не-рядки ігноруються', () => {
    expect(sanitizeImport({ [W]: 42 as unknown as string }, null)).toEqual([]);
  });

  it('введені в додатку ключі AI не затираються копією без ключів', () => {
    const current = JSON.stringify({ name: 'Я', groqApiKey: 'gsk_mine', geminiApiKey: 'AIza_mine' });
    const imported = JSON.stringify({ name: 'З копії', geminiApiKey: '' });
    const [[, value]] = sanitizeImport({ [P]: imported }, current);
    expect(JSON.parse(value)).toMatchObject({ name: 'З копії', groqApiKey: 'gsk_mine', geminiApiKey: 'AIza_mine' });
  });

  it('профіль-список чи профіль-рядок не проходять', () => {
    expect(sanitizeImport({ [P]: '[]' }, null)).toEqual([]);
    expect(sanitizeImport({ [P]: '"x"' }, null)).toEqual([]);
  });
});
