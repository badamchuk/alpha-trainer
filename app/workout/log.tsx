import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { addWorkout, getWorkouts } from '../../services/storage';
import { WorkoutEntry, ExerciseLog, WorkoutType } from '../../types';
import DatePickerField from '../../components/DatePickerField';
import { computePace, formatPace } from '../../services/analytics';
import RestTimer from '../../components/RestTimer';
import { getTemplates, saveTemplate, WorkoutTemplate } from '../../services/templates';

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
  const [workoutType, setWorkoutType] = useState<WorkoutType>('strength');
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(localToday);
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [saving, setSaving] = useState(false);

  // Rest timer
  const [restTimerVisible, setRestTimerVisible] = useState(false);

  // Templates
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [saveTemplateVisible, setSaveTemplateVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Progressive overload hint
  const [overloadHint, setOverloadHint] = useState('');

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function lookupOverloadHint(name: string) {
    if (!name.trim()) { setOverloadHint(''); return; }
    const all = await getWorkouts();
    for (const w of all) {
      const ex = w.exercises.find((e) => e.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (ex) {
        const parts: string[] = [];
        if (ex.weight) parts.push(`${ex.weight} кг`);
        if (ex.reps) parts.push(`${ex.reps} повт.`);
        if (ex.sets) parts.push(`${ex.sets} підх.`);
        setOverloadHint(parts.length ? `Минулого разу: ${parts.join(' × ')}` : '');
        return;
      }
    }
    setOverloadHint('');
  }

  async function openTemplates() {
    const t = await getTemplates();
    setTemplates(t);
    setTemplatesVisible(true);
  }

  function applyTemplate(t: WorkoutTemplate) {
    setWorkoutType(t.workoutType);
    setExercises(t.exercises);
    setTemplatesVisible(false);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) { Alert.alert('Введи назву шаблону'); return; }
    await saveTemplate({
      id: Date.now().toString(),
      name: templateName.trim(),
      workoutType,
      exercises,
      createdAt: new Date().toISOString(),
    });
    setSaveTemplateVisible(false);
    setTemplateName('');
    Alert.alert('Шаблон збережено!');
  }

  function addExercise() {
    if (!exName.trim()) { Alert.alert('Введи назву вправи'); return; }
    const ex: ExerciseLog = {
      name: exName.trim(),
      sets: exSets ? Number(exSets) : undefined,
      reps: exReps ? Number(exReps) : undefined,
      weight: exWeight ? Number(exWeight) : undefined,
      duration: exDuration ? Number(exDuration) : undefined,
      distance: exDistance ? Number(exDistance) : undefined,
      calories: exCalories ? Number(exCalories) : undefined,
      watts: exWatts ? Number(exWatts) : undefined,
    };
    setExercises([...exercises, ex]);
    setExName(''); setExSets(''); setExReps(''); setExWeight('');
    setExDuration(''); setExDistance(''); setExCalories(''); setExWatts('');
    setOverloadHint('');
    setRestTimerVisible(true);
  }

  function removeExercise(i: number) {
    setExercises(exercises.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!duration || isNaN(Number(duration))) { Alert.alert('Вкажи тривалість тренування (в хвилинах)'); return; }

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Нове тренування</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={openTemplates} style={styles.headerIconBtn}>
              <Ionicons name="albums-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>Зберегти</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Workout Type */}
          <Text style={styles.label}>Тип тренування</Text>
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

          <Text style={styles.label}>Тривалість (хв)</Text>
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
                  <Text style={styles.miniLabel}>Дистанція (км)</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={totalDistance} onChangeText={setTotalDistance} keyboardType="decimal-pad" />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.miniLabel}>ккал (всього)</Text>
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
                  <Text style={styles.miniLabel}>ЧСС серед. (уд/хв)</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={avgHeartRate} onChangeText={setAvgHeartRate} keyboardType="numeric" />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.miniLabel}>ЧСС макс. (уд/хв)</Text>
                  <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                    value={maxHeartRate} onChangeText={setMaxHeartRate} keyboardType="numeric" />
                </View>
              </View>
              {workoutType === 'run' && (
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <Text style={styles.miniLabel}>Набір висоти (м)</Text>
                    <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                      value={elevationGain} onChangeText={setElevationGain} keyboardType="numeric" />
                  </View>
                  <View style={styles.rowItem} />
                </View>
              )}
            </View>
          )}

          {/* Rating */}
          <Text style={styles.label}>Оцінка тренування</Text>
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
            <Text style={styles.label}>Вправи</Text>
            <View style={styles.exercisesHeaderActions}>
              {exercises.length > 0 && (
                <TouchableOpacity
                  style={styles.restTimerBtn}
                  onPress={() => setRestTimerVisible(true)}
                >
                  <Ionicons name="timer-outline" size={15} color={Colors.primary} />
                  <Text style={styles.restTimerBtnText}>Відпочинок</Text>
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

          {exercises.map((ex, i) => (
            <View key={i} style={styles.exerciseItem}>
              <View style={styles.exerciseLeft}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseMeta}>
                  {[
                    ex.sets && `${ex.sets} підх.`,
                    ex.reps && `${ex.reps} повт.`,
                    ex.weight && `${ex.weight} кг`,
                    ex.duration && `${ex.duration} хв`,
                    ex.distance && `${ex.distance} км`,
                    ex.calories && `${ex.calories} ккал`,
                    ex.watts && `${ex.watts} вт`,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeExercise(i)}>
                <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add Exercise Form */}
          <View style={styles.exerciseForm}>
            <Text style={styles.formSubtitle}>Додати вправу</Text>
            <TextInput
              style={styles.input}
              placeholder="Назва вправи (наприклад: Присідання)"
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
                <Text style={styles.miniLabel}>Підходи</Text>
                <TextInput style={styles.input} placeholder="3" placeholderTextColor={Colors.textMuted}
                  value={exSets} onChangeText={setExSets} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>Повтори</Text>
                <TextInput style={styles.input} placeholder="12" placeholderTextColor={Colors.textMuted}
                  value={exReps} onChangeText={setExReps} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>Вага (кг)</Text>
                <TextInput style={styles.input} placeholder="50" placeholderTextColor={Colors.textMuted}
                  value={exWeight} onChangeText={setExWeight} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>Час (хв)</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exDuration} onChangeText={setExDuration} keyboardType="numeric" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>Км</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exDistance} onChangeText={setExDistance} keyboardType="decimal-pad" />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>ккал</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exCalories} onChangeText={setExCalories} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.miniLabel}>Вати (вт)</Text>
                <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                  value={exWatts} onChangeText={setExWatts} keyboardType="numeric" />
              </View>
              <View style={[styles.rowItem, { flex: 2 }]}>
                <Text style={styles.miniLabel}> </Text>
                <TouchableOpacity style={styles.addExBtn} onPress={addExercise}>
                  <Ionicons name="add" size={20} color="#FFF" />
                  <Text style={styles.addExBtnText}>Додати</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Notes */}
          <Text style={styles.label}>Нотатки</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Як пройшло тренування? Самопочуття, досягнення, що покращити..."
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </ScrollView>
      </View>

      {/* Rest Timer Modal */}
      <RestTimer visible={restTimerVisible} onClose={() => setRestTimerVisible(false)} />

      {/* Templates Modal */}
      <Modal visible={templatesVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Шаблони тренувань</Text>
              <TouchableOpacity onPress={() => setTemplatesVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {templates.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="albums-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.modalEmptyText}>Немає збережених шаблонів</Text>
                <Text style={styles.modalEmptySubtext}>Додай вправи та збережи як шаблон</Text>
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { padding: Spacing.lg }]}>
            <Text style={styles.modalTitle}>Зберегти шаблон</Text>
            <TextInput
              style={[styles.input, { marginTop: Spacing.md }]}
              placeholder="Назва шаблону"
              placeholderTextColor={Colors.textMuted}
              value={templateName}
              onChangeText={setTemplateName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setSaveTemplateVisible(false); setTemplateName(''); }}
              >
                <Text style={styles.modalCancelText}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSaveTemplate}>
                <Text style={styles.modalConfirmText}>Зберегти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  formSubtitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: Spacing.xs },
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
});
