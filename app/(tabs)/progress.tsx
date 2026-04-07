import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getWorkouts, getStats } from '../../services/storage';
import { WorkoutEntry } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProgressScreen() {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, weeklyWorkouts: 0, monthlyWorkouts: 0, totalDuration: 0, streak: 0 });
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const [w, s] = await Promise.all([getWorkouts(), getStats()]);
    setWorkouts(w);
    setStats(s);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Activity heatmap — last 28 days
  const today = new Date();
  const last28Days = eachDayOfInterval({ start: subDays(today, 27), end: today });
  const workoutDates = new Set(workouts.map((w) => w.date));

  // Weekly activity (last 12 weeks)
  const weeklyData = Array.from({ length: 12 }, (_, i) => {
    const weekEnd = subDays(today, i * 7);
    const weekStart = subDays(weekEnd, 6);
    const count = workouts.filter((w) => {
      const d = new Date(w.date);
      return d >= weekStart && d <= weekEnd;
    }).length;
    return { week: 12 - i, count, label: format(weekEnd, 'dd.MM') };
  }).reverse();

  const maxWeekly = Math.max(...weeklyData.map((w) => w.count), 1);

  // Workout type distribution
  const typeCounts: Record<string, number> = {};
  workouts.forEach((w) => {
    typeCounts[w.workoutType] = (typeCounts[w.workoutType] || 0) + 1;
  });
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxType = typeEntries[0]?.[1] || 1;

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

  const totalDurationHours = Math.floor(stats.totalDuration / 60);
  const totalDurationMins = stats.totalDuration % 60;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Text style={[styles.title, { marginBottom: Spacing.lg }]}>Прогрес</Text>

      {/* Key Stats */}
      <View style={styles.statsGrid}>
        <BigStat icon="flame-outline" color={Colors.primary} value={`${stats.streak}`} unit="днів поспіль" label="Серія" />
        <BigStat icon="barbell-outline" color={Colors.success} value={`${stats.totalWorkouts}`} unit="тренувань" label="Загалом" />
        <BigStat icon="calendar-outline" color={Colors.accent} value={`${stats.weeklyWorkouts}`} unit="цього тижня" label="Тижнево" />
        <BigStat
          icon="timer-outline" color="#9B59B6"
          value={totalDurationHours > 0 ? `${totalDurationHours}г ${totalDurationMins}хв` : `${stats.totalDuration}хв`}
          unit="загальний час" label="Тривалість"
        />
      </View>

      {/* Activity Heatmap */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Активність — останні 28 днів</Text>
        <View style={styles.heatmapContainer}>
          <View style={styles.heatmap}>
            {last28Days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isToday = dateStr === format(today, 'yyyy-MM-dd');
              const hasWorkout = workoutDates.has(dateStr);
              return (
                <View key={dateStr} style={[
                  styles.heatmapCell,
                  hasWorkout && styles.heatmapActive,
                  isToday && styles.heatmapToday,
                ]}>
                  {isToday && <View style={styles.todayDot} />}
                </View>
              );
            })}
          </View>
          <View style={styles.heatmapLegend}>
            <View style={styles.heatmapCell} />
            <Text style={styles.legendText}>Немає</Text>
            <View style={[styles.heatmapCell, styles.heatmapActive]} />
            <Text style={styles.legendText}>Є тренування</Text>
          </View>
        </View>
      </View>

      {/* Weekly bar chart */}
      {workouts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Тижневий об'єм (12 тижнів)</Text>
          <View style={styles.barChart}>
            {weeklyData.map((item) => (
              <View key={item.week} style={styles.barColumn}>
                <Text style={styles.barValue}>{item.count > 0 ? item.count : ''}</Text>
                <View style={styles.barWrapper}>
                  <View style={[
                    styles.bar,
                    { height: Math.max((item.count / maxWeekly) * 80, item.count > 0 ? 4 : 0) },
                  ]} />
                </View>
                <Text style={styles.barLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Workout type distribution */}
      {typeEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Типи тренувань</Text>
          {typeEntries.map(([type, count]) => {
            const pct = (count / maxType) * 100;
            const color = TYPE_COLORS[type] || Colors.textMuted;
            return (
              <View key={type} style={styles.typeRow}>
                <Text style={styles.typeLabel}>{TYPE_LABELS[type] || type}</Text>
                <View style={styles.typeBar}>
                  <View style={[styles.typeBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.typeCount, { color }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}

      {workouts.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="stats-chart-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Немає даних</Text>
          <Text style={styles.emptyText}>Починай записувати тренування — тут буде твоя статистика</Text>
        </View>
      )}
    </ScrollView>
  );
}

function BigStat({ icon, color, value, unit, label }: {
  icon: any; color: string; value: string; unit: string; label: string;
}) {
  return (
    <View style={styles.bigStatCard}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.bigStatValue, { color }]}>{value}</Text>
      <Text style={styles.bigStatUnit}>{unit}</Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingTop: 56, paddingBottom: 32 },
  title: { ...Typography.h2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  bigStatCard: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm) / 2,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  bigStatValue: { fontSize: 26, fontWeight: '800' },
  bigStatUnit: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  bigStatLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { ...Typography.h3, fontSize: 16, marginBottom: Spacing.md },
  heatmapContainer: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: Spacing.sm },
  heatmapCell: {
    width: (SCREEN_WIDTH - Spacing.md * 4 - 4 * 27) / 28,
    aspectRatio: 1, borderRadius: 3,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  heatmapActive: { backgroundColor: Colors.primary },
  heatmapToday: { borderWidth: 2, borderColor: Colors.accent },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF' },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: Colors.textMuted, fontSize: 11 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  barColumn: { flex: 1, alignItems: 'center' },
  barValue: { color: Colors.textMuted, fontSize: 9, marginBottom: 2 },
  barWrapper: { width: '100%', height: 80, justifyContent: 'flex-end' },
  bar: { backgroundColor: Colors.primary, borderRadius: 3, width: '100%' },
  barLabel: { color: Colors.textMuted, fontSize: 9, marginTop: 4, transform: [{ rotate: '-45deg' }] },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeLabel: { color: Colors.textSecondary, fontSize: 13, width: 85 },
  typeBar: { flex: 1, height: 8, backgroundColor: Colors.surfaceElevated, borderRadius: 4, overflow: 'hidden' },
  typeBarFill: { height: '100%', borderRadius: 4 },
  typeCount: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 40, gap: Spacing.sm },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary },
  emptyText: { ...Typography.bodySmall, textAlign: 'center', maxWidth: 260 },
});
