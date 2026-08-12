import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { addWorkout, getWorkouts, getLocalDateString } from '../../services/storage';
import { WorkoutEntry, ExerciseLog, WorkoutType, SetType, SetDetail } from '../../types';
import DatePickerField from '../../components/DatePickerField';
import { computePace, formatPace, getOverloadSuggestion, estimate1RM } from '../../services/analytics';
import RestTimer from '../../components/RestTimer';
import { getTemplates, saveTemplate, WorkoutTemplate } from '../../services/templates';
import { useLocale } from '../../services/i18n';
import ExercisePicker from '../../components/ExercisePicker';
import { checkAndUnlock } from '../../services/achievements';
import {
  getSupersetColor, groupIntoSuperset, ungroupSuperset, normalizeSupersets,
} from '../../services/supersets';

const CARDIO_TYPES: WorkoutType[] = ['run', 'cycling', 'swimming', 'cardio', 'hiit', 'crossfit'];

const WORKOUT_TYPES: { id: WorkoutType; label: string; icon: string; color: string }[] = [
  { id: 'strength', label: 'Силове', icon: 'barbell-outline', color: '#E63946' },
  { id: 'cardio', label: 'Кардіо', icon: 'heart-outline', color: '#2EC4B6' },
  { id: 'crossfit', label: 'CrossFit', icon: 'flash-outline', color: '#F4A261' },
  { id: 'hiit', label: 'HIIT', icon: 'timer-outline', color: '#FF6B6B' },
  { id: 'run', label: 'Біг', icon: 'walk-outline', color: '#2ECC71' },
  { id: 'yoga', label: 'Йога', icon: 'leaf-outline', color: '#9B59B6' },
  { id: 'recovery', label: 'Відновлення', icon: 'bed-outline', color: '#3498DB' },
  { id: 'cycling', label: 'Велосипед', icon: 'bicycle-outline', color: '#E67E22' },
  { id: 'swimming', label: 'Плавання', icon: 'water-outline', color: '#1ABC9C' },
  { id: 'custom', label: 'Інше', icon: 'ellipsis-horizontal-outline', color: '#95A5A6' },
];

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function LogWorkoutScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { repeatId } = useLocalSearchParams<{ repeatId?: string }>();
  const [workoutType, setWorkoutType] = useState<WorkoutType>('strength');
  const [date, setDate] = useState(() => getLocalDateString(new Date()));
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [repeatingFrom, setRepeatingFrom] = useState<string | null>(null); // workout type label for banner

  // Rest timer
  const [restTimerVisible, setRestTimerVisible] = useState(false);

  // Templates
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [saveTemplateVisible, setSaveTemplateVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Progressive overload hint
  const [overloadHint, setOverloadHint] = useState('');
  // Exercise picker
  const [pickerVisible, setPickerVisible] = useState(false);

  // PR banner
  const [prBannerEx, setPrBannerEx] = useState<string | null>(null);
  const prBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Plate calculator
  const [plateCalcVisible, setPlateCalcVisible] = useState(false);
  const [plateCalcBarbell, setPlateCalcBarbell] = useState(20);
  const [plateCalcTarget, setPlateCalcTarget] = useState('');

  // Superset mode — вправи, додані підряд, потрапляють в одну групу
  const [supersetMode, setSupersetMode] = useState(false);
  const [currentSupersetId, setCurrentSupersetId] = useState<string | null>(null);

  function toggleSupersetMode() {
    if (supersetMode) {
      setSupersetMode(false);
      setCurrentSupersetId(null);
    } else {
      const newId = `ss_${Date.now()}`;
      setSupersetMode(true);
      setCurrentSupersetId(newId);
    }
  }

  // Режим групування — об'єднати вже додані вправи в суперсет заднім числом
  const [groupMode, setGroupMode] = useState(false);
  const [groupSel, setGroupSel] = useState<number[]>([]);

  function toggleGroupMode() {
    setGroupMode((on) => !on);
    setGroupSel([]);
  }

  function toggleGroupSel(i: number) {
    setGroupSel((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }

  function applyGrouping() {
    if (groupSel.length < 2) return;
    setExercises((prev) => groupIntoSuperset(prev, groupSel));
    setGroupMode(false);
    setGroupSel([]);
    cancelEditExercise();
  }

  function handleUngroup(ssId: string) {
    setExercises((prev) => ungroupSuperset(prev, ssId));
  }

  // Timer state — timestamp-based so час рахується вірно навіть коли
  // додаток у фоні (Android призупиняє setInterval)
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartRef = useRef<number | null>(null);

  // Load repeat workout if repeatId provided
  useEffect(() => {
    if (!repeatId) return;
    getWorkouts().then((all) => {
      const src = all.find((w) => w.id === repeatId);
      if (!src) return;
      setWorkoutType(src.workoutType as WorkoutType);
      setExercises(src.exercises.map((e) => ({ ...e })));
      setNotes(src.notes || '');
      // Don't copy duration/rating/date — those are for the new session
      setRepeatingFrom(src.workoutType);
    });
  }, [repeatId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (prBannerTimer.current) clearTimeout(prBannerTimer.current);
    };
  }, []);

  function toggleTimer() {
    if (timerRunning) {
      clearInterval(timerRef.current!);
      timerRef.current = null;
      setTimerRunning(false);
      const secs = timerStartRef.current
        ? Math.floor((Date.now() - timerStartRef.current) / 1000)
        : timerSeconds;
      setTimerSeconds(secs);
      const mins = Math.max(1, Math.round(secs / 60));
      setDuration(String(mins));
    } else {
      // продовження: зсуваємо старт назад на вже накопичений час
      timerStartRef.current = Date.now() - timerSeconds * 1000;
      setTimerRunning(true);
      timerRef.current = setInterval(() => {
        if (timerStartRef.current) {
          setTimerSeconds(Math.floor((Date.now() - timerStartRef.current) / 1000));
        }
      }, 1000);
    }
  }

  function formatTimer(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Cardio/run fields
  const [totalDistance, setTotalDistance] = useState('');
  const [avgHeartRate, setAvgHeartRate] = useState('');
  const [maxHeartRate, setMaxHeartRate] = useState('');
  const [elevationGain, setElevationGain] = useState('');
  const [totalCalories, setTotalCalories] = useState('');

  // Exercise form state
  const [exName, setExName] = useState('');
  const [exSets, setExSets] = useState('');
  const [exReps, setExReps] = useState('');
  const [exWeight, setExWeight] = useState('');
  const [exDuration, setExDuration] = useState('');
  const [exDistance, setExDistance] = useState('');
  const [exCalories, setExCalories] = useState('');
  const [exWatts, setExWatts] = useState('');
  const [exRpe, setExRpe] = useState<number | undefined>(undefined);
  const [exSetType, setExSetType] = useState<SetType>('normal');
  // Set-by-set logging (піраміди: 80×5, 85×5, 90×3)
  const [draftSets, setDraftSets] = useState<SetDetail[]>([]);

  function addDraftSet() {
    const reps = parseNum(exReps);
    const weight = parseNum(exWeight);
    if (!reps) { Alert.alert('Вкажи повтори для підходу'); return; }
    setDraftSets([...draftSets, { reps, weight }]);
    // вага/повтори лишаються у полях — зручно коригувати для наступного підходу
  }

  function removeDraftSet(i: number) {
    setDraftSets(draftSets.filter((_, idx) => idx !== i));
  }

  // ── Редагування вже доданої вправи ────────────────────────────────────────
  // Індекс вправи, яку зараз правимо; null — форма працює на додавання.
  const [editingExIdx, setEditingExIdx] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const formY = useRef(0);

  function clearExForm() {
    setExName(''); setExSets(''); setExReps(''); setExWeight('');
    setExDuration(''); setExDistance(''); setExCalories(''); setExWatts('');
    setExRpe(undefined); setExSetType('normal'); setDraftSets([]);
    setOverloadHint('');
  }

  function startEditExercise(idx: number) {
    const ex = exercises[idx];
    if (!ex) return;
    const s = (v: number | undefined) => (v !== undefined ? String(v) : '');
    setExName(ex.name);
    setExSets(s(ex.sets)); setExReps(s(ex.reps)); setExWeight(s(ex.weight));
    setExDuration(s(ex.duration)); setExDistance(s(ex.distance));
    setExCalories(s(ex.calories)); setExWatts(s(ex.watts));
    setExRpe(ex.rpe);
    setExSetType(ex.setType ?? 'normal');
    setDraftSets(ex.setsDetail ? [...ex.setsDetail] : []);
    setOverloadHint('');
    setEditingExIdx(idx);
    // форма нижче списку — підкручуємо, щоб її було видно одразу
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(formY.current - 60, 0), animated: true });
    });
  }

  function cancelEditExercise() {
    setEditingExIdx(null);
    clearExForm();
  }

  async function lookupOverloadHint(name: string) {
    if (!name.trim()) { setOverloadHint(''); return; }
    const all = await getWorkouts();
    const suggestion = getOverloadSuggestion(all, name);
    if (suggestion) {
      setOverloadHint(suggestion.message);
      // Auto-fill suggested values
      if (!exWeight) setExWeight(String(suggestion.suggestedWeight));
      if (!exReps) setExReps(String(
        typeof suggestion.suggestedReps === 'number'
          ? suggestion.suggestedReps
          : suggestion.lastReps
      ));
      if (!exSets) setExSets(String(suggestion.lastSets));
    } else {
      setOverloadHint('');
    }
  }

  async function openTemplates() {
    const tmpl = await getTemplates();
    setTemplates(tmpl);
    setTemplatesVisible(true);
  }

  function applyTemplate(t: WorkoutTemplate) {
    setWorkoutType(t.workoutType);
    setExercises(t.exercises);
    setTemplatesVisible(false);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) { Alert.alert(t('enterExerciseName')); return; }
    await saveTemplate({
      id: Date.now().toString(),
      name: templateName.trim(),
      workoutType,
      exercises,
      createdAt: new Date().toISOString(),
    });
    setSaveTemplateVisible(false);
    setTemplateName('');
    Alert.alert(t('templateSaved'));
  }

  function parseNum(v: string): number | undefined {
    if (!v.trim()) return undefined;
    const n = Number(v.replace(',', '.'));
    return isNaN(n) || n < 0 ? undefined : n;
  }

  // Best estimated 1RM among an exercise's sets (set-by-set aware)
  function best1RMOf(e: ExerciseLog): number {
    const sets = e.setsDetail && e.setsDetail.length > 0
      ? e.setsDetail
      : [{ weight: e.weight, reps: e.reps }];
    return sets.reduce((b, s) => Math.max(b, estimate1RM(s.weight || 0, s.reps || 1)), 0);
  }

  async function addExercise() {
    if (!exName.trim()) { Alert.alert(t('enterExerciseName')); return; }
    const isEdit = editingExIdx !== null;
    // При редагуванні вправа лишається у своїй групі; supersetMode стосується
    // лише щойно доданих вправ.
    const supersetIdForEx = isEdit
      ? exercises[editingExIdx!]?.supersetId
      : (supersetMode && currentSupersetId ? currentSupersetId : undefined);
    let ex: ExerciseLog;
    if (draftSets.length > 0) {
      // Set-by-set: summary поля = кількість підходів + найважчий підхід
      const bestSet = draftSets.reduce((b, s) =>
        ((s.weight || 0) * 1000 + (s.reps || 0)) > ((b.weight || 0) * 1000 + (b.reps || 0)) ? s : b
      );
      ex = {
        name: exName.trim(),
        sets: draftSets.length,
        reps: bestSet.reps,
        weight: bestSet.weight,
        setsDetail: draftSets,
        duration: parseNum(exDuration),
        distance: parseNum(exDistance),
        calories: parseNum(exCalories),
        watts: parseNum(exWatts),
        supersetId: supersetIdForEx,
        rpe: exRpe,
        setType: exSetType !== 'normal' ? exSetType : undefined,
      };
    } else {
      ex = {
        name: exName.trim(),
        sets: parseNum(exSets),
        reps: parseNum(exReps),
        weight: parseNum(exWeight),
        duration: parseNum(exDuration),
        distance: parseNum(exDistance),
        calories: parseNum(exCalories),
        watts: parseNum(exWatts),
        supersetId: supersetIdForEx,
        rpe: exRpe,
        setType: exSetType !== 'normal' ? exSetType : undefined,
      };
    }
    const updatedExercises = isEdit
      ? exercises.map((prev, i) => (i === editingExIdx ? ex : prev))
      : [...exercises, ex];
    setExercises(updatedExercises);
    clearExForm();
    setEditingExIdx(null);
    // Таймер відпочинку і банер рекорду — тільки для нової вправи.
    // Під час виправлення помилки вони б лише заважали.
    if (isEdit) return;
    // Auto-open rest timer only for strength-type workouts (has sets/reps/weight)
    if (ex.sets || ex.reps || ex.weight) {
      setRestTimerVisible(true);
    }
    // PR detection: порівнюємо розрах. 1RM (вага+повтори) з історією
    // ТА з уже доданими вправами поточної сесії — без подвійних банерів
    const candidate1RM = best1RMOf(ex);
    if (candidate1RM > 0) {
      const allPrev = await getWorkouts();
      const nameKey = ex.name.toLowerCase();
      const bestHist = allPrev.reduce((best, w) => {
        const wBest = w.exercises
          .filter((e) => e.name.toLowerCase() === nameKey)
          .reduce((b, e) => Math.max(b, best1RMOf(e)), 0);
        return Math.max(best, wBest);
      }, 0);
      const bestSession = exercises
        .filter((e) => e.name.toLowerCase() === nameKey)
        .reduce((b, e) => Math.max(b, best1RMOf(e)), 0);
      if (bestHist > 0 && candidate1RM > Math.max(bestHist, bestSession)) {
        setPrBannerEx(ex.name);
        if (prBannerTimer.current) clearTimeout(prBannerTimer.current);
        prBannerTimer.current = setTimeout(() => setPrBannerEx(null), 3000);
      }
    }
  }

  function openPlateCalc() {
    setPlateCalcTarget(exWeight || '0');
    setPlateCalcBarbell(20);
    setPlateCalcVisible(true);
  }

  function removeExercise(i: number) {
    // після видалення суперсет може лишитись з однією вправою — розпускаємо
    setExercises(normalizeSupersets(exercises.filter((_, idx) => idx !== i)));
    // індекси зсуваються — інакше правили б не ту вправу
    if (editingExIdx === i) cancelEditExercise();
    else if (editingExIdx !== null && editingExIdx > i) setEditingExIdx(editingExIdx - 1);
    setGroupSel([]);
  }

  async function handleSave() {
    if (!duration || isNaN(Number(duration))) { Alert.alert(t('durationRequired')); return; }
    const isCardioType = CARDIO_TYPES.includes(workoutType);
    if (exercises.length === 0 && !totalDistance) {
      Alert.alert(
        isCardioType ? t('needExercisesCardio') : t('needExercisesStrength'),
        isCardioType ? t('needExercisesCardioMsg') : t('needExercisesStrengthMsg')
      );
      return;
    }

    setSaving(true);
    try {
      const distKm = totalDistance ? Number(totalDistance) : undefined;
      const durMin = Number(duration);
      const pace = distKm && durMin ? computePace(distKm, durMin) : undefined;

      const entry: WorkoutEntry = {
        id: Date.now().toString(),
        date,
        workoutType,
        exercises,
        notes: notes.trim(),
        duration: durMin,
        rating,
        completedAt: new Date().toISOString(),
        totalDistance: distKm,
        avgPace: pace,
        avgHeartRate: avgHeartRate ? Number(avgHeartRate) : undefined,
        maxHeartRate: maxHeartRate ? Number(maxHeartRate) : undefined,
        elevationGain: elevationGain ? Number(elevationGain) : undefined,
        totalCalories: totalCalories ? Number(totalCalories) : undefined,
      };
      await addWorkout(entry);
      const allAfter = await getWorkouts();
      const stats = await import('../../services/storage').then((m) => m.getStats());
      checkAndUnlock(allAfter, stats.streak).catch(() => {});
      router.back();
    } catch (e) {
      Alert.alert('Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  const selectedType = WORKOUT_TYPES.find((t) => t.id === workoutType)!;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('newWorkout')}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={openTemplates} style={styles.headerIconBtn}>
              <Ionicons name="albums-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {prBannerEx && (
          <View style={styles.prBanner} pointerEvents="none">
            <Ionicons name="trophy" size={20} color="#FFD700" />
            <Text style={styles.prBannerText}>Новий рекорд! {prBannerEx}</Text>
          </View>
        )}

        {repeatingFrom && (
          <View style={styles.repeatBanner}>
            <Ionicons name="copy-outline" size={14} color={Colors.primary} />
            <Text style={styles.repeatBannerText}>Повторення тренування — відредагуй і збережи як нове</Text>
          </View>
        )}

        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Workout Type */}
          <Text style={styles.label}>{t('workoutTypeLabel')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeList}>
            {WORKOUT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeChip, workoutType === t.id && { backgroundColor: t.color + '20', borderColor: t.color }]}
                onPress={() => setWorkoutType(t.id)}
              >
                <Ionicons name={t.icon as any} size={18} color={workoutType === t.id ? t.color : Colors.textMuted} />
                <Text style={[styles.typeChipText, workoutType === t.id && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Date & Duration */}
          <DatePickerField
            label="Дата"
            value={date}
            onChange={setDate}
            maximumDate={new Date()}
          />
          {/* Timer */}
          <View style={styles.timerCard}>
            <View style={styles.timerDisplay}>
              <Ionicons
                name={timerRunning ? 'timer' : 'timer-outline'}
                size={22}
                color={timerRunning ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.timerText, timerRunning && styles.timerTextActive]}>
                {formatTimer(timerSeconds)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.timerBtn, timerRunning && styles.timerBtnStop]}
              onPress={toggleTimer}
            >
              <Ionicons name={timerRunning ? 'stop' : 'play'} size={16} color="#FFF" />
              <Text style={styles.timerBtnText}>{timerRunning ? 'Зупинити' : 'Старт'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{t('durationLabel')}</Text>
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            placeholder="60"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />

          {/* Cardio/Run details */}
          {CARDIO_TYPES.includes(workoutType as WorkoutType) && (
            <View style={styles.cardioCard}>
              <Text style={styles.cardioTitle}>
                <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
                {'  '}Параметри кардіо
              </Text>
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Text style={styles.miniLabel}>{t('distanceKmLabel')}</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={totalDistance} onChangeText={setTotalDistance} keyboardType="decimal-pad" />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.miniLabel}>{t('totalCalLabel')}</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={totalCalories} onChangeText={setTotalCalories} keyboardType="numeric" />
                </View>
              </View>
              {totalDistance && duration ? (
                <Text style={styles.paceHint}>
                  Темп: {formatPace(computePace(Number(totalDistance), Number(duration)))}
                </Text>
              ) : null}
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Text style={styles.miniLabel}>{t('avgHrLabel')}</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={avgHeartRate} onChangeText={setAvgHeartRate} keyboardType="numeric" />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.miniLabel}>{t('maxHrLabel')}</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={maxHeartRate} onChangeText={setMaxHeartRate} keyboardType="numeric" />
                </View>
              </View>
              {workoutType === 'run' && (
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <Text style={styles.miniLabel}>{t('elevationLabel')}</Text>
                    <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                      value={elevationGain} onChangeText={setElevationGain} keyboardType="numeric" />
                  </View>
                  <View style={styles.rowItem} />
                </View>
              )}
            </View>
          )}

          {/* Rating */}
          <Text style={styles.label}>{t('ratingLabel')}</Text>
          <View style={styles.ratingRow}>
            {RATINGS.map((r) => (
              <TouchableOpacity key={r} onPress={() => setRating(r)}>
                <Ionicons
                  name={rating && rating >= r ? 'star' : 'star-outline'}
                  size={28}
                  color={rating && rating >= r ? Colors.accent : Colors.textMuted}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Exercises */}
          <View style={styles.exercisesHeader}>
            <Text style={styles.label}>{t('exercisesLabel')}</Text>
            <View style={styles.exercisesHeaderActions}>
              {exercises.length > 0 && (
                <TouchableOpacity
                  style={styles.restTimerBtn}
                  onPress={() => setRestTimerVisible(true)}
                >
                  <Ionicons name="timer-outline" size={15} color={Colors.primary} />
                  <Text style={styles.restTimerBtnText}>{t('restTimerBtn')}</Text>
                </TouchableOpacity>
              )}
              {exercises.length > 0 && (
                <TouchableOpacity
                  style={styles.saveTemplateBtn}
                  onPress={() => setSaveTemplateVisible(true)}
                >
                  <Ionicons name="bookmark-outline" size={15} color={Colors.textSecondary} />
                  <Text style={styles.saveTemplateBtnText}>Шаблон</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Групування вже доданих вправ у суперсет */}
          {exercises.length > 1 && (
            <View style={styles.groupBar}>
              {!groupMode ? (
                <TouchableOpacity style={styles.groupBarBtn} onPress={toggleGroupMode}>
                  <Ionicons name="link-outline" size={15} color={Colors.textSecondary} />
                  <Text style={styles.groupBarText}>Об'єднати в суперсет</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.groupBarHint}>
                    {groupSel.length < 2 ? 'Познач 2+ вправи' : `Вибрано: ${groupSel.length}`}
                  </Text>
                  <TouchableOpacity onPress={toggleGroupMode} style={styles.groupBarBtn}>
                    <Text style={styles.groupBarCancel}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={applyGrouping}
                    disabled={groupSel.length < 2}
                    style={[styles.groupApplyBtn, groupSel.length < 2 && { opacity: 0.4 }]}
                  >
                    <Text style={styles.groupApplyText}>Об'єднати</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {renderExerciseGroups({
            exercises,
            onRemove: removeExercise,
            onEdit: startEditExercise,
            editingIdx: editingExIdx,
            groupMode,
            selected: groupSel,
            onToggleSel: toggleGroupSel,
            onUngroup: handleUngroup,
          })}

          {/* Add / Edit Exercise Form */}
          <View
            style={[styles.exerciseForm, editingExIdx !== null && styles.exerciseFormEditing]}
            onLayout={(e) => { formY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.formHeader}>
              <Text style={styles.formSubtitle}>
                {editingExIdx !== null ? 'Редагувати вправу' : t('addExercise')}
              </Text>
              {editingExIdx !== null ? (
                <TouchableOpacity style={styles.cancelEditBtn} onPress={cancelEditExercise}>
                  <Ionicons name="close" size={14} color={Colors.textSecondary} />
                  <Text style={styles.cancelEditText}>Скасувати</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.supersetToggle, supersetMode && styles.supersetToggleActive]}
                  onPress={toggleSupersetMode}
                >
                  <Ionicons name="link-outline" size={14} color={supersetMode ? '#FFF' : Colors.textSecondary} />
                  <Text style={[styles.supersetToggleText, supersetMode && styles.supersetToggleTextActive]}>
                    Суперсет
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Library button — prominent, full width */}
            <TouchableOpacity
              style={styles.libraryBtn}
              onPress={() => setPickerVisible(true)}
            >
              <Ionicons name="library-outline" size={18} color={Colors.primary} />
              <Text style={styles.libraryBtnText}>{t('chooseFromLibrary')}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder={t('exerciseNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              value={exName}
              onChangeText={(v) => { setExName(v); setOverloadHint(''); }}
              onBlur={() => lookupOverloadHint(exName)}
            />
            {overloadHint ? (
              <Text style={styles.overloadHint}>{overloadHint}</Text>
            ) : null}
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>{t('setsLabel')}</Text>
                <TextInput style={styles.input} placeholder="3" placeholderTextColor={Colors.textMuted}
                  value={exSets} onChangeText={setExSets} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>{t('repsLabel')}</Text>
                <TextInput style={styles.input} placeholder="12" placeholderTextColor={Colors.textMuted}
                  value={exReps} onChangeText={setExReps} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <View style={styles.miniLabelRow}>
                  <Text style={styles.miniLabel}>{t('weightKgLabel')}</Text>
                  <TouchableOpacity onPress={openPlateCalc} style={styles.calcIconBtn}>
                    <Ionicons name="calculator-outline" size={13} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="50" placeholderTextColor={Colors.textMuted}
                  value={exWeight} onChangeText={setExWeight} keyboardType="decimal-pad" />
              </View>
            </View>

            {/* Set-by-set: список доданих підходів + кнопка */}
            {draftSets.length > 0 && (
              <View style={styles.draftSetsList}>
                {draftSets.map((s, i) => (
                  <View key={i} style={styles.draftSetChip}>
                    <Text style={styles.draftSetChipText}>
                      {i + 1}) {s.weight ? `${s.weight}кг × ` : ''}{s.reps}
                    </Text>
                    <TouchableOpacity onPress={() => removeDraftSet(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.addSetBtn} onPress={addDraftSet}>
              <Ionicons name="add-circle-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.addSetBtnText}>
                {draftSets.length > 0
                  ? `Додати підхід ${draftSets.length + 1} (з полів вище)`
                  : 'Записати підходи окремо (піраміда)'}
              </Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>{t('timeMinLabel')}</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exDuration} onChangeText={setExDuration} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>{t('kmLabel')}</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exDistance} onChangeText={setExDistance} keyboardType="decimal-pad" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>{t('kcalLabel')}</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exCalories} onChangeText={setExCalories} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>{t('wattsLabel')}</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exWatts} onChangeText={setExWatts} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>RPE (1–10)</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exRpe !== undefined ? String(exRpe) : ''}
                  onChangeText={(v) => {
                    const n = Number(v);
                    setExRpe(v === '' ? undefined : (n >= 1 && n <= 10 ? n : exRpe));
                  }}
                  keyboardType="numeric" />
              </View>
            </View>

            {/* Set type tags */}
            <View style={styles.setTypeRow}>
              {(['normal', 'warmup', 'dropset', 'failure'] as SetType[]).map((type) => {
                const labels: Record<SetType, string> = {
                  normal: 'Звичайний', warmup: 'Розминка', dropset: 'Дроп-сет', failure: 'Відмова',
                };
                const colors: Record<SetType, string> = {
                  normal: Colors.primary, warmup: '#3498DB', dropset: '#F4A261', failure: '#E63946',
                };
                const active = exSetType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.setTypeChip, active && { backgroundColor: colors[type] + '25', borderColor: colors[type] }]}
                    onPress={() => setExSetType(type)}
                  >
                    <Text style={[styles.setTypeChipText, active && { color: colors[type] }]}>
                      {labels[type]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.addExBtn} onPress={addExercise}>
              <Ionicons name={editingExIdx !== null ? 'checkmark' : 'add'} size={20} color="#FFF" />
              <Text style={styles.addExBtnText}>
                {editingExIdx !== null ? 'Зберегти зміни' : t('add')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Notes */}
          <Text style={styles.label}>{t('notesLabel')}</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder={t('notesPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </ScrollView>
      </View>

      {/* Rest Timer Modal */}
      <RestTimer visible={restTimerVisible} onClose={() => setRestTimerVisible(false)} autoStart />

      {/* Exercise Picker Modal */}
      <ExercisePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(name) => { setExName(name); setOverloadHint(''); lookupOverloadHint(name); }}
      />

      {/* Templates Modal */}
      <Modal visible={templatesVisible} transparent animationType="slide" onRequestClose={() => setTemplatesVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('templatesTitle')}</Text>
              <TouchableOpacity onPress={() => setTemplatesVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {templates.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="albums-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.modalEmptyText}>{t('noTemplates')}</Text>
                <Text style={styles.modalEmptySubtext}>{t('noTemplatesText')}</Text>
              </View>
            ) : (
              <FlatList
                data={templates}
                keyExtractor={(t) => t.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.templateItem} onPress={() => applyTemplate(item)}>
                    <View style={styles.templateItemLeft}>
                      <Text style={styles.templateName}>{item.name}</Text>
                      <Text style={styles.templateMeta}>
                        {item.exercises.length} вправ · {item.workoutType}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Plate Calculator Modal */}
      <Modal visible={plateCalcVisible} transparent animationType="fade" onRequestClose={() => setPlateCalcVisible(false)}>
        <View style={styles.plateCalcOverlay}>
          <View style={styles.plateCalcCard}>
            <View style={styles.plateCalcHeader}>
              <Text style={styles.plateCalcTitle}>Калькулятор блінів</Text>
              <TouchableOpacity onPress={() => setPlateCalcVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.plateCalcRow}>
              <Text style={styles.plateCalcLabel}>Штанга:</Text>
              {[20, 15, 10].map((kg) => (
                <TouchableOpacity
                  key={kg}
                  style={[styles.plateCalcChip, plateCalcBarbell === kg && styles.plateCalcChipActive]}
                  onPress={() => setPlateCalcBarbell(kg)}
                >
                  <Text style={[styles.plateCalcChipText, plateCalcBarbell === kg && styles.plateCalcChipTextActive]}>
                    {kg} кг
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.plateCalcRow}>
              <Text style={styles.plateCalcLabel}>Загальна вага (кг):</Text>
              <TextInput
                style={styles.plateCalcInput}
                value={plateCalcTarget}
                onChangeText={setPlateCalcTarget}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            {(() => {
              const total = parseFloat(plateCalcTarget.replace(',', '.'));
              if (isNaN(total) || total <= plateCalcBarbell) {
                return <Text style={styles.plateCalcHint}>Введи вагу більше ніж штанга ({plateCalcBarbell} кг)</Text>;
              }
              const { plates, leftover } = calcPlates(total, plateCalcBarbell);
              const perSide = (total - plateCalcBarbell) / 2;
              const exactWeight = total - leftover * 2;
              return (
                <View style={styles.plateResult}>
                  <Text style={styles.plateResultTitle}>По {perSide % 1 === 0 ? perSide : perSide.toFixed(2)} кг на кожну сторону:</Text>
                  {plates.length === 0 ? (
                    <Text style={styles.plateCalcHint}>Неможливо скласти зі стандартних блінів</Text>
                  ) : (
                    <View style={styles.plateList}>
                      {plates.map(({ plate, count }) => (
                        <View key={plate} style={styles.plateRow}>
                          <View style={[styles.plateVisual, { width: 12 + Math.min(plate, 25) * 2 }]} />
                          <Text style={styles.plateName}>{plate} кг</Text>
                          <Text style={styles.plateCount}>× {count}</Text>
                          <Text style={styles.plateTotalVal}>= {plate * count} кг</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {leftover > 0.01 && (
                    <View style={styles.plateLeftover}>
                      <Ionicons name="warning-outline" size={14} color={Colors.accent} />
                      <Text style={styles.plateLeftoverText}>
                        Залишок {leftover.toFixed(2)} кг/сторону не складається — фактично {exactWeight} кг
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.plateApplyBtn}
                    onPress={() => { setExWeight(String(leftover > 0.01 ? exactWeight : total)); setPlateCalcVisible(false); }}
                  >
                    <Text style={styles.plateApplyBtnText}>
                      Встановити {leftover > 0.01 ? exactWeight : total} кг
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Save Template Modal */}
      <Modal visible={saveTemplateVisible} transparent animationType="fade" onRequestClose={() => { setSaveTemplateVisible(false); setTemplateName(''); }}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, { padding: Spacing.lg }]}>
            <Text style={styles.modalTitle}>{t('saveTemplateTitle')}</Text>
            <TextInput
              style={[styles.input, { marginTop: Spacing.md }]}
              placeholder={t('templateNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              value={templateName}
              onChangeText={setTemplateName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveTemplate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setSaveTemplateVisible(false); setTemplateName(''); }}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSaveTemplate}>
                <Text style={styles.modalConfirmText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── PLATE CALCULATOR ────────────────────────────────────────────────────────

const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

function calcPlates(totalKg: number, barbell: number): { plates: { plate: number; count: number }[]; leftover: number } {
  let perSide = (totalKg - barbell) / 2;
  if (perSide <= 0) return { plates: [], leftover: 0 };
  const plates: { plate: number; count: number }[] = [];
  for (const p of PLATES_KG) {
    if (perSide >= p - 0.001) {
      const n = Math.floor(perSide / p + 0.001);
      if (n > 0) { plates.push({ plate: p, count: n }); perSide -= n * p; }
    }
  }
  return { plates, leftover: Math.round(perSide * 100) / 100 };
}

// кольори суперсетів — у services/supersets.ts (спільні з екраном деталей)

function renderExerciseMeta(ex: ExerciseLog): string {
  const SET_TYPE_LABELS: Record<string, string> = {
    warmup: '🔵 Розм.', dropset: '🟠 Дроп', failure: '🔴 Відмова',
  };
  if (ex.setsDetail && ex.setsDetail.length > 0) {
    const setsStr = ex.setsDetail
      .map((s) => (s.weight ? `${s.weight}×${s.reps ?? '?'}` : `${s.reps ?? '?'}`))
      .join(' / ');
    return [
      ex.setType && ex.setType !== 'normal' && SET_TYPE_LABELS[ex.setType],
      setsStr,
      ex.rpe && `RPE ${ex.rpe}`,
    ].filter(Boolean).join(' · ');
  }
  return [
    ex.setType && ex.setType !== 'normal' && SET_TYPE_LABELS[ex.setType],
    ex.sets && `${ex.sets} підх.`,
    ex.reps && `${ex.reps} повт.`,
    ex.weight && `${ex.weight} кг`,
    ex.duration && `${ex.duration} хв`,
    ex.distance && `${ex.distance} км`,
    ex.calories && `${ex.calories} ккал`,
    ex.watts && `${ex.watts} вт`,
    ex.rpe && `RPE ${ex.rpe}`,
  ].filter(Boolean).join(' · ');
}

interface ExerciseGroupOpts {
  exercises: ExerciseLog[];
  onRemove: (i: number) => void;
  onEdit: (i: number) => void;
  editingIdx: number | null;
  groupMode: boolean;
  selected: number[];
  onToggleSel: (i: number) => void;
  onUngroup: (ssId: string) => void;
}

function renderExerciseGroups(o: ExerciseGroupOpts): React.ReactNode[] {
  const { exercises, onRemove, onEdit, editingIdx, groupMode, selected, onToggleSel, onUngroup } = o;
  const nodes: React.ReactNode[] = [];
  let i = 0;
  // group consecutive exercises with the same supersetId
  const seenSupersets = new Map<string, number>(); // id → group index

  // Рядок вправи: у режимі групування — чекбокс, інакше — тап відкриває на редагування
  const row = (ex: ExerciseLog, idx: number) => {
    const isSel = selected.includes(idx);
    const isEditing = editingIdx === idx;
    return (
      <View key={idx} style={[styles.exerciseItem, isEditing && styles.exerciseItemEditing]}>
        {groupMode && (
          <TouchableOpacity onPress={() => onToggleSel(idx)} style={styles.selBox} hitSlop={8}>
            <Ionicons
              name={isSel ? 'checkbox' : 'square-outline'}
              size={22}
              color={isSel ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.exerciseLeft}
          onPress={() => (groupMode ? onToggleSel(idx) : onEdit(idx))}
        >
          <Text style={styles.exerciseName}>{ex.name}</Text>
          <Text style={styles.exerciseMeta}>{renderExerciseMeta(ex)}</Text>
        </TouchableOpacity>
        {!groupMode && (
          <>
            <TouchableOpacity onPress={() => onEdit(idx)} style={styles.rowIconBtn} hitSlop={6}>
              <Ionicons
                name="create-outline"
                size={19}
                color={isEditing ? Colors.primary : Colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onRemove(idx)} hitSlop={6}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.supersetId) {
      const ssId = ex.supersetId;
      const color = getSupersetColor(ssId);
      // Collect all exercises with this supersetId
      const group: Array<{ ex: ExerciseLog; idx: number }> = [];
      for (let j = 0; j < exercises.length; j++) {
        if (exercises[j].supersetId === ssId) group.push({ ex: exercises[j], idx: j });
      }
      // Only render group once (when we hit the first member)
      if (!seenSupersets.has(ssId)) {
        seenSupersets.set(ssId, nodes.length);
        nodes.push(
          <View key={`ss_${ssId}`} style={[styles.supersetGroup, { borderLeftColor: color }]}>
            <View style={styles.supersetHeader}>
              <Ionicons name="link-outline" size={12} color={color} />
              <Text style={[styles.supersetLabel, { color }]}>СУПЕРСЕТ</Text>
              {!groupMode && (
                <TouchableOpacity
                  onPress={() => onUngroup(ssId)}
                  style={styles.ungroupBtn}
                  hitSlop={6}
                >
                  <Ionicons name="unlink-outline" size={13} color={Colors.textMuted} />
                  <Text style={styles.ungroupBtnText}>Розгрупувати</Text>
                </TouchableOpacity>
              )}
            </View>
            {group.map(({ ex: gEx, idx }) => row(gEx, idx))}
          </View>
        );
      }
      i++;
    } else {
      nodes.push(row(ex, i));
      i++;
    }
  }
  return nodes;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  repeatBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary + '15', borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '30', paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  repeatBannerText: { color: Colors.primary, fontSize: 13, flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  saveBtn: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  content: { padding: Spacing.md, paddingBottom: 40 },
  label: { ...Typography.label, marginBottom: Spacing.xs, marginTop: Spacing.md },
  miniLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 4 },
  typeList: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  typeChipText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  rowItem: { flex: 1 },
  input: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 15,
  },
  notesInput: { minHeight: 100, textAlignVertical: 'top', paddingTop: 10 },
  ratingRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xs },
  exerciseItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border,
  },
  exerciseLeft: { flex: 1 },
  exerciseName: { ...Typography.body, fontWeight: '600' },
  exerciseMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  exerciseItemEditing: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  rowIconBtn: { paddingHorizontal: Spacing.sm },
  selBox: { paddingRight: Spacing.sm },
  groupBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.xs, minHeight: 34,
  },
  groupBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  groupBarText: { color: Colors.textSecondary, fontSize: 13 },
  groupBarHint: { color: Colors.textMuted, fontSize: 12, flex: 1 },
  groupBarCancel: { color: Colors.textSecondary, fontSize: 13 },
  groupApplyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  groupApplyText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  ungroupBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  ungroupBtnText: { color: Colors.textMuted, fontSize: 11 },
  cancelEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
  },
  cancelEditText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  exerciseForm: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.xs, gap: Spacing.xs,
  },
  exerciseFormEditing: { borderColor: Colors.primary },
  formHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  formSubtitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  setTypeRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4,
  },
  setTypeChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  setTypeChipText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  supersetToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.surfaceElevated,
  },
  supersetToggleActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  supersetToggleText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  supersetToggleTextActive: { color: '#FFF' },
  supersetGroup: {
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
    borderRadius: BorderRadius.md, marginBottom: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  supersetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingBottom: 4, paddingLeft: 2,
  },
  supersetLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
  },
  addExBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 10,
  },
  draftSetsList: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6,
  },
  draftSetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.primary + '50',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  draftSetChipText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
  addSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    borderStyle: 'dashed', paddingVertical: 8, marginTop: 6,
  },
  addSetBtnText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  addExBtnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  timerCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  timerDisplay: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timerText: { fontSize: 28, fontWeight: '700', color: Colors.textMuted, fontVariant: ['tabular-nums'] },
  timerTextActive: { color: Colors.primary },
  cardioCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.md, gap: Spacing.xs,
  },
  cardioTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: Spacing.xs },
  paceHint: { color: Colors.primary, fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIconBtn: { padding: 4 },
  exercisesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.md, marginBottom: Spacing.xs,
  },
  exercisesHeaderActions: { flexDirection: 'row', gap: Spacing.xs },
  restTimerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(230,57,70,0.1)', borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.25)',
  },
  restTimerBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  saveTemplateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.border,
  },
  saveTemplateBtnText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  overloadHint: {
    color: Colors.success, fontSize: 12, fontWeight: '600',
    marginTop: 4, marginBottom: 2,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalTitle: { ...Typography.h3, fontSize: 16 },
  modalEmpty: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  modalEmptyText: { color: Colors.textSecondary, fontWeight: '600' },
  modalEmptySubtext: { color: Colors.textMuted, fontSize: 13 },
  templateItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xs,
  },
  templateItemLeft: { flex: 1 },
  templateName: { color: Colors.textPrimary, fontWeight: '600', fontSize: 15 },
  templateMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  modalCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center',
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 2, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center',
  },
  modalConfirmText: { color: '#FFF', fontWeight: '700' },
  timerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  timerBtnStop: { backgroundColor: Colors.error },
  timerBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  libraryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(230,57,70,0.07)', borderRadius: BorderRadius.md,
    paddingVertical: 11, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.3)',
    marginBottom: Spacing.xs,
  },
  libraryBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600', flex: 1 },
  miniLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  calcIconBtn: { padding: 2 },
  prBanner: {
    position: 'absolute', bottom: 90, left: Spacing.md, right: Spacing.md, zIndex: 999,
    backgroundColor: '#1A1A1A', borderRadius: BorderRadius.lg,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: Spacing.md, borderWidth: 1.5, borderColor: '#FFD700',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },
  prBannerText: { color: '#FFD700', fontSize: 15, fontWeight: '700', flex: 1 },
  plateCalcOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  plateCalcCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, width: '90%',
    borderWidth: 1, borderColor: Colors.border, gap: Spacing.md,
  },
  plateCalcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plateCalcTitle: { ...Typography.h3, fontSize: 16 },
  plateCalcRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  plateCalcLabel: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  plateCalcChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated,
  },
  plateCalcChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  plateCalcChipText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  plateCalcChipTextActive: { color: Colors.primary },
  plateCalcInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    color: Colors.textPrimary, fontSize: 20, fontWeight: '700',
    textAlign: 'center', width: 110,
  },
  plateCalcHint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 4 },
  plateResult: { gap: Spacing.sm },
  plateResultTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  plateList: { gap: Spacing.xs },
  plateRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md, padding: Spacing.sm,
  },
  plateVisual: { height: 30, backgroundColor: Colors.primary, borderRadius: 4, minWidth: 12 },
  plateName: { flex: 1, color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  plateCount: { color: Colors.textSecondary, fontSize: 14, width: 36 },
  plateTotalVal: { color: Colors.textMuted, fontSize: 13, width: 52, textAlign: 'right' },
  plateApplyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  plateApplyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  plateLeftover: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent + '15', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.accent + '40',
    padding: Spacing.sm,
  },
  plateLeftoverText: { color: Colors.accent, fontSize: 12, flex: 1, lineHeight: 16 },
});
