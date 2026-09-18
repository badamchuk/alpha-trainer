/**
 * Рендер розмітки у відповідях AI (план §6).
 *
 * Перевіряємо саме розбір, а не верстку: компонент лише розкладає рядки
 * по стилях, і якщо розбір правильний — на екрані теж буде правильно.
 */
import { parseMarkdown, splitBold } from '../components/RichText';

describe('жирний текст', () => {
  it('виділяє **жирний** і лишає решту', () => {
    expect(splitBold('Пий **воду** щодня')).toEqual([
      { text: 'Пий ', bold: false },
      { text: 'воду', bold: true },
      { text: ' щодня', bold: false },
    ]);
  });

  it('кілька виділень у рядку', () => {
    const parts = splitBold('**Сон** важливіший за **добавки**');
    expect(parts.filter((p) => p.bold).map((p) => p.text)).toEqual(['Сон', 'добавки']);
  });

  it('одинарні зірочки не чіпає', () => {
    expect(splitBold('3*5 підходів')).toEqual([{ text: '3*5 підходів', bold: false }]);
  });

  it('незакритий маркер лишає як текст', () => {
    expect(splitBold('**не закрито')).toEqual([{ text: '**не закрито', bold: false }]);
  });
});

describe('рядки', () => {
  it('списки розпізнаються за дефісом, зірочкою й крапкою', () => {
    for (const line of ['- пункт', '* пункт', '• пункт']) {
      expect(parseMarkdown(line)[0].kind).toBe('bullet');
    }
  });

  it('заголовок ### стає заголовком без решіток', () => {
    const [line] = parseMarkdown('### Відновлення');
    expect(line.kind).toBe('heading');
    expect(line.parts[0].text).toBe('Відновлення');
  });

  it('звичайний текст лишається текстом', () => {
    expect(parseMarkdown('Просто рядок')[0].kind).toBe('text');
  });

  it('кількість рядків зберігається — абзаци не злипаються', () => {
    expect(parseMarkdown('один\n\nдва')).toHaveLength(3);
  });

  it('жирний усередині списку теж працює', () => {
    const [line] = parseMarkdown('- **Присідання**: 5×5');
    expect(line.kind).toBe('bullet');
    expect(line.parts[0]).toEqual({ text: 'Присідання', bold: true });
  });
});
