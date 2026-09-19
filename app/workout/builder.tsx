// Конструктор тренування (ТЗ F5.7).
//
// Екран тонкий: усе, що вирішує, яка вправа куди піде, лежить у services/builder.ts
// і покрите тестами. Тут — вибір формату, показ блоків і дії над ними.

import { useCallback, useEffect, useState } from 'react';
import { exerciseName } from '../../services/library';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import ExerciseImage from '../../components/ExerciseImage';
import ExerciseHowTo from '../../components/ExerciseHowTo';
import SubstitutionSheet from '../../components/SubstitutionSheet';
import LibraryPicker from '../../components/LibraryPicker';
import {
  BuilderDuration, BuilderFormat, WorkoutDraft, blockEmptyText, blockNoteText,
  blockTitleText, draftFromStored, draftToExercises, draftToStored, estimateMinutes,
  generateWorkout, recentMainIds, replaceInDraft,
} from '../../services/builder';
import { useLocale } from '../../services/i18n';
import { Focus, formatPrescription, prescribe } from '../../services/prescriptions';
import { familiarityFrom } from '../../services/substitutions';
import { equipmentOf } from '../../services/equipment';
import {
  LastResult, formatLastResult, lastResults, recentExerciseIds,
} from '../../services/analytics';
import { buildResolver } from '../../services/exerciseLinks';
import { getUserProfile, getWorkouts } from '../../services/storage';
import { saveTemplate } from '../../services/templates';
import { LibraryExercise } from '../../services/library/types';
import type { ExerciseResolver } from '../../services/exerciseMatch';
import { Equipment, JointZone, Level } from '../../services/library/types';

const DRAFT_KEY = '@alpha_trainer:builder_draft';

const FORMATS: { id: BuilderFormat; key: string; hintKey: string }[] = [
  { id: 'fullbody', key: 'formatFullbody', hintKey: 'formatFullbodyHint' },
  { id: 'crossfit', key: 'formatCrossfit', hintKey: 'formatCrossfitHint' },
];
const DURATIONS: BuilderDuration[] = [30, 45, 60];
const FOCUSES: { id: Focus; key: string }[] = [
  { id: 'strength', key: 'focusStrength' },
  { id: 'hypertrophy', key: 'focusMass' },
  { id: 'endurance', key: 'focusEndurance' },
];

const LEVEL_BY_FITNESS: Record<string, Level> = {
  beginner: 1, intermediate: 2, advanced: 3,
};

