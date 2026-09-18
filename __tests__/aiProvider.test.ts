/**
 * Перемикання між Groq і Gemini.
 *
 * Привід із життя: Groq відповідає 403 «Access denied» (блокування за мережею,
 * ключ при цьому робочий), а додаток обирав саме його — і тренер мовчав, хоча
 * другий ключ у профілі був і працював.
 */
import {
  askProvider, isPermanentFailure, isProviderDead, resetProviders, switchNote,
} from '../services/aiProvider';

const both = { groqApiKey: 'gsk_x', geminiApiKey: 'AIza_x' };

beforeEach(() => resetProviders());

describe('вибір провайдера', () => {
  it('з двома ключами першим питає Groq', async () => {
    const r = await askProvider(both, {
      groq: async () => 'від groq',
      gemini: async () => 'від gemini',
    });
    expect(r.provider).toBe('groq');
    expect(r.result).toBe('від groq');
  });

  it('403 від Groq → відповідає Gemini', async () => {
    const r = await askProvider(both, {
      groq: async () => { throw new Error('403 Access denied. Please check your network settings.'); },
      gemini: async () => 'від gemini',
    });
    expect(r.provider).toBe('gemini');
    expect(r.switchedFrom).toBe('groq');
  });

  it('після відмови Groq більше не питають', async () => {
    const groq = jest.fn(async () => { throw new Error('403 Access denied'); });
    await askProvider(both, { groq, gemini: async () => 'ok' });
    await askProvider(both, { groq, gemini: async () => 'ok' });
    expect(groq).toHaveBeenCalledTimes(1);
    expect(isProviderDead('groq')).toBe(true);
  });

  it('тимчасові збої провайдера не викреслюють', async () => {
    const groq = jest.fn(async () => { throw new Error('429 quota exceeded'); });
    await askProvider(both, { groq, gemini: async () => 'ok' });
    expect(isProviderDead('groq')).toBe(false);
    await askProvider(both, { groq, gemini: async () => 'ok' });
    expect(groq).toHaveBeenCalledTimes(2);   // квота могла відновитись
  });

  it('якщо з ключем лише один провайдер — питають тільки його', async () => {
    const groq = jest.fn(async () => 'нізащо');
    const r = await askProvider({ geminiApiKey: 'AIza_x' } as never, {
      groq, gemini: async () => 'від gemini',
    });
    expect(groq).not.toHaveBeenCalled();
    expect(r.provider).toBe('gemini');
  });

  it('коли обидва впали — помилка останнього, а не мовчання', async () => {
    await expect(askProvider(both, {
      groq: async () => { throw new Error('403 Access denied'); },
      gemini: async () => { throw new Error('429 quota exceeded'); },
    })).rejects.toThrow('quota');
  });

  it('без ключів — зрозуміла помилка', async () => {
    await expect(askProvider(null, { groq: async () => 1, gemini: async () => 2 }))
      .rejects.toThrow('ключа');
  });

  it('викреслений провайдер лишається останнім шансом', async () => {
    const gemini = jest.fn(async () => { throw new Error('403 forbidden'); });
    // gemini викреслюється
    await expect(askProvider({ geminiApiKey: 'AIza_x' } as never, {
      groq: async () => 'нема ключа', gemini,
    })).rejects.toThrow();
    expect(isProviderDead('gemini')).toBe(true);
    // але якщо іншого немає — пробуємо ще раз
    gemini.mockImplementation(async () => 'ожив' as never);
    const r = await askProvider({ geminiApiKey: 'AIza_x' } as never, {
      groq: async () => 'нема ключа', gemini,
    });
    expect(r.result).toBe('ожив');
  });
});

describe('класифікація помилок', () => {
  it('403, 401 і невалідний ключ — назавжди', () => {
    for (const m of [
      '403 Access denied. Please check your network settings.',
      '401 Unauthorized',
      'API key not valid. Please pass a valid API key.',
      'PERMISSION_DENIED',
    ]) expect(isPermanentFailure(new Error(m))).toBe(true);
  });

  it('квота, мережа й таймаут — тимчасово', () => {
    for (const m of [
      '429 RESOURCE_EXHAUSTED: quota exceeded',
      'Network request failed',
      'timeout of 30000ms exceeded',
      'rate limit reached',
    ]) expect(isPermanentFailure(new Error(m))).toBe(false);
  });
});

describe('пояснення користувачу', () => {
  it('про Groq каже саме про мережу', () => {
    expect(switchNote('groq', 'gemini')).toContain('мережі');
    expect(switchNote('groq', 'gemini')).toContain('Gemini');
  });

  it('про Gemini — без вигадок про мережу', () => {
    expect(switchNote('gemini', 'groq')).not.toContain('мережі');
  });
});
