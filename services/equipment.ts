// Обладнання користувача в термінах бібліотеки (ТЗ F8.3).
//
// У профілі роками лежать рядки українською («Штанга», «Тренажерний зал»).
// Ламати їх не можна: на них дивиться AI-тренер і старі екрани. Тому старе поле
// лишається, а поруч з'являється `equipmentIds` — з нього фільтруються заміни
// й конструктор. Якщо нового поля ще немає, воно виводиться зі старого.

import { Equipment } from './library/types';
import { UserProfile } from '../types';

/** Звичайний комерційний зал. */
export const GYM_PRESET: Equipment[] = [
  'barbell', 'dumbbell', 'ez_bar', 'plate', 'bench', 'cable', 'machine', 'smith',
  'pullup_bar', 'dip_bars', 'treadmill',
];

/** Кросфіт-бокс: зал плюс снаряди для метоконів. */
export const CROSSFIT_PRESET: Equipment[] = [
  ...GYM_PRESET,
  'kettlebell', 'box', 'wall_ball', 'wall', 'rings', 'band',
  'rower', 'air_bike', 'ski_erg', 'jump_rope', 'medicine_ball',
];

/** Домашній мінімум. */
export const HOME_PRESET: Equipment[] = ['dumbbell', 'band', 'jump_rope'];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Штанга', dumbbell: 'Гантелі', kettlebell: 'Гирі', ez_bar: 'EZ-гриф',
  trap_bar: 'Трап-гриф', plate: 'Млинці', cable: 'Блок', machine: 'Тренажери',
  smith: 'Сміт', bench: 'Лава', box: 'Тумба', wall: 'Стіна',
  pullup_bar: 'Турнік', dip_bars: 'Бруси', rings: 'Кільця', band: 'Резинка',
  ab_wheel: 'Ролик', medicine_ball: 'Медбол', wall_ball: 'Воллбол',
  rower: 'Гребний', bike: 'Велосипед', air_bike: 'Air bike', ski_erg: 'Лижний',
  treadmill: 'Доріжка', jump_rope: 'Скакалка', sled: 'Сани', stick: 'Палиця',
  pool: 'Басейн',
};

/** Ті самі назви англійською: екран профілю й картка вправи мають обидві мови. */
export const EQUIPMENT_LABELS_EN: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbells', kettlebell: 'Kettlebells', ez_bar: 'EZ bar',
  trap_bar: 'Trap bar', plate: 'Plates', cable: 'Cable', machine: 'Machines',
  smith: 'Smith machine', bench: 'Bench', box: 'Box', wall: 'Wall',
  pullup_bar: 'Pull-up bar', dip_bars: 'Dip bars', rings: 'Rings', band: 'Band',
  ab_wheel: 'Ab wheel', medicine_ball: 'Medicine ball', wall_ball: 'Wall ball',
  rower: 'Rower', bike: 'Bike', air_bike: 'Air bike', ski_erg: 'SkiErg',
  treadmill: 'Treadmill', jump_rope: 'Jump rope', sled: 'Sled', stick: 'Stick',
  pool: 'Pool',
};

/** Назва снаряда мовою інтерфейсу. */
export function equipmentLabel(e: Equipment, lang: 'uk' | 'en' = 'uk'): string {
  return (lang === 'en' ? EQUIPMENT_LABELS_EN[e] : EQUIPMENT_LABELS[e]) ?? e;
}

/** Перелік через кому — «штанга, лава» під карткою вправи. */
export function equipmentList(list: Equipment[], lang: 'uk' | 'en' = 'uk'): string {
  return list.map((e) => equipmentLabel(e, lang)).join(', ');
}

/** Групи для екрана профілю. */
export const EQUIPMENT_GROUPS: { title: string; items: Equipment[] }[] = [
  { title: 'Вільна вага', items: ['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'trap_bar', 'plate', 'bench'] },
  { title: 'Тренажери', items: ['machine', 'cable', 'smith', 'sled'] },
  { title: 'Гімнастика', items: ['pullup_bar', 'dip_bars', 'rings', 'band', 'box', 'wall', 'ab_wheel'] },
  { title: 'Кардіо й метокон', items: ['rower', 'ski_erg', 'air_bike', 'bike', 'treadmill', 'jump_rope', 'pool', 'wall_ball', 'medicine_ball', 'stick'] },
];

/** Старі рядки профілю → обладнання бібліотеки (F8.3). */
const LEGACY: Record<string, Equipment[]> = {
  'штанга': ['barbell', 'plate'],
  'гантелі': ['dumbbell'],
  'гирі': ['kettlebell'],
  'турнік': ['pullup_bar'],
  'брусся': ['dip_bars'],
  'бруси': ['dip_bars'],
  'еспандер': ['band'],
  'резинка': ['band'],
  'скакалка': ['jump_rope'],
  'бігова доріжка': ['treadmill'],
  'тренажерний зал': GYM_PRESET,
  'кросфіт-зал': CROSSFIT_PRESET,
  'лише власна вага': [],
};

/**
 * Обладнання профілю у вигляді списку бібліотеки.
 *
 * `undefined` означає «не знаємо» — тоді фільтр не застосовується взагалі, бо
 * порожній список означав би «нічого немає», і заміни б зникли в користувача,
 * який просто не заповнював профіль.
 */
export function equipmentOf(profile: UserProfile | null | undefined): Equipment[] | undefined {
  if (!profile) return undefined;
  if (profile.equipmentIds) return profile.equipmentIds;
  const legacy = profile.equipment;
  if (!legacy || legacy.length === 0) return undefined;

  const out = new Set<Equipment>();
  let known = false;
  for (const raw of legacy) {
    const mapped = LEGACY[raw.toLowerCase().trim()];
    if (!mapped) continue;
    known = true;
    for (const eq of mapped) out.add(eq);
  }
  // «Лише власна вага» — це осмислений порожній список, а не «не знаємо»
  if (!known) return undefined;
  return [...out];
}

/** Чи вибрав користувач рівно пресет — щоб підсвітити кнопку в профілі. */
export function matchesPreset(ids: Equipment[], preset: Equipment[]): boolean {
  if (ids.length !== preset.length) return false;
  const set = new Set(ids);
  return preset.every((e) => set.has(e));
}
