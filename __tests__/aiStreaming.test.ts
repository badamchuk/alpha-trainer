/**
 * Відмова від потокової відповіді (знайдено в емуляторі).
 *
 * Gemini SDK всередині спирається на Web Streams, яких у Hermes немає, тому
 * чат падав із «Cannot read property 'pipeThrough' of undefined». Тепер такий
 * збій має призводити до звичайної, непотокової відповіді — а не до помилки.
 */
import { isStreamingUnsupported } from '../services/gemini';

describe('розпізнавання збою середовища', () => {
  it('саме та помилка, яку ловив емулятор', () => {
    expect(isStreamingUnsupported(
      new TypeError("Cannot read property 'pipeThrough' of undefined"),
    )).toBe(true);
  });

  it('інші прояви відсутніх Web Streams теж', () => {
    for (const msg of [
      'ReadableStream is not defined',
      'result.stream.getReader is not a function',
      'TextDecoderStream is not defined',
    ]) {
      expect(isStreamingUnsupported(new Error(msg))).toBe(true);
    }
  });

  it('помилки API не приймаються за збій середовища', () => {
    for (const msg of [
      '429 RESOURCE_EXHAUSTED: quota exceeded',
      'API key not valid',
      'Network request failed',
      '404 model is not found',
    ]) {
      expect(isStreamingUnsupported(new Error(msg))).toBe(false);
    }
  });

  it('не падає на порожньому значенні', () => {
    expect(isStreamingUnsupported(undefined)).toBe(false);
    expect(isStreamingUnsupported(null)).toBe(false);
  });
});

describe('код чату', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'gemini.ts'), 'utf8',
  ) as string;

  it('обидва потокові чати мають запасний шлях', () => {
    const fallbacks = src.match(/if \(!isStreamingUnsupported\(e\)\) throw e;/g) ?? [];
    expect(fallbacks.length).toBe(2);
  });

  it('запасний шлях віддає текст одним шматком', () => {
    expect(src).toContain('onChunk(text);');
  });
});
