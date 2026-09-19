/**
 * Сервіси не пишуть текст словами.
 *
 * Це головне правило двомовності: конструктор, заміни й програми повертають
 * коди й числа, а фразу збирає екран через t(). Якщо хтось знову вкладе
 * готовий український рядок у результат сервісу — English-інтерфейс наполовину
 * стане українським, і цей тест впаде першим.
 */
import { tFor } from '../services/i18n';
import {
  BlockNoteCode, blockEmptyText, blockNoteText, blockTitleText, draftToExercises,
  generateWorkout,
} from '../services/builder';
import {
  cautionText, findSubstitutions, reasonText, subsEmptyText,
} from '../services/substitutions';
import {
  cardioAmountText, convertCardio, formatPrescription, prescribe,
} from '../services/prescriptions';
import { PROGRAMS } from '../services/programs/data';
import { prescriptionFor, progressionPreview, programDayToExercises } from '../services/programs/engine';
import { cuesOf, getExercise, modificationsOf } from '../services/library';

const CYRILLIC = /[А-Яа-яЇїІіЄєҐґ]/;
const uk = tFor('uk');
const en = tFor('en');

const ex = (id: string) => getExercise(id)!;

describe('конструктор не повертає готового тексту', () => {
  const drafts = [
    generateWorkout({ format: 'fullbody', durationMin: 60, focus: 'strength' }, 1),
    generateWorkout({ format: 'fullbody', durationMin: 30, focus: 'hypertrophy' }, 7),
    generateWorkout({ format: 'crossfit', durationMin: 45 }, 3),
    generateWorkout({ format: 'crossfit', durationMin: 60 }, 11),
  ];

  it('назви, примітки й причини порожнечі — лише коди', () => {
    for (const d of drafts) {
      for (const b of d.blocks) {
        const codes = JSON.stringify([b.title, b.note, b.emptyReason]);
        expect(codes).not.toMatch(CYRILLIC);
      }
    }
  });

  it('англійський інтерфейс збирає ті самі блоки без кирилиці', () => {
    for (const d of drafts) {
      for (const b of d.blocks) {
        expect(blockTitleText(b.title, en)).not.toMatch(CYRILLIC);
        if (b.note) expect(blockNoteText(b.note, en)).not.toMatch(CYRILLIC);
        if (b.emptyReason) expect(blockEmptyText(b.emptyReason, en)).not.toMatch(CYRILLIC);
      }
    }
  });

  it('українською ті самі коди дають український текст', () => {
    const metcon = drafts[2].blocks.find((b) => b.role === 'metcon');
    expect(metcon).toBeDefined();
    expect(blockTitleText(metcon!.title, uk)).toBe('Метокон');
    expect(blockTitleText(metcon!.title, en)).toBe('Metcon');
  });

  it('нотатка блоку потрапляє в запис мовою, якою її склали', () => {
    const d = drafts[2];
    const noteBlock = d.blocks.find((b) => b.note);
    expect(noteBlock).toBeDefined();
    const enLogs = draftToExercises(d, (n: BlockNoteCode) => blockNoteText(n, en));
    const withNote = enLogs.filter((l) => l.notes);
    expect(withNote.length).toBeGreaterThan(0);
    for (const l of withNote) expect(l.notes!).not.toMatch(CYRILLIC);

    // без форматувальника нотатки просто немає — жодної «мови за замовчуванням»
    expect(draftToExercises(d).every((l) => !l.notes)).toBe(true);
  });
});

