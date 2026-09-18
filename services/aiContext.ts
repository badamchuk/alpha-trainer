// Контекст бібліотеки для AI (план §3).
//
// Без цього блоку тренер живе окремим життям: він не знає ні про 181 вправу,
// ні про те, що користувач просив берегти плече, і може порадити стрибки тому,
// кому не можна стрибати. Тут ми даємо моделі той самий фільтр, який
// застосовують заміни й конструктор, — і просимо називати вправи їхніми id,
// щоб пораду можна було виконати одним дотиком, а не переписувати руками.
//
// Модуль чистий: жодного сховища й UI, тільки бібліотека і дані, які передали.

import {
  Equipment, JointZone, LibraryExercise, Level, MovementPattern, MUSCLE_GROUP_LABELS,
} from './library/types';
import { allExercises, getExercise, isAvailable, muscleGroupOf } from './library';
import { EQUIPMENT_LABELS, equipmentOf } from './equipment';
import { UserProfile, WorkoutEntry } from '../types';
import type { ExerciseResolver } from './exerciseMatch';

/** Скільки вправ максимум перелічувати. Більше — зайві токени на кожному запиті. */
const MAX_EXERCISES = 80;

const PATTERN_TITLES: Partial<Record<MovementPattern, string>> = {
  squat: 'Присідання',
  hinge: 'Нахили й тяги від стегна',
  lunge: 'Випади',
  hip_thrust: 'Сідничний міст',
  push_horizontal: 'Жими лежачи й відтискання',
  push_vertical: 'Жими над головою',
  pull_horizontal: 'Горизонтальні тяги',
  pull_vertical: 'Підтягування й вертикальні тяги',
  olympic: 'Ривки й поштовхи',
  jump: 'Стрибки',
  burpee: 'Бурпі',
  carry: 'Перенесення ваги',
  core_flexion: 'Прес',
  core_stability: 'Планки й утримання',
  core_rotation: 'Скручування й ротація',
  elbow_flexion: 'Біцепс',
  elbow_extension: 'Трицепс',
  shoulder_raise: 'Махи на плечі',
  monostructural: 'Кардіо',
  mobility: 'Мобільність і розтяжка',
};

const LEVEL_WORD: Record<Level, string> = { 1: 'просто', 2: 'середньо', 3: 'складно' };

const ZONE_WORD: Record<JointZone, string> = {
  shoulder: 'плече',
  lower_back: 'поперек',
  spine_flexion: 'згинання спини',
  spine_extension: 'розгинання спини',
  knee: 'коліно',
  wrist: 'зап’ястя',
  elbow: 'лікоть',
  impact: 'ударне навантаження (стрибки, біг)',
};

export interface ExerciseContextInput {
  profile: UserProfile | null;
  /** Історія — щоб знайомі вправи потрапили в перелік першими. */
  workouts?: WorkoutEntry[];
  resolver?: ExerciseResolver;
  maxExercises?: number;
}

/** Вправи, які цей користувач може зробити сьогодні — той самий фільтр, що в замінах. */
export function availableExercises(input: ExerciseContextInput): LibraryExercise[] {
  const { profile, workouts = [], resolver, maxExercises = MAX_EXERCISES } = input;
  const equipment = equipmentOf(profile);
  const zones = profile?.protectZones ?? [];
  const level: Level = profile?.fitnessLevel === 'beginner' ? 1
    : profile?.fitnessLevel === 'advanced' ? 3 : 2;

  // скільки разів робив кожну вправу — знайомі корисніші за екзотику
  const familiarity = new Map<string, number>();
  if (resolver) {
    for (const w of workouts) {
      for (const e of w.exercises ?? []) {
        const id = resolver(e);
        if (id) familiarity.set(id, (familiarity.get(id) ?? 0) + 1);
      }
    }
  }

  const pool = allExercises().filter((ex) => {
    if (ex.custom && !ex.baseId) return false;
    if (equipment && !isAvailable(ex, equipment)) return false;
    for (const z of zones) if ((ex.stress?.[z] ?? 0) >= 3) return false;
    // Рівень обмежує лише НЕЗНАЙОМІ вправи. Те, що людина вже робить щотижня
    // (станова важить «складно», але вона в кожному тренуванні), ховати від
    // тренера безглуздо — він порадить «додати різноманіття» замість прогресії.
    if (ex.level > level && !familiarity.has(ex.id)) return false;
    return true;
  });

  return pool
    .sort((a, b) => {
      const fam = (familiarity.get(b.id) ?? 0) - (familiarity.get(a.id) ?? 0);
      if (fam !== 0) return fam;
      // далі — простіші вперед: їх легше порадити будь-кому
      if (a.level !== b.level) return a.level - b.level;
      return a.id.localeCompare(b.id);
    })
    .slice(0, maxExercises);
}

/**
 * Блок для системного промпту: обладнання, обмеження, перелік вправ і правило,
 * як на них посилатись. Іде один раз на сесію чату, не в кожне повідомлення.
 */
