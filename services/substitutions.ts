// Підбір заміни вправи (ТЗ F4).
//
// Головна вимога користувача: список на заміну — не «що попало», а або простіша
// вправа, або інша варіація того самого руху. Тому кандидат мусить бути
// спорідненим (явний зв'язок «простіша за», те саме сімейство або той самий
// патерн), а не просто «теж на груди».
//
// Модуль чистий: ніякого сховища й UI, лише бібліотека. Через це його легко
// перевірити тестами на реальних вправах.

import {
  Equipment, JointZone, LibraryExercise, MovementPattern, Muscle,
} from './library/types';
import { allExercises, exerciseName, getExercise, isAvailable } from './library';
import { convertCardio, needsNewScheme, prescribe } from './prescriptions';
import { ExerciseLog } from '../types';

export type SubstitutionBlock = 'easier' | 'variation';

export interface SubstitutionOption {
  exercise: LibraryExercise;
  block: SubstitutionBlock;
  /** Чому цей варіант тут — показується під назвою. */
  reason: string;
  /** Помірне навантаження на зону, яку просили берегти (stress = 2). */
  caution?: string;
  score: number;
}

export interface SubstitutionRequest {
  /** Що замінюємо. */
  exercise: LibraryExercise;
  /** Доступне обладнання (профіль мінус «немає сьогодні»); undefined — не фільтрувати. */
  availableEquipment?: Equipment[];
  /** Зони, які треба берегти: постійні з профілю + вибрані на цю сесію. */
  protectZones?: JointZone[];
  /** Скільки разів користувач робив кожну вправу — «знайомість» у сортуванні. */
  familiarity?: Map<string, number>;
  maxEasier?: number;
  maxVariations?: number;
}

export interface SubstitutionResult {
  /** «Те саме, але…» — з поля modifications самої вправи. */
  modifications: string[];
  easier: SubstitutionOption[];
  variations: SubstitutionOption[];
  /** Чесне пояснення, коли пусто (F4.7). */
  emptyReason?: string;
}

const ZONE_LABEL: Record<JointZone, string> = {
  shoulder: 'плече',
  lower_back: 'поперек',
  spine_flexion: 'згинання спини',
  spine_extension: 'розгинання спини',
  knee: 'коліно',
  wrist: 'зап’ястя',
  elbow: 'лікоть',
  impact: 'ударне навантаження',
};

const EQUIPMENT_LABEL: Partial<Record<Equipment, string>> = {
  barbell: 'зі штангою', dumbbell: 'з гантелями', kettlebell: 'з гирею',
  machine: 'у тренажері', cable: 'на блоці', band: 'з резинкою',
  smith: 'у Сміті', rings: 'на кільцях', pullup_bar: 'на перекладині',
  dip_bars: 'на брусах', trap_bar: 'з трап-грифом', ez_bar: 'з EZ-грифом',
  box: 'з тумбою', bench: 'на лаві', medicine_ball: 'з м’ячем',
};

/** Перетин м'язів за Жаккаром — наскільки схоже навантаження. */
function muscleOverlap(a: LibraryExercise, b: LibraryExercise): number {
  const setA = new Set<Muscle>([...a.muscles.primary, ...(a.muscles.secondary ?? [])]);
  const setB = new Set<Muscle>([...b.muscles.primary, ...(b.muscles.secondary ?? [])]);
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const m of setA) if (setB.has(m)) common++;
  return common / (setA.size + setB.size - common);
}

/** Спорідненість модальності для кардіо: гребний ближчий до лижного, ніж до бігу. */
const MODALITY_KIN: Record<string, string[]> = {
  run: ['treadmill', 'walk', 'stairs'],
  treadmill: ['run', 'walk'],
  row: ['ski', 'bike_erg', 'air_bike'],
  ski: ['row', 'bike_erg'],
  bike_erg: ['air_bike', 'row'],
  air_bike: ['bike_erg', 'row'],
  rope: ['run'],
  walk: ['run', 'stairs'],
  stairs: ['run', 'walk'],
  elliptical: ['bike_erg', 'walk'],
};

