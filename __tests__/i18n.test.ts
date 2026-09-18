/**
 * Мова назв вправ.
 *
 * Бібліотека тепер україномовна, тож і назви за замовчуванням мають бути
 * українські — англійська лишається вибором, а не тим, що дістається новому
 * користувачу мовчки.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentExerciseLang, getCurrentLang, loadLanguage } from '../services/i18n';
import { exerciseName, getExercise } from '../services/library';
import { draftToExercises, generateWorkout } from '../services/builder';
import { GYM_PRESET } from '../services/equipment';

const EX_KEY = '@alpha_trainer:exercise_language';

describe('мова за замовчуванням', () => {
  it('без збереженого вибору назви вправ українською', async () => {
    await AsyncStorage.removeItem(EX_KEY);
    await loadLanguage();
    expect(getCurrentExerciseLang()).toBe('uk');
  });

  it('мова інтерфейсу теж українська', async () => {
    await AsyncStorage.clear();
    await loadLanguage();
    expect(getCurrentLang()).toBe('uk');
  });

  it('збережений вибір користувача сильніший за замовчування', async () => {
    await AsyncStorage.setItem(EX_KEY, 'en');
    await loadLanguage();
    expect(getCurrentExerciseLang()).toBe('en');
  });

  it('сміття в сховищі не ламає мову', async () => {
    await AsyncStorage.setItem(EX_KEY, 'клінгонська');
    await loadLanguage();
    expect(['uk', 'en']).toContain(getCurrentExerciseLang());
  });
});

describe('назви вправ мовою користувача', () => {
  it('українською за замовчуванням', async () => {
    await AsyncStorage.removeItem(EX_KEY);
    await loadLanguage();
    expect(exerciseName(getExercise('back_squat')!)).toBe('Присідання зі штангою на спині');
  });

  it('англійською, якщо так обрано — саме цього й хоче зал', async () => {
    await AsyncStorage.setItem(EX_KEY, 'en');
    await loadLanguage();
    expect(exerciseName(getExercise('back_squat')!)).toBe('Back Squat');
  });

  it('мову можна задати явно, не чіпаючи налаштування', () => {
    const ex = getExercise('deadlift')!;
    expect(exerciseName(ex, 'uk')).toBe('Станова тяга');
    expect(exerciseName(ex, 'en')).toBe('Deadlift');
  });

  it('вправи з конструктора потрапляють у запис обраною мовою', async () => {
    await AsyncStorage.setItem(EX_KEY, 'en');
    await loadLanguage();
    const draft = generateWorkout({ format: 'fullbody', durationMin: 30, equipment: GYM_PRESET });
    const names = draftToExercises(draft).map((l) => l.name);
    // англійські назви — латиницею
    expect(names.every((n) => /[A-Za-z]/.test(n))).toBe(true);
    await AsyncStorage.setItem(EX_KEY, 'uk');
    await loadLanguage();
  });
});
