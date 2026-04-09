import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

export type Lang = 'uk' | 'en';

const STORAGE_KEY = '@alpha_trainer:language';

let _lang: Lang = 'uk';
const _subscribers: Array<(lang: Lang) => void> = [];

export async function loadLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'uk' || stored === 'en') {
      _lang = stored;
    }
  } catch {
    // default to uk
  }
}

export function getCurrentLang(): Lang {
  return _lang;
}

export async function setLanguage(lang: Lang): Promise<void> {
  _lang = lang;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  _subscribers.forEach((fn) => fn(lang));
}

function subscribe(fn: (lang: Lang) => void): () => void {
  _subscribers.push(fn);
  return () => {
    const i = _subscribers.indexOf(fn);
    if (i >= 0) _subscribers.splice(i, 1);
  };
}

// ─── TRANSLATIONS ────────────────────────────────────────────────────────────

type StringValue = string | ((...args: any[]) => string);

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
  },
};

// ─── useLocale HOOK ───────────────────────────────────────────────────────────

export function useLocale() {
  const [lang, setLangState] = useState<Lang>(_lang);

  useEffect(() => {
    const unsub = subscribe((l) => setLangState(l));
    return unsub;
  }, []);

  function t(key: string, ...args: any[]): string {
    const val = translations[lang][key];
    if (val === undefined) return key;
    if (typeof val === 'function') return val(...args);
    return val;
  }

  async function changeLang(l: Lang) {
    await setLanguage(l);
  }

  return { lang, t, setLanguage: changeLang };
}
