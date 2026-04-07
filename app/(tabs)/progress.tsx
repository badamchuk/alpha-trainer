import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Dimensions,
  TouchableOpacity, TextInput, Modal, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getWorkouts, getStats, getPersonalRecords, PersonalRecord, getWeightLog, addWeightEntry, WeightEntry, getLocalDateString } from '../../services/storage';
import { WorkoutEntry } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProgressScreen() {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, weeklyWorkouts: 0, monthlyWorkouts: 0, totalDuration: 0, streak: 0 });
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [weightLog, setWeightLog] = useState<WeightEntry[]>([]);
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const [w, s, r, wl] = await Promise.all([getWorkouts(), getStats(), getPersonalRecords(), getWeightLog()]);
    setWorkouts(w);
    setStats(s);
    setRecords(r);
    setWeightLog(wl);
  }

  async function handleLogWeight() {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(val) || val < 20 || val > 300) {
      Alert.alert('Введи коректну вагу (20–300 кг)');
      return;
    }
    await addWeightEntry({ date: getLocalDateString(new Date()), weight: val });
    setWeightInput('');
    setWeightModalVisible(false);
    await loadData();
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

      {/* Weight History */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Вага тіла</Text>
          <TouchableOpacity style={styles.logWeightBtn} onPress={() => setWeightModalVisible(true)}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.logWeightBtnText}>Записати</Text>
          </TouchableOpacity>
        </View>
        {weightLog.length === 0 ? (
          <TouchableOpacity style={styles.weightEmpty} onPress={() => setWeightModalVisible(true)}>
            <Ionicons name="scale-outline" size={28} color={Colors.textMuted} />
            <Text style={styles.weightEmptyText}>Записуй вагу щоб відстежувати динаміку</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Sparkline chart */}
            {weightLog.length >= 2 && (() => {
              const last = weightLog.slice(-12);
              const minW = Math.min(...last.map((e) => e.weight));
              const maxW = Math.max(...last.map((e) => e.weight));
              const range = maxW - minW || 1;
              const chartH = 48;
              const chartW = SCREEN_WIDTH - Spacing.md * 4 - Spacing.md * 2;
              const step = chartW / (last.length - 1);
              return (
                <View style={styles.weightChartContainer}>
                  <View style={{ height: chartH, position: 'relative' }}>
                    {last.map((e, i) => {
                      const x = i * step;
                      const y = chartH - ((e.weight - minW) / range) * (chartH - 8);
                      return (
                        <View key={i} style={[styles.weightDot, { left: x - 4, top: y - 4 }]} />
                      );
                    })}
                  </View>
                  <View style={styles.weightChartLabels}>
                    <Text style={styles.weightChartLabel}>{minW} кг</Text>
                    <Text style={styles.weightChartLabel}>{maxW} кг</Text>
                  </View>
                </View>
              );
            })()}
            {/* Last 5 entries */}
            {weightLog.slice(-5).reverse().map((e, i) => (
              <View key={i} style={styles.weightRow}>
                <Ionicons name="scale-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.weightDate}>{e.date}</Text>
                <Text style={styles.weightValue}>{e.weight} кг</Text>
              </View>
            ))}
            {weightLog.length > 5 && (
              <Text style={styles.weightMore}>+{weightLog.length - 5} ще записів</Text>
            )}
          </>
        )}
      </View>

      {/* Personal Records */}
      {records.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Особисті рекорди</Text>
          {records.map((r, i) => (
            <View key={i} style={styles.prRow}>
              <View style={styles.prRank}>
                <Text style={styles.prRankText}>{i + 1}</Text>
              </View>
              <View style={styles.prBody}>
                <Text style={styles.prName} numberOfLines={1}>{r.exerciseName}</Text>
                <Text style={styles.prDate}>{r.date}</Text>
              </View>
              <View style={styles.prStats}>
                {r.maxWeight > 0 && (
                  <View style={styles.prBadge}>
                    <Ionicons name="barbell-outline" size={12} color={Colors.primary} />
                    <Text style={styles.prBadgeText}>{r.maxWeight} кг</Text>
                  </View>
                )}
                {r.maxReps > 0 && (
                  <View style={[styles.prBadge, { backgroundColor: 'rgba(46,196,182,0.12)' }]}>
                    <Ionicons name="repeat-outline" size={12} color={Colors.success} />
                    <Text style={[styles.prBadgeText, { color: Colors.success }]}>{r.maxReps} повт.</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {workouts.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="stats-chart-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Немає даних</Text>
          <Text style={styles.emptyText}>Починай записувати тренування — тут буде твоя статистика</Text>
        </View>
      )}

      {/* Weight log modal */}
      <Modal visible={weightModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Записати вагу</Text>
            <TextInput
              style={styles.weightModalInput}
              placeholder="наприклад: 75.5"
              placeholderTextColor={Colors.textMuted}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={styles.modalUnit}>кг</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setWeightModalVisible(false); setWeightInput(''); }}>
                <Text style={styles.modalCancelText}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleLogWeight}>
                <Text style={styles.modalSaveText}>Зберегти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  prRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border,
  },
  prRank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(230,57,70,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  prRankText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  prBody: { flex: 1 },
  prName: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  prDate: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  prStats: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' },
  prBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(230,57,70,0.12)', borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  prBadgeText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  logWeightBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  logWeightBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  weightEmpty: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm,
  },
  weightEmptyText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  weightChartContainer: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  weightDot: {
    position: 'absolute', width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  weightChartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  weightChartLabel: { color: Colors.textMuted, fontSize: 11 },
  weightRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  weightDate: { flex: 1, color: Colors.textSecondary, fontSize: 14 },
  weightValue: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  weightMore: { color: Colors.textMuted, fontSize: 12, marginTop: Spacing.xs, textAlign: 'center' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, width: '80%', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  modalTitle: { ...Typography.h3, marginBottom: Spacing.md },
  weightModalInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    color: Colors.textPrimary, fontSize: 28, fontWeight: '700',
    textAlign: 'center', width: '100%', marginBottom: Spacing.xs,
  },
  modalUnit: { color: Colors.textMuted, fontSize: 14, marginBottom: Spacing.lg },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  modalCancel: {
    flex: 1, padding: Spacing.sm, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  modalSave: {
    flex: 1, padding: Spacing.sm, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  modalSaveText: { color: '#FFF', fontWeight: '700' },
});
