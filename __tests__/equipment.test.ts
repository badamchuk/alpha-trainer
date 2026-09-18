/**
 * Обладнання профілю (ТЗ F8.3).
 *
 * Ключове: у користувача вже є заповнений профіль зі старими рядками, і він
 * має працювати без жодних дій з його боку.
 */
import { CROSSFIT_PRESET, GYM_PRESET, equipmentOf, matchesPreset } from '../services/equipment';
import { UserProfile } from '../types';

const profile = (over: Partial<UserProfile>): UserProfile => ({
  name: 'Тест', age: 35, weight: 100, height: 185, fitnessLevel: 'intermediate',
  availableDays: [1, 3, 5], equipment: [], geminiApiKey: '', onboardingComplete: true,
  ...over,
});

describe('обладнання профілю', () => {
  it('старі рядки перетворюються на список бібліотеки', () => {
    const ids = equipmentOf(profile({ equipment: ['Штанга', 'Гантелі', 'Турнік'] }))!;
    expect(ids).toEqual(expect.arrayContaining(['barbell', 'dumbbell', 'pullup_bar']));
    expect(ids).not.toContain('machine');
  });

  it('«Тренажерний зал» розгортається в пресет', () => {
    const ids = equipmentOf(profile({ equipment: ['Тренажерний зал'] }))!;
    expect(matchesPreset(ids, GYM_PRESET)).toBe(true);
  });

  it('«Лише власна вага» — це порожній список, а не «невідомо»', () => {
    expect(equipmentOf(profile({ equipment: ['Лише власна вага'] }))).toEqual([]);
  });

  it('порожній профіль не фільтрує нічого', () => {
    expect(equipmentOf(profile({ equipment: [] }))).toBeUndefined();
    expect(equipmentOf(null)).toBeUndefined();
  });

  it('невідомі рядки не перетворюються на «нічого немає»', () => {
    expect(equipmentOf(profile({ equipment: ['Щось своє'] }))).toBeUndefined();
  });

  it('нове поле має пріоритет над старим', () => {
    const p = profile({ equipment: ['Тренажерний зал'], equipmentIds: ['dumbbell'] });
    expect(equipmentOf(p)).toEqual(['dumbbell']);
  });

  it('кросфіт-пресет ширший за зал', () => {
    expect(CROSSFIT_PRESET.length).toBeGreaterThan(GYM_PRESET.length);
    expect(CROSSFIT_PRESET).toEqual(expect.arrayContaining(GYM_PRESET));
  });
});