export default function BuilderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [format, setFormat] = useState<BuilderFormat>('fullbody');
  const [duration, setDuration] = useState<BuilderDuration>(45);
  const [focus, setFocus] = useState<Focus>('hypertrophy');
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const { t } = useLocale();

  const [equipment, setEquipment] = useState<Equipment[] | undefined>(undefined);
  const [protectZones, setProtectZones] = useState<JointZone[]>([]);
  const [level, setLevel] = useState<Level>(2);
  const [familiarity, setFamiliarity] = useState<Map<string, number>>(new Map());
  const [resolver, setResolver] = useState<ExerciseResolver | undefined>(undefined);
  // «не повторювати» — основні вправи минулих тренувань цього формату
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // «нещодавні» для швидкого вибору — просто останні вправи користувача
  const [pickerRecent, setPickerRecent] = useState<string[]>([]);
  // «минулого разу 80 кг × 5» — щоб не згадувати робочу вагу
  const [last, setLast] = useState<Map<string, LastResult>>(new Map());

  // заміна й додавання
  const [subs, setSubs] = useState<{ blockIdx: number; exIdx: number; ex: LibraryExercise } | null>(null);
  const [addTo, setAddTo] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [profile, workouts, res, storedRaw] = await Promise.all([
        getUserProfile(), getWorkouts(), buildResolver(), AsyncStorage.getItem(DRAFT_KEY),
      ]);
      setEquipment(equipmentOf(profile));
      setProtectZones(profile?.protectZones ?? []);
      setLevel(LEVEL_BY_FITNESS[profile?.fitnessLevel ?? 'intermediate'] ?? 2);
      setResolver(() => res);
      setFamiliarity(familiarityFrom(workouts.flatMap((w) => w.exercises ?? []), res));
      setPickerRecent(recentExerciseIds(workouts, res));
      setLast(lastResults(workouts, res));

      if (storedRaw) {
        try {
          const stored = JSON.parse(storedRaw);
          setFormat(stored.format);
          setDuration(stored.durationMin);
          if (stored.focus) setFocus(stored.focus);
          setSeed(stored.seed);
          setAttempt(stored.attempt);
          setDraft(draftFromStored(stored));
        } catch {
          await AsyncStorage.removeItem(DRAFT_KEY);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  const build = useCallback((nextAttempt = 0, nextSeed = seed) => {
    const input = {
      format, durationMin: duration, focus, equipment, protectZones, level, familiarity,
      recentIds,
    };
    const d = generateWorkout(input, nextSeed, nextAttempt);
    setDraft(d);
    setAttempt(nextAttempt);
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftToStored(d, nextSeed, nextAttempt)))
      .catch(() => {});
  }, [format, duration, focus, equipment, protectZones, level, familiarity, recentIds, seed]);

  async function handleGenerate() {
    if (resolver) {
      const workouts = await getWorkouts();
      setRecentIds(recentMainIds(workouts, format, resolver));
    }
    build(0, seed);
  }

  function persist(next: WorkoutDraft) {
    const withTime = { ...next, estimatedMinutes: estimateMinutes(next.blocks) };
    setDraft(withTime);
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftToStored(withTime, seed, attempt)))
      .catch(() => {});
  }

  function replaceExercise(blockIdx: number, exIdx: number, next: LibraryExercise) {
    if (!draft) return;
    persist(replaceInDraft(draft, blockIdx, exIdx, next, focus));
  }

  function removeExercise(blockIdx: number, exIdx: number) {
    if (!draft) return;
    const blocks = draft.blocks.map((b, i) => (i !== blockIdx ? b : {
      ...b, exercises: b.exercises.filter((_, j) => j !== exIdx),
    }));
    persist({ ...draft, blocks });
  }

  function addExercise(blockIdx: number, ex: LibraryExercise) {
    if (!draft) return;
    const block = draft.blocks[blockIdx];
    const role = block.role === 'strength' ? 'main' : 'accessory';
    const blocks = draft.blocks.map((b, i) => (i !== blockIdx ? b : {
      ...b,
      emptyReason: undefined,
      exercises: [...b.exercises, {
        exercise: ex,
        prescription: prescribe(ex, focus, role),
        supersetId: b.exercises[0]?.supersetId,
      }],
    }));
    persist({ ...draft, blocks });
  }

  async function startWorkout() {
    if (!draft) return;
    // чернетку кладемо в сховище, а не в параметри маршруту: вправ може бути
    // десяток із підходами, і в URL це не влазить
    await AsyncStorage.setItem('@alpha_trainer:builder_started', JSON.stringify({
      workoutType: draft.workoutType,
      duration: draft.estimatedMinutes,
      exercises: draftToExercises(draft, (n) => blockNoteText(n, t)),
    }));
    await AsyncStorage.removeItem(DRAFT_KEY);
    router.push('/workout/log?fromBuilder=1');
  }

  async function handleSaveTemplate() {
    if (!draft) return;
    const minutes = t('minutesShort', draft.durationMin);
    const focusLabel = FOCUSES.find((f) => f.id === draft.focus)?.key;
    const name = draft.format === 'crossfit'
      ? `${t('formatCrossfit')} ${minutes}`
      : `${t('formatFullbody')} ${minutes}${focusLabel ? ` · ${t(focusLabel)}` : ''}`;
    await saveTemplate({
      id: `builder_${Date.now()}`,
      name,
      workoutType: draft.workoutType,
      exercises: draftToExercises(draft, (n) => blockNoteText(n, t)),
      createdAt: new Date().toISOString(),
    });
    Alert.alert(t('savedAsTemplate'), name);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('buildWorkout')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>{t('formatLabel')}</Text>
            <View style={styles.row}>
              {FORMATS.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.option, format === f.id && styles.optionActive]}
                  onPress={() => setFormat(f.id)}
                >
                  <Text style={[styles.optionText, format === f.id && styles.optionTextActive]}>{t(f.key)}</Text>
                  <Text style={styles.optionHint}>{t(f.hintKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t('builderDurationLabel')}</Text>
            <View style={styles.row}>
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.pill, duration === d && styles.pillActive]}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[styles.pillText, duration === d && styles.pillTextActive]}>{t('minutesShort', d)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {format === 'fullbody' && (
              <>
                <Text style={styles.label}>{t('focusLabel')}</Text>
                <View style={styles.row}>
                  {FOCUSES.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.pill, focus === f.id && styles.pillActive]}
                      onPress={() => setFocus(f.id)}
                    >
                      <Text style={[styles.pillText, focus === f.id && styles.pillTextActive]}>{t(f.key)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate}>
              <Ionicons name="sparkles-outline" size={18} color="#FFF" />
              <Text style={styles.generateText}>{t(draft ? 'buildAgain' : 'buildWorkout')}</Text>
            </TouchableOpacity>
          </View>

          {draft && (
            <>
              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  {t('approxMinutes', draft.estimatedMinutes)}
                </Text>
                <TouchableOpacity onPress={() => build(attempt + 1)} hitSlop={8} style={styles.reroll}>
                  <Ionicons name="refresh" size={16} color={Colors.primary} />
                  <Text style={styles.rerollText}>{t('anotherSet')}</Text>
                </TouchableOpacity>
              </View>

              {draft.blocks.map((block, blockIdx) => (
                <View key={`${block.title.kind}-${blockIdx}`} style={styles.block}>
                  <View style={styles.blockHead}>
                    <Text style={styles.blockTitle}>{blockTitleText(block.title, t)}</Text>
                    {block.note && (
                      <Text style={styles.blockNote}>{blockNoteText(block.note, t)}</Text>
                    )}
                  </View>

                  {block.exercises.map((e, exIdx) => (
                    <View key={e.exercise.id} style={styles.exRow}>
                      <ExerciseImage slug={e.exercise.imageSlug} pattern={e.exercise.pattern} size={48} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.exName}>{exerciseName(e.exercise)}</Text>
                        <Text style={styles.exScheme}>
                          {formatPrescription(e.prescription, t)}
                          {formatLastResult(last.get(e.exercise.id), t)
                            ? ` · ${formatLastResult(last.get(e.exercise.id), t)}`
                            : ''}
                        </Text>
                        {/* техніка й відео просто тут: у залі ніхто не шукатиме окремо */}
                        <ExerciseHowTo
                          exercise={e.exercise}
                          onOpenCard={() => router.push(`/exercises/${e.exercise.id}`)}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => setSubs({ blockIdx, exIdx, ex: e.exercise })}
                        hitSlop={8}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="swap-horizontal-outline" size={19} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeExercise(blockIdx, exIdx)} hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {block.emptyReason && (
                    <Text style={styles.emptyReason}>{blockEmptyText(block.emptyReason, t)}</Text>
                  )}

                  <TouchableOpacity style={styles.addBtn} onPress={() => setAddTo(blockIdx)}>
                    <Ionicons name="add" size={16} color={Colors.textSecondary} />
                    <Text style={styles.addText}>{t('addExerciseToBlock')}</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleSaveTemplate}>
                  <Ionicons name="bookmark-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.secondaryText}>{t('saveAsTemplate')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={startWorkout}>
                  <Ionicons name="play" size={18} color="#FFF" />
                  <Text style={styles.primaryText}>{t('startWorkout')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}

      <SubstitutionSheet
        visible={subs !== null}
        exercise={subs?.ex ?? null}
        equipment={equipment}
        protectZones={protectZones}
        familiarity={familiarity}
        onClose={() => setSubs(null)}
        onPick={(ex) => {
          if (subs) replaceExercise(subs.blockIdx, subs.exIdx, ex);
          setSubs(null);
        }}
      />

      <LibraryPicker
        visible={addTo !== null}
        title={t('addExerciseToBlock')}
        recentIds={pickerRecent}
        availableEquipment={equipment}
        onClose={() => setAddTo(null)}
        onSelect={(ex) => {
          if (addTo !== null) addExercise(addTo, ex);
          setAddTo(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  card: { padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, gap: Spacing.sm },
  label: { ...Typography.label, marginTop: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  option: {
    flex: 1, minWidth: 140, padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, gap: 2,
  },
  optionActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}14` },
  optionText: { ...Typography.body },
  optionTextActive: { color: Colors.primary },
  optionHint: { ...Typography.bodySmall, color: Colors.textMuted, fontSize: 12 },
  pill: {
    paddingHorizontal: Spacing.md, height: 34, justifyContent: 'center',
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}14` },
  pillText: { ...Typography.bodySmall },
  pillTextActive: { color: Colors.primary },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, marginTop: Spacing.md,
  },
  generateText: { ...Typography.body, color: '#FFF', fontWeight: '600' },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { ...Typography.bodySmall, color: Colors.textSecondary },
  reroll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rerollText: { ...Typography.bodySmall, color: Colors.primary },
  block: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm },
  blockHead: { gap: 2 },
  blockTitle: { ...Typography.label },
  blockNote: { ...Typography.bodySmall, color: Colors.accent },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  exName: { ...Typography.body },
  exScheme: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  iconBtn: { padding: 4 },
  emptyReason: { ...Typography.bodySmall, color: Colors.warning },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  addText: { ...Typography.bodySmall, color: Colors.textSecondary },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  secondaryText: { ...Typography.body, color: Colors.textSecondary },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.primary,
  },
  primaryText: { ...Typography.body, color: '#FFF', fontWeight: '600' },
});
