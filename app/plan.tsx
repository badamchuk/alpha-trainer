import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { getTrainingPlan, saveTrainingPlan, getUserProfile } from '../services/storage';
import { TrainingPlan, DayPlan, ExerciseLog } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ExerciseImage from '../components/ExerciseImage';
import ExerciseHowTo from '../components/ExerciseHowTo';
import RichText from '../components/RichText';
import { stripExerciseIds } from '../services/aiContext';
import { exerciseName, getExercise } from '../services/library';
import { Equipment, JointZone, LibraryExercise } from '../services/library/types';
import { equipmentOf } from '../services/equipment';
import SubstitutionSheet from '../components/SubstitutionSheet';
import { prescribe } from '../services/prescriptions';
import {
  WORKOUT_TYPE_KEYS, WORKOUT_TYPE_COLORS,
} from '../services/planParser';
import { dateLocale, useLocale } from '../services/i18n';

export default function PlanScreen() {
  const router = useRouter();
  const { t, lang } = useLocale();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [expanded, setExpanded] = useState<number | null>(new Date().getDay());
  const [aiProvider, setAiProvider] = useState<'Groq' | 'Gemini AI'>('Gemini AI');
  // заміна вправи прямо в дні плану (ТЗ F8.1)
  const [subs, setSubs] = useState<{ day: number; idx: number; ex: LibraryExercise } | null>(null);
  const [equipment, setEquipment] = useState<Equipment[] | undefined>(undefined);
  const [protectZones, setProtectZones] = useState<JointZone[]>([]);

  useFocusEffect(useCallback(() => {
    async function load() {
      const [p, profile] = await Promise.all([getTrainingPlan(), getUserProfile()]);
      setEquipment(equipmentOf(profile));
      setProtectZones(profile?.protectZones ?? []);
      setPlan(p);
      setAiProvider(profile?.groqApiKey ? 'Groq' : 'Gemini AI');
    }
    load();
  }, []));

  const today = new Date().getDay();

  /**
   * Відкрити форму запису, заповнену вправами дня (ТЗ F8.2).
   *
   * Вправи, впізнані бібліотекою, несуть id — тому в формі одразу працюють
   * заміна, картинка й правильні калорії. Невпізнані йдуть просто назвою.
   */
  /**
   * Заміна вправи в дні плану. Правимо ТІЛЬКИ вправу — текст плану від тренера
   * лишається як був, бо це його порада, а не наші дані.
   */
  async function applyPlanSubstitution(next: LibraryExercise) {
    if (!plan || !subs) return;
    const updated: TrainingPlan = {
      ...plan,
      weeklySchedule: plan.weeklySchedule.map((d) => (d.dayOfWeek !== subs.day ? d : {
        ...d,
        exercises: d.exercises.map((e, i) => (i !== subs.idx ? e : {
          ...e,
          name: exerciseName(next),
          exerciseId: next.id,
          // вага від іншого снаряда не має сенсу
          weight: next.equipment.join() === subs.ex.equipment.join() ? e.weight : undefined,
        })),
      })),
    };
    setPlan(updated);
    setSubs(null);
    await saveTrainingPlan(updated);
  }

  async function startFromPlan(day: DayPlan) {
    const exercises: ExerciseLog[] = day.exercises.map((ex) => {
      const lib = ex.exerciseId ? getExercise(ex.exerciseId) : undefined;
      const scheme = lib ? prescribe(lib) : null;
      const reps = ex.reps ? parseInt(ex.reps, 10) : undefined;
      return {
        name: lib ? exerciseName(lib) : ex.name,
        exerciseId: ex.exerciseId,
        sets: ex.sets ?? scheme?.sets,
        reps: Number.isFinite(reps) ? reps : scheme?.reps,
        duration: scheme?.seconds ? Math.round(scheme.seconds / 6) / 10 : undefined,
      };
    });
    if (exercises.length === 0) {
      router.push('/workout/log');
      return;
    }
    // той самий механізм, що в конструктора й у порад тренера
    await AsyncStorage.setItem('@alpha_trainer:builder_started', JSON.stringify({
      workoutType: day.workoutType || 'strength',
      duration: day.estimatedDuration || 60,
      exercises,
    }));
    router.push('/workout/log?fromBuilder=1');
  }

  if (!plan) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('planTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('planTitle')}</Text>
          <Text style={styles.emptyDesc}>{t('planEmptyHint')}</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => { router.back(); router.push('/(tabs)/trainer'); }}
          >
            <Ionicons name="sparkles" size={18} color="#FFF" />
            <Text style={styles.emptyBtnText}>{t('generatePlan')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const createdDate = format(new Date(plan.createdAt), 'd MMMM yyyy', { locale: dateLocale(lang) });

  // Sort days Mon–Sun
  const sortedDays = [...plan.weeklySchedule].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0, -1];
    return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('planTitle')}</Text>
        <TouchableOpacity
          onPress={() => Alert.alert(t('planTitle'), '', [
            { text: t('cancel'), style: 'cancel' },
            { text: t('generatePlan'), onPress: () => { router.back(); router.push('/(tabs)/trainer'); } },
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
              <Text style={styles.aiTagText}>{aiProvider}</Text>
            </View>
            <Text style={styles.metaDate}>{t('planCreatedOn', createdDate)}</Text>
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
            <Text style={styles.sectionTitle}>{t('weeklySchedule')}</Text>
            {sortedDays.map((day) => {
              const isToday = day.dayOfWeek === today;
              const isOpen = expanded === day.dayOfWeek;
              const color = WORKOUT_TYPE_COLORS[day.workoutType] || Colors.textMuted;
              const typeLabel = t(WORKOUT_TYPE_KEYS[day.workoutType] ?? day.workoutType);

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
                          {t('dayShort', day.dayOfWeek)}
                        </Text>
                      </View>
                      <View>
                        <View style={styles.dayTitleRow}>
                          <Text style={styles.dayName}>{t('dayName', day.dayOfWeek)}</Text>
                          {isToday && (
                            <View style={styles.todayTag}>
                              <Text style={styles.todayTagText}>{t('todayTag')}</Text>
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
                              {/* впізнану вправу показуємо малюнком, невпізнану — крапкою */}
                              {ex.exerciseId ? (
                                <TouchableOpacity onPress={() => router.push(`/exercises/${ex.exerciseId}`)}>
                                  <ExerciseImage
                                    slug={getExercise(ex.exerciseId)?.imageSlug}
                                    pattern={getExercise(ex.exerciseId)?.pattern}
                                    size={40}
                                  />
                                </TouchableOpacity>
                              ) : (
                                <View style={[styles.exDot, { backgroundColor: color }]} />
                              )}
                              <View style={styles.exContent}>
                                <Text style={styles.exName}>{ex.name}</Text>
                                {(ex.sets || ex.reps || ex.weight || ex.duration) && (
                                  <Text style={styles.exMeta}>
                                    {[
                                      ex.sets && t('setsCount', ex.sets),
                                      ex.reps && `× ${ex.reps}`,
                                      ex.weight && `${ex.weight}`,
                                      ex.duration && `${ex.duration}`,
                                    ].filter(Boolean).join('  ')}
                                  </Text>
                                )}
                                {ex.exerciseId && getExercise(ex.exerciseId) && (
                                  <ExerciseHowTo
                                    exercise={getExercise(ex.exerciseId)!}
                                    onOpenCard={() => router.push(`/exercises/${ex.exerciseId}`)}
                                  />
                                )}
                              </View>
                              {/* замінити вправу прямо в плані — та сама панель,
                                  що у формі запису й конструкторі */}
                              {ex.exerciseId && (
                                <TouchableOpacity
                                  hitSlop={8}
                                  onPress={() => setSubs({
                                    day: day.dayOfWeek, idx: i, ex: getExercise(ex.exerciseId!)!,
                                  })}
                                >
                                  <Ionicons name="swap-horizontal-outline" size={18} color={Colors.textSecondary} />
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                        </View>
                      ) : day.description ? (
                        // опис від AI приходить із розміткою й технічними id —
                        // показуємо його так само, як у чаті
                        <RichText style={styles.dayDesc} boldColor={Colors.textPrimary}>
                          {stripExerciseIds(day.description)}
                        </RichText>
                      ) : null}

                      {isToday && (
                        <TouchableOpacity
                          style={styles.logTodayBtn}
                          onPress={() => startFromPlan(day)}
                        >
                          <Ionicons name="play" size={16} color="#FFF" />
                          <Text style={styles.logTodayBtnText}>{t('startByPlan')}</Text>
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

      <SubstitutionSheet
        visible={subs !== null}
        exercise={subs?.ex ?? null}
        equipment={equipment}
        protectZones={protectZones}
        onClose={() => setSubs(null)}
        onPick={applyPlanSubstitution}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: Spacing.md,
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
