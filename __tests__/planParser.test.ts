/**
 * План від AI (план §4).
 *
 * Модель відповідає вільним текстом. Наше завдання — витягти з нього дні й
 * вправи і, де вдалось, прив'язати вправи до бібліотеки, НЕ змінюючи сам текст:
 * користувач має читати те, що написав тренер.
 */
import { createPlanFromAIText } from '../services/planParser';
import { createResolver } from '../services/exerciseMatch';

const AI_TEXT = `Ось твій тижневий план.

**Понеділок — силове тренування**
- Присідання зі штангою на спині 5x5
- Жим штанги лежачи 4x8
- Станова тяга 3x5
- Якась авторська вправа тренера 3x10

**Середа — відпочинок**
Легка прогулянка 30 хвилин.

**П'ятниця — кросфіт**
- Бурпі 5x10
- Гребля 500м
`;

describe('розбір плану', () => {
  const plan = createPlanFromAIText(AI_TEXT, ['сила'], createResolver());
  const day = (n: number) => plan.weeklySchedule.find((d) => d.dayOfWeek === n)!;

  it('дні тижня знайдені', () => {
    expect(plan.weeklySchedule.map((d) => d.dayOfWeek).sort()).toEqual([1, 3, 5]);
  });

  it('вправи дня розібрані з підходами', () => {
    const mon = day(1).exercises;
    expect(mon.length).toBeGreaterThanOrEqual(3);
    expect(mon[0].sets).toBe(5);
    expect(mon[0].reps).toBe('5');
  });

  it('впізнані вправи отримують id бібліотеки', () => {
    const mon = day(1).exercises;
    expect(mon[0].exerciseId).toBe('back_squat');
    expect(mon[1].exerciseId).toBe('bench_press');
    expect(mon[2].exerciseId).toBe('deadlift');
  });

  it('невпізнана вправа лишається без id, але не зникає', () => {
    const custom = day(1).exercises.find((e) => e.name.includes('авторська'));
    expect(custom).toBeDefined();
    expect(custom!.exerciseId).toBeUndefined();
  });

  it('кросфітні вправи теж впізнаються', () => {
    const ids = day(5).exercises.map((e) => e.exerciseId);
    expect(ids).toContain('burpee');
  });

  it('текст плану зберігається без змін', () => {
    expect(plan.generatedFor).toBe(AI_TEXT);
  });

  it('без резолвера поведінка стара — жодного id', () => {
    const plain = createPlanFromAIText(AI_TEXT, ['сила']);
    for (const d of plain.weeklySchedule) {
      for (const e of d.exercises) expect(e.exerciseId).toBeUndefined();
    }
  });

  it('назви вправ у плані не переписуються', () => {
    // користувач має бачити те, що написав тренер, навіть якщо в бібліотеці
    // вправа зветься інакше
    const withResolver = createPlanFromAIText('**Понеділок**\n- front squad 3x5', [], createResolver());
    const ex = withResolver.weeklySchedule[0].exercises[0];
    expect(ex.name).toContain('front squad');
    expect(ex.exerciseId).toBe('front_squat');
  });
});

