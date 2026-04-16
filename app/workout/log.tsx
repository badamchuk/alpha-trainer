import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { addWorkout, getWorkouts, getLocalDateString } from '../../services/storage';
import { WorkoutEntry, ExerciseLog, WorkoutType, SetType } from '../../types';
import DatePickerField from '../../components/DatePickerField';
import { computePace, formatPace, getOverloadSuggestion } from '../../services/analytics';
import RestTimer from '../../components/RestTimer';
import { getTemplates, saveTemplate, WorkoutTemplate } from '../../services/templates';
import { useLocale } from '../../services/i18n';
import ExercisePicker from '../../components/ExercisePicker';

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

  // Superset mode
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

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function toggleTimer() {
    if (timerRunning) {
      clearInterval(timerRef.current!);
      timerRef.current = null;
      setTimerRunning(false);
      const mins = Math.max(1, Math.round(timerSeconds / 60));
      setDuration(String(mins));
    } else {
      setTimerRunning(true);
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
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

  function addExercise() {
    if (!exName.trim()) { Alert.alert(t('enterExerciseName')); return; }
    const ex: ExerciseLog = {
      name: exName.trim(),
      sets: parseNum(exSets),
      reps: parseNum(exReps),
      weight: parseNum(exWeight),
      duration: parseNum(exDuration),
      distance: parseNum(exDistance),
      calories: parseNum(exCalories),
      watts: parseNum(exWatts),
      supersetId: supersetMode && currentSupersetId ? currentSupersetId : undefined,
      rpe: exRpe,
      setType: exSetType !== 'normal' ? exSetType : undefined,
    };
    setExercises([...exercises, ex]);
    setExName(''); setExSets(''); setExReps(''); setExWeight('');
    setExDuration(''); setExDistance(''); setExCalories(''); setExWatts('');
    setExRpe(undefined); setExSetType('normal');
    setOverloadHint('');
    // Auto-open rest timer only for strength-type workouts (has sets/reps/weight)
    if (ex.sets || ex.reps || ex.weight) {
      setRestTimerVisible(true);
    }
  }

  function removeExercise(i: number) {
    setExercises(exercises.filter((_, idx) => idx !== i));
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
        <View style={styles.header}>
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

        {repeatingFrom && (
          <View style={styles.repeatBanner}>
            <Ionicons name="copy-outline" size={14} color={Colors.primary} />
            <Text style={styles.repeatBannerText}>Повторення тренування — відредагуй і збережи як нове</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

          {renderExerciseGroups(exercises, removeExercise)}

          {/* Add Exercise Form */}
          <View style={styles.exerciseForm}>
            <View style={styles.formHeader}>
              <Text style={styles.formSubtitle}>{t('addExercise')}</Text>
              <TouchableOpacity
                style={[styles.supersetToggle, supersetMode && styles.supersetToggleActive]}
                onPress={toggleSupersetMode}
              >
                <Ionicons name="link-outline" size={14} color={supersetMode ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.supersetToggleText, supersetMode && styles.supersetToggleTextActive]}>
                  Суперсет
                </Text>
              </TouchableOpacity>
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
                <Text style={styles.miniLabel}>{t('weightKgLabel')}</Text>
                <TextInput style={styles.input} placeholder="50" placeholderTextColor={Colors.textMuted}
                  value={exWeight} onChangeText={setExWeight} keyboardType="decimal-pad" />
              </View>
            </View>
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
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.addExBtnText}>{t('add')}</Text>
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
      <Modal visible={templatesVisible} transparent animationType="slide">
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

      {/* Save Template Modal */}
      <Modal visible={saveTemplateVisible} transparent animationType="fade">
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

// ─── SUPERSET COLORS ─────────────────────────────────────────────────────────

const SUPERSET_COLORS = ['#E63946', '#2EC4B6', '#F4A261', '#9B59B6', '#2ECC71', '#E91E63'];

function getSupersetColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return SUPERSET_COLORS[hash % SUPERSET_COLORS.length];
}

function renderExerciseMeta(ex: ExerciseLog): string {
  const SET_TYPE_LABELS: Record<string, string> = {
    warmup: '🔵 Розм.', dropset: '🟠 Дроп', failure: '🔴 Відмова',
  };
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

function renderExerciseGroups(
  exercises: ExerciseLog[],
  onRemove: (i: number) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  // group consecutive exercises with the same supersetId
  const seenSupersets = new Map<string, number>(); // id → group index

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
            </View>
            {group.map(({ ex: gEx, idx }) => (
              <View key={idx} style={styles.exerciseItem}>
                <View style={styles.exerciseLeft}>
                  <Text style={styles.exerciseName}>{gEx.name}</Text>
                  <Text style={styles.exerciseMeta}>{renderExerciseMeta(gEx)}</Text>
                </View>
                <TouchableOpacity onPress={() => onRemove(idx)}>
                  <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );
      }
      i++;
    } else {
      nodes.push(
        <View key={i} style={styles.exerciseItem}>
          <View style={styles.exerciseLeft}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <Text style={styles.exerciseMeta}>{renderExerciseMeta(ex)}</Text>
          </View>
          <TouchableOpacity onPress={() => onRemove(i)}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      );
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
    paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.md,
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
  exerciseForm: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.xs, gap: Spacing.xs,
  },
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
});
