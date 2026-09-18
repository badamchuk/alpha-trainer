// Типи бібліотеки вправ. Див. docs/02-tz.md §3.1 і додаток A.
//
// Бібліотека — єдине джерело правди про вправу: що це за рух, що працює, чим робиться,
// наскільки складно, на що дає навантаження і як записується. На цих полях стоять
// заміни (services/substitutions.ts), конструктор і аналітика.

export type Level = 1 | 2 | 3;

/** Для чого вправа. Визначає схему підходів і чи рахувати її в гіпертрофічний об'єм. */
export type Intent =
  | 'max_strength'   // важкі підходи на силу
  | 'hypertrophy'    // робота на м'яз
  | 'power'          // вибухові рухи (ривки, взяття, стрибки)
  | 'conditioning'   // кондиція: кардіо, метокон-рухи
  | 'isometric'      // утримання (планка, стільчик)
  | 'mobility';      // розминка, розтяжка

export type MovementPattern =
  | 'squat' | 'hinge' | 'lunge' | 'hip_thrust'
  | 'push_horizontal' | 'push_vertical' | 'pull_horizontal' | 'pull_vertical'
  | 'carry' | 'olympic' | 'jump' | 'burpee'
  | 'core_flexion' | 'core_stability' | 'core_rotation'
  | 'elbow_flexion' | 'elbow_extension' | 'shoulder_raise' | 'rear_delt'
  | 'knee_extension' | 'knee_flexion' | 'calf' | 'hip_abduction' | 'chest_fly' | 'shrug'
  | 'monostructural' | 'mobility';

export type Equipment =
  | 'barbell' | 'dumbbell' | 'kettlebell' | 'ez_bar' | 'trap_bar' | 'plate'
  | 'cable' | 'machine' | 'smith' | 'bench' | 'box' | 'wall'
  | 'pullup_bar' | 'dip_bars' | 'rings' | 'band' | 'ab_wheel' | 'medicine_ball' | 'wall_ball'
  | 'rower' | 'bike' | 'air_bike' | 'ski_erg' | 'treadmill' | 'jump_rope' | 'sled' | 'stick'
  /** Так, це «обладнання»: без басейну плавати ніде, і в зал його не поставиш. */
  | 'pool';

export type Muscle =
  | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'calves'
  | 'chest' | 'lats' | 'upper_back' | 'lower_back' | 'traps'
  | 'front_delts' | 'side_delts' | 'rear_delts' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'hip_flexors' | 'cardio';

/** Як вправа записується. Перша метрика — основна. */
export type Metric = 'weight_reps' | 'reps' | 'time' | 'distance' | 'calories';

/** Зони, які користувач може попросити берегти. */
export type JointZone =
  | 'shoulder' | 'lower_back' | 'spine_flexion' | 'spine_extension'
  | 'knee' | 'wrist' | 'elbow'
  /** Ударне навантаження: стрибки, біг. Іде в парі з коліном, але це окрема причина. */
  | 'impact';

/** 1 — незначне, 2 — помірне (пропонуємо нижче і з позначкою), 3 — сильне (не пропонуємо). */
export type StressLevel = 1 | 2 | 3;

export type CardioModality =
  | 'run' | 'row' | 'ski' | 'bike_erg' | 'air_bike' | 'treadmill'
  | 'rope' | 'swim' | 'stairs' | 'walk' | 'elliptical';

/** Скільки цієї роботи вміщується у 2 хвилини в помірно-важкому темпі (див. ТЗ F4.8). */
export interface CardioUnit {
  modality: CardioModality;
  per2min: { distanceM?: number; calories?: number; reps?: number };
}

/**
 * Вид вправи для оцінки калорій. Значення збігаються з `ExerciseKind` у services/calories.ts —
 * поле задається вручну, а не виводиться з патерну: трастер за патерном «присід», але за
 * витратами — вибуховий рух, і виведення з патерну занизило б калорії майже вдвічі.
 */
