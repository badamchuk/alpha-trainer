// Готові програми.
//
// Назви власні й описові: методи тут загальновідомі (лінійна прогресія, хвиля
// відсотків, накопичення обсягу), а чужі торгові марки в назвах додатку не
// потрібні.
//
// Кожна програма чесно каже, що для неї треба. Якщо обладнання бракує, екран
// підбере заміну звичайним рушієм — це те, чого немає в готових програмах
// конкурентів.

import { ProgramTemplate } from './types';

export const PROGRAMS: ProgramTemplate[] = [
  {
    id: 'linear_strength',
    nameUk: 'Лінійна сила',
    nameEn: 'Linear Strength',
    weeks: 8,
    focus: 'strength',
    level: 2,
    equipment: ['barbell', 'plate', 'bench', 'pullup_bar'],
    summaryUk: 'Три тренування на тиждень, два чергові дні. Щотижня додаємо 2.5 кг '
      + 'до основних рухів. Восьмий тиждень — розвантаження, щоб закріпити результат.',
    summaryEn: 'Three sessions a week, two alternating days. Add 2.5 kg to the main '
      + 'lifts every week. Week eight is a deload to consolidate the gains.',
    progression: { kind: 'linear', stepKg: 2.5, deloadWeeks: [8] },
    days: [
      {
        titleUk: 'День A — присід і жим',
        titleEn: 'Day A — squat and press',
        slots: [
          { exerciseId: 'back_squat', role: 'main', sets: 5, reps: 5 },
          { exerciseId: 'bench_press', role: 'main', sets: 5, reps: 5 },
          { exerciseId: 'barbell_row', role: 'accessory', sets: 3, reps: 8 },
          { exerciseId: 'plank', role: 'core', sets: 3, reps: 1 },
        ],
      },
      {
        titleUk: 'День B — тяга і жим стоячи',
        titleEn: 'Day B — deadlift and overhead press',
        slots: [
          { exerciseId: 'back_squat', role: 'main', sets: 5, reps: 5, intensity: 0.85 },
          { exerciseId: 'strict_press', role: 'main', sets: 5, reps: 5 },
          { exerciseId: 'deadlift', role: 'main', sets: 1, reps: 5 },
          { exerciseId: 'pull_up', role: 'accessory', sets: 3, reps: 6 },
        ],
      },
      {
        titleUk: 'День C — повтор A з легшою вагою',
        titleEn: 'Day C — lighter repeat of A',
        slots: [
          { exerciseId: 'back_squat', role: 'main', sets: 3, reps: 5, intensity: 0.8 },
          { exerciseId: 'incline_bench_press', role: 'accessory', sets: 4, reps: 8 },
          { exerciseId: 'lat_pulldown', role: 'accessory', sets: 3, reps: 10 },
          { exerciseId: 'hanging_knee_raise', role: 'core', sets: 3, reps: 12 },
        ],
      },
    ],
  },

  {
    id: 'volume_mass',
    nameUk: 'Обʼєм на масу',
    nameEn: 'Volume for Mass',
    weeks: 6,
    focus: 'hypertrophy',
    level: 2,
    equipment: ['barbell', 'dumbbell', 'bench', 'cable', 'pullup_bar'],
    summaryUk: 'Чотири дні: верх і низ по два рази. Вага та сама, але кожні два '
      + 'тижні додається підхід — росте саме обсяг роботи, від якого росте мʼяз.',
    summaryEn: 'Four days: upper and lower twice each. The weight stays, but a set is '
      + 'added every two weeks — muscle grows from accumulated work.',
    progression: { kind: 'volume', addSetEveryWeeks: 2, deloadWeeks: [6] },
    days: [
      {
        titleUk: 'Низ — присід',
        titleEn: 'Lower — squat',
        slots: [
          { exerciseId: 'back_squat', role: 'main', sets: 4, reps: 8 },
          { exerciseId: 'romanian_deadlift', role: 'accessory', sets: 3, reps: 10 },
          { exerciseId: 'leg_press', role: 'accessory', sets: 3, reps: 12 },
          { exerciseId: 'standing_calf_raise', role: 'accessory', sets: 3, reps: 15 },
        ],
      },
      {
        titleUk: 'Верх — жим',
        titleEn: 'Upper — press',
        slots: [
          { exerciseId: 'bench_press', role: 'main', sets: 4, reps: 8 },
          { exerciseId: 'db_shoulder_press', role: 'accessory', sets: 3, reps: 10 },
          { exerciseId: 'chest_dip', role: 'accessory', sets: 3, reps: 10 },
          { exerciseId: 'tricep_pushdown', role: 'accessory', sets: 3, reps: 12 },
        ],
      },
      {
        titleUk: 'Низ — тяга',
        titleEn: 'Lower — hinge',
        slots: [
          { exerciseId: 'deadlift', role: 'main', sets: 4, reps: 6 },
          { exerciseId: 'bulgarian_split_squat', role: 'accessory', sets: 3, reps: 10 },
          { exerciseId: 'lying_leg_curl', role: 'accessory', sets: 3, reps: 12 },
          { exerciseId: 'hanging_knee_raise', role: 'core', sets: 3, reps: 12 },
        ],
      },
      {
        titleUk: 'Верх — тяга',
        titleEn: 'Upper — pull',
        slots: [
          { exerciseId: 'pull_up', role: 'main', sets: 4, reps: 8 },
          { exerciseId: 'barbell_row', role: 'accessory', sets: 4, reps: 8 },
          { exerciseId: 'face_pull', role: 'accessory', sets: 3, reps: 15 },
          { exerciseId: 'dumbbell_curl', role: 'accessory', sets: 3, reps: 12 },
        ],
      },
    ],
  },

  {
    id: 'crossfit_cycle',
    nameUk: 'Кросфіт-цикл',
    nameEn: 'CrossFit Cycle',
    weeks: 6,
    focus: 'endurance',
    level: 2,
    equipment: ['barbell', 'plate', 'kettlebell', 'box', 'pullup_bar', 'jump_rope'],
    summaryUk: 'Силова частина по хвилі 70–85% плюс метокон щодня. Три тижні вгору, '
      + 'четвертий легший — і по колу. Саме так тримають форму цілий сезон.',
    summaryEn: 'A strength piece waving 70–85% plus a metcon every session. Three weeks '
      + 'up, the fourth lighter — then repeat. This is how a season is held.',
    progression: { kind: 'wave', intensities: [0.7, 0.8, 0.85, 0.65] },
    days: [
      {
        titleUk: 'Присід і метокон',
        titleEn: 'Squat and metcon',
        slots: [
          { exerciseId: 'back_squat', role: 'main', sets: 5, reps: 3 },
          { exerciseId: 'kb_swing', role: 'conditioning', sets: 5, reps: 15 },
          { exerciseId: 'burpee', role: 'conditioning', sets: 5, reps: 10 },
          { exerciseId: 'box_jump', role: 'conditioning', sets: 5, reps: 10 },
        ],
      },
      {
        titleUk: 'Жим і гімнастика',
        titleEn: 'Press and gymnastics',
        slots: [
          { exerciseId: 'push_press', role: 'main', sets: 5, reps: 3 },
          { exerciseId: 'pull_up', role: 'conditioning', sets: 5, reps: 8 },
          { exerciseId: 'push_up', role: 'conditioning', sets: 5, reps: 15 },
          { exerciseId: 'sit_up', role: 'core', sets: 5, reps: 20 },
        ],
      },
      {
        titleUk: 'Тяга і дихалка',
        titleEn: 'Deadlift and engine',
        slots: [
          { exerciseId: 'deadlift', role: 'main', sets: 5, reps: 3 },
          { exerciseId: 'double_under', role: 'conditioning', sets: 4, reps: 40 },
          { exerciseId: 'thruster', role: 'conditioning', sets: 4, reps: 12 },
          { exerciseId: 'row_erg', role: 'conditioning', sets: 4, reps: 1 },
        ],
      },
    ],
  },

  {
    id: 'bodyweight_base',
    nameUk: 'Власна вага',
    nameEn: 'Bodyweight Base',
    weeks: 6,
    focus: 'hypertrophy',
    level: 1,
    equipment: [],
    summaryUk: 'Без жодного інвентарю: три дні на тиждень, обсяг росте кожні два '
      + 'тижні. Коли вправа стає легкою — бери складнішу варіацію з її картки. '
      + 'Повноцінної тяги без турніка не буває: додай його в профіль, і програма '
      + 'запропонує підтягування замість вправ на спину лежачи.',
    summaryEn: 'No equipment at all: three days a week, volume grows every two weeks. '
      + 'When a movement gets easy, take the harder variation from its card. '
      + 'A real pull needs a bar: add one in your profile and the program will '
      + 'offer pull-ups instead of floor work.',
    progression: { kind: 'volume', addSetEveryWeeks: 2, deloadWeeks: [6] },
    days: [
      {
        titleUk: 'Поштовх',
        titleEn: 'Push',
        slots: [
          { exerciseId: 'push_up', role: 'main', sets: 4, reps: 12 },
          { exerciseId: 'pike_push_up', role: 'accessory', sets: 3, reps: 10 },
          { exerciseId: 'plank', role: 'core', sets: 3, reps: 1 },
        ],
      },
      {
        titleUk: 'Ноги',
        titleEn: 'Legs',
        slots: [
          { exerciseId: 'air_squat', role: 'main', sets: 4, reps: 20 },
          { exerciseId: 'walking_lunge', role: 'accessory', sets: 3, reps: 16 },
          { exerciseId: 'glute_bridge', role: 'accessory', sets: 3, reps: 15 },
          { exerciseId: 'sit_up', role: 'core', sets: 3, reps: 20 },
        ],
      },
      {
        titleUk: 'Спина і кор',
        titleEn: 'Back and core',
        slots: [
          { exerciseId: 'superman', role: 'main', sets: 4, reps: 15 },
          { exerciseId: 'hollow_hold', role: 'core', sets: 3, reps: 1 },
          { exerciseId: 'bicycle_crunch', role: 'core', sets: 3, reps: 20 },
          { exerciseId: 'mountain_climber', role: 'conditioning', sets: 3, reps: 30 },
        ],
      },
    ],
  },
];

export function getProgram(id: string): ProgramTemplate | undefined {
  return PROGRAMS.find((p) => p.id === id);
}
