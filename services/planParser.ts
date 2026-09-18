import { TrainingPlan, DayPlan, PlannedExercise } from '../types';
import type { ExerciseResolver } from './exerciseMatch';
import { getExercise } from './library';
import { looksLikeHeading } from './library/normalize';

/**
 * Зберігає текст плану від AI і, якщо передали резолвер, прив'язує вправи до
 * бібліотеки (ТЗ F8.1). Сам текст не змінюється — користувач читає те, що
 * написала модель, а id потрібні лише додатку: картинка, заміна, калорії.
 */
export function createPlanFromAIText(
  text: string,
  goals: string[],
  resolver?: ExerciseResolver
): TrainingPlan {
  const days = parseWeekDays(text);
  for (const day of days) {
    for (const ex of day.exercises) {
      // id від моделі може бути вигаданим — лишаємо тільки те, що є в бібліотеці
      if (ex.exerciseId && !getExercise(ex.exerciseId)) ex.exerciseId = undefined;
      if (!ex.exerciseId && resolver) {
        const id = resolver({ name: ex.name });
        if (id) ex.exerciseId = id;
      }
    }
    // Заголовки без двокрапки («Цілі», «Примітки») на вигляд не відрізниш від
    // назви вправи — але вправа або впізнається бібліотекою, або має цифри.
    // Голе слово, за яким нічого немає, — це підзаголовок.
    day.exercises = day.exercises.filter((ex) => (
      ex.exerciseId
      || ex.sets || ex.reps || ex.duration || ex.weight
      || ex.name.trim().split(/\s+/).length > 2
    ));
  }
  return {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    weeklySchedule: days,
    goals,
    generatedFor: text,
  };
}

