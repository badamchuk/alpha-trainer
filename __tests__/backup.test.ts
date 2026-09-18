/**
 * Автоматична резервна копія (план §5).
 *
 * Найважливіше — що копія містить УСІ ключі сховища. Забутий ключ означає, що
 * після відновлення частина даних просто зникне, і помітять це нескоро.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAutoBackupState } from '../services/backup';

/**
 * Ключі, які свідомо НЕ потрапляють у копію. Кожен — з поясненням, інакше
 * через півроку ніхто не згадає, це рішення чи забудькуватість.
 */
const INTENTIONALLY_SKIPPED: Record<string, string> = {
  '@alpha_trainer:trainer_context': 'кеш контексту AI з часом життя 2 години',
  '@alpha_trainer:auto_backup': 'позначка самої автокопії',
};

const ROOT = path.join(__dirname, '..');
const BACKUP_SRC = fs.readFileSync(path.join(ROOT, 'services', 'backup.ts'), 'utf8');

/** Ключі, оголошені в кожному сервісі: те, що реально пишеться в сховище. */
function declaredKeys(): Map<string, string> {
  const found = new Map<string, string>();
  const dir = path.join(ROOT, 'services');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of src.matchAll(/'(@alpha_trainer:[a-z_]+)'/g)) {
      if (!found.has(m[1])) found.set(m[1], file);
    }
  }
  return found;
}

describe('перелік ключів', () => {
  it('усі ключі сховища входять у резервну копію', () => {
    const missing: string[] = [];
    for (const [key, file] of declaredKeys()) {
      if (key in INTENTIONALLY_SKIPPED) continue;
      if (!BACKUP_SRC.includes(`'${key}'`)) missing.push(`${key} (${file})`);
    }
    expect(missing).toEqual([]);
  });

  it('нові ключі бібліотеки вправ теж у копії', () => {
    for (const key of [
      '@alpha_trainer:exercise_links',
      '@alpha_trainer:custom_exercises',
      '@alpha_trainer:builder_draft',
    ]) {
      expect(BACKUP_SRC).toContain(key);
    }
  });
});

describe('правила автокопії', () => {
  it('інтервал — тиждень, зберігаються три останні файли', () => {
    expect(BACKUP_SRC).toMatch(/AUTO_INTERVAL_DAYS = 7/);
    expect(BACKUP_SRC).toMatch(/AUTO_KEEP = 3/);
  });

  it('копія пишеться в теку документів, а не в кеш', () => {
    // кеш система чистить сама — копія там не пережила б і тижня
    const autoSection = BACKUP_SRC.slice(BACKUP_SRC.indexOf('АВТОМАТИЧНА КОПІЯ'));
    expect(autoSection).toContain('Paths.document');
    expect(autoSection).not.toContain('Paths.cache');
  });

  it('помилка запису не кидається назовні — старт додатку не має падати', () => {
    const fn = BACKUP_SRC.slice(BACKUP_SRC.indexOf('export async function autoBackup'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('try {');
    expect(body).toContain('catch');
    expect(body).toContain('return null');
  });

  it('стан автокопії читається навіть із пошкодженого ключа', async () => {
    await AsyncStorage.setItem('@alpha_trainer:auto_backup', '{зіпсовано');
    await expect(getAutoBackupState()).resolves.toBeNull();
  });
});

describe('надійність автокопії', () => {
  const src = BACKUP_SRC.slice(BACKUP_SRC.indexOf('export async function autoBackup'));

  it('перевіряє, що файл справді на місці, а не вірить позначці', () => {
    expect(src).toContain('.exists');
    expect(src).toMatch(/ageDays < AUTO_INTERVAL_DAYS && stillThere/);
  });

  it('використовує сучасний файловий API без застарілих викликів', () => {
    // шукаємо саме виклики, а не згадки в коментарях
    const code = BACKUP_SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\bwriteAsStringAsync\s*\(/);
    expect(code).not.toMatch(/\breadAsStringAsync\s*\(/);
    expect(code).toContain('.write(');
  });
});
