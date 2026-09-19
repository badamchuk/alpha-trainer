import { ExerciseLog, UserProfile, WorkoutEntry } from '../types';
import { EXERCISES, Exercise, MuscleGroup } from './exercises';
import { classifyExercise } from './analytics';
import { getExercise } from './library';
import type { ExerciseResolver } from './exerciseMatch';
import { getAgeFromProfile } from './nutrition';
import { TFn, translate } from './i18n';

// Оцінка витрат калорій по вправах з урахуванням параметрів користувача.
//
// Основа — MET (Compendium of Physical Activities). Годинна витрата:
//   (MET − 1) × вага       — ціна самого руху, пропорційна масі тіла
//   + базовий обмін / 24   — спокій, Mifflin-St Jeor (вага, зріст, вік, стать)
// Коли базовий обмін дорівнює 1 ккал/кг/год, це збігається з класичним
// «MET × вага × години». Та сама структура, що в метаболічних формулах ACSM.
//
// Для кардіо з темпом або ватами MET рахується з них, а не з таблиці —
// інакше біг 12 км/год і підтюпцем 7 км/год давали б однакову цифру.
//
// Час, дистанція й ккал у вправі — НА ПІДХІД, як їх вписують у форму:
// «Планка 3 підх. 1 хв» = 3 хв, «Гребля 6 підх. 16 ккал» = 96 ккал
// (кросфіт-інтервали на тренажерах). Без підходів — це вся вправа.

export interface BodyParams {
  weightKg: number;
  heightCm?: number;
  age?: number;
  gender?: 'male' | 'female';
}

export interface ExerciseCalories {
  /** На всі підходи вправи */
  kcal: number;
  /** false — значення вписав сам користувач */
  estimated: boolean;
}

export interface WorkoutCalories {
  total: number;
  /** false — загальну цифру вписано вручну (наприклад, з годинника) */
  estimated: boolean;
  /** За індексом вправи у workout.exercises */
  perExercise: ExerciseCalories[];
}

type WorkoutLike = Pick<
  WorkoutEntry,
  'workoutType' | 'duration' | 'exercises' | 'totalDistance' | 'totalCalories'
>;

// ─── Параметри тіла ──────────────────────────────────────────────────────────

/** Замір ваги, давніший за це, вважаємо застарілим і беремо вагу з профілю. */
const WEIGHT_STALE_DAYS = 60;

/**
 * Вага на дату тренування: останній замір не пізніше цієї дати.
 * Профіль сам не оновлюється, коли вагу записують у прогресі, тому замір
 * зазвичай свіжіший — але тільки якщо він не надто старий.
 */
export function weightOnDate(
  log: { date: string; weight: number }[],
  date: string,
): number | undefined {
  let best: { date: string; weight: number } | undefined;
  for (const e of log) {
    if (e.date <= date && e.weight > 0 && (!best || e.date > best.date)) best = e;
  }
  if (!best) return undefined;
  const days = (Date.parse(`${date}T12:00:00`) - Date.parse(`${best.date}T12:00:00`)) / 86_400_000;
  return days <= WEIGHT_STALE_DAYS ? best.weight : undefined;
}

export function bodyParamsFor(
  profile: UserProfile | null,
  weightLog: { date: string; weight: number }[],
  date: string,
): BodyParams | null {
  const weightKg = weightOnDate(weightLog, date) ?? profile?.weight;
  if (!weightKg || weightKg <= 0) return null;
  const age = profile ? getAgeFromProfile(profile) : undefined;
  return {
    weightKg,
    heightCm: profile?.height && profile.height > 0 ? profile.height : undefined,
    age: age && isFinite(age) && age > 0 ? age : undefined,
    gender: profile?.gender,
  };
}

/** «80 кг · 180 см · 34 р.» — щоб було видно, з чого рахувалось. */
export function paramsLabel(p: BodyParams, t: TFn = translate): string {
  const kg = Math.round(p.weightKg * 10) / 10;
  if (p.heightCm && p.age) return t('bodyParamsLabel', kg, p.heightCm, p.age);
  if (p.heightCm) return t('bodyParamsNoAge', kg, p.heightCm);
  return t('bodyParamsWeightOnly', kg);
}