describe('реальні формати відповіді AI', () => {
  const NUMBERED = `**Понеділок — сила**
1.  **Присідання зі штангою на спині [back_squat]** — 5x5
2.  **Жим штанги лежачи [bench_press]** — 4x8
3)  Планка [plank] — 3 підходи
`;

  it('нумерований список теж розбирається', () => {
    const plan = createPlanFromAIText(NUMBERED, []);
    expect(plan.weeklySchedule[0].exercises).toHaveLength(3);
  });

  it('id береться прямо з позначки тренера, без розпізнавання назви', () => {
    const plan = createPlanFromAIText(NUMBERED, []);   // навіть без резолвера
    expect(plan.weeklySchedule[0].exercises.map((e) => e.exerciseId))
      .toEqual(['back_squat', 'bench_press', 'plank']);
  });

  it('технічні дужки й розмітка не лишаються в назві', () => {
    const [first] = createPlanFromAIText(NUMBERED, []).weeklySchedule[0].exercises;
    expect(first.name).toBe('Присідання зі штангою на спині');
    expect(first.name).not.toContain('[');
    expect(first.name).not.toContain('*');
  });

  it('вигаданий id відкидається', () => {
    const plan = createPlanFromAIText('**Вівторок**\n- Щось [неіснуюча_вправа] 3x10', []);
    expect(plan.weeklySchedule[0].exercises[0].exerciseId).toBeUndefined();
  });

  it('підходи розбираються попри розмітку', () => {
    const [first] = createPlanFromAIText(NUMBERED, []).weeklySchedule[0].exercises;
    expect(first.sets).toBe(5);
    expect(first.reps).toBe('5');
  });
});

describe('сміття в списку вправ', () => {
  const WITH_SETS = `**П'ятниця — сила**
- **Присідання зі штангою [back_squat]**: робочі підходи
  - 5 повторень (пустий гриф)
  - 5 повторень @ 40kg
  - 3 повторення @ 70kg
- **Планка [plank]**: 3х45 секунд
`;

  it('рядки підходів не стають окремими вправами', () => {
    const exercises = createPlanFromAIText(WITH_SETS, []).weeklySchedule[0].exercises;
    expect(exercises.map((e) => e.name)).toEqual([
      'Присідання зі штангою', 'Планка',
    ]);
  });

  it('справжні вправи не відсіюються', () => {
    const exercises = createPlanFromAIText(WITH_SETS, []).weeklySchedule[0].exercises;
    expect(exercises.map((e) => e.exerciseId)).toEqual(['back_squat', 'plank']);
  });

  it('короткі назви-сміття теж прибираються', () => {
    const plan = createPlanFromAIText('**Понеділок**\n- х\n- 10\n- Бурпі [burpee] 3x10', []);
    expect(plan.weeklySchedule[0].exercises).toHaveLength(1);
  });
});

describe('коментарі й заголовки', () => {
  const NOISY = `**П'ятниця**
- **Присідання [back_squat]**: 5х5
- _Намагайся виконувати усі підходи з цією вагою, це буде значний крок вперед для тебе._
- Робочі підходи:
- **Махи гирею [kb_swing]**: 3х15
`;

  it('курсивні коментарі не стають вправами', () => {
    const names = createPlanFromAIText(NOISY, []).weeklySchedule[0].exercises.map((e) => e.name);
    expect(names.some((n) => n.includes('Намагайся'))).toBe(false);
  });

  it('заголовок із двокрапкою теж відсіюється', () => {
    const names = createPlanFromAIText(NOISY, []).weeklySchedule[0].exercises.map((e) => e.name);
    expect(names).toEqual(['Присідання', 'Махи гирею']);
  });
});

describe('підзаголовки без двокрапки', () => {
  const TEXT = `**Понеділок**
- **Присідання [back_squat]**: 5х5
- Цілі
- Примітки
- Бурпі
- Тримай спину рівно і не поспішай між підходами
`;

  it('голе слово-заголовок не стає вправою', () => {
    const names = createPlanFromAIText(TEXT, [], createResolver())
      .weeklySchedule[0].exercises.map((e) => e.name);
    expect(names).not.toContain('Цілі');
    expect(names).not.toContain('Примітки');
  });

  it('впізнана вправа без цифр лишається', () => {
    const names = createPlanFromAIText(TEXT, [], createResolver())
      .weeklySchedule[0].exercises.map((e) => e.name);
    expect(names).toContain('Бурпі');
  });

  it('без резолвера теж не тягне заголовки', () => {
    const names = createPlanFromAIText(TEXT, []).weeklySchedule[0].exercises.map((e) => e.name);
    expect(names).not.toContain('Цілі');
  });
});