function related(a: LibraryExercise, b: LibraryExercise): boolean {
  if (a.id === b.id) return false;
  if (b.easierThan?.includes(a.id)) return true;
  if (a.easierThan?.includes(b.id)) return true;
  if (a.family === b.family) return true;

  // Складені рухи (трастер = присід + жим) споріднені лише з такими ж складеними:
  // інакше в заміну трастера летіли б звичайні присідання.
  const aPatterns = [a.pattern, a.secondaryPattern].filter(Boolean) as MovementPattern[];
  const bPatterns = [b.pattern, b.secondaryPattern].filter(Boolean) as MovementPattern[];
  if (aPatterns.length > 1 || bPatterns.length > 1) {
    return aPatterns.length === bPatterns.length
      && aPatterns.every((p) => bPatterns.includes(p));
  }
  if (a.pattern === b.pattern) {
    // monostructural — це «будь-яке кардіо»: там спорідненість рахуємо за модальністю
    if (a.pattern === 'monostructural') {
      const am = a.cardio?.modality;
      const bm = b.cardio?.modality;
      if (!am || !bm) return false;
      return am === bm || (MODALITY_KIN[am]?.includes(bm) ?? false);
    }
    return true;
  }
  return false;
}

/** Найгірша зона, яку вправа чіпає з тих, що просили берегти. */
function zoneStress(ex: LibraryExercise, zones: JointZone[]): { max: number; zone?: JointZone } {
  let max = 0;
  let worst: JointZone | undefined;
  for (const z of zones) {
    const s = ex.stress?.[z] ?? 0;
    if (s > max) { max = s; worst = z; }
  }
  return { max, zone: worst };
}

function explain(from: LibraryExercise, to: LibraryExercise, easier: boolean): string {
  const lostEquipment = from.equipment.filter((e) => !to.equipment.includes(e));
  const gainedEquipment = to.equipment.filter((e) => !from.equipment.includes(e));
  // «Те саме, але…» можна казати лише про справжню варіацію того самого руху.
  // Гіперекстензія — не «станова в тренажері», хоч і споріднений патерн.
  const sameMovement = from.family === to.family;

  if (sameMovement && gainedEquipment.length > 0 && EQUIPMENT_LABEL[gainedEquipment[0]]) {
    return `те саме, але ${EQUIPMENT_LABEL[gainedEquipment[0]]}`;
  }
  if (sameMovement && to.equipment.length === 0 && lostEquipment.length > 0) {
    return 'те саме, але з власною вагою';
  }
  if (sameMovement) return 'варіація того самого руху';
  if (easier && to.level < from.level) {
    return to.equipment.length === 0 && lostEquipment.length > 0
      ? 'простіший рух із власною вагою'
      : 'простіший рух на ті самі м’язи';
  }
  if (to.pattern === from.pattern) {
    return gainedEquipment.length > 0 && EQUIPMENT_LABEL[gainedEquipment[0]]
      ? `той самий рух ${EQUIPMENT_LABEL[gainedEquipment[0]]}`
      : 'той самий рух іншим способом';
  }
  return 'схоже навантаження';
}

function protectionNote(
  ex: LibraryExercise, from: LibraryExercise, zones: JointZone[]
): string | undefined {
  for (const z of zones) {
    const before = from.stress?.[z] ?? 0;
    const now = ex.stress?.[z] ?? 0;
    if (before >= 2 && now === 0) return `не навантажує ${ZONE_LABEL[z]}`;
  }
  return undefined;
}

