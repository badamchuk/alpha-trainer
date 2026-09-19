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
import { allExercises, exerciseName, getExercise, isAvailable, modificationsOf } from './library';
import { convertCardio, needsNewScheme, prescribe } from './prescriptions';
import { ExerciseLog } from '../types';
import type { TFn } from './i18n';

export type SubstitutionBlock = 'easier' | 'variation';

/**
 * Чому варіант тут — КОДОМ, а не готовим рядком.
 *
 * Текст збирає інтерфейс: сервіс не має знати, якою мовою його читатимуть.
 * `reason` лишається українським рядком для сумісності зі старими екранами.
 */
export type ReasonCode =
  | { kind: 'same_with_equipment'; equipment: Equipment }
  | { kind: 'same_bodyweight' }
  | { kind: 'same_family' }
  | { kind: 'easier_bodyweight' }
  | { kind: 'easier_same_muscles' }
  | { kind: 'same_pattern_equipment'; equipment: Equipment }
  | { kind: 'same_pattern' }
  | { kind: 'similar_load' }
  | { kind: 'spares_zone'; zone: JointZone };

export type CautionCode = { kind: 'moderate_zone'; zone: JointZone };

export interface SubstitutionOption {
  exercise: LibraryExercise;
  block: SubstitutionBlock;
  /** Чому цей варіант тут — кодом; фразу збирає інтерфейс потрібною мовою. */
  reasonCode: ReasonCode;
  /** Помірне навантаження на зону, яку просили берегти (stress = 2). */
  cautionCode?: CautionCode;
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
  /** Чесне пояснення, коли пусто (F4.7) — кодом. */
  emptyReason?: SubsEmptyCode;
}

/** Чому не знайшлося жодної заміни (F4.7). */
export type SubsEmptyCode =
  | { kind: 'bodyweightOnly' }
  | { kind: 'zonesTooTight' }
  | { kind: 'nothingSimilar' };

const SUBS_EMPTY_KEY: Record<SubsEmptyCode['kind'], string> = {
  bodyweightOnly: 'subsEmptyBodyweight',
  zonesTooTight: 'subsEmptyZones',
  nothingSimilar: 'subsEmptyNothing',
};

export function subsEmptyText(code: SubsEmptyCode, t: TFn): string {
  return t(SUBS_EMPTY_KEY[code.kind]);
}

/** Ключі i18n для зон — назва зони входить у фразу «не навантажує …». */
export const ZONE_KEY: Record<JointZone, string> = {
  shoulder: 'zoneShoulder',
  lower_back: 'zoneLowerBack',
  spine_flexion: 'zoneSpineFlexion',
  spine_extension: 'zoneSpineExtension',
  knee: 'zoneKnee',
  wrist: 'zoneWrist',
  elbow: 'zoneElbow',
  impact: 'zoneImpact',
};

/**
 * Снаряди, які варто називати в підказці заміни.
 *
 * Сказати «те саме, але з гантелями» корисно; «те саме, але з млинцем» —
 * ні, тому такі снаряди в підказку не потрапляють.
 */
const NAMED_EQUIPMENT: Equipment[] = [
  'barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'band', 'smith',
  'rings', 'pullup_bar', 'dip_bars', 'trap_bar', 'ez_bar', 'box', 'bench',
  'medicine_ball',
];

const named = (e: Equipment | undefined): boolean => !!e && NAMED_EQUIPMENT.includes(e);

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

function explainCode(from: LibraryExercise, to: LibraryExercise, easier: boolean): ReasonCode {
  const lostEquipment = from.equipment.filter((e) => !to.equipment.includes(e));
  const gainedEquipment = to.equipment.filter((e) => !from.equipment.includes(e));
  // «Те саме, але…» можна казати лише про справжню варіацію того самого руху.
  // Гіперекстензія — не «станова в тренажері», хоч і споріднений патерн.
  const sameMovement = from.family === to.family;

  if (sameMovement && named(gainedEquipment[0])) {
    return { kind: 'same_with_equipment', equipment: gainedEquipment[0] };
  }
  if (sameMovement && to.equipment.length === 0 && lostEquipment.length > 0) {
    return { kind: 'same_bodyweight' };
  }
  if (sameMovement) return { kind: 'same_family' };
  if (easier && to.level < from.level) {
    return to.equipment.length === 0 && lostEquipment.length > 0
      ? { kind: 'easier_bodyweight' }
      : { kind: 'easier_same_muscles' };
  }
  if (to.pattern === from.pattern) {
    return named(gainedEquipment[0])
      ? { kind: 'same_pattern_equipment', equipment: gainedEquipment[0] }
      : { kind: 'same_pattern' };
  }
  return { kind: 'similar_load' };
}

/** Причина словами — збирає екран, бо тільки він знає мову інтерфейсу. */
export function reasonText(code: ReasonCode, t: TFn): string {
  switch (code.kind) {
    case 'same_with_equipment': return t('reasonSameWith', t(`equip_${code.equipment}`));
    case 'same_bodyweight': return t('reasonSameBodyweight');
    case 'same_family': return t('reasonSameFamily');
    case 'easier_bodyweight': return t('reasonEasierBodyweight');
    case 'easier_same_muscles': return t('reasonEasierSameMuscles');
    case 'same_pattern_equipment': return t('reasonSamePatternWith', t(`equip_${code.equipment}`));
    case 'same_pattern': return t('reasonSamePattern');
    case 'spares_zone': return t('reasonSparesZone', t(ZONE_KEY[code.zone]));
    default: return t('reasonSimilarLoad');
  }
}

export function cautionText(code: CautionCode, t: TFn): string {
  return t('cautionModerateZone', t(ZONE_KEY[code.zone]));
}

function protectionCode(
  ex: LibraryExercise, from: LibraryExercise, zones: JointZone[]
): ReasonCode | undefined {
  for (const z of zones) {
    const before = from.stress?.[z] ?? 0;
    const now = ex.stress?.[z] ?? 0;
    if (before >= 2 && now === 0) return { kind: 'spares_zone', zone: z };
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

    const reasonCode = protectionCode(ex, from, protectZones)
      ?? explainCode(from, ex, block === 'easier');
    const cautionCode: CautionCode | undefined = stress === 2 && zone
      ? { kind: 'moderate_zone', zone }
      : undefined;
    return {
      exercise: ex,
      block,
      reasonCode,
      cautionCode,
      score,
    };
  });

  const byScore = (a: SubstitutionOption, b: SubstitutionOption) =>
    b.score - a.score || a.exercise.id.localeCompare(b.exercise.id);

  const easier = options.filter((o) => o.block === 'easier').sort(byScore).slice(0, maxEasier);
  const variations = options.filter((o) => o.block === 'variation').sort(byScore).slice(0, maxVariations);

  let emptyReason: SubsEmptyCode | undefined;
  if (easier.length === 0 && variations.length === 0) {
    emptyReason = availableEquipment && availableEquipment.length === 0
      ? { kind: 'bodyweightOnly' }
      : protectZones.length > 0
        ? { kind: 'zonesTooTight' }
        : { kind: 'nothingSimilar' };
  }

  return {
    modifications: modificationsOf(from),
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
