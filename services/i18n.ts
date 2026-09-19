import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import { enUS, uk } from 'date-fns/locale';
import type { Locale } from 'date-fns';

export type Lang = 'uk' | 'en';

const STORAGE_KEY = '@alpha_trainer:language';
const EXERCISE_LANG_KEY = '@alpha_trainer:exercise_language';

const DEFAULT_LANG: Lang = 'uk';
const DEFAULT_EXERCISE_LANG: Lang = 'uk';

let _lang: Lang = DEFAULT_LANG;
// Бібліотека вправ тепер україномовна (services/library), тож і назви за
// замовчуванням українські. Хто вже обрав English — вибір лежить у сховищі
// й перебиває це значення, тож нічого не міняється.
let _exerciseLang: Lang = DEFAULT_EXERCISE_LANG;
const _subscribers: Array<() => void> = [];

export async function loadLanguage(): Promise<void> {
  try {
    const [stored, storedEx] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(EXERCISE_LANG_KEY),
    ]);
    // Порожнє чи зіпсоване значення означає «нічого не обирали» — тоді
    // повертаємось до типової мови, а не лишаємо те, що було в пам'яті.
    _lang = stored === 'uk' || stored === 'en' ? stored : DEFAULT_LANG;
    _exerciseLang = storedEx === 'uk' || storedEx === 'en' ? storedEx : DEFAULT_EXERCISE_LANG;
  } catch {
    // defaults
  }
}

export function getCurrentLang(): Lang { return _lang; }
export function getCurrentExerciseLang(): Lang { return _exerciseLang; }

export async function setLanguage(lang: Lang): Promise<void> {
  _lang = lang;
  try { await AsyncStorage.setItem(STORAGE_KEY, lang); } catch {}
  _subscribers.forEach((fn) => fn());
}

export async function setExerciseLanguage(lang: Lang): Promise<void> {
  _exerciseLang = lang;
  try { await AsyncStorage.setItem(EXERCISE_LANG_KEY, lang); } catch {}
  _subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  _subscribers.push(fn);
  return () => {
    const i = _subscribers.indexOf(fn);
    if (i >= 0) _subscribers.splice(i, 1);
  };
}

// ─── TRANSLATIONS ────────────────────────────────────────────────────────────

type StringValue = string | ((...args: any[]) => string);

/**
 * Функція перекладу — така, яку віддає useLocale().
 *
 * Сервіси її лише приймають: вони повертають коди й числа, а слова підставляє
 * екран. Через це один і той самий конструктор працює обома мовами.
 */
export type TFn = (key: string, ...args: any[]) => string;

