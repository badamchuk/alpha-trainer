/**
 * Списки моделей AI (план §1).
 *
 * Мертва модель у ланцюжку — це не косметика: кожен запит спершу отримує 404,
 * і при невдалому збігу обставин користувач бачить «AI недоступний». Тест
 * стежить, щоб у списки не поверталось те, що вже зняте або експериментальне.
 */
import fs from 'fs';
import path from 'path';

const SERVICES = path.join(__dirname, '..', 'services');

function modelsIn(file: string): string[] {
  const src = fs.readFileSync(path.join(SERVICES, file), 'utf8');
  return [...src.matchAll(/'((?:gemini|llama|meta-llama)[^']*)'/g)].map((m) => m[1]);
}

const GEMINI_FILES = ['gemini.ts', 'foodAI.ts'];

describe('моделі Gemini', () => {
  it('жодного покоління 1.5 — воно зняте', () => {
    for (const f of GEMINI_FILES) {
      expect(modelsIn(f).filter((m) => m.includes('1.5'))).toEqual([]);
    }
  });

  it('жодної експериментальної моделі — вони зникають без попередження', () => {
    for (const f of GEMINI_FILES) {
      expect(modelsIn(f).filter((m) => m.includes('-exp'))).toEqual([]);
    }
  });

  it('основний ланцюжок починається з 2.5-flash і має запасні', () => {
    const chain = modelsIn('gemini.ts').filter((m) => m.startsWith('gemini-'));
    expect(chain[0]).toBe('gemini-2.5-flash');
    expect(chain.length).toBeGreaterThanOrEqual(3);
  });

  it('vision для фото їжі теж на актуальних моделях', () => {
    const vision = modelsIn('foodAI.ts').filter((m) => m.startsWith('gemini-'));
    expect(vision.length).toBeGreaterThanOrEqual(2);
    expect(vision[0]).toBe('gemini-2.5-flash');
  });

  it('назви моделей не дублюються в ланцюжку', () => {
    const chain = modelsIn('gemini.ts').filter((m) => m.startsWith('gemini-'));
    expect(new Set(chain).size).toBe(chain.length);
  });
});

describe('моделі Groq', () => {
  it('ланцюжок непорожній', () => {
    const chain = modelsIn('groq.ts');
    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  it('службові запити йдуть найдешевшою моделлю, а не хардкодом', () => {
    const src = fs.readFileSync(path.join(SERVICES, 'groq.ts'), 'utf8');
    // модель для витягання фактів береться з константи
    expect(src).toContain('CHEAP_MODEL');
    const afterConst = src.slice(src.indexOf('CHEAP_MODEL ='));
    expect(afterConst).not.toContain("'llama-3.1-8b-instant'\n    );");
  });
});