/** Базовий обмін, ккал/год. Без зросту чи віку — 1 ккал/кг/год (класичний 1 MET). */
export function restingKcalPerHour(p: BodyParams): number {
  if (p.heightCm && p.age) {
    const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.gender === 'female' ? -161 : 5);
    if (bmr > 0) return bmr / 24;
  }
  return p.weightKg;
}

function kcalPerHour(met: number, p: BodyParams): number {
  return Math.max(0, met - 1) * p.weightKg + restingKcalPerHour(p);
}

// ─── Вид вправи → MET ────────────────────────────────────────────────────────

export type ExerciseKind =
  | 'heavy' | 'strength' | 'isolation' | 'core' | 'explosive' | 'carry'
  | 'run' | 'walk' | 'bike' | 'row' | 'swim' | 'rope' | 'elliptical' | 'stairs' | 'sprint' | 'cardio'
  | 'yoga' | 'stretch';

// Compendium 2024: силові — від 3.5 (багато вправ, 8–15 повторів) до 6.0
// (важкий пауерліфтинг), колові з мінімальним відпочинком — 8.0. Для
// кардіо — «помірний» темп, коли реальних темпу чи ват немає.
const MET_BY_KIND: Record<ExerciseKind, number> = {
  heavy: 5.5,
  strength: 4.5,
  isolation: 3.5,
  core: 3.8,
  explosive: 9.0,   // берпі, трастери, махи гирею — сам робочий відрізок
  carry: 6.5,
  run: 9.0,
  walk: 3.5,
  bike: 6.8,
  row: 7.0,
  swim: 7.0,
  rope: 11.8,       // ~120 стрибків за хвилину
  elliptical: 5.0,
  stairs: 9.0,
  sprint: 8.0,
  cardio: 6.0,
  yoga: 2.5,
  stretch: 2.3,
};

/** Для тренування без жодної вправи. */
const MET_BY_WORKOUT_TYPE: Record<string, number> = {
  strength: 4.5, crossfit: 8.0, hiit: 8.0, cardio: 6.5, run: 9.0,
  cycling: 6.8, swimming: 7.0, yoga: 2.5, recovery: 2.3, custom: 4.5,
};

/** Невідома назва в кардіо-тренуванні — найімовірніше, це воно й є. */
const KIND_BY_WORKOUT_TYPE: Record<string, ExerciseKind> = {
  run: 'run', cycling: 'bike', swimming: 'swim', cardio: 'cardio',
  hiit: 'explosive', crossfit: 'explosive', yoga: 'yoga', recovery: 'stretch',
};

/** Кардіо й розтяжка: MET описує саму активність, без пауз. */
const CONTINUOUS = new Set<ExerciseKind>([
  'run', 'walk', 'bike', 'row', 'swim', 'rope', 'elliptical', 'stairs', 'sprint', 'cardio',
  'yoga', 'stretch',
]);

/**
 * Записані підходами без часу («Скакалка 8×40», «Трастери 4×4») рахуються
 * як короткі робочі відрізки на своєму MET плюс відпочинок на легкому.
 * Табличний MET на весь час разом з паузами дав би скакалці годину стрибків.
 */
function isInterval(kind: ExerciseKind): boolean {
  return kind === 'explosive' || (CONTINUOUS.has(kind) && kind !== 'yoga' && kind !== 'stretch');
}

// Кардіо в бібліотеці різне за інтенсивністю — розрізняємо за id
const LIBRARY_KIND: Record<string, ExerciseKind> = {
  car_01: 'run', car_02: 'run', car_03: 'bike', car_04: 'bike', car_05: 'row',
  car_06: 'rope', car_07: 'swim', car_08: 'elliptical', car_09: 'stairs',
  car_10: 'walk', car_11: 'sprint', ful_03: 'carry', ful_11: 'carry', ful_12: 'explosive',
};