const translations: Record<Lang, Record<string, StringValue>> = {
  uk: {
    // COMMON
    save: 'Зберегти',
    cancel: 'Скасувати',
    close: 'Закрити',
    delete: 'Видалити',
    add: 'Додати',
    edit: 'Редагувати',
    all: 'Всі',
    confirm: 'Підтвердити',
    yes: 'Так',
    no: 'Ні',
    error: 'Помилка',
    loading: 'Завантаження...',
    back: 'Назад',
    next: 'Далі',
    done: 'Готово!',
    settings: 'Налаштування',
    language: 'Мова',
    ukrainian: 'Українська',
    english: 'English',

    // HOME
    workoutDay: 'День тренування',
    restDay: 'День відпочинку',
    workoutNotLogged: 'Тренування ще не записано',
    relax: 'Відновлюйся та готуйся',
    logBtn: 'Записати',
    streak: 'Серія',
    daysUnit: 'днів',
    thisWeekLabel: 'Цього тижня',
    totalLabel: 'Загалом',
    trainingsUnit: 'трен.',
    todayPlan: 'План на сьогодні',
    fullWeekBtn: 'Весь тиждень →',
    noPlanTitle: 'Немає плану тренувань',
    noPlanSub: 'Попроси AI скласти програму →',
    todayDone: 'Сьогодні зроблено',
    coachAdvice: 'Порада від тренера',
    gettingAdvice: 'Отримую пораду...',
    noApiKeyAdvice: 'Додай Groq або Gemini API ключ у профілі щоб отримувати персональні поради',
    configureBtn: 'Налаштувати →',
    chatWithCoach: 'Поговорити з тренером',
    logTraining: 'Записати тренування',
    thisWeekTracker: 'Цей тиждень',
    waterLabel: 'Вода',
    waterGoalDone: 'Ціль виконана!',
    waterRemindersLabel: 'Нагадування',
    workoutsLoggedToday: (count: number) => `${count} тренування записано`,

    // JOURNAL
    journalTitle: 'Журнал тренувань',
    searchPlaceholder: 'Пошук за вправою, нотатками...',
    emptyJournalTitle: 'Журнал порожній',
    emptyJournalText: 'Запиши своє перше тренування',
    deleteWorkoutTitle: (type: string) => `Видалити "${type}"?`,

    // LOG
    newWorkout: 'Нове тренування',
    workoutTypeLabel: 'Тип тренування',
    dateLabel: 'Дата',
    durationLabel: 'Тривалість (хв)',
    exercisesLabel: 'Вправи',
    addExercise: 'Додати вправу',
    exerciseNamePlaceholder: 'Назва вправи (наприклад: Присідання)',
    setsLabel: 'Підходи',
    repsLabel: 'Повтори',
    weightKgLabel: 'Вага (кг)',
    timeMinLabel: 'Час (хв)',
    kmLabel: 'Км',
    kcalLabel: 'ккал',
    wattsLabel: 'Вати (вт)',
    notesLabel: 'Нотатки',
    notesPlaceholder: 'Як пройшло тренування? Самопочуття, досягнення, що покращити...',
    ratingLabel: 'Оцінка тренування',
    cardioParamsTitle: 'Параметри кардіо',
    distanceKmLabel: 'Дистанція (км)',
    totalCalLabel: 'ккал (всього)',
    avgHrLabel: 'ЧСС серед. (уд/хв)',
    maxHrLabel: 'ЧСС макс. (уд/хв)',
    elevationLabel: 'Набір висоти (м)',
    templatesTitle: 'Шаблони тренувань',
    saveTemplateTitle: 'Зберегти шаблон',
    noTemplates: 'Немає збережених шаблонів',
    noTemplatesText: 'Додай вправи та збережи як шаблон',
    templateNamePlaceholder: 'Назва шаблону',
    templateSaved: 'Шаблон збережено!',
    restTimerBtn: 'Відпочинок',
    enterExerciseName: 'Введи назву вправи',
    durationRequired: 'Вкажи тривалість тренування (в хвилинах)',
    needExercisesCardio: 'Додай дистанцію або вправи',
    needExercisesStrength: 'Додай хоча б одну вправу',
    needExercisesCardioMsg: 'Для кардіо тренування вкажи дистанцію або додай вправи.',
    needExercisesStrengthMsg: 'Запишіть вправи, щоб відстежувати прогрес.',
    overloadLastTime: (parts: string) => `Минулого разу: ${parts}`,
    chooseFromLibrary: 'Обрати з бібліотеки',

    // TRAINER
    trainerTitle: 'AI Тренер',
    trainerPlaceholder: 'Напиши питання тренеру...',
    trainerClear: 'Очистити чат',
    trainerClearConfirm: 'Видалити всю історію розмови?',
    trainerThinking: 'Складаю план...',
    trainerNoApiKey: 'API ключ не налаштовано',
    trainerNoApiKeyText: 'Щоб спілкуватися з AI-тренером, потрібен Groq або Gemini API ключ.',
    trainerGoToProfile: 'Налаштувати',

    // PROGRESS
    progressTitle: 'Прогрес',
    weeklyLoad: 'Навантаження по тижнях',
    exerciseProgress: 'Прогрес вправ',
    searchExercise: 'Пошук вправи...',
    allExercises: 'Усі вправи',
    muscleGroupsTitle: 'М\'язові групи',
    hrZonesTitle: 'Пульсові зони',
    caloriesByMonthTitle: 'Витрати калорій по типах',
    measurementsTitle: 'Виміри тіла',
    addMeasurementBtn: 'Додати виміри',
    personalRecordsTitle: 'Особисті рекорди',
    weightHistoryTitle: 'Динаміка ваги',
    addWeightBtn: 'Додати вагу',
    runStatsTitle: 'Статистика бігу',
    noData: 'Немає даних',
    noWorkouts: 'Ще немає тренувань',

    // GOALS
    goalsTitle: 'Мої цілі',
    addGoalBtn: 'Додати ціль',
    noGoalsTitle: 'Немає цілей',
    noGoalsText: 'Постав свою першу ціль — і AI-тренер допоможе її досягти',
    goalAchieved: 'Досягнуто',
    deadlineLabel: 'Дедлайн',

    // PLAN
    planTitle: 'Мій план тренувань',
    generatePlan: 'Відкрити AI Тренера',

    // WORKOUT DETAIL
    workoutDetailTitle: 'Деталі тренування',
    deleteWorkoutBtn: 'Видалити тренування',
    deleteWorkoutConfirm: 'Цю дію не можна скасувати.',

    // MISC
    exerciseLibrary: 'Бібліотека вправ',
    allMusclesFilter: 'Всі',
    languagePickerTitle: 'Оберіть мову',
    exerciseLangLabel: 'Мова вправ',
    exerciseLangHint: 'Назви вправ у бібліотеці та при записі',
    appLangLabel: 'Мова додатку',

    // ── БІБЛІОТЕКА, ЗАМІНИ, КОНСТРУКТОР, ПРОГРАМИ ──────────────────────────
    howTo: 'Як робити',
    howToCollapse: 'Згорнути',
    video: 'Відео',
    moreAboutExercise: 'Докладніше про вправу',
    recentExercises: 'Нещодавні',
    wholeLibrary: 'Уся бібліотека',
    myEquipment: 'Моє обладнання',
    nothingFound: 'Нічого не знайшли',
    chooseExercise: 'Обрати вправу',
    myOwnExercise: 'Моя власна вправа',
    exerciseNameSearch: 'Назва вправи',

    substituteTitle: 'Замінити вправу',
    substituteFor: 'замість чого шукаємо',
    noEquipmentChip: 'Немає обладнання',
    painDisclaimer: 'Гострий або тривалий біль — привід до лікаря, а не до заміни вправи.',
    sameButBlock: 'Те саме, але…',
    easierBlock: 'Простіше',
    variationsBlock: 'Варіації',
    harderBlock: 'Складніше',

    // причини заміни (services/substitutions.ts повертає коди)
    reasonSameWith: 'те саме, але {0}',
    reasonSameBodyweight: 'те саме, але з власною вагою',
    reasonSameFamily: 'варіація того самого руху',
    reasonEasierBodyweight: 'простіший рух із власною вагою',
    reasonEasierSameMuscles: 'простіший рух на ті самі м’язи',
    reasonSamePatternWith: 'той самий рух {0}',
    reasonSamePattern: 'той самий рух іншим способом',
    reasonSimilarLoad: 'схоже навантаження',
    reasonSparesZone: 'не навантажує {0}',
    cautionModerateZone: 'помірно навантажує {0}',

    buildWorkout: 'Скласти тренування',
    buildAgain: 'Скласти заново',
    anotherSet: 'Інший набір',
    approxMinutes: 'Орієнтовно {0} хв',
    addExerciseToBlock: 'Додати вправу',
    saveAsTemplate: 'Зберегти як шаблон',
    startWorkout: 'Почати тренування',
    formatLabel: 'Формат',
    builderDurationLabel: 'Скільки часу',
    focusLabel: 'Фокус',
    lastTime: 'минулого разу {0}',

    programs: 'Програми',
    programWeeks: '{0} тижнів',
    programDaysPerWeek: '{0} дні на тиждень',
    programWorkingWeights: 'Робочі ваги',
    programHowLoadGrows: 'Як росте навантаження',
    programWeek: 'Тиждень {0}',
    programDeload: 'розвантаження',
    programStart: 'Почати програму',
    programStop: 'Зупинити програму',
    programEquipmentOk: 'обладнання є',
    programNoEquipment: 'без інвентарю',
    programEquipmentMissing: 'бракує: {0} — підберемо заміну',

    // зони, які можна берегти
    zoneShoulder: 'плече',
    zoneLowerBack: 'поперек',
    zoneKnee: 'коліно',
    zoneWrist: 'зап’ястя',
    zoneElbow: 'лікоть',
    zoneImpact: 'без стрибків',
    zoneSpineFlexion: 'згинання спини',
    zoneSpineExtension: 'розгинання спини',

    // обладнання (в реченнях на кшталт «те саме, але з гантелями»)
    equip_barbell: 'зі штангою',
    equip_dumbbell: 'з гантелями',
    equip_kettlebell: 'з гирею',
    equip_machine: 'у тренажері',
    equip_cable: 'на блоці',
    equip_band: 'з резинкою',
    equip_smith: 'у Сміті',
    equip_rings: 'на кільцях',
    equip_pullup_bar: 'на перекладині',
    equip_dip_bars: 'на брусах',
    equip_trap_bar: 'з трап-грифом',
    equip_ez_bar: 'з EZ-грифом',
    equip_box: 'з тумбою',
    equip_bench: 'на лаві',
    equip_medicine_ball: 'з м’ячем',

    // блоки конструктора
    blockWarmup: 'Розігрів',
    blockMobility: 'Мобільність',
    blockCooldown: 'Заминка',
    blockMainLegs: 'A. Основна — ноги',
    blockMainUpper: 'B. Основна — верх',
    blockSupersetPullPush: 'C. Суперсет — тяга/жим',
    blockSupersetLegs: 'C. Суперсет — ноги',
    blockSuperset: 'C. Суперсет',
    blockCore: 'Кор',
    blockStrength: 'Силова частина',
    blockStrengthMin: 'Силова частина — {0} хв',
    blockMetcon: 'Метокон',
    blockEmptyEquipment: 'Немає підхожої вправи під твоє обладнання',
    blockEmptyMetcon: 'Немає підхожих рухів під твоє обладнання — прибери обмеження або додай інвентар у профілі.',
    noteAmrap: 'AMRAP {0} хв — максимум раундів',
    noteEmom: 'EMOM {0} хв — по черзі щохвилини',
    noteScheme219: '21-15-9 на час',
    noteRoundsForTime: '{0} раундів на час',
    notePowerFresh: 'вибухові рухи роблять свіжими — мало повторів, повний відпочинок',

    // схема підходів
    secondsShort: '{0} с',
    restLabel: 'відпочинок {0}',
    unitMeters: 'м',
    unitKcal: 'ккал',
    unitReps: 'повторів',
    cardioApprox: '{0} {1} (орієнтовно, для чоловіка ~80 кг)',

    // формати й фокус конструктора
    formatFullbody: 'Фулбоді',
    formatFullbodyHint: 'штанга, гантелі, все тіло',
    formatCrossfit: 'Кросфіт',
    formatCrossfitHint: 'силова частина + метокон',
    focusStrength: 'Сила',
    focusMass: 'Маса',
    focusEndurance: 'Витривалість',
    minutesShort: '{0} хв',
    savedAsTemplate: 'Збережено як шаблон',

    // картка вправи
    exerciseTitle: 'Вправа',
    exerciseNotFound: 'Такої вправи немає в бібліотеці',
    schemeLabel: 'Схема: {0}',
    techniqueTitle: 'Техніка',
    watchVideo: 'Подивитись відео',
    sameButTitle: 'Те саме, але…',
    myHistoryTitle: 'Моя історія',
    bestE1rm: 'Найкращий розрахунковий максимум: {0} кг',
    nextStepNote: 'наступний крок',
    bodyweightLabel: 'власна вага',
    setsShort: '{0} підх. × {1}',
    weightByReps: '{0} кг × {1}',
    levelEasy: 'просто',
    levelMedium: 'середній рівень',
    levelHard: 'складно',
    intentMaxStrength: 'на силу',
    intentHypertrophy: 'на м’язи',
    intentPower: 'на потужність',
    intentConditioning: 'на кондицію',
    intentIsometric: 'утримання',
    intentMobility: 'мобільність',

    // екрани програм
    programTitle: 'Програма',
    programNotFound: 'Програму не знайдено',
    programsIntro: 'Програма веде тижнями й сама піднімає навантаження. Обери одну — і на головному екрані щоразу буде видно, що робити сьогодні.',
    programActive: 'активна',
    programWorkoutsTotal: '{0} тренувань',
    programFocusStrength: 'сила',
    programFocusMass: 'маса',
    programFocusEndurance: 'витривалість',
    programMissingEquipment: 'Бракує: {0}. Замінити вправу можна прямо в тренуванні.',
    programWeightsHint: 'З чого починаємо. Підставили з твоєї історії — виправ, якщо не збігається. Порожнє поле означає «працюю за відчуттям».',
    programByWeeks: '{0} по тижнях',
    programWeekSection: 'Тиждень',
    programNextWorkout: 'До наступного тренування',
    programFinished: '{0} пройдено',
    programPickNext: 'Обери наступну програму →',
    programCardDay: 'Тиждень {0} · {1}',

    // джерела й умови
    attributionTitle: 'Джерела й умови',
    attrImagesTitle: 'Малюнки вправ',
    attrImagesText: '{0} вправ, {1} кадрів. Автор графіки — Bryl Lim, проєкт Workout Guide. Основа — Everkinetic. Усе під ліцензією CC BY-SA 4.0.',
    attrAuthorLink: 'Автор — bryllim.com',
    attrSourceLink: 'Джерело — bryllim/workout-guide',
    attrBaseLink: 'Першоджерело — everkinetic/data',
    attrLicenseLink: 'Ліцензія CC BY-SA 4.0',
    attrChangesTitle: 'Що ми змінили',
    attrChange1: 'PNG 512×512 перетворено у WebP 256 px, щоб не роздувати розмір застосунку',
    attrChange2: 'залишено лише кадри вправ, які є в бібліотеці «Гарт»',
    attrChange3: 'файли перейменовано за схемою «слаг-номер кадру»',
    attrFoodTitle: 'Дані про продукти',
    attrFoodText: 'Пошук за штрихкодом бере дані з Open Food Facts — відкритої бази, яку наповнюють люди з усього світу. База поширюється за ліцензією ODbL: нею можна користуватись, зазначивши джерело.',
    attrOdblLink: 'Ліцензія ODbL 1.0',
    attrMedicalTitle: 'Це не медична порада',
    attrMedicalText: 'Додаток рахує й підказує, але не знає твого здоров’я. Поради AI-тренера, схеми підходів і оцінки калорій — орієнтир, а не призначення лікаря. Гострий чи тривалий біль, хронічні хвороби, вагітність, відновлення після травми — це привід спершу поговорити з лікарем, а не з додатком.',
    attrShareTitle: 'Умови поширення',
    attrShareText: 'Ліцензія вимагає, щоб похідні роботи поширювались на тих самих умовах, тож наші перероблені зображення теж під CC BY-SA 4.0. Повний перелік — у файлі assets/exercises/ATTRIBUTION.md у репозиторії додатку.',
    subsEmptyBodyweight: 'Під власну вагу схожої вправи немає. Спробуй прибрати обмеження по обладнанню.',
    subsEmptyZones: 'З урахуванням обмежень схожої вправи не знайшли. Прибери одне з обмежень або пропусти вправу сьогодні.',
    subsEmptyNothing: 'Схожої вправи в бібліотеці немає.',
    myExerciseTag: 'моя вправа',
    levelMediumShort: 'середньо',
    repsShort: '{0} повт.',
    providerSwitchGeo: '{0} не відповідає з твоєї мережі — питаю {1}',
    providerSwitch: '{0} не відповідає — питаю {1}',

    // дні тижня (0 = неділя, як у Date.getDay)
    dayName: (i: number) => ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'][i] ?? '',
    dayShort: (i: number) => ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][i] ?? '',

    // екран плану
    weeklySchedule: 'Тижневий розклад',
    todayTag: 'сьогодні',
    planCreatedOn: 'Складено {0}',
    startByPlan: 'Почати тренування за планом',
    planEmptyHint: 'Перейди до вкладки «Тренер», натисни «Розробити план тренувань» і збережи відповідь AI',
    setsCount: '{0} підх.',
    wtStrength: 'Силове',
    wtCardio: 'Кардіо',
    wtCrossfit: 'CrossFit',
    wtHiit: 'HIIT',
    wtYoga: 'Йога',
    wtRecovery: 'Відновлення',
    wtRun: 'Біг',
    wtCycling: 'Велосипед',
    wtSwimming: 'Плавання',
    wtCustom: 'За планом',

    // головний екран: готовність і самопочуття
    greetingHi: 'Привіт, {0} 👋',
    athleteFallback: 'Спортсмен',
    swappedForEquipment: 'Замінили вправи під твоє обладнання',
    permissionDenied: 'Дозвіл відхилено',
    permissionWaterText: 'Дозволь сповіщення в налаштуваннях телефону щоб отримувати нагадування про воду.',
    tomorrow: 'завтра',
    inDaysOn: 'через {0} дні — {1}',
    buildShort: 'Скласти',
    buildMyself: 'Скласти сам',
    aiProgramBtn: 'AI-програма',
    readinessTitle: 'Готовність',
    recoveryRest: 'Відпочинок',
    recoveryEasy: 'Легке',
    recoveryModerate: 'Помірне',
    recoveryHard: 'Важке',
    recoveryPeak: 'Пік',
    recoveryRestSub: 'Тілу потрібен відпочинок',
    recoveryEasySub: 'Підійде легке кардіо або йога',
    recoveryModerateSub: 'Можна тренуватись помірно',
    recoveryHardSub: 'Готовий до важкого тренування',
    recoveryPeakSub: 'Відмінна форма — максимум!',
    wellbeingToday: 'Самопочуття сьогодні',
    wellbeingHint: 'Як спалось? Як самопочуття? — впливає на готовність',
    wellbeingSummary: '{0}  Сон: {1}г  ·  Стрес: {2}',
    sleepHoursLabel: 'Сон (годин)',
    stressLabel: 'Стрес',
    stressNone: 'Немає',
    stressLow: 'Мало',
    stressMid: 'Середній',
    stressHigh: 'Багато',
    stressMax: 'Дуже',
    tabToday: 'Сьогодні',
    tabJournal: 'Журнал',
    tabProgress: 'Прогрес',
    tabTrainer: 'Тренер',
    tabNutrition: 'Харчування',
    tabGoals: 'Цілі',
    noPlanHint: 'Попроси AI скласти програму — або склади тренування сам, без інтернету',
    reminderTime: 'Час нагадувань',
    startLabel: 'Початок',
    endLabel: 'Кінець',
    remindersSpread: 'Нагадування розподіляться рівномірно між {0}:00 і {1}:00',
    howDoYouFeel: 'Як ти себе почуваєш?',
    moodLabel: 'Настрій',
    mergeSuperset: 'Об’єднати',
    markTwoExercises: 'Познач 2+ вправи',
    pickDate: 'Вибрати дату',
    selectedCount: 'Вибрано: {0}',
    nextWorkoutOn: 'Наступне тренування: {0}',
    programStartedTitle: 'Програму почато',
    programStartedText: 'Наступне тренування зʼявиться на головному екрані.',
    programReplaceTitle: 'Замінити активну програму?',
    programReplaceText: 'Поточний прогрес по ній буде втрачено. Дві програми одночасно проходити не вийде.',
    programReplace: 'Замінити',
    programStopTitle: 'Зупинити програму?',
    programStopText: 'Прогрес по ній буде стерто.',
    programStopBtn: 'Зупинити',
    programHintDeload: 'тиждень розвантаження — легше навмисно',
    programHintBackoff: 'вага відкочена після невдалого тижня',
    kgUnit: 'кг',
    weightKg: '{0} кг',
    ok: 'Добре',

    // розпізнавання назв вправ
    unresolvedTitle: 'Розпізнавання вправ',
    unresolvedTab: 'Нерозпізнані',
    linksTab: 'Зв’язки',
    recordsPlural: (n: number) => {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return 'запис';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'записи';
      return 'записів';
    },
    recognizedSummary: 'назв впізнано автоматично ({0} з {1}).',
    recognizedRest: ' Решту підкажи сам — це разова робота.',
    recognizedAllDone: ' Усе розібрано.',
    confidenceAmbiguous: 'кілька варіантів',
    confidenceFuzzy: 'схоже на',
    confidenceNone: 'не впізнали',
    thatsIt: 'Це воно: {0}',
    pickAnother: 'Обрати іншу',
    allNamesResolved: 'Усі назви розпізнано',
    nothingLinkedYet: 'Ще нічого не прив’язано',
    linkOrphan: 'вправи більше немає — зв’язок не діє',
    unlinkBtn: 'Відв’язати',
    whatIsThis: '«{0}» — це…',
    backupFirstTitle: 'Спершу резервна копія?',
    backupFirstText: 'Прив’язка змінює те, як рахується прогрес і калорії по всій історії. Записи лишаються цілі, але копію краще мати.',
    skipBtn: 'Пропустити',
    saveBackupBtn: 'Зберегти копію',
    linkNameTitle: 'Прив’язати назву?',
    linkNameText: '«{0}» → {1}\n\nВплине на {2}. Назву в записах не змінюємо — це можна відв’язати будь-коли.',
    linkBtn: 'Прив’язати',
    createCustomText: 'Створити «{0}» як власну вправу й прив’язати до неї {1}?',
    createBtn: 'Створити',
    unlinkTitle: 'Відв’язати?',
    unlinkText: '«{0}» знову стане нерозпізнаною назвою.',
  },

  en: {
    // COMMON
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    add: 'Add',
    edit: 'Edit',
    all: 'All',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    error: 'Error',
    loading: 'Loading...',
    back: 'Back',
    next: 'Next',
    done: 'Done!',
    settings: 'Settings',
    language: 'Language',
    ukrainian: 'Українська',
    english: 'English',

    // HOME
    workoutDay: 'Workout Day',
    restDay: 'Rest Day',
    workoutNotLogged: 'Workout not logged yet',
    relax: 'Rest & recover',
    logBtn: 'Log',
    streak: 'Streak',
    daysUnit: 'days',
    thisWeekLabel: 'This week',
    totalLabel: 'Total',
    trainingsUnit: 'workouts',
    todayPlan: "Today's plan",
    fullWeekBtn: 'Full week →',
    noPlanTitle: 'No workout plan',
    noPlanSub: 'Ask AI to create a program →',
    todayDone: 'Done today',
    coachAdvice: 'Coach advice',
    gettingAdvice: 'Getting advice...',
    noApiKeyAdvice: 'Add a Groq or Gemini API key in your profile to get personalized advice',
    configureBtn: 'Configure →',
    chatWithCoach: 'Chat with coach',
    logTraining: 'Log workout',
    thisWeekTracker: 'This week',
    waterLabel: 'Water',
    waterGoalDone: 'Goal achieved!',
    waterRemindersLabel: 'Reminders',
    workoutsLoggedToday: (count: number) => `${count} workout(s) logged`,

    // JOURNAL
    journalTitle: 'Workout Journal',
    searchPlaceholder: 'Search by exercise, notes...',
    emptyJournalTitle: 'Journal is empty',
    emptyJournalText: 'Log your first workout',
    deleteWorkoutTitle: (type: string) => `Delete "${type}"?`,

    // LOG
    newWorkout: 'New Workout',
    workoutTypeLabel: 'Workout type',
    dateLabel: 'Date',
    durationLabel: 'Duration (min)',
    exercisesLabel: 'Exercises',
    addExercise: 'Add exercise',
    exerciseNamePlaceholder: 'Exercise name (e.g. Squat)',
    setsLabel: 'Sets',
    repsLabel: 'Reps',
    weightKgLabel: 'Weight (kg)',
    timeMinLabel: 'Time (min)',
    kmLabel: 'Km',
    kcalLabel: 'kcal',
    wattsLabel: 'Watts (W)',
    notesLabel: 'Notes',
    notesPlaceholder: 'How did the workout go? How you felt, achievements, improvements...',
    ratingLabel: 'Workout rating',
    cardioParamsTitle: 'Cardio parameters',
    distanceKmLabel: 'Distance (km)',
    totalCalLabel: 'kcal (total)',
    avgHrLabel: 'Avg HR (bpm)',
    maxHrLabel: 'Max HR (bpm)',
    elevationLabel: 'Elevation gain (m)',
    templatesTitle: 'Workout templates',
    saveTemplateTitle: 'Save template',
    noTemplates: 'No saved templates',
    noTemplatesText: 'Add exercises and save as a template',
    templateNamePlaceholder: 'Template name',
    templateSaved: 'Template saved!',
    restTimerBtn: 'Rest timer',
    enterExerciseName: 'Enter exercise name',
    durationRequired: 'Enter workout duration (in minutes)',
    needExercisesCardio: 'Add distance or exercises',
    needExercisesStrength: 'Add at least one exercise',
    needExercisesCardioMsg: 'For a cardio workout, enter distance or add exercises.',
    needExercisesStrengthMsg: 'Log exercises to track your progress.',
    overloadLastTime: (parts: string) => `Last time: ${parts}`,
    chooseFromLibrary: 'Choose from library',

    // TRAINER
    trainerTitle: 'AI Trainer',
    trainerPlaceholder: 'Ask your trainer...',
    trainerClear: 'Clear chat',
    trainerClearConfirm: 'Delete all conversation history?',
    trainerThinking: 'Building plan...',
    trainerNoApiKey: 'API key not configured',
    trainerNoApiKeyText: 'You need a Groq or Gemini API key to chat with the AI trainer.',
    trainerGoToProfile: 'Configure',

    // PROGRESS
    progressTitle: 'Progress',
    weeklyLoad: 'Weekly load',
    exerciseProgress: 'Exercise progress',
    searchExercise: 'Search exercise...',
    allExercises: 'All exercises',
    muscleGroupsTitle: 'Muscle groups',
    hrZonesTitle: 'HR zones',
    caloriesByMonthTitle: 'Calories by type',
    measurementsTitle: 'Body measurements',
    addMeasurementBtn: 'Add measurements',
    personalRecordsTitle: 'Personal records',
    weightHistoryTitle: 'Weight history',
    addWeightBtn: 'Add weight',
    runStatsTitle: 'Run statistics',
    noData: 'No data',
    noWorkouts: 'No workouts yet',

    // GOALS
    goalsTitle: 'My Goals',
    addGoalBtn: 'Add goal',
    noGoalsTitle: 'No goals',
    noGoalsText: 'Set your first goal — the AI trainer will help you achieve it',
    goalAchieved: 'Achieved',
    deadlineLabel: 'Deadline',

    // PLAN
    planTitle: 'My Workout Plan',
    generatePlan: 'Open AI Trainer',

    // WORKOUT DETAIL
    workoutDetailTitle: 'Workout details',
    deleteWorkoutBtn: 'Delete workout',
    deleteWorkoutConfirm: 'This action cannot be undone.',

    // MISC
    exerciseLibrary: 'Exercise library',
    allMusclesFilter: 'All',
    languagePickerTitle: 'Choose language',
    exerciseLangLabel: 'Exercise language',
    exerciseLangHint: 'Exercise names in the library and logging',
    appLangLabel: 'App language',

    // ── LIBRARY, SUBSTITUTIONS, BUILDER, PROGRAMS ──────────────────────────
    howTo: 'How to do it',
    howToCollapse: 'Collapse',
    video: 'Video',
    moreAboutExercise: 'More about this exercise',
    recentExercises: 'Recent',
    wholeLibrary: 'Whole library',
    myEquipment: 'My equipment',
    nothingFound: 'Nothing found',
    chooseExercise: 'Choose an exercise',
    myOwnExercise: 'My own exercise',
    exerciseNameSearch: 'Exercise name',

    substituteTitle: 'Swap the exercise',
    substituteFor: 'what we are replacing',
    noEquipmentChip: 'No equipment',
    painDisclaimer: 'Sharp or lasting pain is a reason to see a doctor, not to swap an exercise.',
    sameButBlock: 'Same, but…',
    easierBlock: 'Easier',
    variationsBlock: 'Variations',
    harderBlock: 'Harder',

    reasonSameWith: 'same, but {0}',
    reasonSameBodyweight: 'same, but bodyweight',
    reasonSameFamily: 'a variation of the same movement',
    reasonEasierBodyweight: 'an easier bodyweight movement',
    reasonEasierSameMuscles: 'an easier movement for the same muscles',
    reasonSamePatternWith: 'the same movement {0}',
    reasonSamePattern: 'the same movement done differently',
    reasonSimilarLoad: 'similar load',
    reasonSparesZone: 'does not load the {0}',
    cautionModerateZone: 'moderately loads the {0}',

    buildWorkout: 'Build a workout',
    buildAgain: 'Build again',
    anotherSet: 'Another set',
    approxMinutes: 'About {0} min',
    addExerciseToBlock: 'Add exercise',
    saveAsTemplate: 'Save as template',
    startWorkout: 'Start workout',
    formatLabel: 'Format',
    builderDurationLabel: 'How long',
    focusLabel: 'Focus',
    lastTime: 'last time {0}',

    programs: 'Programs',
    programWeeks: '{0} weeks',
    programDaysPerWeek: '{0} days a week',
    programWorkingWeights: 'Working weights',
    programHowLoadGrows: 'How the load grows',
    programWeek: 'Week {0}',
    programDeload: 'deload',
    programStart: 'Start the program',
    programStop: 'Stop the program',
    programEquipmentOk: 'you have the equipment',
    programNoEquipment: 'no equipment needed',
    programEquipmentMissing: 'missing: {0} — we will find a swap',

    zoneShoulder: 'shoulder',
    zoneLowerBack: 'lower back',
    zoneKnee: 'knee',
    zoneWrist: 'wrist',
    zoneElbow: 'elbow',
    zoneImpact: 'no jumping',
    zoneSpineFlexion: 'spinal flexion',
    zoneSpineExtension: 'spinal extension',

    equip_barbell: 'with a barbell',
    equip_dumbbell: 'with dumbbells',
    equip_kettlebell: 'with a kettlebell',
    equip_machine: 'on a machine',
    equip_cable: 'on a cable',
    equip_band: 'with a band',
    equip_smith: 'in the Smith machine',
    equip_rings: 'on rings',
    equip_pullup_bar: 'on a pull-up bar',
    equip_dip_bars: 'on dip bars',
    equip_trap_bar: 'with a trap bar',
    equip_ez_bar: 'with an EZ bar',
    equip_box: 'with a box',
    equip_bench: 'on a bench',
    equip_medicine_ball: 'with a medicine ball',

    // builder blocks
    blockWarmup: 'Warm-up',
    blockMobility: 'Mobility',
    blockCooldown: 'Cool-down',
    blockMainLegs: 'A. Main — legs',
    blockMainUpper: 'B. Main — upper body',
    blockSupersetPullPush: 'C. Superset — pull/press',
    blockSupersetLegs: 'C. Superset — legs',
    blockSuperset: 'C. Superset',
    blockCore: 'Core',
    blockStrength: 'Strength part',
    blockStrengthMin: 'Strength part — {0} min',
    blockMetcon: 'Metcon',
    blockEmptyEquipment: 'No exercise matches your equipment',
    blockEmptyMetcon: 'No movements match your equipment — drop a limit or add gear in your profile.',
    noteAmrap: 'AMRAP {0} min — as many rounds as possible',
    noteEmom: 'EMOM {0} min — alternating every minute',
    noteScheme219: '21-15-9 for time',
    noteRoundsForTime: '{0} rounds for time',
    notePowerFresh: 'explosive work is done fresh — few reps, full rest',

    // set scheme
    secondsShort: '{0} s',
    restLabel: 'rest {0}',
    unitMeters: 'm',
    unitKcal: 'kcal',
    unitReps: 'reps',
    cardioApprox: '{0} {1} (rough guide, for an ~80 kg man)',

    // builder formats and focus
    formatFullbody: 'Full body',
    formatFullbodyHint: 'barbell, dumbbells, whole body',
    formatCrossfit: 'CrossFit',
    formatCrossfitHint: 'strength part + metcon',
    focusStrength: 'Strength',
    focusMass: 'Size',
    focusEndurance: 'Endurance',
    minutesShort: '{0} min',
    savedAsTemplate: 'Saved as a template',

    // exercise card
    exerciseTitle: 'Exercise',
    exerciseNotFound: 'This exercise is not in the library',
    schemeLabel: 'Scheme: {0}',
    techniqueTitle: 'Technique',
    watchVideo: 'Watch a video',
    sameButTitle: 'Same, but…',
    myHistoryTitle: 'My history',
    bestE1rm: 'Best estimated 1RM: {0} kg',
    nextStepNote: 'the next step',
    bodyweightLabel: 'bodyweight',
    setsShort: '{0} sets × {1}',
    weightByReps: '{0} kg × {1}',
    levelEasy: 'easy',
    levelMedium: 'intermediate',
    levelHard: 'hard',
    intentMaxStrength: 'for strength',
    intentHypertrophy: 'for size',
    intentPower: 'for power',
    intentConditioning: 'for conditioning',
    intentIsometric: 'holds',
    intentMobility: 'mobility',

    // program screens
    programTitle: 'Program',
    programNotFound: 'Program not found',
    programsIntro: 'A program runs week by week and raises the load for you. Pick one — the home screen will then always show what to do today.',
    programActive: 'active',
    programWorkoutsTotal: '{0} workouts',
    programFocusStrength: 'strength',
    programFocusMass: 'size',
    programFocusEndurance: 'endurance',
    programMissingEquipment: 'Missing: {0}. You can swap the exercise right inside the workout.',
    programWeightsHint: 'Where we start from. Filled in from your history — correct it if it does not match. An empty field means “I go by feel”.',
    programByWeeks: '{0} week by week',
    programWeekSection: 'The week',
    programNextWorkout: 'Go to the next workout',
    programFinished: '{0} completed',
    programPickNext: 'Pick the next program →',
    programCardDay: 'Week {0} · {1}',

    // sources and terms
    attributionTitle: 'Sources and terms',
    attrImagesTitle: 'Exercise artwork',
    attrImagesText: '{0} exercises, {1} frames. Artwork by Bryl Lim, the Workout Guide project, based on Everkinetic. All under the CC BY-SA 4.0 licence.',
    attrAuthorLink: 'Author — bryllim.com',
    attrSourceLink: 'Source — bryllim/workout-guide',
    attrBaseLink: 'Original — everkinetic/data',
    attrLicenseLink: 'CC BY-SA 4.0 licence',
    attrChangesTitle: 'What we changed',
    attrChange1: '512×512 PNGs converted to 256 px WebP so the app stays small',
    attrChange2: 'only frames for exercises in the Hart library were kept',
    attrChange3: 'files renamed to the “slug-frame number” pattern',
    attrFoodTitle: 'Food data',
    attrFoodText: 'Barcode search pulls data from Open Food Facts — an open database filled in by people around the world. It is published under the ODbL licence: you may use it as long as you credit the source.',
    attrOdblLink: 'ODbL 1.0 licence',
    attrMedicalTitle: 'This is not medical advice',
    attrMedicalText: 'The app counts and suggests, but it does not know your health. AI coach advice, set schemes and calorie estimates are a guide, not a doctor’s prescription. Sharp or lasting pain, chronic conditions, pregnancy, recovery from injury — those are reasons to talk to a doctor first, not to an app.',
    attrShareTitle: 'Sharing terms',
    attrShareText: 'The licence requires derivative work to be shared on the same terms, so our reworked images are CC BY-SA 4.0 as well. The full list is in assets/exercises/ATTRIBUTION.md in the app repository.',
    subsEmptyBodyweight: 'There is no similar bodyweight exercise. Try lifting the equipment limit.',
    subsEmptyZones: 'With those limits we found nothing similar. Drop one of them, or skip this exercise today.',
    subsEmptyNothing: 'There is no similar exercise in the library.',
    myExerciseTag: 'my exercise',
    levelMediumShort: 'intermediate',
    repsShort: '{0} reps',
    providerSwitchGeo: '{0} does not answer from your network — asking {1}',
    providerSwitch: '{0} is not answering — asking {1}',

    // days of the week (0 = Sunday, as in Date.getDay)
    dayName: (i: number) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i] ?? '',
    dayShort: (i: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i] ?? '',

    // plan screen
    weeklySchedule: 'Weekly schedule',
    todayTag: 'today',
    planCreatedOn: 'Made on {0}',
    startByPlan: 'Start the planned workout',
    planEmptyHint: 'Open the Coach tab, tap “Build a training plan” and save the AI answer',
    setsCount: '{0} sets',
    wtStrength: 'Strength',
    wtCardio: 'Cardio',
    wtCrossfit: 'CrossFit',
    wtHiit: 'HIIT',
    wtYoga: 'Yoga',
    wtRecovery: 'Recovery',
    wtRun: 'Run',
    wtCycling: 'Cycling',
    wtSwimming: 'Swimming',
    wtCustom: 'As planned',

    // home screen: readiness and wellbeing
    greetingHi: 'Hi, {0} 👋',
    athleteFallback: 'Athlete',
    swappedForEquipment: 'Swapped exercises to fit your equipment',
    permissionDenied: 'Permission denied',
    permissionWaterText: 'Allow notifications in your phone settings to get water reminders.',
    tomorrow: 'tomorrow',
    inDaysOn: 'in {0} days — {1}',
    buildShort: 'Build',
    buildMyself: 'Build it myself',
    aiProgramBtn: 'AI program',
    readinessTitle: 'Readiness',
    recoveryRest: 'Rest',
    recoveryEasy: 'Easy',
    recoveryModerate: 'Moderate',
    recoveryHard: 'Hard',
    recoveryPeak: 'Peak',
    recoveryRestSub: 'Your body needs a rest',
    recoveryEasySub: 'Light cardio or yoga would suit',
    recoveryModerateSub: 'You can train at a moderate pace',
    recoveryHardSub: 'Ready for a hard session',
    recoveryPeakSub: 'Great shape — go all in!',
    wellbeingToday: 'How you feel today',
    wellbeingHint: 'How did you sleep? How do you feel? — it shapes your readiness',
    wellbeingSummary: '{0}  Sleep: {1}h  ·  Stress: {2}',
    sleepHoursLabel: 'Sleep (hours)',
    stressLabel: 'Stress',
    stressNone: 'None',
    stressLow: 'Low',
    stressMid: 'Medium',
    stressHigh: 'High',
    stressMax: 'Very high',
    tabToday: 'Today',
    tabJournal: 'Journal',
    tabProgress: 'Progress',
    tabTrainer: 'Coach',
    tabNutrition: 'Nutrition',
    tabGoals: 'Goals',
    noPlanHint: 'Ask the AI for a program — or build a workout yourself, no internet needed',
    reminderTime: 'Reminder hours',
    startLabel: 'Start',
    endLabel: 'End',
    remindersSpread: 'Reminders will be spread evenly between {0}:00 and {1}:00',
    howDoYouFeel: 'How do you feel?',
    moodLabel: 'Mood',
    mergeSuperset: 'Merge',
    markTwoExercises: 'Mark 2+ exercises',
    pickDate: 'Pick a date',
    selectedCount: 'Selected: {0}',
    nextWorkoutOn: 'Next workout: {0}',
    programStartedTitle: 'Program started',
    programStartedText: 'The next workout will show up on the home screen.',
    programReplaceTitle: 'Replace the active program?',
    programReplaceText: 'Its current progress will be lost. You cannot run two programs at once.',
    programReplace: 'Replace',
    programStopTitle: 'Stop the program?',
    programStopText: 'Its progress will be erased.',
    programStopBtn: 'Stop',
    programHintDeload: 'deload week — lighter on purpose',
    programHintBackoff: 'weight rolled back after a week that did not go',
    kgUnit: 'kg',
    weightKg: '{0} kg',
    ok: 'OK',

    // exercise name recognition
    unresolvedTitle: 'Exercise recognition',
    unresolvedTab: 'Unrecognised',
    linksTab: 'Links',
    recordsPlural: (n: number) => (n === 1 ? 'record' : 'records'),
    recognizedSummary: 'of names recognised automatically ({0} of {1}).',
    recognizedRest: ' Tell us the rest — it is a one-off job.',
    recognizedAllDone: ' All sorted.',
    confidenceAmbiguous: 'several options',
    confidenceFuzzy: 'looks like',
    confidenceNone: 'not recognised',
    thatsIt: 'That is it: {0}',
    pickAnother: 'Pick another',
    allNamesResolved: 'Every name is recognised',
    nothingLinkedYet: 'Nothing linked yet',
    linkOrphan: 'the exercise is gone — this link does nothing',
    unlinkBtn: 'Unlink',
    whatIsThis: '“{0}” is…',
    backupFirstTitle: 'Make a backup first?',
    backupFirstText: 'Linking changes how progress and calories are counted across your whole history. The records stay intact, but a copy is worth having.',
    skipBtn: 'Skip',
    saveBackupBtn: 'Save a copy',
    linkNameTitle: 'Link this name?',
    linkNameText: '“{0}” → {1}\n\nAffects {2}. The name in your records stays as it is — you can unlink any time.',
    linkBtn: 'Link',
    createCustomText: 'Create “{0}” as your own exercise and link {1} to it?',
    createBtn: 'Create',
    unlinkTitle: 'Unlink?',
    unlinkText: '“{0}” becomes an unrecognised name again.',
  },
};

