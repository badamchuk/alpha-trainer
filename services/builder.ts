// Конструктор тренування (ТЗ F5).
//
// Складає осмислене заняття, а не набір вправ: спершу великий рух, потім
// протилежний, потім допоміжне й кор. Порядок слотів фіксований — це і є
// «грамотність», яку не можна отримати випадковим вибором із бібліотеки.
//
// Детермінований: той самий seed і attempt дають той самий результат, тож
// «перегенерувати» — це attempt + 1, а не випадок.

import {
  Equipment, Intent, JointZone, Level, LibraryExercise, MovementPattern,
} from './library/types';
import { allExercises, getExercise, isAvailable } from './library';
import { Focus, Prescription, needsNewScheme, prescribe } from './prescriptions';
import { ExerciseLog, WorkoutEntry } from '../types';

export type BuilderFormat = 'fullbody' | 'crossfit';
export type BuilderDuration = 30 | 45 | 60;

export interface BuilderInput {
  format: BuilderFormat;
  durationMin: BuilderDuration;
  /** Лише для фулбоді. */
  focus?: Focus;
  equipment?: Equipment[];
  protectZones?: JointZone[];
  /** Рівень користувача: вправи, складніші за нього, не пропонуються. */
  level?: Level;
  /** Скільки разів робив кожну вправу — знайомі ставимо охочіше. */
  familiarity?: Map<string, number>;
  /** Що вже було в попередніх тренуваннях цього формату — щоб не повторювати. */
  recentIds?: string[];
}

export type BlockRole = 'warmup' | 'strength' | 'accessory' | 'metcon' | 'core' | 'cooldown';

export interface BuilderExercise {
  exercise: LibraryExercise;
  prescription: Prescription;
  /** Для метокону — вправи об'єднуються в суперсет. */
  supersetId?: string;
}

export interface BuilderBlock {
  role: BlockRole;
  title: string;
  /** «AMRAP 12 хв», «5 раундів» — як виконувати блок. */
  note?: string;
  exercises: BuilderExercise[];
  /** Скільки хвилин відведено блоку (метокон іде на час, а не на підходи). */
  minutes?: number;
  /** Чому блок порожній (F5.7). */
  emptyReason?: string;
}

export interface WorkoutDraft {
  workoutType: 'strength' | 'crossfit';
  format: BuilderFormat;
  focus?: Focus;
  durationMin: number;
  blocks: BuilderBlock[];
  estimatedMinutes: number;
}

interface Slot {
  role: BlockRole;
  title: string;
  /** Будь-який із патернів підходить. */
  patterns: MovementPattern[];
  /**
   * Дозволені наміри вправи. Без цього фільтра в «основну силову» потрапляє
   * трастер (за патерном це присід), а в розминку — спринти.
   */
  intents?: Intent[];
  /** Види навантаження, яким у цьому слоті не місце (спринт у розминці). */
  excludeMetKinds?: string[];
  /** Виключити ці сімейства (щоб не ставити двічі те саме). */
  avoidFamilies?: string[];
  prescriptionRole?: 'main' | 'accessory';
  note?: string;
}

// ─── Структура тренування (F5.2) ─────────────────────────────────────────────

const WARMUP: Slot[] = [
  { role: 'warmup', title: 'Розігрів', patterns: ['monostructural'], intents: ['conditioning'],
    // спринт і плавання — не розігрів перед штангою
    excludeMetKinds: ['sprint', 'explosive', 'swim'] },
  { role: 'warmup', title: 'Мобільність', patterns: ['mobility'], intents: ['mobility'] },
  { role: 'warmup', title: 'Мобільність', patterns: ['mobility'], intents: ['mobility'] },
];

const COOLDOWN: Slot[] = [
  { role: 'cooldown', title: 'Заминка', patterns: ['mobility'], intents: ['mobility'] },
];

/** Що вважається силовою роботою: решту в основні слоти не пускаємо. */
const STRENGTH_INTENTS: Intent[] = ['max_strength', 'hypertrophy'];
const CORE_INTENTS: Intent[] = ['hypertrophy', 'isometric', 'conditioning'];

