import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getUserProfile, getGoals, getRecentWorkouts, getStats, getWorkoutsForDate, getTrainingPlan } from '../../services/storage';
import { getDailyAdvice as geminiDailyAdvice } from '../../services/gemini';
import { getDailyAdvice as groqDailyAdvice, initGroq } from '../../services/groq';
import { getTodayPlan, WORKOUT_TYPE_LABELS, WORKOUT_TYPE_COLORS } from '../../services/planParser';
import { UserProfile, WorkoutEntry, TrainingPlan, DayPlan } from '../../types';

export default function TodayScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutEntry[]>([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, weeklyWorkouts: 0, monthlyWorkouts: 0, totalDuration: 0, streak: 0 });
  const [advice, setAdvice] = useState<string>('');
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayPlan, setTodayPlan] = useState<DayPlan | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const todayFormatted = format(new Date(), 'EEEE, d MMMM', { locale: uk });

  async function loadData() {
    const [p, s, tw, plan] = await Promise.all([
      getUserProfile(),
      getStats(),
      getWorkoutsForDate(today),
      getTrainingPlan(),
    ]);
    setProfile(p);
    setStats(s);
    setTodayWorkouts(tw);
    setTodayPlan(plan ? getTodayPlan(plan) : null);
  }

  async function loadAdvice(p: UserProfile) {
    if (!p?.groqApiKey && !p?.geminiApiKey) return;
    setLoadingAdvice(true);
    try {
      const goals = await getGoals();
      const recent = await getRecentWorkouts(5);
      let text: string;
      if (p.groqApiKey) {
        initGroq(p.groqApiKey);
        text = await groqDailyAdvice(p, goals, recent);
      } else {
        text = await geminiDailyAdvice(p, goals, recent);
      }
      setAdvice(text);
    } catch {
      setAdvice('');
    } finally {
      setLoadingAdvice(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData().then(() => {
        getUserProfile().then((p) => p && loadAdvice(p));
      });
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (profile) await loadAdvice(profile);
    setRefreshing(false);
  };

  const dayOfWeek = new Date().getDay(); // 0=Sun
  const workoutDayNames: Record<number, string> = { 0: 'Відпочинок', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };
  const isWorkoutDay = profile?.availableDays?.includes(dayOfWeek);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Привіт, {profile?.name || 'Спортсмен'} 👋</Text>
          <Text style={styles.date}>{todayFormatted}</Text>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => router.push('/onboarding')}
        >
          <Ionicons name="person-circle-outline" size={32} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Today Status */}
      <View style={[styles.todayCard, isWorkoutDay ? styles.workoutDay : styles.restDay]}>
        <View style={styles.todayCardLeft}>
          <Ionicons
            name={isWorkoutDay ? 'barbell-outline' : 'bed-outline'}
            size={28}
            color={isWorkoutDay ? Colors.primary : Colors.accent}
          />
          <View style={{ marginLeft: Spacing.sm }}>
            <Text style={styles.todayLabel}>
              {isWorkoutDay ? 'День тренування' : 'День відпочинку'}
            </Text>
            <Text style={styles.todaySubtext}>
              {todayWorkouts.length > 0
                ? `${todayWorkouts.length} тренування записано`
                : isWorkoutDay
                ? 'Тренування ще не записано'
                : 'Відновлюйся та готуйся'}
            </Text>
          </View>
        </View>
        {isWorkoutDay && (
          <TouchableOpacity
            style={styles.logBtn}
            onPress={() => router.push('/workout/log')}
          >
            <Text style={styles.logBtnText}>Записати</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatCard label="Серія" value={`${stats.streak}`} unit="днів" icon="flame-outline" color={Colors.primary} />
        <StatCard label="Цього тижня" value={`${stats.weeklyWorkouts}`} unit="трен." icon="calendar-outline" color={Colors.success} />
        <StatCard label="Загалом" value={`${stats.totalWorkouts}`} unit="трен." icon="trophy-outline" color={Colors.accent} />
      </View>

      {/* Today's plan from AI */}
      {todayPlan && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>План на сьогодні</Text>
            <TouchableOpacity onPress={() => router.push('/plan')}>
              <Text style={styles.seeAllBtn}>Весь тиждень →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.planCard} onPress={() => router.push('/plan')} activeOpacity={0.8}>
            <View style={[styles.planCardAccent, { backgroundColor: WORKOUT_TYPE_COLORS[todayPlan.workoutType] || Colors.primary }]} />
            <View style={styles.planCardBody}>
              <View style={styles.planCardHeader}>
                <View style={[styles.planTypePill, { backgroundColor: (WORKOUT_TYPE_COLORS[todayPlan.workoutType] || Colors.primary) + '20' }]}>
                  <Text style={[styles.planTypeText, { color: WORKOUT_TYPE_COLORS[todayPlan.workoutType] || Colors.primary }]}>
                    {WORKOUT_TYPE_LABELS[todayPlan.workoutType] || todayPlan.workoutType}
                  </Text>
                </View>
                {todayPlan.estimatedDuration > 0 && (
                  <View style={styles.planMeta}>
                    <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.planMetaText}>~{todayPlan.estimatedDuration} хв</Text>
                  </View>
                )}
              </View>
              {todayPlan.exercises.length > 0 && (
                <View style={styles.planExercises}>
                  {todayPlan.exercises.slice(0, 3).map((ex, i) => (
                    <Text key={i} style={styles.planExercise} numberOfLines={1}>
                      · {ex.name}{ex.sets ? ` — ${ex.sets}×${ex.reps || '?'}` : ''}
                    </Text>
                  ))}
                  {todayPlan.exercises.length > 3 && (
                    <Text style={styles.planMore}>ще {todayPlan.exercises.length - 3} вправ...</Text>
                  )}
                </View>
              )}
              {todayPlan.exercises.length === 0 && todayPlan.description && (
                <Text style={styles.planDesc} numberOfLines={3}>{todayPlan.description}</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* No plan yet nudge */}
      {!todayPlan && (
        <TouchableOpacity style={styles.noPlanCard} onPress={() => router.push('/(tabs)/trainer')}>
          <Ionicons name="sparkles" size={20} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noPlanTitle}>Немає плану тренувань</Text>
            <Text style={styles.noPlanSub}>Попроси AI скласти програму →</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Today's logged workouts */}
      {todayWorkouts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Сьогодні зроблено</Text>
          {todayWorkouts.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={styles.workoutItem}
              onPress={() => router.push(`/workout/${w.id}`)}
            >
              <View style={styles.workoutItemLeft}>
                <View style={[styles.workoutDot, { backgroundColor: Colors.success }]} />
                <View>
                  <Text style={styles.workoutItemTitle}>{w.workoutType}</Text>
                  <Text style={styles.workoutItemSub}>{w.duration} хв • {w.exercises.length} вправ</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* AI Advice */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Порада від тренера</Text>
          <View style={styles.geminiTag}>
            <Text style={styles.geminiTagText}>{profile?.groqApiKey ? 'Groq' : 'Gemini'}</Text>
          </View>
        </View>
        {loadingAdvice ? (
          <View style={styles.adviceCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={[styles.adviceText, { marginTop: Spacing.sm, color: Colors.textMuted }]}>Отримую пораду...</Text>
          </View>
        ) : advice ? (
          <View style={styles.adviceCard}>
            <Text style={styles.adviceText}>{advice}</Text>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => router.push('/(tabs)/trainer')}
            >
              <Text style={styles.chatBtnText}>Поговорити з тренером</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.adviceCard}
            onPress={() => router.push('/onboarding')}
          >
            <Ionicons name="key-outline" size={24} color={Colors.textMuted} />
            <Text style={[styles.adviceText, { color: Colors.textSecondary, marginTop: Spacing.sm }]}>
              Додай Groq або Gemini API ключ у профілі щоб отримувати персональні поради
            </Text>
            <Text style={[styles.chatBtnText, { marginTop: Spacing.sm }]}>Налаштувати →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Log Button */}
      <TouchableOpacity
        style={styles.bigLogBtn}
        onPress={() => router.push('/workout/log')}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFF" />
        <Text style={styles.bigLogBtnText}>Записати тренування</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ label, value, unit, icon, color }: {
  label: string; value: string; unit: string; icon: any; color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingTop: 56, paddingBottom: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  greeting: { ...Typography.h2, marginBottom: 2 },
  date: { ...Typography.bodySmall, textTransform: 'capitalize' },
  profileBtn: { padding: 4 },
  todayCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1,
  },
  workoutDay: { backgroundColor: 'rgba(230,57,70,0.08)', borderColor: 'rgba(230,57,70,0.3)' },
  restDay: { backgroundColor: 'rgba(244,162,97,0.08)', borderColor: 'rgba(244,162,97,0.3)' },
  todayCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  todayLabel: { ...Typography.h3, fontSize: 16 },
  todaySubtext: { ...Typography.bodySmall, marginTop: 2 },
  logBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  logBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, alignItems: 'center', gap: 2,
    borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statUnit: { fontSize: 11, color: Colors.textMuted },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  section: { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.h3, fontSize: 16, marginBottom: Spacing.sm },
  geminiTag: {
    backgroundColor: 'rgba(66,133,244,0.15)', borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(66,133,244,0.3)',
  },
  geminiTagText: { color: '#4285F4', fontSize: 11, fontWeight: '600' },
  adviceCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'flex-start',
  },
  adviceText: { ...Typography.body, lineHeight: 22 },
  seeAllBtn: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  planCard: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  planCardAccent: { width: 4 },
  planCardBody: { flex: 1, padding: Spacing.md, gap: Spacing.xs },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTypePill: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  planTypeText: { fontSize: 12, fontWeight: '700' },
  planMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  planMetaText: { color: Colors.textMuted, fontSize: 12 },
  planExercises: { gap: 2 },
  planExercise: { color: Colors.textSecondary, fontSize: 13 },
  planMore: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  planDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  noPlanCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(230,57,70,0.06)', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)',
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  noPlanTitle: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  noPlanSub: { color: Colors.primary, fontSize: 12, marginTop: 2 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.md },
  chatBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  workoutItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  workoutItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  workoutDot: { width: 8, height: 8, borderRadius: 4 },
  workoutItemTitle: { ...Typography.body, fontWeight: '600' },
  workoutItemSub: { ...Typography.bodySmall, marginTop: 2 },
  bigLogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  bigLogBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