export type MetKind =
  | 'heavy' | 'strength' | 'isolation' | 'core' | 'explosive' | 'carry'
  | 'run' | 'walk' | 'bike' | 'row' | 'swim' | 'rope' | 'elliptical' | 'stairs'
  | 'sprint' | 'cardio' | 'yoga' | 'stretch';

export interface LibraryExercise {
  /** Незмінний між версіями: на нього посилаються збережені зв'язки назв. */
  id: string;
  nameUk: string;
  nameEn: string;
  /**
   * Синоніми й типові написання в нормалізованій формі (див. services/exerciseMatch.ts).
   * Назви, які можуть означати різні вправи («присідання», «велосипед»), сюди НЕ додаються —
   * вони перелічені в `AMBIGUOUS_NAMES` реєстру і прив'язуються лише вручну.
   */
  aliases: string[];
  pattern: MovementPattern;
  /** Для складених рухів: трастер = squat + push_vertical. */
  secondaryPattern?: MovementPattern;
  /** Сімейство варіацій одного руху: підтягування з резинкою й строгі — одне сімейство. */
  family: string;
  level: Level;
  intent: Intent;
  metKind: MetKind;
  metrics: Metric[];
  /** Потрібне ВСЕ перелічене; порожній масив — власна вага. */
  equipment: Equipment[];
  muscles: { primary: Muscle[]; secondary?: Muscle[] };
  /**
   * Група для показу й старої аналітики, коли згортка за першим м'язом бреше:
   * бурпі й трастер — це «все тіло», а не груди чи ноги.
   */
  displayGroup?: MuscleGroup;
  stress?: Partial<Record<JointZone, StressLevel>>;
  /** Ця вправа простіша за перелічені — працює і між сімействами (тяга блоку простіша за підтягування). */
  easierThan?: string[];
  /** «Те саме, але…»: інший снаряд, хват чи амплітуда, коли треба щось поберегти. */
  modifications?: string[];
  /** 2–4 короткі підказки техніки. */
  cues: string[];
  defaultReps?: number;
  defaultSeconds?: number;
  cardio?: CardioUnit;
  /** Ключ у мапі ілюстрацій. Сама мапа — у UI-модулі, сервіси її не імпортують. */
  imageSlug?: string;
  /** Вправа, яку додав користувач (ТЗ F2.8), а не частина бібліотеки. */
  custom?: boolean;
  /** Для власної вправи — на кого вона схожа; звідси взяті всі решта полів. */
  baseId?: string;
}

// ─── Групи м'язів (сумісність зі старим кодом) ───────────────────────────────

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'legs' | 'hamstrings' | 'glutes' | 'core' | 'calves'
  | 'cardio' | 'fullbody';

/** Єдине джерело: решта згорток (баланс, об'ємні орієнтири) виводяться з нього. */
export const MUSCLE_TO_GROUP: Record<Muscle, MuscleGroup> = {
  quads: 'legs',
  adductors: 'legs',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  chest: 'chest',
  lats: 'back',
  upper_back: 'back',
  lower_back: 'back',
  traps: 'back',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'biceps',
  abs: 'core',
  obliques: 'core',
  hip_flexors: 'core',
  cardio: 'cardio',
};

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, { uk: string; en: string }> = {
  chest: { uk: 'Груди', en: 'Chest' },
  back: { uk: 'Спина', en: 'Back' },
  shoulders: { uk: 'Плечі', en: 'Shoulders' },
  biceps: { uk: 'Біцепс', en: 'Biceps' },
  triceps: { uk: 'Трицепс', en: 'Triceps' },
  legs: { uk: 'Ноги', en: 'Legs' },
  hamstrings: { uk: 'Задня ст.', en: 'Hamstrings' },
  glutes: { uk: 'Сідниці', en: 'Glutes' },
  core: { uk: 'Прес', en: 'Core' },
  calves: { uk: 'Литки', en: 'Calves' },
  cardio: { uk: 'Кардіо', en: 'Cardio' },
  fullbody: { uk: 'Все тіло', en: 'Full Body' },
};
