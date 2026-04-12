import { Lang } from './i18n';

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'legs' | 'hamstrings' | 'glutes' | 'core' | 'calves'
  | 'cardio' | 'fullbody';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, { uk: string; en: string }> = {
  chest:      { uk: 'Груди',        en: 'Chest' },
  back:       { uk: 'Спина',        en: 'Back' },
  shoulders:  { uk: 'Плечі',        en: 'Shoulders' },
  biceps:     { uk: 'Біцепс',       en: 'Biceps' },
  triceps:    { uk: 'Трицепс',      en: 'Triceps' },
  legs:       { uk: 'Ноги',         en: 'Legs' },
  hamstrings: { uk: 'Задня ст.',    en: 'Hamstrings' },
  glutes:     { uk: 'Сідниці',      en: 'Glutes' },
  core:       { uk: 'Прес',         en: 'Core' },
  calves:     { uk: 'Литки',        en: 'Calves' },
  cardio:     { uk: 'Кардіо',       en: 'Cardio' },
  fullbody:   { uk: 'Все тіло',     en: 'Full Body' },
};

export type ExerciseType = 'strength' | 'bodyweight' | 'cardio';

export interface Exercise {
  id: string;
  nameUk: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  type: ExerciseType;
}

export const EXERCISES: Exercise[] = [
  // ── CHEST ──────────────────────────────────────────────────────────────────
  { id: 'chest_01', nameEn: 'Barbell Bench Press',            nameUk: 'Жим штанги лежачи',                   muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_02', nameEn: 'Incline Barbell Bench Press',    nameUk: 'Жим штанги на похилій лаві',           muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_03', nameEn: 'Decline Barbell Bench Press',    nameUk: 'Жим штанги під нахилом вниз',          muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_04', nameEn: 'Dumbbell Bench Press',           nameUk: 'Жим гантелей лежачи',                  muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_05', nameEn: 'Incline Dumbbell Bench Press',   nameUk: 'Жим гантелей на похилій лаві',         muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_06', nameEn: 'Dumbbell Fly',                   nameUk: 'Зведення гантелей лежачи',             muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_07', nameEn: 'Incline Dumbbell Fly',           nameUk: 'Зведення гантелей на похилій лаві',    muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_08', nameEn: 'Cable Crossover',                nameUk: 'Зведення на блоці (Cable Crossover)',  muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_09', nameEn: 'Low-to-High Cable Fly',          nameUk: 'Зведення на блоці знизу-вгору',        muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_10', nameEn: 'Push-up',                        nameUk: 'Відтискання',                          muscleGroup: 'chest',      type: 'bodyweight' },
  { id: 'chest_11', nameEn: 'Wide-Grip Push-up',              nameUk: 'Відтискання широким хватом',           muscleGroup: 'chest',      type: 'bodyweight' },
  { id: 'chest_12', nameEn: 'Diamond Push-up',                nameUk: 'Відтискання алмазом',                  muscleGroup: 'chest',      type: 'bodyweight' },
  { id: 'chest_13', nameEn: 'Chest Dips',                     nameUk: 'Відтискання на брусах (грудні)',        muscleGroup: 'chest',      type: 'bodyweight' },
  { id: 'chest_14', nameEn: 'Pec Deck',                       nameUk: 'Пек-дек',                              muscleGroup: 'chest',      type: 'strength' },
  { id: 'chest_15', nameEn: 'Smith Machine Bench Press',      nameUk: 'Жим у тренажері Сміта лежачи',         muscleGroup: 'chest',      type: 'strength' },

  // ── BACK ───────────────────────────────────────────────────────────────────
  { id: 'back_01',  nameEn: 'Pull-up',                        nameUk: 'Підтягування (широкий хват)',           muscleGroup: 'back',       type: 'bodyweight' },
  { id: 'back_02',  nameEn: 'Chin-up',                        nameUk: 'Підтягування зворотним хватом',         muscleGroup: 'back',       type: 'bodyweight' },
  { id: 'back_03',  nameEn: 'Neutral-Grip Pull-up',           nameUk: 'Підтягування нейтральним хватом',       muscleGroup: 'back',       type: 'bodyweight' },
  { id: 'back_04',  nameEn: 'Inverted Row',                   nameUk: 'Горизонтальні підтягування',            muscleGroup: 'back',       type: 'bodyweight' },
  { id: 'back_05',  nameEn: 'Barbell Bent Over Row',          nameUk: 'Тяга штанги в нахилі',                  muscleGroup: 'back',       type: 'strength' },
  { id: 'back_06',  nameEn: 'Pendlay Row',                    nameUk: 'Тяга Пендлей',                          muscleGroup: 'back',       type: 'strength' },
  { id: 'back_07',  nameEn: 'One-Arm Dumbbell Row',           nameUk: 'Тяга гантелі в нахилі однією рукою',   muscleGroup: 'back',       type: 'strength' },
  { id: 'back_08',  nameEn: 'T-Bar Row',                      nameUk: 'Тяга Т-грифа',                          muscleGroup: 'back',       type: 'strength' },
  { id: 'back_09',  nameEn: 'Seated Cable Row',               nameUk: 'Тяга горизонтального блоку сидячи',    muscleGroup: 'back',       type: 'strength' },
  { id: 'back_10',  nameEn: 'Lat Pulldown',                   nameUk: 'Тяга верхнього блоку широким хватом',  muscleGroup: 'back',       type: 'strength' },
  { id: 'back_11',  nameEn: 'Close-Grip Lat Pulldown',        nameUk: 'Тяга верхнього блоку вузьким хватом',  muscleGroup: 'back',       type: 'strength' },
  { id: 'back_12',  nameEn: 'Straight-Arm Pulldown',          nameUk: 'Тяга верхнього блоку прямими руками',  muscleGroup: 'back',       type: 'strength' },
  { id: 'back_13',  nameEn: 'Deadlift',                       nameUk: 'Станова тяга',                          muscleGroup: 'back',       type: 'strength' },
  { id: 'back_14',  nameEn: 'Rack Pull',                      nameUk: 'Тяга з рамки (Rack Pull)',               muscleGroup: 'back',       type: 'strength' },
  { id: 'back_15',  nameEn: 'Back Extension',                 nameUk: 'Гіперекстензія',                        muscleGroup: 'back',       type: 'strength' },
  { id: 'back_16',  nameEn: 'Face Pull',                      nameUk: 'Тяга до обличчя (Face Pull)',            muscleGroup: 'back',       type: 'strength' },
  { id: 'back_17',  nameEn: 'Barbell Shrugs',                 nameUk: 'Шраги зі штангою',                      muscleGroup: 'back',       type: 'strength' },
  { id: 'back_18',  nameEn: 'Dumbbell Shrugs',                nameUk: 'Шраги з гантелями',                     muscleGroup: 'back',       type: 'strength' },
  { id: 'back_19',  nameEn: 'Meadows Row',                    nameUk: 'Тяга Медоуза',                          muscleGroup: 'back',       type: 'strength' },
  { id: 'back_20',  nameEn: 'Chest-Supported Row',            nameUk: 'Тяга в нахилі з опорою на лаву',       muscleGroup: 'back',       type: 'strength' },

  // ── SHOULDERS ──────────────────────────────────────────────────────────────
  { id: 'sho_01',   nameEn: 'Barbell Overhead Press (OHP)',   nameUk: 'Жим штанги стоячи (OHP)',               muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_02',   nameEn: 'Seated Dumbbell Press',          nameUk: 'Жим гантелей сидячи',                   muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_03',   nameEn: 'Arnold Press',                   nameUk: 'Жим Арнольда',                          muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_04',   nameEn: 'Dumbbell Lateral Raise',         nameUk: 'Підйом гантелей в сторони',             muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_05',   nameEn: 'Cable Lateral Raise',            nameUk: 'Підйом на блоці в сторони',             muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_06',   nameEn: 'Machine Lateral Raise',          nameUk: 'Підйом в сторони на тренажері',         muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_07',   nameEn: 'Dumbbell Front Raise',           nameUk: 'Підйом гантелей вперед',                muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_08',   nameEn: 'Cable Front Raise',              nameUk: 'Підйом на блоці вперед',                muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_09',   nameEn: 'Rear Delt Fly (Dumbbell)',       nameUk: 'Зворотні розводки з гантелями',         muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_10',   nameEn: 'Reverse Pec Deck',               nameUk: 'Зворотній пек-дек',                     muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_11',   nameEn: 'Upright Row',                    nameUk: 'Тяга штанги до підборіддя',             muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_12',   nameEn: 'Landmine Press',                 nameUk: 'Жим ландміна',                          muscleGroup: 'shoulders',  type: 'strength' },
  { id: 'sho_13',   nameEn: 'Pike Push-up',                   nameUk: 'Відтискання (Pike Push-up)',             muscleGroup: 'shoulders',  type: 'bodyweight' },
  { id: 'sho_14',   nameEn: 'Handstand Push-up',              nameUk: 'Відтискання в стійці на руках',         muscleGroup: 'shoulders',  type: 'bodyweight' },

  // ── BICEPS ─────────────────────────────────────────────────────────────────
  { id: 'bic_01',   nameEn: 'Barbell Curl',                   nameUk: 'Підйом штанги на біцепс',               muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_02',   nameEn: 'EZ-Bar Curl',                    nameUk: 'Підйом EZ-штанги на біцепс',            muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_03',   nameEn: 'Dumbbell Curl',                  nameUk: 'Підйом гантелей на біцепс',             muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_04',   nameEn: 'Hammer Curl',                    nameUk: 'Молоткові підйоми',                     muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_05',   nameEn: 'Incline Dumbbell Curl',          nameUk: 'Підйом гантелей на похилій лаві',       muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_06',   nameEn: 'Preacher Curl',                  nameUk: 'Підйом на лавці Скотта',                muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_07',   nameEn: 'Concentration Curl',             nameUk: 'Концентрований підйом',                 muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_08',   nameEn: 'Cable Curl',                     nameUk: 'Підйом на нижньому блоці',              muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_09',   nameEn: 'Reverse Curl',                   nameUk: 'Підйом зворотним хватом',               muscleGroup: 'biceps',     type: 'strength' },
  { id: 'bic_10',   nameEn: 'Cable Hammer Curl',              nameUk: 'Молоткові підйоми на блоці',            muscleGroup: 'biceps',     type: 'strength' },

  // ── TRICEPS ────────────────────────────────────────────────────────────────
  { id: 'tri_01',   nameEn: 'Tricep Pushdown (Rope)',          nameUk: 'Розгинання на блоці (канат)',            muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_02',   nameEn: 'Tricep Pushdown (Bar)',           nameUk: 'Розгинання на блоці (гриф)',             muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_03',   nameEn: 'Skull Crusher (EZ-Bar)',          nameUk: 'Французький жим EZ-штангою',            muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_04',   nameEn: 'Skull Crusher (Barbell)',         nameUk: 'Французький жим штангою',               muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_05',   nameEn: 'Overhead Tricep Extension',       nameUk: 'Розгинання гантеллю з-за голови',       muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_06',   nameEn: 'Cable Overhead Tricep Extension', nameUk: 'Розгинання на блоці з-за голови',       muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_07',   nameEn: 'Tricep Dips',                    nameUk: 'Відтискання на брусах (трицепс)',        muscleGroup: 'triceps',    type: 'bodyweight' },
  { id: 'tri_08',   nameEn: 'Bench Dips',                     nameUk: 'Відтискання від лави',                   muscleGroup: 'triceps',    type: 'bodyweight' },
  { id: 'tri_09',   nameEn: 'Close-Grip Bench Press',         nameUk: 'Жим штанги вузьким хватом',             muscleGroup: 'triceps',    type: 'strength' },
  { id: 'tri_10',   nameEn: 'Tricep Kickback',                nameUk: 'Розгинання з гантеллю назад',           muscleGroup: 'triceps',    type: 'strength' },

  // ── LEGS (QUADS) ───────────────────────────────────────────────────────────
  { id: 'leg_01',   nameEn: 'Back Squat',                     nameUk: 'Присідання зі штангою на спині',        muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_02',   nameEn: 'Front Squat',                    nameUk: 'Фронтальне присідання',                 muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_03',   nameEn: 'Box Squat',                      nameUk: 'Присідання на ящик (Box Squat)',        muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_04',   nameEn: 'Pause Squat',                    nameUk: 'Присідання з паузою',                   muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_05',   nameEn: 'Zercher Squat',                  nameUk: 'Присідання Зерхера',                    muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_06',   nameEn: 'Goblet Squat',                   nameUk: 'Присідання з гирею (Goblet Squat)',     muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_07',   nameEn: 'Sumo Squat',                     nameUk: 'Присідання сумо',                       muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_08',   nameEn: 'Hack Squat',                     nameUk: 'Гак-присідання',                        muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_09',   nameEn: 'Leg Press',                      nameUk: 'Жим ногами в тренажері',                muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_10',   nameEn: 'Leg Extension',                  nameUk: 'Розгинання ніг у тренажері',            muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_11',   nameEn: 'Bulgarian Split Squat',          nameUk: 'Болгарські присідання',                 muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_12',   nameEn: 'Lunge',                          nameUk: 'Випади',                                muscleGroup: 'legs',       type: 'bodyweight' },
  { id: 'leg_13',   nameEn: 'Walking Lunge',                  nameUk: 'Ходячі випади',                         muscleGroup: 'legs',       type: 'bodyweight' },
  { id: 'leg_14',   nameEn: 'Reverse Lunge',                  nameUk: 'Зворотні випади',                       muscleGroup: 'legs',       type: 'bodyweight' },
  { id: 'leg_15',   nameEn: 'Step-up',                        nameUk: 'Підйом на крок',                        muscleGroup: 'legs',       type: 'bodyweight' },
  { id: 'leg_16',   nameEn: 'Smith Machine Squat',            nameUk: 'Присідання у тренажері Сміта',          muscleGroup: 'legs',       type: 'strength' },
  { id: 'leg_17',   nameEn: 'Pistol Squat',                   nameUk: 'Присідання на одній нозі (Пістолет)',   muscleGroup: 'legs',       type: 'bodyweight' },

  // ── HAMSTRINGS ─────────────────────────────────────────────────────────────
  { id: 'ham_01',   nameEn: 'Romanian Deadlift (RDL)',        nameUk: 'Румунська тяга (RDL)',                   muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_02',   nameEn: 'Stiff-Leg Deadlift',            nameUk: 'Тяга на прямих ногах',                  muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_03',   nameEn: 'Sumo Deadlift',                 nameUk: 'Станова тяга сумо',                     muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_04',   nameEn: 'Lying Leg Curl',                nameUk: 'Згинання ніг лежачи у тренажері',      muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_05',   nameEn: 'Seated Leg Curl',               nameUk: 'Згинання ніг сидячи у тренажері',      muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_06',   nameEn: 'Standing Leg Curl',             nameUk: 'Згинання ноги стоячи у тренажері',     muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_07',   nameEn: 'Nordic Curl',                   nameUk: 'Скандинавські згинання (Nordic Curl)',  muscleGroup: 'hamstrings', type: 'bodyweight' },
  { id: 'ham_08',   nameEn: 'Good Morning',                  nameUk: 'Доброго ранку (Good Morning)',          muscleGroup: 'hamstrings', type: 'strength' },
  { id: 'ham_09',   nameEn: 'Glute-Ham Raise (GHR)',         nameUk: 'Розгинання на GHR-тренажері',           muscleGroup: 'hamstrings', type: 'bodyweight' },
  { id: 'ham_10',   nameEn: 'Cable Pull-Through',            nameUk: 'Протяжка з блоком (Cable Pull-Through)',muscleGroup: 'hamstrings', type: 'strength' },

  // ── GLUTES ─────────────────────────────────────────────────────────────────
  { id: 'glu_01',   nameEn: 'Barbell Hip Thrust',            nameUk: 'Тяга стегном зі штангою (Hip Thrust)',  muscleGroup: 'glutes',     type: 'strength' },
  { id: 'glu_02',   nameEn: 'Glute Bridge',                  nameUk: 'Ягодичний міст',                        muscleGroup: 'glutes',     type: 'bodyweight' },
  { id: 'glu_03',   nameEn: 'Barbell Glute Bridge',          nameUk: 'Ягодичний міст зі штангою',             muscleGroup: 'glutes',     type: 'strength' },
  { id: 'glu_04',   nameEn: 'Cable Kickback',                nameUk: 'Відведення ноги на блоці',              muscleGroup: 'glutes',     type: 'strength' },
  { id: 'glu_05',   nameEn: 'Donkey Kicks',                  nameUk: 'Кікбек на чотирьох (Donkey Kicks)',     muscleGroup: 'glutes',     type: 'bodyweight' },
  { id: 'glu_06',   nameEn: 'Hip Abduction Machine',         nameUk: 'Відведення в сторони у тренажері',     muscleGroup: 'glutes',     type: 'strength' },
  { id: 'glu_07',   nameEn: 'Single-Leg Hip Thrust',         nameUk: 'Тяга стегном на одній нозі',            muscleGroup: 'glutes',     type: 'bodyweight' },

  // ── CORE ───────────────────────────────────────────────────────────────────
  { id: 'cor_01',   nameEn: 'Plank',                         nameUk: 'Планка',                                muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_02',   nameEn: 'Side Plank',                    nameUk: 'Бічна планка',                          muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_03',   nameEn: 'Ab Wheel Rollout',              nameUk: 'Ролик для преса',                       muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_04',   nameEn: 'Hanging Leg Raise',             nameUk: 'Підйом ніг у висі',                     muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_05',   nameEn: 'Hanging Knee Raise',            nameUk: 'Підйом колін у висі',                   muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_06',   nameEn: 'Cable Crunch',                  nameUk: 'Тяга блоку на прес',                    muscleGroup: 'core',       type: 'strength' },
  { id: 'cor_07',   nameEn: 'Crunches',                      nameUk: 'Скручування',                           muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_08',   nameEn: 'Decline Crunches',              nameUk: 'Скручування на похилій лаві',           muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_09',   nameEn: 'Russian Twist',                 nameUk: 'Русинський твіст',                      muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_10',   nameEn: 'Bicycle Crunch',                nameUk: 'Велосипед',                             muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_11',   nameEn: 'Lying Leg Raise',               nameUk: 'Підйом ніг лежачи',                     muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_12',   nameEn: 'Dragon Flag',                   nameUk: 'Прапор Дракона (Dragon Flag)',          muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_13',   nameEn: 'L-Sit',                         nameUk: 'Кут у висі (L-Sit)',                    muscleGroup: 'core',       type: 'bodyweight' },
  { id: 'cor_14',   nameEn: 'Hollow Body Hold',              nameUk: 'Утримання порожнього тіла',             muscleGroup: 'core',       type: 'bodyweight' },

  // ── CALVES ─────────────────────────────────────────────────────────────────
  { id: 'cal_01',   nameEn: 'Standing Calf Raise',           nameUk: 'Підйом на носки стоячи',                muscleGroup: 'calves',     type: 'strength' },
  { id: 'cal_02',   nameEn: 'Seated Calf Raise',             nameUk: 'Підйом на носки сидячи',                muscleGroup: 'calves',     type: 'strength' },
  { id: 'cal_03',   nameEn: 'Donkey Calf Raise',             nameUk: 'Підйом на носки з нахилом',             muscleGroup: 'calves',     type: 'strength' },
  { id: 'cal_04',   nameEn: 'Leg Press Calf Raise',          nameUk: 'Підйом на носки в жимі ногами',         muscleGroup: 'calves',     type: 'strength' },
  { id: 'cal_05',   nameEn: 'Single-Leg Calf Raise',         nameUk: 'Підйом на носки на одній нозі',         muscleGroup: 'calves',     type: 'bodyweight' },

  // ── CARDIO ─────────────────────────────────────────────────────────────────
  { id: 'car_01',   nameEn: 'Running',                       nameUk: 'Біг',                                   muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_02',   nameEn: 'Treadmill Running',             nameUk: 'Біг на доріжці',                        muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_03',   nameEn: 'Cycling (Outdoor)',             nameUk: 'Їзда на велосипеді',                    muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_04',   nameEn: 'Stationary Bike',               nameUk: 'Велотренажер',                          muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_05',   nameEn: 'Rowing Machine',                nameUk: 'Гребний тренажер',                      muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_06',   nameEn: 'Jump Rope',                     nameUk: 'Скакалка',                              muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_07',   nameEn: 'Swimming',                      nameUk: 'Плавання',                              muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_08',   nameEn: 'Elliptical Trainer',            nameUk: 'Еліпсоїд',                              muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_09',   nameEn: 'Stair Climber',                 nameUk: 'Сходова доріжка',                       muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_10',   nameEn: 'Walking',                       nameUk: 'Ходьба',                                muscleGroup: 'cardio',     type: 'cardio' },
  { id: 'car_11',   nameEn: 'HIIT Sprints',                  nameUk: 'HIIT-спринти',                          muscleGroup: 'cardio',     type: 'cardio' },

  // ── FULL BODY / OLYMPIC ────────────────────────────────────────────────────
  { id: 'ful_01',   nameEn: 'Burpees',                       nameUk: 'Берпі',                                 muscleGroup: 'fullbody',   type: 'bodyweight' },
  { id: 'ful_02',   nameEn: 'Kettlebell Swing',              nameUk: 'Гойдання гирею (Kettlebell Swing)',     muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_03',   nameEn: "Farmer's Walk",                 nameUk: 'Прогулянка фермера',                    muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_04',   nameEn: 'Turkish Get-Up',                nameUk: 'Турецький підйом',                      muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_05',   nameEn: 'Push Press',                    nameUk: 'Поштовх штанги (Push Press)',           muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_06',   nameEn: 'Power Clean',                   nameUk: 'Поштовх у підсіді (Power Clean)',       muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_07',   nameEn: 'Hang Clean',                    nameUk: 'Підйом на груди з висіння (Hang Clean)',muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_08',   nameEn: 'Power Snatch',                  nameUk: 'Ривок (Power Snatch)',                  muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_09',   nameEn: 'Thruster',                      nameUk: 'Траст (Thruster)',                      muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_10',   nameEn: 'Box Jump',                      nameUk: 'Стрибок на ящик',                       muscleGroup: 'fullbody',   type: 'bodyweight' },
  { id: 'ful_11',   nameEn: 'Sled Push',                     nameUk: 'Штовхання саней (Sled Push)',           muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_12',   nameEn: 'Battle Ropes',                  nameUk: 'Канати (Battle Ropes)',                 muscleGroup: 'fullbody',   type: 'cardio' },
  { id: 'ful_13',   nameEn: 'Clean and Jerk',                nameUk: 'Поштовх (Clean & Jerk)',                muscleGroup: 'fullbody',   type: 'strength' },
  { id: 'ful_14',   nameEn: 'Barbell Complex',               nameUk: 'Комплекс зі штангою',                   muscleGroup: 'fullbody',   type: 'strength' },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────

export function getExerciseName(exercise: Exercise, lang: Lang): string {
  return lang === 'en' ? exercise.nameEn : exercise.nameUk;
}

export function searchExercises(
  query: string,
  lang: Lang,
  group?: MuscleGroup | null
): Exercise[] {
  const q = query.trim().toLowerCase();
  return EXERCISES.filter((ex) => {
    if (group && ex.muscleGroup !== group) return false;
    if (!q) return true;
    return (
      ex.nameEn.toLowerCase().includes(q) ||
      ex.nameUk.toLowerCase().includes(q)
    );
  });
}