function fullbodySlots(duration: BuilderDuration): Slot[] {
  const a: Slot = { role: 'strength', title: 'A. Основна — ноги', patterns: ['squat', 'hinge'], intents: STRENGTH_INTENTS, prescriptionRole: 'main' };
  const b: Slot = { role: 'strength', title: 'B. Основна — верх', patterns: ['push_horizontal', 'pull_vertical'], intents: STRENGTH_INTENTS, prescriptionRole: 'main' };
  const c1: Slot = { role: 'accessory', title: 'C. Суперсет — тяга/жим', patterns: ['pull_horizontal', 'push_vertical'], intents: STRENGTH_INTENTS, prescriptionRole: 'accessory' };
  const c2: Slot = { role: 'accessory', title: 'C. Суперсет — ноги', patterns: ['lunge', 'hip_thrust'], intents: STRENGTH_INTENTS, prescriptionRole: 'accessory' };
  const core: Slot = { role: 'core', title: 'Кор', patterns: ['core_flexion', 'core_stability', 'core_rotation'], intents: CORE_INTENTS, prescriptionRole: 'accessory' };

  if (duration === 30) return [...WARMUP.slice(0, 2), a, b, core, ...COOLDOWN];
  if (duration === 45) return [...WARMUP, a, b, c1, c2, core, ...COOLDOWN];
  return [...WARMUP, a, b, c1, c2, core, core, ...COOLDOWN];
}

/** Схеми метокону: назва + скільки рухів + скільки хвилин. */
const METCON_SCHEMES: {
  note: string; movements: number; rounds: number; repsLabel?: string; repsPerRound?: number;
}[] = [
  { note: 'AMRAP {min} хв — максимум раундів', movements: 3, rounds: 1, repsPerRound: 12 },
  { note: '21-15-9 на час', movements: 2, rounds: 3, repsLabel: '21-15-9', repsPerRound: 15 },
  { note: '5 раундів на час', movements: 3, rounds: 5, repsPerRound: 10 },
  { note: 'EMOM {min} хв — по черзі щохвилини', movements: 2, rounds: 1, repsPerRound: 10 },
];

function crossfitSlots(duration: BuilderDuration): Slot[] {
  const strength: Slot = {
    role: 'strength',
    title: duration === 30 ? 'Силова частина' : `Силова частина — ${duration === 45 ? 12 : 15} хв`,
    patterns: ['squat', 'hinge', 'olympic', 'push_vertical'],
    intents: ['max_strength', 'hypertrophy', 'power'],
    prescriptionRole: 'main',
  };
  const core: Slot = { role: 'core', title: 'Кор', patterns: ['core_flexion', 'core_stability'], intents: CORE_INTENTS, prescriptionRole: 'accessory' };
  const warm = WARMUP.slice(0, duration === 30 ? 2 : 3);
  return duration === 30
    ? [...warm, core, ...COOLDOWN]
    : [...warm, strength, core, ...COOLDOWN];
}

// ─── Вибір вправи в слот (F5.3) ──────────────────────────────────────────────

/** Детермінований «шум» — щоб при перегенерації порядок мінявся передбачувано. */
function jitter(seed: number, attempt: number, id: string): number {
  let h = seed + attempt * 7919;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return (h % 100) / 100;
}

interface PickContext {
  input: BuilderInput;
  usedIds: Set<string>;
  usedFamilies: Set<string>;
  seed: number;
  attempt: number;
}

function candidates(slot: Slot, ctx: PickContext): LibraryExercise[] {
  const { equipment, protectZones = [], level = 3 } = ctx.input;
  return allExercises().filter((ex) => {
    if (ex.custom) return false;                       // власні — лише вручну (F4.3 п.6)
    if (ctx.usedIds.has(ex.id)) return false;
    if (slot.intents && !slot.intents.includes(ex.intent)) return false;
    if (slot.excludeMetKinds?.includes(ex.metKind)) return false;
    // складений рух (трастер) не займає слот простого: інакше присід стає метоконом
    const matchesPattern = slot.patterns.includes(ex.pattern)
      || (ex.secondaryPattern !== undefined && slot.patterns.includes(ex.secondaryPattern));
    if (!matchesPattern) return false;
    if (slot.role === 'strength' && ex.secondaryPattern && !slot.patterns.includes(ex.pattern)) return false;
    // рівень стримує лише незнайомі вправи: звичну людина вже вміє робити
    if (ex.level > level && !(ctx.input.familiarity?.get(ex.id) ?? 0)) return false;
    if (equipment && !isAvailable(ex, equipment)) return false;
    for (const z of protectZones) if ((ex.stress?.[z] ?? 0) >= 3) return false;
    return true;
  });
}

