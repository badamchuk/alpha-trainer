// Вибір AI-провайдера з перемиканням (Groq ↔ Gemini).
//
// Причина: Groq у частині країн відповідає 403 «Access denied» — це блокування
// за мережею, а не поганий ключ. Якщо в профілі є обидва ключі, показувати
// помилку безглуздо: треба просто спитати іншого.
//
// Провайдера, який щойно відмовив, більше не турбуємо до перезапуску додатку,
// інакше кожне повідомлення чекало б на його таймаут. Але помилки, які лікуються
// самі (вичерпана квота, зникла мережа), провайдера не «ховають»: завтра квота
// відновиться, і він знову знадобиться.

import { UserProfile } from '../types';
import { TFn, translate } from './i18n';

export type ProviderId = 'groq' | 'gemini';

/** Провайдери, які відмовили в цій сесії з невиправної причини. */
const dead = new Set<ProviderId>();

export function markProviderDead(id: ProviderId): void {
  dead.add(id);
}

export function isProviderDead(id: ProviderId): boolean {
  return dead.has(id);
}

/** Для тестів і для випадку, коли користувач змінив ключі. */
export function resetProviders(): void {
  dead.clear();
}

/**
 * Чи варто викреслити провайдера після цієї помилки.
 *
 * 403 і невалідний ключ — так: повторювати марно. Квота, мережа й таймаут —
 * ні: це тимчасово.
 */
export function isPermanentFailure(e: unknown): boolean {
  const msg = ((e as { message?: string })?.message ?? String(e)).toLowerCase();
  if (/quota|rate|resource_exhausted|429|timeout|network request failed/.test(msg)) return false;
  return /403|access denied|forbidden|401|unauthorized|api key not valid|api_key_invalid|permission/.test(msg);
}

export interface ProviderAttempt<T> {
  result: T;
  provider: ProviderId;
  /** Хто відмовив по дорозі — щоб пояснити користувачу, чому відповідає інший. */
  switchedFrom?: ProviderId;
}

const LABEL: Record<ProviderId, string> = { groq: 'Groq', gemini: 'Gemini' };

export function switchNote(from: ProviderId, to: ProviderId, t: TFn): string {
  // Groq блокує цілі країни — це не збій ключа, і сказати про це варто прямо.
  return t(from === 'groq' ? 'providerSwitchGeo' : 'providerSwitch', LABEL[from], LABEL[to]);
}

/**
 * Питає першого доступного провайдера, а при невдачі — наступного.
 *
 * Порядок: Groq (якщо ключ є і він не викреслений), далі Gemini. Якщо Groq
 * викреслений, він усе одно лишається останнім шансом — раптом це був разовий збій.
 */
export async function askProvider<T>(
  profile: Pick<UserProfile, 'groqApiKey' | 'geminiApiKey'> | null,
  runners: { groq: () => Promise<T>; gemini: () => Promise<T> }
): Promise<ProviderAttempt<T>> {
  const hasGroq = !!profile?.groqApiKey;
  const hasGemini = !!profile?.geminiApiKey;

  const order: ProviderId[] = [];
  if (hasGroq && !dead.has('groq')) order.push('groq');
  if (hasGemini && !dead.has('gemini')) order.push('gemini');
  // викреслені йдуть останніми: краще спробувати ще раз, ніж не відповісти взагалі
  if (hasGroq && dead.has('groq')) order.push('groq');
  if (hasGemini && dead.has('gemini')) order.push('gemini');

  if (order.length === 0) throw new Error(translate('noAiKey'));

  let switchedFrom: ProviderId | undefined;
  let lastError: unknown;

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    try {
      const result = await runners[id]();
      return { result, provider: id, switchedFrom };
    } catch (e) {
      lastError = e;
      if (isPermanentFailure(e)) dead.add(id);
      if (i < order.length - 1) switchedFrom = id;
    }
  }
  throw lastError;
}