const LIBRARY = new Map<string, Exercise>();
for (const ex of EXERCISES) {
  LIBRARY.set(ex.nameUk.toLowerCase().trim(), ex);
  LIBRARY.set(ex.nameEn.toLowerCase().trim(), ex);
}

// JS-овий \b після кирилиці не працює, тому межі слова — лише в англійських
const HEAVY_RE = /присід|squat|станов|deadlift|жим ногами|leg press|випад|lunge|hip thrust|тяга стегном|румунськ|\brdl\b|good morning|доброго ранку|болгарськ|гак-присід|hack squat|тяга з рамки|rack pull/;
const EXPLOSIVE_RE = /берпі|бурпі|борпі|burpee|девіл|devil|kettlebell|гир[яіею]|swing|thruster|траст|\bclean\b|snatch|jerk|ривок|поштовх|box jump|стрибк|стрибок|jumping jack|скелелаз|mountain climber|battle rope|канати|wall ball/;
const BIKE_RE = /велосипед|велотренаж|вело|\bbike|байк|cycling|\bspin/;

function kindFromGroup(mg: MuscleGroup | null, n: string): ExerciseKind | null {
  switch (mg) {
    case 'core': return 'core';
    case 'biceps': case 'triceps': case 'calves': return 'isolation';
    case 'shoulders': return /жим|press|ohp|push/.test(n) ? 'strength' : 'isolation';
    case 'legs': case 'hamstrings': case 'glutes': case 'back':
      return HEAVY_RE.test(n) ? 'heavy' : 'strength';
    case 'chest': return 'strength';
    case 'cardio': return 'cardio';
    case 'fullbody': return /фермер|farmer|сан[іей]|sled/.test(n) ? 'carry' : 'explosive';
    default: return null;
  }
}

/**
 * `timed` — у вправі є час, дистанція чи вати. «Велосипед» у бібліотеці —
 * скручування на прес, але прес записують повторами; з хвилинами це байк.
 */
export function exerciseKind(name: string, workoutType?: string, timed = false): ExerciseKind {
  const n = name.toLowerCase().trim();

  if ((timed || workoutType === 'cycling') && BIKE_RE.test(n)) return 'bike';

  const lib = LIBRARY.get(n);
  if (lib) return LIBRARY_KIND[lib.id] ?? kindFromGroup(lib.muscleGroup, n) ?? 'strength';

  // Порядок важливий: «скручування велосипед» — прес, «walking lunge» — випади,
  // «прогулянка фермера» — перенесення ваги, а не ходьба
  if (/скручуван|crunch|планк|plank|стільчик|wall sit/.test(n)) return 'core';
  if (HEAVY_RE.test(n)) return 'heavy';
  if (/скакалк|jump rope|skipping/.test(n)) return 'rope';
  if (/спринт|sprint|інтервал|човников|shuttle/.test(n)) return 'sprint';
  if (/фермер|farmer|\bcarry|сані|sled/.test(n)) return 'carry';
  // «Концепт» — гребний Concept2, «лижі» — його ж SkiErg: близькі за витратами
  if (/гребл|гребн|rowing|ергометр|\berg\b|концепт|concept|лиж|\bski/.test(n)) return 'row';
  if (/плаван|swim|басейн|кроль|брас/.test(n)) return 'swim';
  if (/еліпс|elliptical|орбітрек/.test(n)) return 'elliptical';
  if (/сходов|stair|степпер|stepper/.test(n)) return 'stairs';
  if (BIKE_RE.test(n) && !/скручуван|прес/.test(n)) return 'bike';
  if (/біг|\brun|\bjog|пробіжк/.test(n)) return 'run';
  if (/кардіо|cardio/.test(n)) return 'cardio';
  if (/ходьб|\bwalk|прогулянк|кроки/.test(n)) return 'walk';
  if (/йог|yoga|пілатес|pilates/.test(n)) return 'yoga';
  if (/розтяжк|stretch|мобільн|mobility/.test(n)) return 'stretch';
  if (EXPLOSIVE_RE.test(n)) return 'explosive';

  return kindFromGroup(classifyExercise(n), n)
    ?? (workoutType ? KIND_BY_WORKOUT_TYPE[workoutType] : undefined)
    ?? 'strength';
}