function score(ex: LibraryExercise, slot: Slot, ctx: PickContext): number {
  const { familiarity, recentIds = [], level = 3, protectZones = [] } = ctx.input;
  const moderateStress = protectZones.some((z) => (ex.stress?.[z] ?? 0) === 2);
  const loadable = ex.metrics[0] === 'weight_reps';
  const strengthSlot = slot.role === 'strength' || slot.role === 'accessory';
  return (
    (slot.patterns[0] === ex.pattern ? 120 : 60)          // влучання в патерн слота
    // силовий слот існує заради прогресії, тому рух із вагою кращий за власну вагу,
    // якщо обладнання доступне; без обладнання цей бонус просто нікому не дістанеться
    + (strengthSlot && loadable ? 70 : 0)
    + (slot.prescriptionRole === 'main' && ex.intent === 'max_strength' ? 50 : 0)
    + Math.min(80, (familiarity?.get(ex.id) ?? 0) * 8)    // знайомість
    - Math.abs(level - ex.level) * 30                     // влучання в рівень
    - (ctx.usedFamilies.has(ex.family) ? 200 : 0)         // повтор сімейства
    - (recentIds.includes(ex.id) ? 150 : 0)               // було минулого разу
    - (moderateStress ? 100 : 0)
    + jitter(ctx.seed, ctx.attempt, ex.id) * 50
  );
}

function pick(slot: Slot, ctx: PickContext): LibraryExercise | null {
  const pool = candidates(slot, ctx);
  if (pool.length === 0) return null;
  return pool.reduce((best, ex) => (score(ex, slot, ctx) > score(best, slot, ctx) ? ex : best));
}

// ─── Метокон (F5.4) ──────────────────────────────────────────────────────────

const METCON_PATTERNS: MovementPattern[] = [
  'burpee', 'jump', 'monostructural', 'squat', 'hinge', 'push_horizontal',
  'pull_vertical', 'olympic', 'core_flexion',
];

function buildMetcon(minutes: number, ctx: PickContext): BuilderBlock {
  const scheme = METCON_SCHEMES[(ctx.seed + ctx.attempt) % METCON_SCHEMES.length];
  const supersetId = `builder_metcon_${ctx.seed}`;
  const chosen: BuilderExercise[] = [];

  // рухи різних патернів: присід + тяга + кардіо читається як нормальний комплекс
  const patternOrder = METCON_PATTERNS
    .slice()
    .sort((a, b) => jitter(ctx.seed, ctx.attempt, a) - jitter(ctx.seed, ctx.attempt, b));

  for (const pattern of patternOrder) {
    if (chosen.length >= scheme.movements) break;
    const slot: Slot = { role: 'metcon', title: 'Метокон', patterns: [pattern] };
    const ex = pick(slot, ctx);
    if (!ex) continue;
    // у метоконі не місце важким силовим схемам
    if (ex.intent === 'max_strength' && ex.level === 3) continue;
    ctx.usedIds.add(ex.id);
    ctx.usedFamilies.add(ex.family);
    chosen.push({
      exercise: ex,
      prescription: metconPrescription(ex, scheme),
      supersetId,
    });
  }

  return {
    role: 'metcon',
    title: 'Метокон',
    note: scheme.note.replace('{min}', String(minutes)),
    minutes,
    exercises: chosen,
    emptyReason: chosen.length === 0
      ? 'Немає підхожих рухів під твоє обладнання — прибери обмеження або додай інвентар у профілі.'
      : undefined,
  };
}

