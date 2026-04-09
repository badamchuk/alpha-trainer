import { Lang } from './i18n';

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'legs' | 'hamstrings' | 'glutes' | 'core' | 'calves'
  | 'cardio' | 'fullbody';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, { uk: string; en: string }> = {
  chest:      { uk: 'Груди',      en: 'Chest' },
  back:       { uk: 'Спина',      en: 'Back' },
  shoulders:  { uk: 'Плечі',      en: 'Shoulders' },
  biceps:     { uk: 'Біцепс',     en: 'Biceps' },
  triceps:    { uk: 'Трицепс',    en: 'Triceps' },
  legs:       { uk: 'Ноги',       en: 'Legs' },
  hamstrings: { uk: 'Задня ст.',  en: 'Hamstrings' },
  glutes:     { uk: 'Сідниці',    en: 'Glutes' },
  core:       { uk: 'Прес',       en: 'Core' },
  calves:     { uk: 'Литки',      en: 'Calves' },
  cardio:     { uk: 'Кардіо',     en: 'Cardio' },
  fullbody:   { uk: 'Все тіло',   en: 'Full body' },
};

export interface Exercise {
  id: string;
  nameUk: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  type: 'strength' | 'bodyweight' | 'cardio';
}

export const EXERCISES: Exercise[] = [
  // ── Chest (10) ──────────────────────────────────────────────────────────────
  { id: 'chest_01', nameUk: 'Жим штанги лежачи',            nameEn: 'Bench Press',            muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_02', nameUk: 'Жим на похилій лаві',           nameEn: 'Incline Bench Press',    muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_03', nameUk: 'Жим на лаві під нахилом вниз', nameEn: 'Decline Bench Press',    muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_04', nameUk: 'Жим гантелей лежачи',           nameEn: 'Dumbbell Bench Press',   muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_05', nameUk: 'Відтискання',                   nameEn: 'Push-up',                muscleGroup: 'chest',      type: 'bodyweight' },
  { id: 'chest_06', nameUk: 'Зведення гантелей лежачи',      nameEn: 'Dumbbell Fly',           muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_07', nameUk: 'Зведення на блоці',             nameEn: 'Cable Crossover',        muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_08', nameUk: 'Відтискання на брусах (грудні)',nameEn: 'Chest Dips',             muscleGroup: 'chest',      type: 'bodyweight' },
  { id: 'chest_09', nameUk: 'Пек-дек',                       nameEn: 'Pec Deck',               muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_10', nameUk: 'Відтискання алмазом',           nameEn: 'Diamond Push-up',        muscleGroup: 'chest',      type: 'bodyweight' },

  // ── Back (10) ────────────────────────────────────────────────────────────────
  { id: 'back_01',  nameUk: 'Підтягування',                  nameEn: 'Pull-up',                muscleGroup: 'back',       type: 'bodyweight' },
  { id: 'back_02',  nameUk: 'Тяга верхнього блоку',          nameEn: 'Lat Pulldown',           muscleGroup: 'back',       type: 'strength' },
  { id: 'back_03',  nameUk: 'Тяга штанги в нахилі',          nameEn: 'Bent Over Row',          muscleGroup: 'back',       type: 'strength' },
  { id: 'back_04',  nameUk: 'Станова тяга',                  nameEn: 'Deadlift',               muscleGroup: 'back',       type: 'strength' },
  { id: 'back_05',  nameUk: 'Тяга горизонтального блоку',    nameEn: 'Seated Cable Row',       muscleGroup: 'back',       type: 'strength' },
  { id: 'back_06',  nameUk: 'Тяга гантелі в нахилі',         nameEn: 'One-Arm Dumbbell Row',   muscleGroup: 'back',       type: 'strength' },
  { id: 'back_07',  nameUk: 'Гіперекстензія',                nameEn: 'Back Extension',         muscleGroup: 'back',       type: 'strength' },
  { id: 'back_08',  nameUk: 'Тяга Т-грифа',                  nameEn: 'T-Bar Row',              muscleGroup: 'back',       type: 'strength' },
  { id: 'back_09',  nameUk: 'Горизонтальні підтягування',    nameEn: 'Inverted Row',           muscleGroup: 'back',       type: 'bodyweight' },
  { id: 'back_10',  nameUk: 'Шраги',                         nameEn: 'Shrugs',                 muscleGroup: 'back',       type: 'strength' },

  // ── Shoulders (8) ────────────────────────────────────────────────────────────
  { id: 'sho_01',   nameUk: 'Жим штанги стоячи',             nameEn: 'Overhead Press',         muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_02',   nameUk: 'Жим гантелей сидячи',           nameEn: 'Dumbbell Shoulder Press',muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_03',   nameUk: 'Підйом гантелей в сторони',     nameEn: 'Lateral Raise',          muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_04',   nameUk: 'Підйом гантелей вперед',        nameEn: 'Front Raise',            muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_05',   nameUk: 'Жим Арнольда',                  nameEn: 'Arnold Press',           muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_06',   nameUk: 'Зворотні розводки',             nameEn: 'Rear Delt Fly',          muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_07',   nameUk: 'Тяга штанги до підборіддя',     nameEn: 'Upright Row',            muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_08',   nameUk: 'Підйом в сторони на блоці',     nameEn: 'Cable Lateral Raise',    muscleGroup: 'shoulders',  type: 'strength' },

  // ── Biceps (6) ───────────────────────────────────────────────────────────────
  { id: 'bic_01',   nameUk: 'Підйом штанги на біцепс',       nameEn: 'Barbell Curl',           muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_02',   nameUk: 'Підйом гантелей на біцепс',     nameEn: 'Dumbbell Curl',          muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_03',   nameUk: 'Молоткові підйоми',             nameEn: 'Hammer Curl',            muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_04',   nameUk: 'Підйом на лавці Скотта',        nameEn: 'Preacher Curl',          muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_05',   nameUk: 'Концентрований підйом',         nameEn: 'Concentration Curl',     muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_06',   nameUk: 'Підйом на блоці',               nameEn: 'Cable Curl',             muscleGroup: 'biceps',     type: 'strength' },

  // ── Triceps (7) ──────────────────────────────────────────────────────────────
  { id: 'tri_01',   nameUk: 'Розгинання на блоці',           nameEn: 'Tricep Pushdown',        muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_02',   nameUk: 'Французький жим',               nameEn: 'Skull Crusher',          muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_03',   nameUk: 'Розгинання гантеллю з-за голови', nameEn: 'Overhead Tricep Extension', muscleGroup: 'triceps', type: 'strength' },
  { id: 'tri_04',   nameUk: 'Відтискання на брусах (трицепс)', nameEn: 'Tricep Dips',          muscleGroup: 'triceps',    type: 'bodyweight' },
  { id: 'tri_05',   nameUk: 'Розгинання з гантеллю',         nameEn: 'Tricep Kickback',        muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_06',   nameUk: 'Жим штанги вузьким хватом',     nameEn: 'Close Grip Bench Press', muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_07',   nameUk: 'Французький жим гантелями',     nameEn: 'EZ-Bar Skull Crusher',   muscleGroup: 'triceps',    type: 'strength' },

  // ── Legs (10) ────────────────────────────────────────────────────────────────
  { id: 'leg_01',   nameUk: 'Присідання',                    nameEn: 'Squat',                  muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_02',   nameUk: 'Фронтальне присідання',         nameEn: 'Front Squat',            muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_03',   nameUk: 'Жим ногами',                    nameEn: 'Leg Press',              muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_04',   nameUk: 'Розгинання ніг',                nameEn: 'Leg Extension',          muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_05',   nameUk: 'Гак-присідання',                nameEn: 'Hack Squat',             muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_06',   nameUk: 'Болгарські присідання',         nameEn: 'Bulgarian Split Squat',  muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_07',   nameUk: 'Випади',                        nameEn: 'Lunge',                  muscleGroup: 'legs',       type: 'bodyweight' },
  { id: 'leg_08',   nameUk: 'Ходячі випади',                 nameEn: 'Walking Lunge',          muscleGroup: 'legs',       type: 'bodyweight' },
  { id: 'leg_09',   nameUk: 'Підйом на крок',                nameEn: 'Step-up',                muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_10',   nameUk: 'Присідання сумо',               nameEn: 'Sumo Squat',             muscleGroup: 'legs',       type: 'strength' },

  // ── Hamstrings (6) ───────────────────────────────────────────────────────────
  { id: 'ham_01',   nameUk: 'Румунська тяга',                nameEn: 'Romanian Deadlift',      muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_02',   nameUk: 'Згинання ніг лежачи',           nameEn: 'Lying Leg Curl',         muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_03',   nameUk: 'Скандинавські згинання',        nameEn: 'Nordic Curl',            muscleGroup: 'hamstrings', type: 'bodyweight' },
  { id: 'ham_04',   nameUk: 'Тяга на прямих ногах',          nameEn: 'Stiff-Leg Deadlift',     muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_05',   nameUk: 'Сумо-станова',                  nameEn: 'Sumo Deadlift',          muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_06',   nameUk: 'Згинання ніг стоячи',           nameEn: 'Standing Leg Curl',      muscleGroup: 'hamstrings', type: 'strength' },

  // ── Glutes (5) ───────────────────────────────────────────────────────────────
  { id: 'glu_01',   nameUk: 'Ягодичний міст',                nameEn: 'Glute Bridge',           muscleGroup: 'glutes',     type: 'bodyweight' },
  { id: 'glu_02',   nameUk: 'Тяга стегном',                  nameEn: 'Hip Thrust',             muscleGroup: 'glutes',     type: 'strength' },
  { id: 'glu_03',   nameUk: 'Відведення ноги на блоці',      nameEn: 'Cable Kickback',         muscleGroup: 'glutes',     type: 'strength' },
  { id: 'glu_04',   nameUk: 'Кікбек на чотирьох',            nameEn: 'Donkey Kicks',           muscleGroup: 'glutes',     type: 'bodyweight' },
  { id: 'glu_05',   nameUk: 'Відведення в сторони',          nameEn: 'Hip Abduction',          muscleGroup: 'glutes',     type: 'strength' },

  // ── Core (8) ─────────────────────────────────────────────────────────────────
  { id: 'cor_01',   nameUk: 'Планка',                        nameEn: 'Plank',                  muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_02',   nameUk: 'Скручування',                   nameEn: 'Crunches',               muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_03',   nameUk: 'Підйом ніг лежачи',             nameEn: 'Lying Leg Raise',        muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_04',   nameUk: 'Русинський твіст',              nameEn: 'Russian Twist',          muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_05',   nameUk: 'Ролик для преса',               nameEn: 'Ab Wheel Rollout',       muscleGroup: 'core',       type: 'strength' },
  { id: 'cor_06',   nameUk: 'Підйом ніг у висі',             nameEn: 'Hanging Leg Raise',      muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_07',   nameUk: 'Тяга блоку на прес',            nameEn: 'Cable Crunch',           muscleGroup: 'core',       type: 'strength' },
  { id: 'cor_08',   nameUk: 'Велосипед',                     nameEn: 'Bicycle Crunch',         muscleGroup: 'core',       type: 'bodyweight' },

  // ── Calves (3) ───────────────────────────────────────────────────────────────
  { id: 'cal_01',   nameUk: 'Підйом на носки стоячи',        nameEn: 'Standing Calf Raise',    muscleGroup: 'calves',     type: 'strength' },
  { id: 'cal_02',   nameUk: 'Підйом на носки сидячи',        nameEn: 'Seated Calf Raise',      muscleGroup: 'calves',     type: 'strength' },
  { id: 'cal_03',   nameUk: 'Підйом на носки (тренажер)',    nameEn: 'Machine Calf Raise',     muscleGroup: 'calves',     type: 'strength' },

  // ── Cardio (8) ───────────────────────────────────────────────────────────────
  { id: 'car_01',   nameUk: 'Біг',                           nameEn: 'Running',                muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_02',   nameUk: 'Їзда на велосипеді',            nameEn: 'Cycling',                muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_03',   nameUk: 'Плавання',                      nameEn: 'Swimming',               muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_04',   nameUk: 'Скакалка',                      nameEn: 'Jump Rope',              muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_05',   nameUk: 'Гребля',                        nameEn: 'Rowing',                 muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_06',   nameUk: 'Еліпсоїд',                     nameEn: 'Elliptical',             muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_07',   nameUk: 'Сходова доріжка',               nameEn: 'Stair Climber',          muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_08',   nameUk: 'Ходьба',                        nameEn: 'Walking',                muscleGroup: 'cardio',     type: 'cardio' },

  // ── Full body (5) ────────────────────────────────────────────────────────────
  { id: 'fb_01',    nameUk: 'Берпі',                         nameEn: 'Burpees',                muscleGroup: 'fullbody',   type: 'bodyweight' },
  { id: 'fb_02',    nameUk: 'Гойдання гирею',                nameEn: 'Kettlebell Swing',       muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'fb_03',    nameUk: 'Прогулянка фермера',            nameEn: "Farmer's Walk",          muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'fb_04',    nameUk: 'Турецький підйом',              nameEn: 'Turkish Get-Up',         muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'fb_05',    nameUk: 'Поштовх штанги',                nameEn: 'Push Press',             muscleGroup: 'fullbody',   type: 'strength' },
];

export function getExerciseName(exercise: Exercise, lang: Lang): string {
  return lang === 'en' ? exercise.nameEn : exercise.nameUk;
}

export function searchExercises(
  query: string,
  lang: Lang,
  group?: MuscleGroup | null,
): Exercise[] {
  let results = EXERCISES;
  if (group) {
    results = results.filter((e) => e.muscleGroup === group);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (e) =>
        e.nameUk.toLowerCase().includes(q) ||
        e.nameEn.toLowerCase().includes(q),
    );
  }
  return results;
}