export function buildExerciseContext(input: ExerciseContextInput): string {
  const { profile } = input;
  const equipment = equipmentOf(profile);
  const zones = profile?.protectZones ?? [];
  const list = availableExercises(input);
  if (list.length === 0) return '';

  const equipmentLine = equipment === undefined
    ? 'не вказано (можна пропонувати будь-що з переліку)'
    : equipment.length === 0
      ? 'немає — тільки власна вага'
      : equipment.map((e) => EQUIPMENT_LABELS[e] ?? e).join(', ');

  // групуємо за патерном: так моделі легше добирати протилежні рухи
  const byPattern = new Map<MovementPattern, LibraryExercise[]>();
  for (const ex of list) {
    byPattern.set(ex.pattern, [...(byPattern.get(ex.pattern) ?? []), ex]);
  }

  const groups = [...byPattern.entries()].map(([pattern, items]) => {
    const title = PATTERN_TITLES[pattern] ?? pattern;
    const rows = items
      .map((ex) => `  ${ex.id} — ${ex.nameUk} (${MUSCLE_GROUP_LABELS[muscleGroupOf(ex)].uk}, ${LEVEL_WORD[ex.level]})`)
      .join('\n');
    return `${title}:\n${rows}`;
  });

  return `

БІБЛІОТЕКА ВПРАВ ДОДАТКУ (пропонуй ЛИШЕ звідси):
- Обладнання користувача: ${equipmentLine}
${zones.length > 0 ? `- Береже: ${zones.map((z) => ZONE_WORD[z]).join(', ')} — вправи, що сильно навантажують ці зони, вже прибрані з переліку\n` : ''}
${groups.join('\n\n')}

ЯК ПОСИЛАТИСЬ НА ВПРАВУ: пиши назву, а одразу після неї — ідентифікатор у
квадратних дужках, наприклад: Присідання зі штангою на спині [back_squat].
Так додаток підставить картинку, схему підходів і дасть замінити вправу одним
дотиком. Вправ поза цим переліком не пропонуй: користувач не зможе їх виконати
через обладнання або обмеження.`;
}

/**
 * Історія тренувань очима бібліотеки: різні написання однієї вправи зводяться
 * до однієї назви з id. Без цього «front squad» і «фронтальні присідання»
 * виглядають для моделі як дві різні вправи, і вона радить «додати різноманіття».
 */
export function describeWorkout(w: WorkoutEntry, resolver?: ExerciseResolver): string {
  const lines: string[] = [];
  for (const e of w.exercises ?? []) {
    const id = resolver ? resolver(e) : null;
    const lib = id ? getExercise(id) : undefined;
    const name = lib ? `${lib.nameUk} [${lib.id}]` : e.name;
    const parts: string[] = [];
    if (e.sets && e.reps && e.weight) parts.push(`${e.sets}×${e.reps} @ ${e.weight}кг`);
    else if (e.sets && e.reps) parts.push(`${e.sets}×${e.reps}`);
    if (e.distance) parts.push(`${e.distance}км`);
    if (e.duration) parts.push(`${e.duration}хв`);
    if (e.calories) parts.push(`${e.calories}ккал`);
    lines.push(`  • ${name}${parts.length ? `: ${parts.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Вправи, які AI назвав у відповіді. Невідомі id мовчки відкидаємо: модель
 * цілком може вигадати ідентифікатор, і показувати користувачу вигадку не можна.
 */
export function parseExerciseIds(text: string): LibraryExercise[] {
  const out: LibraryExercise[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[([a-z][a-z0-9_]{2,40})\]/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const ex = getExercise(id);
    if (ex) out.push(ex);
  }
  return out;
}

/** Текст без технічних дужок — саме його показуємо в чаті. */
export function stripExerciseIds(text: string): string {
  return text.replace(/\s*\[([a-z][a-z0-9_]{2,40})\]/g, (whole, id: string) => (
    getExercise(id) ? '' : whole
  ));
}

/** Готові шматки контексту для промпту. Складає екран, який має і профіль, і резолвер. */
export interface AIContextBlocks {
  /** Перелік доступних вправ і правило посилання на них. */
  exercises: string;
  /** Останні тренування бібліотечними назвами; порожньо — провайдер зробить сам. */
  workouts: string;
  /** Яке сьогодні число й день тижня. */
  today: string;
}

const WEEKDAYS = [
  'неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота',
];

/**
 * Модель не знає, який сьогодні день, і починає вгадувати за розкладом
 * («сьогодні вівторок» у п'ятницю). Тому дату кажемо прямо.
 */
export function describeToday(profile: UserProfile | null, now = new Date()): string {
  const day = now.getDay();
  const date = now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const isTrainingDay = profile?.availableDays?.includes(day);
  const planned = profile?.availableDays?.length
    ? isTrainingDay
      ? ' — тренувальний день за розкладом'
      : ' — за розкладом це день відпочинку, але людина може хотіти потренуватись'
    : '';
  return `\n\nСЬОГОДНІ: ${WEEKDAYS[day]}, ${date}${planned}.`;
}

export function buildAIContext(
  input: ExerciseContextInput & { recentWorkouts?: WorkoutEntry[] }
): AIContextBlocks {
  const recent = (input.recentWorkouts ?? input.workouts ?? []).slice(0, 5);
  const workouts = recent
    .map((w) => {
      const rating = w.rating ? ` ⭐${w.rating}` : '';
      const head = `${w.date} — ${w.workoutType} (${w.duration} хв)${rating}`;
      const body = describeWorkout(w, input.resolver);
      const notes = w.notes ? `\n  Нотатки: ${w.notes}` : '';
      return `${head}\n${body}${notes}`;
    })
    .join('\n\n');

  return {
    exercises: buildExerciseContext(input),
    workouts,
    today: describeToday(input.profile),
  };
}