/** Повтори в метоконі: з обтяженням 9–15, власна вага 10–20, кардіо — за метрикою. */
function metconPrescription(
  ex: LibraryExercise,
  scheme: { rounds: number; repsLabel?: string; repsPerRound?: number }
): Prescription {
  if (ex.cardio) {
    const per2 = ex.cardio.per2min;
    return {
      sets: scheme.rounds,
      reps: per2.reps,
      seconds: per2.reps ? undefined : 120,
      restSec: 0,
      note: per2.distanceM ? `${per2.distanceM} м` : per2.calories ? `${per2.calories} ккал` : undefined,
    };
  }
  const weighted = ex.equipment.length > 0;
  const reps = scheme.repsPerRound ?? (weighted ? 12 : 15);
  return {
    sets: scheme.rounds,
    reps: weighted ? Math.min(reps, 15) : reps,
    repsLabel: scheme.repsLabel,
    restSec: 0,
  };
}

// ─── Збірка ──────────────────────────────────────────────────────────────────

export function generateWorkout(input: BuilderInput, seed = 1, attempt = 0): WorkoutDraft {
  const ctx: PickContext = {
    input, seed, attempt, usedIds: new Set(), usedFamilies: new Set(),
  };
  const focus = input.focus ?? 'hypertrophy';
  const slots = input.format === 'fullbody'
    ? fullbodySlots(input.durationMin)
    : crossfitSlots(input.durationMin);

  const blocks: BuilderBlock[] = [];
  let supersetCounter = 0;

  for (const slot of slots) {
    const ex = pick(slot, ctx);
    if (!ex) {
      blocks.push({
        role: slot.role,
        title: slot.title,
        exercises: [],
        emptyReason: 'Немає підхожої вправи під твоє обладнання',
      });
      continue;
    }
    ctx.usedIds.add(ex.id);
    ctx.usedFamilies.add(ex.family);

    // блок «C. Суперсет» — дві вправи поспіль в одному блоці
    const isSuperset = slot.title.startsWith('C.');
    const prev = blocks[blocks.length - 1];
    // Розігрів — це 3 хвилини легкого кардіо, а не 3 підходи з відпочинком
    let prescription = slot.role === 'warmup' && ex.cardio
      ? { sets: 1, seconds: 180, restSec: 0, note: 'легко, щоб зігрітись' }
      : prescribe(ex, focus, slot.prescriptionRole ?? 'accessory');

    // Стретчинг «за замовчуванням» триває 5 хвилин — це окреме заняття, а не
    // рядок розминки. У розминці й заминці обмежуємо мобільність хвилиною.
    if ((slot.role === 'warmup' || slot.role === 'cooldown')
      && prescription.seconds && prescription.seconds > 60 && !ex.cardio) {
      prescription = { ...prescription, seconds: 60 };
    }

    // У коротке заняття 5 робочих підходів двох великих рухів просто не влазять,
    // а викидати кор заради них — гірше, ніж зробити менше підходів (F5.2 + F5.5).
    const mainCap = input.durationMin === 30 ? 3 : input.durationMin === 45 ? 4 : 5;
    if (slot.prescriptionRole === 'main' && prescription.sets > mainCap) {
      prescription = { ...prescription, sets: mainCap };
    }

    const entry: BuilderExercise = {
      exercise: ex,
      prescription,
      supersetId: isSuperset ? `builder_ss_${seed}_${supersetCounter}` : undefined,
    };

    if (isSuperset && prev && prev.title.startsWith('C.')) {
      entry.supersetId = prev.exercises[0]?.supersetId ?? entry.supersetId;
      prev.exercises.push(entry);
      prev.title = 'C. Суперсет';
      continue;
    }
    if (isSuperset) supersetCounter++;

    blocks.push({ role: slot.role, title: slot.title, note: slot.note, exercises: [entry] });
  }

  if (input.format === 'crossfit') {
    const metconMin = input.durationMin === 30 ? 14 : input.durationMin === 45 ? 11 : 12;
    // метокон іде перед кором і заминкою
    const tailAt = blocks.findIndex((b) => b.role === 'core');
    const metcon = buildMetcon(metconMin, ctx);
    blocks.splice(tailAt < 0 ? blocks.length : tailAt, 0, metcon);
  }

  fitToDuration(blocks, input.durationMin);

  return {
    workoutType: input.format === 'crossfit' ? 'crossfit' : 'strength',
    format: input.format,
    focus: input.format === 'fullbody' ? focus : undefined,
    durationMin: input.durationMin,
    blocks,
    estimatedMinutes: estimateMinutes(blocks),
  };
}