// Try to extract day-by-day structure from AI text
function parseWeekDays(text: string): DayPlan[] {
  // NOTE: JS-овий \b не працює після кирилиці, тому короткі назви днів
  // матчимо з явними межами (початок рядка / не-літера з обох боків)
  const CYR = 'а-щьюяіїєґ';
  const short = (abbr: string) => new RegExp(`(^|[^${CYR}a-z])${abbr}([^${CYR}a-z]|$)`, 'i');
  const DAY_PATTERNS: { patterns: RegExp[]; dayOfWeek: number; name: string }[] = [
    { patterns: [/понеділок|monday/i, short('пн')], dayOfWeek: 1, name: 'Понеділок' },
    { patterns: [/вівторок|tuesday/i, short('вт')], dayOfWeek: 2, name: 'Вівторок' },
    { patterns: [/середа|серед|wednesday/i, short('ср')], dayOfWeek: 3, name: 'Середа' },
    { patterns: [/четвер|thursday/i, short('чт')], dayOfWeek: 4, name: 'Четвер' },
    { patterns: [/п\'ятниця|пятниця|friday/i, short('пт')], dayOfWeek: 5, name: 'П\'ятниця' },
    { patterns: [/субота|saturday/i, short('сб')], dayOfWeek: 6, name: 'Субота' },
    { patterns: [/неділя|sunday/i, short('нд')], dayOfWeek: 0, name: 'Неділя' },
  ];

  const lines = text.split('\n');
  const days: DayPlan[] = [];
  let currentDay: DayPlan | null = null;
  let currentLines: string[] = [];

  function flushDay() {
    if (currentDay) {
      currentDay.description = currentLines.join('\n').trim();
      currentDay.exercises = extractExercises(currentLines);
      days.push(currentDay);
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matchedDay = DAY_PATTERNS.find((d) => d.patterns.some((p) => p.test(trimmed)));
    if (matchedDay) {
      flushDay();
      currentLines = [];
      currentDay = {
        dayOfWeek: matchedDay.dayOfWeek,
        workoutType: detectWorkoutType(trimmed + ' ' + lines.slice(lines.indexOf(line) + 1, lines.indexOf(line) + 5).join(' ')),
        description: '',
        exercises: [],
        estimatedDuration: 60,
      };
    } else if (currentDay) {
      currentLines.push(trimmed);
    }
  }
  flushDay();

  // If parsing found nothing, create a single "plan" entry with full text
  if (days.length === 0) {
    return [{
      dayOfWeek: -1,
      workoutType: 'custom',
      description: text,
      exercises: [],
      estimatedDuration: 60,
    }];
  }

  return days;
}

function detectWorkoutType(text: string): string {
  const lower = text.toLowerCase();
  if (/відпочинок|відновлення|rest|recovery/i.test(lower)) return 'recovery';
  if (/біг|run|кардіо|cardio/i.test(lower)) return 'run';
  if (/crossfit|кросфіт/i.test(lower)) return 'crossfit';
  if (/hiit/i.test(lower)) return 'hiit';
  if (/йога|yoga/i.test(lower)) return 'yoga';
  if (/силов|strength|жим|присідання|станова/i.test(lower)) return 'strength';
  return 'strength';
}

/**
 * Рядки розминочних підходів («5 повторень @ 40kg», «2 хвилини») моделі пишуть
 * тим самим списком, що й вправи. Після того, як з назви прибрано числа, від
 * таких рядків лишається сама одиниця виміру — це не вправа.
 */
function isNotAnExercise(name: string, raw = name): boolean {
  const t = name.trim();
  // Двокрапка в кінці рядка — ознака заголовка («Робочі підходи:»). Перевіряємо
  // саме СИРИЙ рядок, бо з назви її вже зрізано при чистці.
  if (/:\s*$/.test(raw.replace(/\*\*/g, '').trim())) return true;
  // курсивом моделі пишуть коментарі до вправи, а не вправи
  if (/^_.*_$/.test(t)) return true;
  // ціле речення замість назви — рахуємо слова вже в очищеній назві, інакше
  // під ніж потрапить нормальна вправа з довгим поясненням після двокрапки
  if (looksLikeHeading(t)) return true;

  // числа на початку («5 повторень», «2х10 разів») до справи не стосуються —
  // важливо, яке слово йде далі
  const n = t.replace(/^[\d\s.,:;x×х/-]+/i, '').trim().toLowerCase();
  if (n.length < 3) return true;
  return /^(повтор|разів|раз\b|хвилин|хв\b|секунд|сек\b|кг\b|раунд|підход|сет\b|@)/.test(n);
}

function extractExercises(lines: string[]): PlannedExercise[] {
  const exercises: PlannedExercise[] = [];
  // Моделі пишуть і маркованими списками, і нумерованими («1. Присідання»),
  // тому приймаємо обидва — інакше половина плану просто не розбирається
  const exercisePattern = /^\s*(?:[-•*]|\d+[.)])\s+(.+)/;
  const setsPattern = /(\d+)\s*[xх×]\s*(\d+[-–]?\d*)/i;
  const repsPattern = /(\d+[-–]\d+|\d+)\s*(повт|раз|rep)/i;
  const setsOnlyPattern = /(\d+)\s*(підх|set)/i;

  for (const line of lines) {
    const match = line.match(exercisePattern);
    if (!match) continue;

    let content = match[1].trim();

    // Тренер позначає вправи ідентифікаторами бібліотеки: «Присідання [back_squat]».
    // Це точніше за розпізнавання назви — беремо id звідси, а дужки прибираємо,
    // щоб користувач бачив звичайний текст.
    const markers = [...content.matchAll(/\s*\[([a-z][a-z0-9_]{2,40})\]/g)];
    const markedId: string | undefined = markers[0]?.[1];
    for (const m of markers) content = content.replace(m[0], '');

    // Назву модель майже завжди виділяє жирним, а далі йде опис:
    // «**Кола руками**: 2х10 обертань вперед та назад». Беремо саме виділене —
    // інакше в назву вправи потрапляє півречення пояснень.
    const bold = /\*\*(.+?)\*\*/.exec(content);
    let notes: string | undefined;
    if (bold) {
      notes = content.replace(bold[0], '').replace(/^[\s:—-]+/, '').trim() || undefined;
      content = bold[1].trim();
    }
    content = content.replace(/\*\*/g, '').replace(/^[:—-]+|[:—-]+$/g, '').trim();

    const exercise: PlannedExercise = { name: content };
    if (markedId) exercise.exerciseId = markedId;
    if (notes) exercise.notes = notes;

    const setsMatch = content.match(setsPattern) ?? notes?.match(setsPattern) ?? null;
    if (setsMatch) {
      exercise.sets = parseInt(setsMatch[1]);
      exercise.reps = setsMatch[2];
      // з назви прибираємо «3х10», якщо воно було саме там
      exercise.name = content.replace(setsPattern, '').trim().replace(/[:—-]+$/, '').trim();
    }

    if (isNotAnExercise(exercise.name, match[1])) continue;
    exercises.push(exercise);
    if (exercises.length >= 12) break;
  }

  return exercises;
}

export function getTodayPlan(plan: TrainingPlan): DayPlan | null {
  const today = new Date().getDay(); // 0=Sun
  return plan.weeklySchedule.find((d) => d.dayOfWeek === today) || null;
}

export const WORKOUT_TYPE_LABELS: Record<string, string> = {
  strength: 'Силове', cardio: 'Кардіо', crossfit: 'CrossFit',
  hiit: 'HIIT', yoga: 'Йога', recovery: 'Відновлення',
  run: 'Біг', cycling: 'Велосипед', swimming: 'Плавання', custom: 'За планом',
};

export const WORKOUT_TYPE_COLORS: Record<string, string> = {
  strength: '#E63946', cardio: '#2EC4B6', crossfit: '#F4A261',
  hiit: '#FF6B6B', yoga: '#9B59B6', recovery: '#3498DB',
  run: '#2ECC71', cycling: '#E67E22', swimming: '#1ABC9C', custom: '#95A5A6',
};