// Формули ACSM: VO2 (мл/кг/хв) = спокій 3.5 + ціна руху; MET = VO2 / 3.5
function runWalkMet(kmh: number): number {
  const v = (Math.min(Math.max(kmh, 2), 25) * 1000) / 60; // м/хв
  return (kmh < 7 ? 3.5 + 0.1 * v : 3.5 + 0.2 * v) / 3.5;
}

function cyclingSpeedMet(kmh: number): number {
  if (kmh < 16) return 4.0;
  if (kmh < 19) return 6.8;
  if (kmh < 22.5) return 8.0;
  if (kmh < 25.5) return 10.0;
  if (kmh < 30.5) return 12.0;
  return 15.8;
}

function swimSpeedMet(kmh: number): number {
  if (kmh >= 3) return 9.8;   // швидше за 2:00 на 100 м
  if (kmh >= 2.4) return 8.3;
  if (kmh >= 1.8) return 5.8;
  return 4.8;
}

/** Вати → MET. Велоергометр — формула ACSM (1.8 мл O2 на кгм); гребля має нижчий ККД. */
function powerMet(watts: number, kg: number, kind: 'bike' | 'row'): number {
  const perWatt = kind === 'row' ? 12 : 11;
  return (7 + (perWatt * watts) / kg) / 3.5;
}

/** Корекція табличного MET на те, як насправді йшло. */
function intensity(ex: ExerciseLog): number {
  let f = 1;
  if (ex.rpe) f *= ex.rpe >= 9 ? 1.2 : ex.rpe >= 8 ? 1.1 : ex.rpe <= 5 ? 0.85 : 1;
  if (ex.setType === 'warmup') f *= 0.7;
  else if (ex.setType === 'dropset' || ex.setType === 'failure') f *= 1.1;
  return f;
}

function exerciseMet(ex: ExerciseLog, kind: ExerciseKind, p: BodyParams, inSuperset: boolean): number {
  const kmh = ex.distance && ex.duration ? ex.distance / (ex.duration / 60) : 0;
  let met: number | null = null;
  if ((kind === 'bike' || kind === 'row') && ex.watts) met = powerMet(ex.watts, p.weightKg, kind);
  else if (kmh > 0 && (kind === 'run' || kind === 'walk')) met = runWalkMet(kmh);
  else if (kmh > 0 && kind === 'bike') met = cyclingSpeedMet(kmh);
  else if (kmh > 0 && kind === 'swim') met = swimSpeedMet(kmh);

  if (met === null) {
    // Табличне значення — уточнюємо за RPE/типом підходу; суперсет щільніший
    met = MET_BY_KIND[kind] * intensity(ex) * (inSuperset && !CONTINUOUS.has(kind) ? 1.1 : 1);
  }
  return Math.min(Math.max(met, 1.5), 20);
}

// ─── Час на вправу ───────────────────────────────────────────────────────────

const SEC_PER_REP = 3.5;
/** Скакалка: ~120 стрибків за хвилину */
const SEC_PER_SKIP = 0.5;
const REST_SEC = 90;
/** Кардіо-підхід без жодних цифр («Гребля, 3 підх.») — типовий кросфіт-інтервал */
const INTERVAL_WORK_SEC = 90;
/** Типовий темп, коли є лише дистанція, хв/км */
const MIN_PER_KM: Partial<Record<ExerciseKind, number>> = {
  run: 6, walk: 12, bike: 3, row: 5, swim: 25, elliptical: 6, stairs: 10, sprint: 5,
};
/** Скільки разів довше за розрахунок силова вправа може тривати на повній інтенсивності */
const SLACK = 1.5;
/** Відпочинок між підходами, перехід між снарядами */
const IDLE_MET = 2.0;

