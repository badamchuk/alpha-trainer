import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getWorkouts, deleteWorkout, updateWorkout, addWorkout } from '../../services/storage';
import { WorkoutEntry, ExerciseLog, WorkoutType, SetType, SetDetail } from '../../types';
import DatePickerField from '../../components/DatePickerField';
import { computePace, formatPace } from '../../services/analytics';
import { useLocale } from '../../services/i18n';
import {
  getSupersetColor, groupIntoSuperset, ungroupSuperset, normalizeSupersets,
} from '../../services/supersets';

const CARDIO_TYPES: WorkoutType[] = ['run', 'cycling', 'swimming', 'cardio', 'hiit', 'crossfit'];

const TYPE_LABELS: Record<string, string> = {
  strength: 'Силове', cardio: 'Кардіо', crossfit: 'CrossFit',
  hiit: 'HIIT', yoga: 'Йога', recovery: 'Відновлення',
  run: 'Біг', cycling: 'Велосипед', swimming: 'Плавання', custom: 'Інше',
};

const TYPE_ICONS: Record<string, string> = {
  strength: 'barbell-outline', cardio: 'heart-outline', crossfit: 'flash-outline',
  hiit: 'timer-outline', run: 'walk-outline', yoga: 'leaf-outline',
  recovery: 'bed-outline', cycling: 'bicycle-outline', swimming: 'water-outline', custom: 'ellipsis-horizontal-outline',
};

const TYPE_COLORS: Record<string, string> = {
  strength: '#E63946', cardio: '#2EC4B6', crossfit: '#F4A261',
  hiit: '#FF6B6B', yoga: '#9B59B6', recovery: '#3498DB',
  run: '#2ECC71', cycling: '#E67E22', swimming: '#1ABC9C', custom: '#95A5A6',
};

