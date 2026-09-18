// Мінімальний рендер розмітки для відповідей AI (план §6).
//
// Моделі відповідають з markdown, і без обробки користувач бачить «**Сон**»
// замість жирного. Повноцінна бібліотека тут зайва: у відповідях трапляються
// лише жирний текст, списки й заголовки — саме їх і підтримуємо, решта
// лишається звичайним текстом як є.

import { Fragment } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

/** Розбиває рядок на шматки за `**жирний**`. */
export function splitBold(line: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  let rest = line;
  const re = /\*\*(.+?)\*\*/;
  let m = re.exec(rest);
  while (m) {
    if (m.index > 0) out.push({ text: rest.slice(0, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    rest = rest.slice(m.index + m[0].length);
    m = re.exec(rest);
  }
  if (rest) out.push({ text: rest, bold: false });
  return out.length > 0 ? out : [{ text: line, bold: false }];
}

export interface ParsedLine {
  kind: 'text' | 'bullet' | 'heading';
  parts: { text: string; bold: boolean }[];
}

export function parseMarkdown(text: string): ParsedLine[] {
  return text.split('\n').map((raw) => {
    const line = raw.trimEnd();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) return { kind: 'heading' as const, parts: splitBold(heading[1]) };
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) return { kind: 'bullet' as const, parts: splitBold(bullet[1]) };
    return { kind: 'text' as const, parts: splitBold(line) };
  });
}

interface Props {
  children: string;
  style?: StyleProp<TextStyle>;
  boldColor?: string;
}

export default function RichText({ children, style, boldColor }: Props) {
  const lines = parseMarkdown(children);
  return (
    <Text style={style}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.kind === 'bullet' && '•  '}
          {line.parts.map((part, j) => (
            <Text
              key={j}
              style={part.bold || line.kind === 'heading'
                ? { fontWeight: '700', color: boldColor }
                : undefined}
            >
              {part.text}
            </Text>
          ))}
          {i < lines.length - 1 && '\n'}
        </Fragment>
      ))}
    </Text>
  );
}
