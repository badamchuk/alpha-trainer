import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { getTrainingPlan, saveTrainingPlan } from '../services/storage';
import { TrainingPlan, DayPlan } from '../types';
import {
  WORKOUT_TYPE_LABELS, WORKOUT_TYPE_COLORS,
} from '../services/planParser';

const DAY_NAMES: Record<number, string> = {
  0: 'Неділя', 1: 'Понеділок', 2: 'Вівторок',
  3: 'Середа', 4: 'Четвер', 5: 'П\'ятниця', 6: 'Субота',
};
const DAY_SHORT: Record<number, string> = {
  0: 'Нд', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб',
};

export default function PlanScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [expanded, setExpanded] = useState<number | null>(new Date().getDay());

  useEffect(() => {
    getTrainingPlan().then(setPlan);
  }, []);

  const today = new Date().getDay();

  if (!plan) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Мій план тренувань</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>План ще не створено</Text>
          <Text style={styles.emptyDesc}>
            Перейди до вкладки "Тренер", натисни{'\n'}"Розробити план тренувань"{'\n'}і збережи відповідь AI
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => { router.back(); router.push('/(tabs)/trainer'); }}
          >
            <Ionicons name="sparkles" size={18} color="#FFF" />
            <Text style={styles.emptyBtnText}>Відкрити AI Тренера</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const createdDate = format(new Date(plan.createdAt), 'd MMMM yyyy', { locale: uk });

  // Sort days Mon–Sun
  const sortedDays = [...plan.weeklySchedule].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0, -1];
    return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Мій план тренувань</Text>
        <TouchableOpacity
          onPress={() => Alert.alert('Оновити план?', 'Перейди до AI Тренера і попроси новий план', [
            { text: 'Скасувати', style: 'cancel' },
            { text: 'Відкрити тренера', onPress: () => { router.back(); router.push('/(tabs)/trainer'); } },
          ])}
        >
          <Ionicons name="refresh-outline" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Plan meta */}
        <View style={styles.metaCard}>
          <View style={styles.metaLeft}>
            <View style={styles.aiTag}>
              <Ionicons name="sparkles" size={12} color="#4285F4" />
              <Text style={styles.aiTagText}>Gemini AI</Text>
            </View>
            <Text style={styles.metaDate}>Складено {createdDate}</Text>
          </View>
          {plan.goals.length > 0 && (
            <View style={styles.goalsRow}>
              <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.goalsText} numberOfLines={1}>{plan.goals.join(', ')}</Text>
            </View>
          )}
        </View>

        {/* Full AI text (collapsible) */}
        {plan.generatedFor && plan.weeklySchedule[0]?.dayOfWeek === -1 && (
          <View style={styles.fullTextCard}>
            <Text style={styles.fullPlanText}>{plan.generatedFor}</Text>
          </View>
        )}

        {/* Weekly schedule */}
        {plan.weeklySchedule[0]?.dayOfWeek !== -1 && (
          <>
            <Text style={styles.sectionTitle}>Тижневий розклад</Text>
            {sortedDays.map((day) => {
              const isToday = day.dayOfWeek === today;
              const isOpen = expanded === day.dayOfWeek;
              const color = WORKOUT_TYPE_COLORS[day.workoutType] || Colors.textMuted;
              const typeLabel = WORKOUT_TYPE_LABELS[day.workoutType] || day.workoutType;

              return (
                <TouchableOpacity
                  key={day.dayOfWeek}
                  style={[styles.dayCard, isToday && styles.dayCardToday]}
                  onPress={() => setExpanded(isOpen ? null : day.dayOfWeek)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dayHeader}>
                    <View style={styles.dayHeaderLeft}>
                      <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
                        <Text style={[styles.dayBadgeText, isToday && styles.dayBadgeTextToday]}>
                          {DAY_SHORT[day.dayOfWeek]}
                        </Text>
                      </View>
                      <View>
                        <View style={styles.dayTitleRow}>
                          <Text style={styles.dayName}>{DAY_NAMES[day.dayOfWeek]}</Text>
                          {isToday && (
                            <View style={styles.todayTag}>
                              <Text style={styles.todayTagText}>сьогодні</Text>
                            </View>
                          )}
                        </View>
                        <View style={[styles.typePill, { backgroundColor: color + '20' }]}>
                          <Text style={[styles.typePillText, { color }]}>{typeLabel}</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Colors.textMuted}
                    />
                  </View>

                  {isOpen && (
                    <View style={styles.dayBody}>
                      {day.exercises.length > 0 ? (
                        <View style={styles.exercisesList}>
                          {day.exercises.map((ex, i) => (
                            <View key={i} style={styles.exerciseRow}>
                              <View style={[styles.exDot, { backgroundColor: color }]} />
                              <View style={styles.exContent}>
                                <Text style={styles.exName}>{ex.name}</Text>
                                {(ex.sets || ex.reps || ex.weight || ex.duration) && (
                                  <Text style={styles.exMeta}>
                                    {[
                                      ex.sets && `${ex.sets} підх.`,
                                      ex.reps && `× ${ex.reps}`,
                                      ex.weight && `${ex.weight}`,
                                      ex.duration && `${ex.duration}`,
                                    ].filter(Boolean).join('  ')}
                                  </Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : day.description ? (
                        <Text style={styles.dayDesc}>{day.description}</Text>
                      ) : null}

                      {isToday && (
                        <TouchableOpacity
                          style={styles.logTodayBtn}
                          onPress={() => router.push('/workout/log')}
                        >
                          <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                          <Text style={styles.logTodayBtnText}>Записати сьогоднішнє тренування</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Full text if it was unparseable */}
        {plan.weeklySchedule[0]?.dayOfWeek === -1 && plan.weeklySchedule[0]?.description && (
          <View style={styles.fullTextCard}>
            <Text style={styles.fullPlanText}>{plan.weeklySchedule[0].description}</Text>
          </View>
        )}
      </ScrollView>
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
  content: { padding: Spacing.md, paddingBottom: 40, gap: Spacing.sm },
  metaCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.xs,
  },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  aiTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(66,133,244,0.1)', borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(66,133,244,0.25)',
  },
  aiTagText: { color: '#4285F4', fontSize: 11, fontWeight: '600' },
  metaDate: { color: Colors.textMuted, fontSize: 13 },
  goalsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  goalsText: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
  sectionTitle: { ...Typography.h3, fontSize: 16, marginTop: Spacing.xs },
  dayCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  dayCardToday: { borderColor: Colors.primary, backgroundColor: 'rgba(230,57,70,0.04)' },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md,
  },
  dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
  },
  dayBadgeToday: { backgroundColor: Colors.primary },
  dayBadgeText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
  dayBadgeTextToday: { color: '#FFF' },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
  dayName: { ...Typography.body, fontWeight: '700' },
  todayTag: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  todayTagText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  typePill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { fontSize: 11, fontWeight: '600' },
  dayBody: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm,
  },
  exercisesList: { gap: Spacing.xs },
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  exDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  exContent: { flex: 1 },
  exName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500' },
  exMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  dayDesc: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  logTodayBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.xs,
  },
  logTodayBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { ...Typography.h2, textAlign: 'center' },
  emptyDesc: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  fullTextCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  fullPlanText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