/**
 * Підгонка під обрану тривалість (ТЗ F5.5): ±15%.
 *
 * Міняємо кількість підходів у допоміжному й корі, а основні рухи не чіпаємо —
 * саме вони дають результат. Якщо й це не допомагає, прибираємо останній
 * допоміжний блок: краще коротше й чесно, ніж «60 хв», яких не існує.
 */
function fitToDuration(blocks: BuilderBlock[], durationMin: number): void {
  const flexible = blocks.filter((b) => b.role === 'accessory' || b.role === 'core');
  const low = durationMin * 0.85;
  const high = durationMin * 1.15;

  // Бракує часу — спершу подовжуємо метокон: це його природний спосіб рости,
  // на відміну від кора, якому п'ять підходів ні до чого.
  const metcon = blocks.find((b) => b.role === 'metcon' && b.exercises.length > 0);
  for (let guard = 0; guard < 8 && metcon && estimateMinutes(blocks) < low; guard++) {
    if ((metcon.minutes ?? 0) >= 20) break;
    metcon.minutes = (metcon.minutes ?? 10) + 1;
    metcon.note = metcon.note?.replace(/\d+ хв/, `${metcon.minutes} хв`);
  }

  for (let guard = 0; guard < 6 && estimateMinutes(blocks) < low; guard++) {
    const target = flexible.find((b) => b.exercises.some((e) => e.prescription.sets < 4));
    if (!target) break;
    for (const e of target.exercises) {
      if (e.prescription.sets < 4) e.prescription = { ...e.prescription, sets: e.prescription.sets + 1 };
    }
  }

  for (let guard = 0; guard < 6 && estimateMinutes(blocks) > high; guard++) {
    const target = [...flexible].reverse().find((b) => b.exercises.some((e) => e.prescription.sets > 2));
    if (target) {
      for (const e of target.exercises) {
        if (e.prescription.sets > 2) e.prescription = { ...e.prescription, sets: e.prescription.sets - 1 };
      }
      continue;
    }
    const lastAccessory = blocks.map((b, i) => [b, i] as const)
      .reverse().find(([b]) => b.role === 'accessory' || b.role === 'core');
    if (!lastAccessory) break;
    blocks.splice(lastAccessory[1], 1);
    flexible.splice(flexible.indexOf(lastAccessory[0]), 1);
  }
}

/**
 * Оцінка тривалості: робота + відпочинок за приписом.
 * Точні калорії рахує services/calories.ts на вже зібраному тренуванні (F5.5).
 */
export function estimateMinutes(blocks: BuilderBlock[]): number {
  let seconds = 0;
  for (const b of blocks) {
    if (b.role === 'metcon') {
      // метокон іде рівно стільки, скільки на нього відведено, плюс пояснення
      seconds += (b.minutes ?? 10) * 60 + 120;
      continue;
    }
    for (const e of b.exercises) {
      const p = e.prescription;
      const work = p.seconds ?? ((p.reps ?? 10) * 3);   // ~3 с на повтор
      seconds += p.sets * (work + p.restSec);
    }
  }
  return Math.round(seconds / 60);
}

/** Чернетка у вправи для форми запису (F5.7). */
export function draftToExercises(draft: WorkoutDraft): ExerciseLog[] {
  const out: ExerciseLog[] = [];
  for (const block of draft.blocks) {
    for (const e of block.exercises) {
      const p = e.prescription;
      out.push({
        name: e.exercise.nameUk,
        exerciseId: e.exercise.id,
        sets: p.sets,
        reps: p.reps,
        // форма показує хвилини: 40 секунд — це 0.7 хв, а не 0.6666666666666666
        duration: p.seconds ? Math.round(p.seconds / 6) / 10 : undefined,
        supersetId: e.supersetId,
        notes: block.note,
      });
    }
  }
  return out;
}

