// Нормалізація назв вправ. Без залежностей: цим користуються і бібліотека, і розпізнавання назв.
//
// Мета — привести те, що людина набрала руками, до порівнюваного вигляду:
// «Присідання зі штангою 100кг» і «присідання зі штангою» мають стати однаковими.

/** Апострофи, які трапляються в українських назвах, — це один символ. */
const APOSTROPHES = /[’ʼ`'‘']/g;

/** Числа з одиницями й без: «400м», «10 кг», «3х10», «1 хв». */
const UNITS = 'кг|kg|м|m|км|km|хв|min|сек|с|s|раз|повт|reps?|ккал|kcal|%';
const NUMBER_TOKEN = new RegExp(`^\\d+([.,]\\d+)?(${UNITS})?$`);
/** Одиниця, що лишилась сама після зрізання числа: «планка 1 хв» → «планка». */
const UNIT_TOKEN = new RegExp(`^(${UNITS})$`);
const REPS_TOKEN = /^\d+\s*[xх×]\s*\d+$/;

const PUNCTUATION = /[.,;:!?()[\]{}«»"“”…/\\|+—–-]/g;

/**
 * Базова нормалізація: нижній регістр, єдиний апостроф, без пунктуації, чисел і одиниць.
 * Використовується для точного порівняння назв і синонімів.
 */
export function normalizeName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/ё/g, 'е')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(' ')
    .filter((t) => t && !NUMBER_TOKEN.test(t) && !REPS_TOKEN.test(t) && !UNIT_TOKEN.test(t));

  return tokens.join(' ');
}

/**
 * Пом'якшений ключ для нечіткого порівняння: прибирає різницю и/і, ґ/г і апостроф.
 * «крокуючий» і «крокуючі» так стають ближчими, а «стільчик» і «стiльчик» — однаковими.
 */
export function looseKey(raw: string): string {
  return normalizeName(raw)
    .replace(/и/g, 'і')
    .replace(/ґ/g, 'г')
    .replace(/'/g, '');
}

/** Рядок схожий на службовий текст плану, а не на вправу («17:00 — Кросфіту», «Розминка:»). */
export function looksLikeHeading(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (/^\d{1,2}[:.]\d{2}/.test(t)) return true;          // час на початку
  if (/:\s*$/.test(t)) return true;                       // заголовок із двокрапкою в кінці
  if (t.split(/\s+/).length > 8) return true;             // ціле речення, а не назва
  return false;
}
