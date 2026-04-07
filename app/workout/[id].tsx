import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getWorkouts, deleteWorkout } from '../../services/storage';
import { WorkoutEntry } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  strength: 'Силове', cardio: 'Кардіо', crossfit: 'CrossFit',
  hiit: 'HIIT', yoga: 'Йога', recovery: 'Відновлення',
  run: 'Біг', cycling: 'Велосипед', swimming: 'Плавання', custom: 'Інше',
};

const TYPE_COLORS: Record<string, string> = {
  strength: '#E63946', cardio: '#2EC4B6', crossfit: '#F4A261',
  hiit: '#FF6B6B', yoga: '#9B59B6', recovery: '#3498DB',
  run: '#2ECC71', cycling: '#E67E22', swimming: '#1ABC9C', custom: '#95A5A6',
};

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<WorkoutEntry | null>(null);

  useEffect(() => {
    async function load() {
      const workouts = await getWorkouts();
      setWorkout(workouts.find((w) => w.id === id) || null);
    }
    load();
  }, [id]);

  async function handleDelete() {
    Alert.alert('Видалити тренування?', 'Цю дію не можна скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(id!);
          router.back();
        },
      },
    ]);
  }

  if (!workout) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Тренування</Text>
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
  const dateFormatted = format(parseISO(workout.date), 'EEEE, d MMMM yyyy', { locale: uk });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Деталі тренування</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Type Badge */}
        <View style={[styles.typeBanner, { backgroundColor: color + '15', borderColor: color + '30' }]}>
          <View style={styles.typeBannerLeft}>
            <View style={[styles.typeIcon, { backgroundColor: color + '20' }]}>
              <Ionicons name="barbell-outline" size={24} color={color} />
            </View>
            <View>
              <Text style={[styles.typeLabel, { color }]}>{label}</Text>
              <Text style={styles.dateText}>{dateFormatted}</Text>
            </View>
          </View>
          {workout.rating && (
            <View style={styles.ratingRow}>
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
          <StatItem icon="barbell-outline" label="Вправ" value={`${workout.exercises.length}`} />
          {workout.exercises.some((e) => e.sets) && (
            <StatItem
              icon="repeat-outline"
              label="Підходів"
              value={`${workout.exercises.reduce((s, e) => s + (e.sets || 0), 0)}`}
            />
          )}
        </View>

        {/* Exercises */}
        {workout.exercises.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Вправи</Text>
            {workout.exercises.map((ex, i) => (
              <View key={i} style={styles.exerciseRow}>
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>{i + 1}</Text>
                </View>
                <View style={styles.exerciseBody}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {[
                      ex.sets && `${ex.sets} підх.`,
                      ex.reps && `× ${ex.reps} повт.`,
                      ex.weight && `${ex.weight} кг`,
                      ex.duration && `${ex.duration} хв`,
                      ex.distance && `${ex.distance} км`,
                    ].filter(Boolean).join('  ')}
                  </Text>
                  {ex.notes && <Text style={styles.exerciseNotes}>{ex.notes}</Text>}
                </View>
              </View>
            ))}
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

        {/* AI Generated Plan */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
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
  ratingRow: { flexDirection: 'row', gap: 2 },
  statsRow: {
    flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg,
  },
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
  exerciseName: { ...Typography.body, fontWeight: '600' },
  exerciseMeta: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  exerciseNotes: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  notesCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  notesText: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
