/**
 * Мова назв вправ.
 *
 * Бібліотека тепер україномовна, тож і назви за замовчуванням мають бути
 * українські — англійська лишається вибором, а не тим, що дістається новому
 * користувачу мовчки.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentExerciseLang, getCurrentLang, loadLanguage } from '../services/i18n';

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