interface ExercisePlan {
  kind: ExerciseKind;
  met: number;
  /** Ккал, вписані вручну, — на всі підходи */
  manualKcal?: number;
  /** Час із записаного (тривалість, дистанція, ккал) — не підганяється */
  fixedMin: number;
  /** Розрахунковий час разом з відпочинком — підганяється під тривалість тренування */
  estMin: number;
  /** Робоча частина estMin; у інтервальних решта — відпочинок */
  workMin: number;
}

/**
 * Тип навантаження для запису. Впізнану вправу питаємо в бібліотеки (ТЗ F7.4):
 * там `metKind` проставлений вручну, тож жим вузьким хватом — це прес, а не
 * ізоляція, а жим ногами — не те саме, що важка станова. Невпізнану розбираємо
 * по назві, як раніше.
 */
function kindOf(ex: ExerciseLog, workoutType: string, resolver?: ExerciseResolver): ExerciseKind {
  const timed = !!(ex.duration || ex.distance || ex.watts);
  const id = resolver ? resolver(ex) : null;
  const lib = id ? getExercise(id) : undefined;
  return lib ? lib.metKind : exerciseKind(ex.name, workoutType, timed);
}

function planExercise(
  ex: ExerciseLog, workoutType: string, groupSize: number, p: BodyParams,
  resolver?: ExerciseResolver
): ExercisePlan {
  const detail = ex.setsDetail && ex.setsDetail.length > 0 ? ex.setsDetail : null;
  // Значення в полях — на підхід; без підходів — на всю вправу
  const perSet = detail ? detail.length : ex.sets && ex.sets > 0 ? ex.sets : 1;
  const kind = kindOf(ex, workoutType, resolver);
  const met = exerciseMet(ex, kind, p, groupSize > 1);
  const manualKcal = ex.calories && ex.calories > 0 ? ex.calories * perSet : undefined;
  const plan: ExercisePlan = { kind, met, manualKcal, fixedMin: 0, estMin: 0, workMin: 0 };

  if (ex.duration && ex.duration > 0) return { ...plan, fixedMin: ex.duration * perSet };
  if (ex.distance && ex.distance > 0 && CONTINUOUS.has(kind)) {
    return { ...plan, fixedMin: ex.distance * perSet * (MIN_PER_KM[kind] ?? 6) };
  }
  if (manualKcal) return { ...plan, fixedMin: (manualKcal / kcalPerHour(met, p)) * 60 };

  // Лише назва кардіо — вважаємо одним суцільним заходом
  if (CONTINUOUS.has(kind) && !detail && !ex.sets && !ex.reps) {
    return { ...plan, estMin: 10, workMin: 10 };
  }

  const sets = detail ? detail.length : ex.sets || 3;
  const reps = detail
    ? detail.reduce((s, d) => s + (d.reps || 0), 0) / detail.length || undefined
    : ex.reps;
  // У суперсеті відпочинок один на всю групу, а не після кожної вправи
  const restMin = (sets * REST_SEC) / Math.max(1, groupSize) / 60;

  let workSec: number;
  if (kind === 'rope') workSec = Math.max((reps ?? 120) * SEC_PER_SKIP, 10);
  else if (isInterval(kind) && kind !== 'explosive') workSec = reps ? Math.max(reps * 3, 10) : INTERVAL_WORK_SEC;
  else workSec = Math.min(Math.max((reps ?? 10) * SEC_PER_REP, 20), 75);

  const workMin = (sets * workSec) / 60;
  return { ...plan, estMin: workMin + restMin, workMin };
}

function supersetSizes(exercises: ExerciseLog[]): number[] {
  const counts = new Map<string, number>();
  for (const e of exercises) {
    if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) ?? 0) + 1);
  }
  return exercises.map((e) => (e.supersetId ? counts.get(e.supersetId) ?? 1 : 1));
}

// ─── Тренування ──────────────────────────────────────────────────────────────