// ─── useLocale HOOK ───────────────────────────────────────────────────────────

function format(lang: Lang, key: string, args: any[]): string {
  const val = translations[lang][key];
  if (val === undefined) return key;
  if (typeof val === 'function') return val(...args);
  // Підстановка {0}, {1}… — щоб фразу можна було зібрати з частин, не
  // склеюючи рядки в коді: у різних мовах порядок слів різний.
  if (args.length === 0) return val;
  return val.replace(/\{(\d+)\}/g, (whole: string, i: string) => (
    args[Number(i)] !== undefined ? String(args[Number(i)]) : whole
  ));
}

/** Переклад конкретною мовою — для тестів і для коду поза React-деревом. */
/**
 * Локаль дат під мову інтерфейсу.
 *
 * date-fns форматує «19 вересня» чи «September 19» сам — треба лише дати йому
 * правильну локаль, інакше англійський екран показує українську дату.
 */
export function dateLocale(lang: Lang = _lang): Locale {
  return lang === 'en' ? enUS : uk;
}

export function tFor(lang: Lang): TFn {
  return (key, ...args) => format(lang, key, args);
}

/** Переклад поточною мовою інтерфейсу (AI-запит, фонові задачі). */
export const translate: TFn = (key, ...args) => format(_lang, key, args);

export function useLocale() {
  const [lang, setLangState] = useState<Lang>(_lang);
  const [exerciseLang, setExerciseLangState] = useState<Lang>(_exerciseLang);

  useEffect(() => {
    const unsub = subscribe(() => {
      setLangState(_lang);
      setExerciseLangState(_exerciseLang);
    });
    return unsub;
  }, []);

  const t: TFn = (key, ...args) => format(lang, key, args);

  return {
    lang,
    exerciseLang,
    t,
    setLanguage,
    setExerciseLanguage,
  };
}