describe('заміни не повертають готового тексту', () => {
  const result = findSubstitutions({
    exercise: ex('back_squat'),
    protectZones: ['knee'],
    maxEasier: 5,
    maxVariations: 5,
  });
  const all = [...result.easier, ...result.variations];

  it('варіанти знайшлися', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it('причина й застереження — коди без слів', () => {
    for (const o of all) {
      expect(JSON.stringify([o.reasonCode, o.cautionCode])).not.toMatch(CYRILLIC);
    }
  });

  it('англійський підпис не містить кирилиці, український — містить', () => {
    for (const o of all) {
      expect(reasonText(o.reasonCode, en)).not.toMatch(CYRILLIC);
      expect(reasonText(o.reasonCode, uk)).toMatch(CYRILLIC);
      if (o.cautionCode) {
        expect(cautionText(o.cautionCode, en)).not.toMatch(CYRILLIC);
      }
    }
  });
});

describe('приписи й кардіо', () => {
  it('схема підходів перекладається', () => {
    const p = prescribe(ex('back_squat'), 'strength', 'main');
    expect(formatPrescription(p, en)).not.toMatch(CYRILLIC);
    expect(formatPrescription(p, uk)).toMatch(CYRILLIC);
  });

  it('вправи на час теж', () => {
    const p = prescribe(ex('plank'));
    expect(formatPrescription(p, en)).not.toMatch(CYRILLIC);
  });

  it('конверсія кардіо віддає число й одиницю, а не фразу', () => {
    const c = convertCardio(ex('run'), ex('row_erg'), { distanceKm: 0.8 })!;
    expect(JSON.stringify(c)).not.toMatch(CYRILLIC);
    expect(cardioAmountText(c.amount, en)).not.toMatch(CYRILLIC);
  });
});

describe('програми', () => {
  it('підказка тижня — код, а не речення', () => {
    for (const template of PROGRAMS) {
      for (let week = 1; week <= template.weeks; week++) {
        for (const slot of template.days[0].slots) {
          const p = prescriptionFor(template, slot, week, 100, 1);
          expect(JSON.stringify(p.hint ?? null)).not.toMatch(CYRILLIC);
        }
      }
    }
  });

  it('прев’ю прогресії — числа, а не підписи', () => {
    for (const template of PROGRAMS) {
      expect(JSON.stringify(progressionPreview(template, 100))).not.toMatch(CYRILLIC);
    }
  });

  it('день програми бере назви вправ з бібліотеки', () => {
    const template = PROGRAMS[0];
    const logs = programDayToExercises(template, template.days[0], 1, {});
    expect(logs.length).toBeGreaterThan(0);
    // назва вправи — з бібліотеки, тож мова залежить від налаштування вправ
    for (const l of logs) expect(l.exerciseId).toBeTruthy();
  });
});

describe('підказки техніки', () => {
  // найуживаніші рухи мають англійські підказки: саме їх бачить людина в залі
  const common = ['back_squat', 'deadlift', 'bench_press', 'pull_up', 'burpee', 'kb_swing'];

  it('базові вправи мають техніку англійською', () => {
    for (const id of common) {
      const cues = cuesOf(ex(id), 'en');
      expect(cues.length).toBeGreaterThan(0);
      for (const c of cues) expect(c).not.toMatch(CYRILLIC);
    }
  });

  it('українська лишається українською', () => {
    for (const id of common) {
      expect(cuesOf(ex(id), 'uk').join(' ')).toMatch(CYRILLIC);
    }
  });

  it('вправа без англійських підказок відкочується на українські', () => {
    const withoutEn = ['back_squat', 'deadlift'].map((id) => ex(id));
    // сам відкіт перевіряємо на вправі, якої немає в перекладеному списку
    const rare = ex('wall_ball');
    expect(cuesOf(rare, 'en')).toEqual(rare.cues);
    expect(withoutEn.every((e) => cuesOf(e, 'en') !== e.cues)).toBe(true);
  });

  it('варіанти виконання не показуємо чужою мовою', () => {
    const squat = ex('back_squat');
    expect(modificationsOf(squat, 'uk').join(' ')).toMatch(CYRILLIC);
    expect(modificationsOf(squat, 'en').join(' ')).not.toMatch(CYRILLIC);
    // якщо перекладу немає — краще порожньо, ніж кирилиця в English-режимі
    for (const e of [ex('air_squat'), ex('plank')]) {
      expect(modificationsOf(e, 'en').join(' ')).not.toMatch(CYRILLIC);
    }
  });
});

describe('порожній результат заміни', () => {
  it('пояснення теж код', () => {
    const result = findSubstitutions({
      exercise: ex('back_squat'),
      availableEquipment: [],
      protectZones: ['knee', 'lower_back', 'impact'],
    });
    if (result.emptyReason) {
      expect(JSON.stringify(result.emptyReason)).not.toMatch(CYRILLIC);
      expect(subsEmptyText(result.emptyReason, en)).not.toMatch(CYRILLIC);
      expect(subsEmptyText(result.emptyReason, uk)).toMatch(CYRILLIC);
    }
  });
});