export function findSubstitutions(req: SubstitutionRequest): SubstitutionResult {
  const {
    exercise: from, availableEquipment, protectZones = [], familiarity,
    maxEasier = 5, maxVariations = 6,
  } = req;

  const pool = allExercises().filter((ex) => {
    if (ex.id === from.id) return false;
    // власні вправи без «схожа на» нема з чим порівнювати (F4.3 п.6)
    if (ex.custom && !ex.baseId) return false;
    if (availableEquipment && !isAvailable(ex, availableEquipment)) return false;
    if (zoneStress(ex, protectZones).max >= 3) return false;
    return related(from, ex);
  });

  const options: SubstitutionOption[] = pool.map((ex) => {
    const explicitlyEasier = ex.easierThan?.includes(from.id) ?? false;
    const block: SubstitutionBlock = explicitlyEasier || ex.level < from.level
      ? 'easier'
      : 'variation';
    const { max: stress, zone } = zoneStress(ex, protectZones);

    const score =
      (explicitlyEasier ? 1000 : 0)
      + (ex.family === from.family ? 400 : 0)
      + (ex.intent === from.intent ? 200 : 0)
      + Math.round(muscleOverlap(from, ex) * 150)
      - Math.abs(ex.level - from.level) * 40
      + Math.min(60, (familiarity?.get(ex.id) ?? 0) * 6)
      - (stress === 2 ? 120 : 0);

    const reason = protectionNote(ex, from, protectZones) ?? explain(from, ex, block === 'easier');
    return {
      exercise: ex,
      block,
      reason,
      caution: stress === 2 && zone ? `помірно навантажує ${ZONE_LABEL[zone]}` : undefined,
      score,
    };
  });

  const byScore = (a: SubstitutionOption, b: SubstitutionOption) =>
    b.score - a.score || a.exercise.id.localeCompare(b.exercise.id);

  const easier = options.filter((o) => o.block === 'easier').sort(byScore).slice(0, maxEasier);
  const variations = options.filter((o) => o.block === 'variation').sort(byScore).slice(0, maxVariations);

  let emptyReason: string | undefined;
  if (easier.length === 0 && variations.length === 0) {
    emptyReason = availableEquipment && availableEquipment.length === 0
      ? 'Під власну вагу схожої вправи немає. Спробуй прибрати обмеження по обладнанню.'
      : protectZones.length > 0
        ? 'З урахуванням обмежень схожої вправи не знайшли. Прибери одне з обмежень або пропусти вправу сьогодні.'
        : 'Схожої вправи в бібліотеці немає.';
  }

  return {
    modifications: from.modifications ?? [],
    easier,
    variations,
    emptyReason,
  };
}

/** Скільки разів кожну вправу вже робили — для «знайомості» в сортуванні (F4.3 п.5). */
export function familiarityFrom(
  logs: { name: string; exerciseId?: string }[],
  resolve: (log: { name: string; exerciseId?: string }) => string | null
): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of logs) {
    const id = resolve(log);
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Зручний вхід, коли на руках лише id. */
export function substitutionsFor(
  id: string,
  req: Omit<SubstitutionRequest, 'exercise'> = {}
): SubstitutionResult | null {
  const ex = getExercise(id);
  return ex ? findSubstitutions({ ...req, exercise: ex }) : null;
}

// ─── Застосування заміни (ТЗ F4.5–F4.6) ──────────────────────────────────────

/**
 * Новий запис вправи замість старого.
 *
 * Позиція в списку й членство в суперсеті — справа екрана; тут зберігається все
 * інше: схема підходів переноситься, коли намір вправи той самий, і береться
 * заново, коли змінився. Вага від іншого снаряда не переноситься — 100 кг у
 * присіданнях зі штангою нічого не означають для присідань із гирею.
 *
 * `lastWeight` — остання робоча вага для НОВОЇ вправи з історії, якщо вона є.
 */
export function applySubstitution(
  prev: ExerciseLog,
  from: LibraryExercise,
  to: LibraryExercise,
  lastWeight?: number
): ExerciseLog {
  const changeScheme = needsNewScheme(from, to);
  const scheme = changeScheme ? prescribe(to) : null;
  const equipmentChanged = from.equipment.join() !== to.equipment.join();

  const cardio = from.cardio && to.cardio
    ? convertCardio(from, to, {
        distanceKm: prev.distance,
        calories: prev.calories,
        reps: prev.reps,
        minutes: prev.duration,
      })
    : null;

  const next: ExerciseLog = {
    ...prev,
    name: exerciseName(to),
    exerciseId: to.id,
    sets: scheme?.sets ?? prev.sets,
  };

  if (cardio) {
    // кардіо міняє снаряд: перераховуємо роботу ОДНОГО підходу, підходи лишаються
    next.distance = cardio.distanceKm;
    next.calories = cardio.calories;
    next.reps = cardio.reps ?? (cardio.distanceKm || cardio.calories ? undefined : prev.reps);
    next.duration = undefined;
    next.weight = undefined;
    next.setsDetail = undefined;
    return next;
  }

  if (scheme) {
    next.reps = scheme.reps;
    next.duration = scheme.seconds ? scheme.seconds / 60 : undefined;
  }

  if (equipmentChanged) {
    next.weight = lastWeight;
    // повтори лишаються, ваги від іншого снаряда — ні
    next.setsDetail = prev.setsDetail?.map((d) => ({ reps: d.reps }));
  }

  return next;
}