const WORKOUT_TYPES: { id: WorkoutType; label: string; icon: string }[] = [
  { id: 'strength', label: 'Силове', icon: 'barbell-outline' },
  { id: 'cardio', label: 'Кардіо', icon: 'heart-outline' },
  { id: 'crossfit', label: 'CrossFit', icon: 'flash-outline' },
  { id: 'hiit', label: 'HIIT', icon: 'timer-outline' },
  { id: 'run', label: 'Біг', icon: 'walk-outline' },
  { id: 'yoga', label: 'Йога', icon: 'leaf-outline' },
  { id: 'recovery', label: 'Відновлення', icon: 'bed-outline' },
  { id: 'cycling', label: 'Велосипед', icon: 'bicycle-outline' },
  { id: 'swimming', label: 'Плавання', icon: 'water-outline' },
  { id: 'custom', label: 'Інше', icon: 'ellipsis-horizontal-outline' },
];

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<WorkoutEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [workoutType, setWorkoutType] = useState<WorkoutType>('strength');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
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
  const [draftSets, setDraftSets] = useState<SetDetail[]>([]);
  const [editingExIdx, setEditingExIdx] = useState<number | null>(null);
  // Групування вправ у суперсет заднім числом
  const [groupMode, setGroupMode] = useState(false);
  const [groupSel, setGroupSel] = useState<number[]>([]);
  // Cardio edit fields
  const [totalDistance, setTotalDistance] = useState('');
  const [avgHeartRate, setAvgHeartRate] = useState('');
  const [maxHeartRate, setMaxHeartRate] = useState('');
  const [elevationGain, setElevationGain] = useState('');
  const [totalCalories, setTotalCalories] = useState('');

  useEffect(() => {
    async function load() {
      const workouts = await getWorkouts();
      const found = workouts.find((w) => w.id === id) || null;
      setWorkout(found);
    }
    load();
  }, [id]);

  function enterEdit() {
    if (!workout) return;
    setWorkoutType(workout.workoutType as WorkoutType);
    setDate(workout.date);
    setDuration(String(workout.duration));
    setNotes(workout.notes || '');
    setRating(workout.rating);
    setExercises([...workout.exercises]);
    setTotalDistance(workout.totalDistance ? String(workout.totalDistance) : '');
    setAvgHeartRate(workout.avgHeartRate ? String(workout.avgHeartRate) : '');
    setMaxHeartRate(workout.maxHeartRate ? String(workout.maxHeartRate) : '');
    setElevationGain(workout.elevationGain ? String(workout.elevationGain) : '');
    setTotalCalories(workout.totalCalories ? String(workout.totalCalories) : '');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    clearExForm();
  }

  function clearExForm() {
    setExName(''); setExSets(''); setExReps(''); setExWeight('');
    setExDuration(''); setExDistance(''); setExCalories(''); setExWatts('');
    setExRpe(undefined); setExSetType('normal'); setDraftSets([]);
    setEditingExIdx(null);
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
    setEditingExIdx(idx);
  }

  function addDraftSet() {
    const reps = parseNum(exReps);
    const weight = parseNum(exWeight);
    if (!reps) { Alert.alert('Вкажи повтори для підходу'); return; }
    setDraftSets([...draftSets, { reps, weight }]);
  }

  function removeDraftSet(i: number) {
    setDraftSets(draftSets.filter((_, idx) => idx !== i));
  }

  // ── Суперсети ─────────────────────────────────────────────────────────────
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
    clearExForm();
  }

  function handleUngroup(ssId: string) {
    setExercises((prev) => ungroupSuperset(prev, ssId));
  }

  function removeExerciseAt(i: number) {
    setExercises(normalizeSupersets(exercises.filter((_, idx) => idx !== i)));
    // індекси зсуваються — інакше правили б не ту вправу
    if (editingExIdx === i) clearExForm();
    else if (editingExIdx !== null && editingExIdx > i) setEditingExIdx(editingExIdx - 1);
    setGroupSel([]);
  }

  function parseNum(v: string): number | undefined {
    if (!v.trim()) return undefined;
    const n = Number(v.replace(',', '.'));
    return isNaN(n) || n < 0 ? undefined : n;
  }

  function addExercise() {
    if (!exName.trim()) { Alert.alert(t('enterExerciseName')); return; }
    const isEdit = editingExIdx !== null;
    // Вправа лишається у своєму суперсеті — групи міняються окремою кнопкою
    const prevEx = isEdit ? exercises[editingExIdx!] : undefined;
    const common = {
      name: exName.trim(),
      duration: parseNum(exDuration),
      distance: parseNum(exDistance),
      calories: parseNum(exCalories),
      watts: parseNum(exWatts),
      supersetId: prevEx?.supersetId,
      rpe: exRpe,
      setType: exSetType !== 'normal' ? exSetType : undefined,
    };
    // Політні підходи редагуються явно (чіпи нижче), тому вони — джерело істини:
    // зведені поля рахуються з них, а не вгадуються за збігом старих значень.
    const ex: ExerciseLog = draftSets.length > 0
      ? (() => {
          const bestSet = draftSets.reduce((b, s) =>
            ((s.weight || 0) * 1000 + (s.reps || 0)) > ((b.weight || 0) * 1000 + (b.reps || 0)) ? s : b
          );
          return {
            ...common,
            sets: draftSets.length,
            reps: bestSet.reps,
            weight: bestSet.weight,
            setsDetail: draftSets,
          };
        })()
      : {
          ...common,
          sets: parseNum(exSets),
          reps: parseNum(exReps),
          weight: parseNum(exWeight),
        };

    setExercises(isEdit
      ? exercises.map((p, i) => (i === editingExIdx ? ex : p))
      : [...exercises, ex]);
    clearExForm();
  }

  async function handleSave() {
    if (!workout) return;
    if (!duration || isNaN(Number(duration))) {
      Alert.alert(t('durationRequired'));
      return;
    }
    setSaving(true);
    try {
      const distKm = totalDistance ? Number(totalDistance) : undefined;
      const durMin = Number(duration);
      const updated: WorkoutEntry = {
        ...workout,
        workoutType,
        date,
        duration: durMin,
        notes: notes.trim(),
        rating,
        exercises,
        totalDistance: distKm,
        avgPace: distKm && durMin ? computePace(distKm, durMin) : undefined,
        avgHeartRate: avgHeartRate ? Number(avgHeartRate) : undefined,
        maxHeartRate: maxHeartRate ? Number(maxHeartRate) : undefined,
        elevationGain: elevationGain ? Number(elevationGain) : undefined,
        totalCalories: totalCalories ? Number(totalCalories) : undefined,
      };
      await updateWorkout(updated);
      setWorkout(updated);
      setEditing(false);
    } catch {
      Alert.alert('Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(t('deleteWorkoutBtn'), t('deleteWorkoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => { await deleteWorkout(id!); router.back(); },
      },
    ]);
  }

  async function handleDuplicate() {
    if (!workout) return;
    const dup = {
      ...workout,
      id: Date.now().toString(),
      completedAt: new Date().toISOString(),
    };
    await addWorkout(dup);
    router.replace(`/workout/${dup.id}`);
  }

  if (!workout) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('workoutDetailTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.notFound}>
          <Text style={{ color: Colors.textSecondary }}>Тренування не знайдено</Text>
        </View>
      </View>
    );
  }

  const color = TYPE_COLORS[workout.workoutType] || Colors.textMuted;
  const label = TYPE_LABELS[workout.workoutType] || workout.workoutType;
  const typeIcon = TYPE_ICONS[workout.workoutType] || 'barbell-outline';
  const dateFormatted = format(parseISO(workout.date), 'EEEE, d MMMM yyyy', { locale: uk });

  // ─── EDIT MODE ────────────────────────────────────────────────────
  if (editing) {
    const editColor = TYPE_COLORS[workoutType] || Colors.textMuted;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={cancelEdit}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('edit')}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Workout Type */}
            <Text style={styles.label}>Тип тренування</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeList}>
              {WORKOUT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeChip, workoutType === t.id && { backgroundColor: TYPE_COLORS[t.id] + '20', borderColor: TYPE_COLORS[t.id] }]}
                  onPress={() => setWorkoutType(t.id)}
                >
                  <Ionicons name={t.icon as any} size={18} color={workoutType === t.id ? TYPE_COLORS[t.id] : Colors.textMuted} />
                  <Text style={[styles.typeChipText, workoutType === t.id && { color: TYPE_COLORS[t.id] }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <DatePickerField label="Дата" value={date} onChange={setDate} maximumDate={new Date()} />

            <Text style={styles.label}>Тривалість (хв)</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              placeholder="60"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            {CARDIO_TYPES.includes(workoutType as WorkoutType) && (
              <View style={styles.cardioCard}>
                <Text style={styles.cardioTitle}>Параметри кардіо</Text>
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
                    <Text style={styles.miniLabel}>ЧСС серед.</Text>
                    <TextInput style={styles.input} placeholder="–" placeholderTextColor={Colors.textMuted}
                      value={avgHeartRate} onChangeText={setAvgHeartRate} keyboardType="numeric" />
                  </View>
                  <View style={styles.rowItem}>
                    <Text style={styles.miniLabel}>ЧСС макс.</Text>
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
              {([1, 2, 3, 4, 5] as const).map((r) => (
                <TouchableOpacity key={r} onPress={() => setRating(rating === r ? undefined : r)}>
                  <Ionicons
                    name={rating && rating >= r ? 'star' : 'star-outline'}
                    size={28}
                    color={rating && rating >= r ? Colors.accent : Colors.textMuted}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Exercises list */}
            <Text style={styles.label}>Вправи</Text>
            <Text style={styles.editHint}>Торкнись вправи, щоб змінити її</Text>

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

            {renderEditableExercises({
              exercises,
              onRemove: removeExerciseAt,
              onEdit: startEditExercise,
              editingIdx: editingExIdx,
              groupMode,
              selected: groupSel,
              onToggleSel: toggleGroupSel,
              onUngroup: handleUngroup,
            })}

            {/* Add/edit exercise form */}
            <View style={styles.exerciseForm}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.formSubtitle}>{editingExIdx !== null ? 'Редагувати вправу' : 'Додати вправу'}</Text>
                {editingExIdx !== null && (
                  <TouchableOpacity onPress={clearExForm}>
                    <Text style={{ color: Colors.textMuted, fontSize: 13 }}>Скасувати</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Назва вправи"
                placeholderTextColor={Colors.textMuted}
                value={exName}
                onChangeText={setExName}
              />
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
              {/* Політні підходи — піраміди на кшталт 80×5 / 85×5 / 90×3 */}
              {draftSets.length > 0 && (
                <View style={styles.draftSetsList}>
                  {draftSets.map((s, i) => (
                    <View key={i} style={styles.draftSetChip}>
                      <Text style={styles.draftSetChipText}>
                        {i + 1}) {s.weight ? `${s.weight}кг × ` : ''}{s.reps}
                      </Text>
                      <TouchableOpacity onPress={() => removeDraftSet(i)} hitSlop={8}>
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

              {/* Тип підходу */}
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

              <TouchableOpacity style={[styles.addExBtn, editingExIdx !== null && { backgroundColor: Colors.accent }]} onPress={addExercise}>
                <Ionicons name={editingExIdx !== null ? 'checkmark' : 'add'} size={20} color="#FFF" />
                <Text style={styles.addExBtnText}>{editingExIdx !== null ? 'Зберегти зміни' : 'Додати'}</Text>
              </TouchableOpacity>
            </View>

            {/* Notes */}
            <Text style={styles.label}>Нотатки</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Як пройшло тренування?"
              placeholderTextColor={Colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─── VIEW MODE ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('workoutDetailTitle')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleDuplicate} style={styles.iconBtn}>
            <Ionicons name="copy-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
          {/* Підписана кнопка — сірий олівець серед трьох іконок ніхто не знаходив */}
          <TouchableOpacity onPress={enterEdit} style={styles.editPill}>
            <Ionicons name="create-outline" size={16} color="#FFF" />
            <Text style={styles.editPillText}>Змінити</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Type Banner */}
        <View style={[styles.typeBanner, { backgroundColor: color + '15', borderColor: color + '30' }]}>
          <View style={styles.typeBannerLeft}>
            <View style={[styles.typeIcon, { backgroundColor: color + '20' }]}>
              <Ionicons name={typeIcon as any} size={24} color={color} />
            </View>
            <View>
              <Text style={[styles.typeLabel, { color }]}>{label}</Text>
              <Text style={styles.dateText}>{dateFormatted}</Text>
            </View>
          </View>
          {workout.rating && (
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <Ionicons
                  key={r}
                  name={workout.rating! >= r ? 'star' : 'star-outline'}
                  size={16}
                  color={workout.rating! >= r ? Colors.accent : Colors.textMuted}
                />
              ))}
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatItem icon="time-outline" label="Тривалість" value={`${workout.duration} хв`} />
          {workout.totalDistance ? (
            <StatItem icon="navigate-outline" label="Дистанція" value={`${workout.totalDistance} км`} />
          ) : (
            <StatItem icon="barbell-outline" label="Вправ" value={`${workout.exercises.length}`} />
          )}
          {workout.avgPace ? (
            <StatItem icon="speedometer-outline" label="Темп" value={formatPace(workout.avgPace)} />
          ) : workout.exercises.some((e) => e.sets) ? (
            <StatItem icon="repeat-outline" label="Підходів"
              value={`${workout.exercises.reduce((s, e) => s + (e.sets || 0), 0)}`} />
          ) : null}
        </View>

        {/* Cardio details */}
        {(workout.avgHeartRate || workout.maxHeartRate || workout.elevationGain || workout.totalCalories) && (
          <View style={styles.cardioStatsRow}>
            {workout.avgHeartRate && (
              <View style={styles.cardioStatItem}>
                <Ionicons name="heart-outline" size={14} color="#E63946" />
                <Text style={styles.cardioStatVal}>{workout.avgHeartRate}</Text>
                <Text style={styles.cardioStatLbl}>avg уд/хв</Text>
              </View>
            )}
            {workout.maxHeartRate && (
              <View style={styles.cardioStatItem}>
                <Ionicons name="heart" size={14} color="#E63946" />
                <Text style={styles.cardioStatVal}>{workout.maxHeartRate}</Text>
                <Text style={styles.cardioStatLbl}>max уд/хв</Text>
              </View>
            )}
            {workout.elevationGain && (
              <View style={styles.cardioStatItem}>
                <Ionicons name="trending-up-outline" size={14} color={Colors.success} />
                <Text style={styles.cardioStatVal}>{workout.elevationGain}</Text>
                <Text style={styles.cardioStatLbl}>м висоти</Text>
              </View>
            )}
            {workout.totalCalories && (
              <View style={styles.cardioStatItem}>
                <Ionicons name="flame-outline" size={14} color={Colors.accent} />
                <Text style={styles.cardioStatVal}>{workout.totalCalories}</Text>
                <Text style={styles.cardioStatLbl}>ккал</Text>
              </View>
            )}
          </View>
        )}

        {/* Exercises */}
        {workout.exercises.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Вправи</Text>
            {renderDetailExercises(workout.exercises)}
          </View>
        )}

        {/* Notes */}
        {workout.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Нотатки</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{workout.notes}</Text>
            </View>
          </View>
        ) : null}

        {workout.aiGeneratedPlan && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI план</Text>
            <View style={[styles.notesCard, { borderColor: 'rgba(66,133,244,0.3)' }]}>
              <Text style={styles.notesText}>{workout.aiGeneratedPlan}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatItem({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={18} color={Colors.textMuted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── SUPERSET HELPERS ────────────────────────────────────────────────────────

// Редагований список вправ: тап відкриває вправу у формі нижче,
// у режимі групування — чекбокси для об'єднання в суперсет.
interface EditableListOpts {
  exercises: ExerciseLog[];
  onRemove: (i: number) => void;
  onEdit: (i: number) => void;
  editingIdx: number | null;
  groupMode: boolean;
  selected: number[];
  onToggleSel: (i: number) => void;
  onUngroup: (ssId: string) => void;
}

function renderEditableExercises(o: EditableListOpts): React.ReactNode[] {
  const { exercises, onRemove, onEdit, editingIdx, groupMode, selected, onToggleSel, onUngroup } = o;
  const nodes: React.ReactNode[] = [];
  const seen = new Set<string>();

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
          <Text style={styles.exerciseMeta}>{detailMeta(ex, ' · ')}</Text>
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

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const ssId = ex.supersetId;
    if (ssId) {
      if (seen.has(ssId)) continue;
      seen.add(ssId);
      const color = getSupersetColorDetail(ssId);
      const group = exercises
        .map((e, idx) => ({ e, idx }))
        .filter(({ e }) => e.supersetId === ssId);
      nodes.push(
        <View key={`ss_${ssId}`} style={[styles.supersetGroupView, { borderLeftColor: color }]}>
          <View style={styles.supersetHeaderView}>
            <Ionicons name="link-outline" size={12} color={color} />
            <Text style={[styles.supersetLabelView, { color }]}>СУПЕРСЕТ</Text>
            {!groupMode && (
              <TouchableOpacity onPress={() => onUngroup(ssId)} style={styles.ungroupBtn} hitSlop={6}>
                <Ionicons name="unlink-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.ungroupBtnText}>Розгрупувати</Text>
              </TouchableOpacity>
            )}
          </View>
          {group.map(({ e, idx }) => row(e, idx))}
        </View>
      );
    } else {
      nodes.push(row(ex, i));
    }
  }
  return nodes;
}

// кольори суперсетів — спільні з екраном логування (services/supersets.ts)
const getSupersetColorDetail = getSupersetColor;

// Формує підпис вправи; для set-by-set показує кожен підхід ("80×5 / 85×5 / 90×3")
function detailMeta(ex: ExerciseLog, sep: string): string {
  const base = ex.setsDetail && ex.setsDetail.length > 0
    ? [ex.setsDetail.map((s) => (s.weight ? `${s.weight}×${s.reps ?? '?'}` : `${s.reps ?? '?'}`)).join(' / ')]
    : [
        ex.sets && `${ex.sets} підх.`,
        ex.reps && `× ${ex.reps} повт.`,
        ex.weight && `${ex.weight} кг`,
      ];
  return [
    ...base,
    ex.duration && `${ex.duration} хв`,
    ex.distance && `${ex.distance} км`,
    ex.calories && `${ex.calories} ккал`,
    ex.watts && `${ex.watts} вт`,
  ].filter(Boolean).join(sep);
}

function renderDetailExercises(exercises: ExerciseLog[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const seen = new Set<string>();
  let counter = 1;

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (ex.supersetId && !seen.has(ex.supersetId)) {
      seen.add(ex.supersetId);
      const color = getSupersetColorDetail(ex.supersetId);
      const group = exercises.filter((e) => e.supersetId === ex.supersetId);
      nodes.push(
        <View key={`ss_${ex.supersetId}`} style={[styles.supersetGroupView, { borderLeftColor: color }]}>
          <View style={styles.supersetHeaderView}>
            <Ionicons name="link-outline" size={12} color={color} />
            <Text style={[styles.supersetLabelView, { color }]}>СУПЕРСЕТ</Text>
          </View>
          {group.map((gEx, gi) => {
            const num = counter++;
            return (
              <View key={gi} style={styles.exerciseRow}>
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>{num}</Text>
                </View>
                <View style={styles.exerciseBody}>
                  <Text style={styles.exerciseNameView}>{gEx.name}</Text>
                  <Text style={styles.exerciseMetaView}>{detailMeta(gEx, '  ')}</Text>
                  {gEx.notes && <Text style={styles.exerciseNotes}>{gEx.notes}</Text>}
                </View>
              </View>
            );
          })}
        </View>
      );
    } else if (!ex.supersetId) {
      const num = counter++;
      nodes.push(
        <View key={i} style={styles.exerciseRow}>
          <View style={styles.exerciseNumber}>
            <Text style={styles.exerciseNumberText}>{num}</Text>
          </View>
          <View style={styles.exerciseBody}>
            <Text style={styles.exerciseNameView}>{ex.name}</Text>
            <Text style={styles.exerciseMetaView}>{detailMeta(ex, '  ')}</Text>
            {ex.notes && <Text style={styles.exerciseNotes}>{ex.notes}</Text>}
          </View>
        </View>
      );
    }
  }
  return nodes;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  headerActions: { flexDirection: 'row', gap: Spacing.xs },
  iconBtn: { padding: 4 },
  saveBtn: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  content: { padding: Spacing.md, paddingBottom: 40 },
  typeBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, marginBottom: Spacing.md,
  },
  typeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  typeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: 18, fontWeight: '700' },
  dateText: { color: Colors.textSecondary, fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  starsRow: { flexDirection: 'row', gap: 2 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statItem: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.sm, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { ...Typography.h3, fontSize: 16, marginBottom: Spacing.sm },
  exerciseRow: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border,
  },
  exerciseNumber: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  exerciseNumberText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  exerciseBody: { flex: 1 },
  exerciseNameView: { ...Typography.body, fontWeight: '600' },
  exerciseMetaView: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  exerciseNotes: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  supersetGroupView: {
    borderLeftWidth: 3, borderRadius: BorderRadius.md,
    paddingLeft: Spacing.xs, marginBottom: Spacing.xs,
  },
  supersetHeaderView: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingBottom: 4, paddingLeft: 2,
  },
  supersetLabelView: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  notesCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  notesText: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardioStatsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  cardioStatItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardioStatVal: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  cardioStatLbl: { color: Colors.textMuted, fontSize: 11 },
  cardioCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.xs, gap: Spacing.xs,
  },
  cardioTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: Spacing.xs },
  paceHint: { color: Colors.primary, fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  // Edit mode styles
  label: {
    color: Colors.textSecondary, fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: Spacing.xs, marginTop: Spacing.md,
  },
  miniLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 4 },
  typeList: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  typeChipText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  ratingRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 15,
  },
  notesInput: { minHeight: 100, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  rowItem: { flex: 1 },
  exerciseItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border,
  },
  exerciseItemEditing: { borderColor: Colors.accent, backgroundColor: Colors.accent + '10' },
  editHint: { color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.xs },
  editPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 7, marginLeft: 2,
  },
  editPillText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
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
  draftSetsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  draftSetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.background, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  draftSetChipText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
  addSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    marginTop: 4,
  },
  addSetBtnText: { color: Colors.textSecondary, fontSize: 12 },
  setTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  setTypeChip: {
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  setTypeChipText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
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
});