/**
 * Калорії по кожній вправі і за тренування.
 *
 * Тривалість тренування — єдиний реальний вимір часу, тому вона
 * розподіляється між вправами пропорційно їхньому розрахунковому часу.
 * Силова вправа, яка «розтягнулась» понад розрахунок більш ніж у півтора
 * раза, решту часу рахує як легку активність — інакше три підходи жиму
 * в годинному тренуванні виглядали б як година безперервної роботи.
 */
export function estimateWorkoutCalories(
  w: WorkoutLike, p: BodyParams, resolver?: ExerciseResolver
): WorkoutCalories {
  const exercises = w.exercises ?? [];

  if (exercises.length === 0) {
    const total = w.totalCalories && w.totalCalories > 0
      ? w.totalCalories
      : w.duration > 0 ? (kcalPerHour(workoutLevelMet(w), p) * w.duration) / 60 : 0;
    return { total, estimated: !(w.totalCalories && w.totalCalories > 0), perExercise: [] };
  }

  const sizes = supersetSizes(exercises);
  const plans = exercises.map((e, i) => planExercise(e, w.workoutType, sizes[i], p, resolver));

  const fixedSum = plans.reduce((s, x) => s + x.fixedMin, 0);
  const estSum = plans.reduce((s, x) => s + x.estMin, 0);
  const factor = w.duration > 0 && estSum > 0
    ? Math.max(0.5, (w.duration - fixedSum) / estSum)
    : 1;
  const idle = kcalPerHour(IDLE_MET, p);

  let perExercise: ExerciseCalories[] = plans.map((x) => {
    if (x.manualKcal) return { kcal: x.manualKcal, estimated: false };
    const kph = kcalPerHour(x.met, p);
    if (x.fixedMin > 0) return { kcal: (kph * x.fixedMin) / 60, estimated: true };

    const minutes = x.estMin * factor;
    if (isInterval(x.kind) && x.workMin < x.estMin) {
      // робота — скільки записано, решта відведеного часу — відпочинок
      const work = Math.min(x.workMin, minutes);
      return { kcal: (kph * work + idle * (minutes - work)) / 60, estimated: true };
    }
    if (!CONTINUOUS.has(x.kind) && factor > SLACK) {
      const active = x.estMin * SLACK;
      return { kcal: (kph * active + idle * (minutes - active)) / 60, estimated: true };
    }
    return { kcal: (kph * minutes) / 60, estimated: true };
  });

  const manualSum = perExercise.reduce((s, x) => s + (x.estimated ? 0 : x.kcal), 0);
  const estimatedSum = perExercise.reduce((s, x) => s + (x.estimated ? x.kcal : 0), 0);

  if (w.totalCalories && w.totalCalories > 0) {
    // Цифра з годинника точніша за будь-яку оцінку — розкладаємо її по
    // вправах у тих самих пропорціях
    const rest = w.totalCalories - manualSum;
    if (rest > 0 && estimatedSum > 0) {
      const k = rest / estimatedSum;
      perExercise = perExercise.map((x) => (x.estimated ? { ...x, kcal: x.kcal * k } : x));
    }
    return { total: w.totalCalories, estimated: false, perExercise };
  }

  return {
    total: manualSum + estimatedSum,
    estimated: estimatedSum > 0,
    perExercise,
  };
}

function workoutLevelMet(w: WorkoutLike): number {
  if (w.totalDistance && w.duration > 0) {
    const kmh = w.totalDistance / (w.duration / 60);
    if (w.workoutType === 'run') return runWalkMet(kmh);
    if (w.workoutType === 'cycling') return cyclingSpeedMet(kmh);
    if (w.workoutType === 'swimming') return swimSpeedMet(kmh);
  }
  return MET_BY_WORKOUT_TYPE[w.workoutType] ?? 4.5;
}

/** Точність до одиниць в оцінці вигадана — округлюємо чесно. */
export function roundKcal(n: number): number {
  if (n <= 0) return 0;
  if (n < 20) return Math.max(1, Math.round(n));
  if (n < 200) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}