/** Основні вправи двох останніх тренувань цього формату — щоб не повторюватись (F5.3). */
export function recentMainIds(
  workouts: WorkoutEntry[],
  format: BuilderFormat,
  resolve: (log: { name: string; exerciseId?: string }) => string | null,
  limit = 2
): string[] {
  const type = format === 'crossfit' ? 'crossfit' : 'strength';
  const ids: string[] = [];
  for (const w of [...workouts].sort((a, b) => b.date.localeCompare(a.date))) {
    if (w.workoutType !== type) continue;
    for (const e of (w.exercises ?? []).slice(0, 3)) {
      const id = resolve(e);
      if (id) ids.push(id);
    }
    if (--limit <= 0) break;
  }
  return ids;
}

// ─── Збереження чернетки (ТЗ F5.7) ───────────────────────────────────────────
//
// Зберігаємо id вправ, а не самі об'єкти: бібліотека з версіями змінюється, а
// id лишаються. Вправу, якої більше немає, просто пропускаємо при відновленні.

export interface StoredDraft {
  workoutType: WorkoutDraft['workoutType'];
  format: BuilderFormat;
  focus?: Focus;
  durationMin: number;
  seed: number;
  attempt: number;
  blocks: {
    role: BlockRole;
    title: string;
    note?: string;
    minutes?: number;
    emptyReason?: string;
    exercises: { id: string; prescription: Prescription; supersetId?: string }[];
  }[];
}

export function draftToStored(draft: WorkoutDraft, seed: number, attempt: number): StoredDraft {
  return {
    workoutType: draft.workoutType,
    format: draft.format,
    focus: draft.focus,
    durationMin: draft.durationMin,
    seed,
    attempt,
    blocks: draft.blocks.map((b) => ({
      role: b.role,
      title: b.title,
      note: b.note,
      minutes: b.minutes,
      emptyReason: b.emptyReason,
      exercises: b.exercises.map((e) => ({
        id: e.exercise.id,
        prescription: e.prescription,
        supersetId: e.supersetId,
      })),
    })),
  };
}

export function draftFromStored(stored: StoredDraft): WorkoutDraft {
  const blocks: BuilderBlock[] = stored.blocks.map((b) => ({
    role: b.role,
    title: b.title,
    note: b.note,
    minutes: b.minutes,
    emptyReason: b.emptyReason,
    exercises: b.exercises.flatMap((e): BuilderExercise[] => {
      const exercise = getExercise(e.id);
      return exercise ? [{ exercise, prescription: e.prescription, supersetId: e.supersetId }] : [];
    }),
  }));
  return {
    workoutType: stored.workoutType,
    format: stored.format,
    focus: stored.focus,
    durationMin: stored.durationMin,
    blocks,
    estimatedMinutes: estimateMinutes(blocks),
  };
}

/**
 * Заміна вправи в чернетці (ТЗ F4.5 у контексті конструктора).
 *
 * Коли намір вправи той самий — лишаємо схему, яку користувач уже бачив.
 * Коли інший — беремо схему нової вправи ЦІЛКОМ: інакше присіданням із
 * власною вагою дістається двохвилинний відпочинок від жиму ногами.
 */
export function replaceInDraft(
  draft: WorkoutDraft,
  blockIdx: number,
  exIdx: number,
  next: LibraryExercise,
  focus: Focus = 'hypertrophy'
): WorkoutDraft {
  const block = draft.blocks[blockIdx];
  const current = block?.exercises[exIdx];
  if (!current) return draft;

  const role = block.role === 'strength' ? 'main' : 'accessory';
  const prescription = needsNewScheme(current.exercise, next)
    ? prescribe(next, focus, role)
    : current.prescription;

  const blocks = draft.blocks.map((b, i) => (i !== blockIdx ? b : {
    ...b,
    exercises: b.exercises.map((e, j) => (
      j !== exIdx ? e : { ...e, exercise: next, prescription }
    )),
  }));
  return { ...draft, blocks, estimatedMinutes: estimateMinutes(blocks) };
}
