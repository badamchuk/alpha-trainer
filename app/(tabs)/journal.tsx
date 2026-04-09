import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, RefreshControl, TextInput, Share,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getWorkouts, deleteWorkout } from '../../services/storage';
import { WorkoutEntry } from '../../types';

const WORKOUT_TYPE_COLORS: Record<string, string> = {
  strength: '#E63946',
  cardio: '#2EC4B6',
  crossfit: '#F4A261',
  hiit: '#FF6B6B',
  yoga: '#9B59B6',
  recovery: '#3498DB',
  run: '#2ECC71',
  cycling: '#E67E22',
  swimming: '#1ABC9C',
  custom: '#95A5A6',
};

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  strength: 'Силове',
  cardio: 'Кардіо',
  crossfit: 'CrossFit',
  hiit: 'HIIT',
  yoga: 'Йога',
  recovery: 'Відновлення',
  run: 'Біг',
  cycling: 'Велосипед',
  swimming: 'Плавання',
  custom: 'Інше',
};

export default function JournalScreen() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function loadWorkouts() {
    const data = await getWorkouts();
    setWorkouts(data);
  }

  useFocusEffect(
    useCallback(() => {
      loadWorkouts();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWorkouts();
    setRefreshing(false);
  };

  const handleDelete = (id: string, type: string) => {
    Alert.alert('Видалити тренування', `Видалити "${type}"?`, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(id);
          await loadWorkouts();
        },
      },
    ]);
  };

  const filtered = workouts.filter((w) => {
    if (filter && w.workoutType !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.workoutType.toLowerCase().includes(q) ||
      w.notes?.toLowerCase().includes(q) ||
      w.exercises.some((e) => e.name.toLowerCase().includes(q))
    );
  });

  const typeFilters = Array.from(new Set(workouts.map((w) => w.workoutType)));

  async function exportCSV() {
    if (workouts.length === 0) { Alert.alert('Немає даних для експорту'); return; }
    const header = 'Дата,Тип,Тривалість (хв),Вправи,Дистанція (км),ккал,Нотатки,Оцінка\n';
    const rows = workouts.map((w) => {
      const exStr = w.exercises.map((e) => {
        const parts = [e.name];
        if (e.sets && e.reps) parts.push(`${e.sets}x${e.reps}`);
        if (e.weight) parts.push(`${e.weight}кг`);
        return parts.join(' ');
      }).join('; ');
      const cols = [
        w.date,
        WORKOUT_TYPE_LABELS[w.workoutType] || w.workoutType,
        w.duration || '',
        `"${exStr.replace(/"/g, '""')}"`,
        w.totalDistance || '',
        w.totalCalories || '',
        `"${(w.notes || '').replace(/"/g, '""')}"`,
        w.rating || '',
      ];
      return cols.join(',');
    });
    const csv = header + rows.join('\n');
    try {
      await Share.share({ message: csv, title: 'AlphaTrainer – Журнал тренувань' });
    } catch { /* user cancelled */ }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Журнал тренувань</Text>
        <View style={styles.headerActions}>
          {workouts.length > 0 && (
            <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
              <Ionicons name="share-outline" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/workout/log')}
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук за вправою, нотатками..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClear}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      {typeFilters.length > 1 && (
        <View>
          <FlatList
            horizontal
            data={[null, ...typeFilters]}
            keyExtractor={(item) => item || 'all'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.filterChip, filter === item && styles.filterChipActive]}
                onPress={() => setFilter(item)}
              >
                <Text style={[styles.filterChipText, filter === item && styles.filterChipTextActive]}>
                  {item ? (WORKOUT_TYPE_LABELS[item] || item) : 'Всі'}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="journal-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Журнал порожній</Text>
            <Text style={styles.emptyText}>Запиши своє перше тренування</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/workout/log')}>
              <Text style={styles.emptyBtnText}>Записати тренування</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item }) => <WorkoutCard workout={item} onPress={() => router.push(`/workout/${item.id}`)} onDelete={() => handleDelete(item.id, item.workoutType)} />}
      />
    </View>
  );
}

function WorkoutCard({ workout, onPress, onDelete }: {
  workout: WorkoutEntry; onPress: () => void; onDelete: () => void;
}) {
  const color = WORKOUT_TYPE_COLORS[workout.workoutType] || Colors.textMuted;
  const label = WORKOUT_TYPE_LABELS[workout.workoutType] || workout.workoutType;
  const dateObj = parseISO(workout.date);
  const dateStr = format(dateObj, 'd MMMM yyyy', { locale: uk });
  const dayStr = format(dateObj, 'EEEE', { locale: uk });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} onLongPress={onDelete} activeOpacity={0.8}>
      <View style={[styles.cardAccent, { backgroundColor: color }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.cardLeft}>
            <View style={[styles.typeBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
              <Text style={[styles.typeBadgeText, { color }]}>{label}</Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            {workout.duration > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText}>{workout.duration} хв</Text>
              </View>
            )}
            {workout.rating && (
              <View style={styles.metaItem}>
                <Ionicons name="star" size={12} color={Colors.accent} />
                <Text style={[styles.metaText, { color: Colors.accent }]}>{workout.rating}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.cardDate}>{dayStr}, {dateStr}</Text>

        {workout.exercises.length > 0 && (
          <Text style={styles.cardExercises} numberOfLines={1}>
            {workout.exercises.map((e) => e.name).join(' · ')}
          </Text>
        )}

        {workout.notes ? (
          <Text style={styles.cardNotes} numberOfLines={2}>{workout.notes}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { ...Typography.h2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  exportBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: Spacing.md, marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  searchIcon: { paddingHorizontal: 6 },
  searchInput: {
    flex: 1, color: Colors.textPrimary, fontSize: 15,
    paddingVertical: 10,
  },
  searchClear: { padding: 6 },
  filterList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  filterChipTextActive: { color: '#FFF' },
  listContent: { padding: Spacing.md, gap: Spacing.sm },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.sm },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary },
  emptyText: { ...Typography.bodySmall },
  emptyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginTop: Spacing.md,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700' },
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  cardAccent: { width: 4 },
  cardContent: { flex: 1, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardLeft: { flexDirection: 'row', gap: Spacing.xs },
  cardRight: { flexDirection: 'row', gap: Spacing.sm },
  typeBadge: {
    borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: Colors.textMuted, fontSize: 12 },
  cardDate: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  cardExercises: { color: Colors.textMuted, fontSize: 12, marginBottom: 4 },
  cardNotes: { color: Colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
});
