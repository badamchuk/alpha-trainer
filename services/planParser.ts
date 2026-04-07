import { TrainingPlan, DayPlan, PlannedExercise } from '../types';

// Saves AI text response as a training plan
export function createPlanFromAIText(text: string, goals: string[]): TrainingPlan {
  const days = parseWeekDays(text);
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
  const DAY_PATTERNS: { pattern: RegExp; dayOfWeek: number; name: string }[] = [
    { pattern: /понеділок|пн\b|monday/i, dayOfWeek: 1, name: 'Понеділок' },
    { pattern: /вівторок|вт\b|tuesday/i, dayOfWeek: 2, name: 'Вівторок' },
    { pattern: /середа|серед|ср\b|wednesday/i, dayOfWeek: 3, name: 'Середа' },
    { pattern: /четвер|чт\b|thursday/i, dayOfWeek: 4, name: 'Четвер' },
    { pattern: /п\'ятниця|пятниця|пт\b|friday/i, dayOfWeek: 5, name: 'П\'ятниця' },
    { pattern: /субота|сб\b|saturday/i, dayOfWeek: 6, name: 'Субота' },
    { pattern: /неділя|нд\b|sunday/i, dayOfWeek: 0, name: 'Неділя' },
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

    const matchedDay = DAY_PATTERNS.find((d) => d.pattern.test(trimmed));
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

function extractExercises(lines: string[]): PlannedExercise[] {
  const exercises: PlannedExercise[] = [];
  const exercisePattern = /[-•*]\s*(.+)/;
  const setsPattern = /(\d+)\s*[xх×]\s*(\d+[-–]?\d*)/i;
  const repsPattern = /(\d+[-–]\d+|\d+)\s*(повт|раз|rep)/i;
  const setsOnlyPattern = /(\d+)\s*(підх|set)/i;

  for (const line of lines) {
    const match = line.match(exercisePattern);
    if (!match) continue;

    const content = match[1].trim();
    const exercise: PlannedExercise = { name: content };

    const setsMatch = content.match(setsPattern);
    if (setsMatch) {
      exercise.sets = parseInt(setsMatch[1]);
      exercise.reps = setsMatch[2];
      exercise.name = content.replace(setsPattern, '').trim().replace(/[:—-]+$/, '').trim();
    }

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
