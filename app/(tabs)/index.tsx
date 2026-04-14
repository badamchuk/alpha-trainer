import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Switch, Modal, TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, startOfWeek, addDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getUserProfile, getGoals, getRecentWorkouts, getStats, getWorkoutsForDate, getTrainingPlan, getCachedDailyAdvice, saveDailyAdviceCache, getLocalDateString, getWorkouts } from '../../services/storage';
import { useLocale } from '../../services/i18n';
import { getDailyAdvice as geminiDailyAdvice, initGemini } from '../../services/gemini';
import { getDailyAdvice as groqDailyAdvice, initGroq } from '../../services/groq';
import { getTodayPlan, WORKOUT_TYPE_LABELS, WORKOUT_TYPE_COLORS } from '../../services/planParser';
import { UserProfile, WorkoutEntry, TrainingPlan, DayPlan } from '../../types';
import { getWaterData, addGlass, removeGlass, setWaterGoal, computeWaterGoal } from '../../services/water';
import { getRecoveryScore, RecoveryScoreResult, WellbeingSnapshot } from '../../services/analytics';
import { getTodayWellbeing, saveWellbeingEntry, WellbeingEntry } from '../../services/wellbeing';
import { scheduleWaterReminders, cancelWaterReminders, requestPermissions } from '../../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TodayScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutEntry[]>([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, weeklyWorkouts: 0, monthlyWorkouts: 0, totalDuration: 0, streak: 0 });
  const [advice, setAdvice] = useState<string>('');
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayPlan, setTodayPlan] = useState<DayPlan | null>(null);
  const [weekWorkoutDates, setWeekWorkoutDates] = useState<Set<string>>(new Set());
  const [waterData, setWaterData] = useState({ glasses: 0, goal: 8 });
  const [waterRemindersOn, setWaterRemindersOn] = useState(false);
  const [reminderStart, setReminderStart] = useState(8);
  const [reminderEnd, setReminderEnd] = useState(22);
  const [reminderSettingsVisible, setReminderSettingsVisible] = useState(false);
  const [editStart, setEditStart] = useState(8);
  const [editEnd, setEditEnd] = useState(22);
  const [recovery, setRecovery] = useState<RecoveryScoreResult | null>(null);
  const [wellbeing, setWellbeing] = useState<WellbeingEntry | null>(null);
  const [wellbeingModalVisible, setWellbeingModalVisible] = useState(false);
  const [wbMood, setWbMood] = useState<1|2|3|4|5>(3);
  const [wbSleep, setWbSleep] = useState('7');
  const [wbStress, setWbStress] = useState<1|2|3|4|5>(3);

  const today = getLocalDateString(new Date());
  const todayFormatted = format(new Date(), 'EEEE, d MMMM', { locale: uk });

  async function loadData() {
    const [p, s, tw, plan, allWorkouts, water] = await Promise.all([
      getUserProfile(),
      getStats(),
      getWorkoutsForDate(today),
      getTrainingPlan(),
      getWorkouts(),
      getWaterData(),
    ]);
    setProfile(p);
    setStats(s);
    setTodayWorkouts(tw);
    setTodayPlan(plan ? getTodayPlan(plan) : null);
    // Update water goal from profile if profile is complete
    if (p?.onboardingComplete) {
      const computed = computeWaterGoal(p);
      if (computed !== water.goal) {
        await setWaterGoal(computed);
        setWaterData({ ...water, goal: computed });
      } else {
        setWaterData(water);
      }
    } else {
      setWaterData(water);
    }

    // Load water reminders state
    const remindersFlag = await AsyncStorage.getItem('@alpha_trainer:water_reminders');
    setWaterRemindersOn(remindersFlag === 'true');

    // Load reminder time range
    const rangeJson = await AsyncStorage.getItem('@alpha_trainer:water_reminder_range');
    if (rangeJson) {
      const range = JSON.parse(rangeJson);
      setReminderStart(range.start ?? 8);
      setReminderEnd(range.end ?? 22);
    }

    // Build set of logged workout dates for current week
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
    const weekEnd = addDays(weekStart, 6);
    const weekStartStr = getLocalDateString(weekStart);
    const weekEndStr = getLocalDateString(weekEnd);
    const dates = new Set(
      allWorkouts.filter((w) => w.date >= weekStartStr && w.date <= weekEndStr).map((w) => w.date)
    );
    setWeekWorkoutDates(dates);

    // Recovery score + wellbeing
    const wb = await getTodayWellbeing(today);
    setWellbeing(wb);
    const wbSnapshot: WellbeingSnapshot | undefined = wb
      ? { mood: wb.mood, sleep: wb.sleep, stress: wb.stress }
      : undefined;
    setRecovery(getRecoveryScore(allWorkouts, today, wbSnapshot));
  }

  async function loadAdvice(p: UserProfile) {
    if (!p?.groqApiKey && !p?.geminiApiKey) return;

    // Use cached advice if available for today
    const cached = await getCachedDailyAdvice();
    if (cached) {
      setAdvice(cached);
      return;
    }

    setLoadingAdvice(true);
    try {
      const goals = await getGoals();
      const recent = await getRecentWorkouts(5);
      let text: string;
      if (p.groqApiKey) {
        initGroq(p.groqApiKey);
        text = await groqDailyAdvice(p, goals, recent);
      } else {
        initGemini(p.geminiApiKey);
        text = await geminiDailyAdvice(p, goals, recent);
      }
      setAdvice(text);
      await saveDailyAdviceCache(text);
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

  async function toggleWaterReminders() {
    if (waterRemindersOn) {
      await cancelWaterReminders();
      await AsyncStorage.setItem('@alpha_trainer:water_reminders', 'false');
      setWaterRemindersOn(false);
    } else {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert(
          'Дозвіл відхилено',
          'Дозволь сповіщення в налаштуваннях телефону щоб отримувати нагадування про воду.'
        );
        return;
      }
      await scheduleWaterReminders(waterData.goal, reminderStart, reminderEnd);
      await AsyncStorage.setItem('@alpha_trainer:water_reminders', 'true');
      setWaterRemindersOn(true);
    }
  }

  async function saveReminderRange(start: number, end: number) {
    setReminderStart(start);
    setReminderEnd(end);
    await AsyncStorage.setItem('@alpha_trainer:water_reminder_range', JSON.stringify({ start, end }));
    if (waterRemindersOn) {
      await scheduleWaterReminders(waterData.goal, start, end);
    }
    setReminderSettingsVisible(false);
  }

  async function handleSaveWellbeing() {
    const sleepVal = parseFloat(wbSleep.replace(',', '.'));
    const entry: WellbeingEntry = {
      date: today,
      mood: wbMood,
      sleep: isNaN(sleepVal) ? 7 : Math.max(0, Math.min(12, sleepVal)),
      stress: wbStress,
    };
    await saveWellbeingEntry(entry);
    setWellbeing(entry);
    setWellbeingModalVisible(false);
    const wbSnapshot: WellbeingSnapshot = { mood: entry.mood, sleep: entry.sleep, stress: entry.stress };
    const allWorkouts = await getWorkouts();
    setRecovery(getRecoveryScore(allWorkouts, today, wbSnapshot));
  }

  function openWellbeingModal() {
    if (wellbeing) {
      setWbMood(wellbeing.mood);
      setWbSleep(String(wellbeing.sleep));
      setWbStress(wellbeing.stress);
    } else {
      setWbMood(3);
      setWbSleep('7');
      setWbStress(3);
    }
    setWellbeingModalVisible(true);
  }

  const dayOfWeek = new Date().getDay(); // 0=Sun
  const isWorkoutDay = profile?.availableDays?.includes(dayOfWeek);

  // Find next workout day
  const nextWorkoutDayName = (() => {
    if (!profile?.availableDays?.length || isWorkoutDay) return null;
    const dayNames: Record<number, string> = { 0: 'неділя', 1: 'понеділок', 2: 'вівторок', 3: 'середа', 4: 'четвер', 5: 'п\'ятниця', 6: 'субота' };
    for (let i = 1; i <= 7; i++) {
      const next = (dayOfWeek + i) % 7;
      if (profile.availableDays.includes(next)) {
        return i === 1 ? 'завтра' : `через ${i} дні — ${dayNames[next]}`;
      }
    }
    return null;
  })();

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
              {isWorkoutDay ? t('workoutDay') : t('restDay')}
            </Text>
            <Text style={styles.todaySubtext}>
              {todayWorkouts.length > 0
                ? t('workoutsLoggedToday', todayWorkouts.length)
                : isWorkoutDay
                ? t('workoutNotLogged')
                : nextWorkoutDayName
                ? `Наступне тренування: ${nextWorkoutDayName}`
                : t('relax')}
            </Text>
          </View>
        </View>
        {isWorkoutDay && (
          <TouchableOpacity
            style={styles.logBtn}
            onPress={() => router.push('/workout/log')}
          >
            <Text style={styles.logBtnText}>{t('logBtn')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatCard label={t('streak')} value={`${stats.streak}`} unit={t('daysUnit')} icon="flame-outline" color={Colors.primary} />
        <StatCard label={t('thisWeekLabel')} value={`${stats.weeklyWorkouts}`} unit={t('trainingsUnit')} icon="calendar-outline" color={Colors.success} />
        <StatCard label={t('totalLabel')} value={`${stats.totalWorkouts}`} unit={t('trainingsUnit')} icon="trophy-outline" color={Colors.accent} />
      </View>

      {/* Recovery Score */}
      {recovery && <RecoveryWidget recovery={recovery} />}

      {/* Wellbeing Card */}
      <WellbeingCard wellbeing={wellbeing} onOpen={openWellbeingModal} />

      {/* Weekly Tracker */}
      <WeeklyTracker
        availableDays={profile?.availableDays || []}
        workoutDates={weekWorkoutDates}
      />

      {/* Water Tracker */}
      <View style={styles.waterCard}>
        <View style={styles.waterHeader}>
          <Ionicons name="water" size={18} color="#4285F4" />
          <Text style={styles.waterTitle}>{t('waterLabel')}</Text>
          <Text style={styles.waterCount}>
            {waterData.glasses}/{waterData.goal} склянок
          </Text>
        </View>
        <View style={styles.glassesGrid}>
          {Array(waterData.goal).fill(0).map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={async () => {
                const d = i < waterData.glasses ? await removeGlass() : await addGlass();
                setWaterData(d);
              }}
            >
              <Ionicons
                name={i < waterData.glasses ? 'water' : 'water-outline'}
                size={26}
                color={i < waterData.glasses ? '#4285F4' : Colors.border}
              />
            </TouchableOpacity>
          ))}
        </View>
        {waterData.glasses >= waterData.goal ? (
          <Text style={styles.waterDone}>{t('waterGoalDone')}</Text>
        ) : null}
        <View style={styles.waterFooter}>
          <Ionicons
            name="notifications-outline"
            size={14}
            color={waterRemindersOn ? '#4285F4' : Colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.waterReminderLabel}>{t('waterRemindersLabel')}</Text>
            {waterRemindersOn && (
              <TouchableOpacity
                onPress={() => { setEditStart(reminderStart); setEditEnd(reminderEnd); setReminderSettingsVisible(true); }}
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
              >
                <Text style={styles.waterReminderRange}>
                  {String(reminderStart).padStart(2, '0')}:00 – {String(reminderEnd).padStart(2, '0')}:00  ✎
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Switch
            value={waterRemindersOn}
            onValueChange={toggleWaterReminders}
            trackColor={{ false: Colors.border, true: 'rgba(66,133,244,0.4)' }}
            thumbColor={waterRemindersOn ? '#4285F4' : Colors.textMuted}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>
      </View>

      {/* Today's plan from AI */}
      {todayPlan && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('todayPlan')}</Text>
            <TouchableOpacity onPress={() => router.push('/plan')}>
              <Text style={styles.seeAllBtn}>{t('fullWeekBtn')}</Text>
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
            <Text style={styles.noPlanTitle}>{t('noPlanTitle')}</Text>
            <Text style={styles.noPlanSub}>{t('noPlanSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Today's logged workouts */}
      {todayWorkouts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('todayDone')}</Text>
          {todayWorkouts.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={styles.workoutItem}
              onPress={() => router.push(`/workout/${w.id}`)}
            >
              <View style={styles.workoutItemLeft}>
                <View style={[styles.workoutDot, { backgroundColor: Colors.success }]} />
                <View>
                  <Text style={styles.workoutItemTitle}>{WORKOUT_TYPE_LABELS[w.workoutType] || w.workoutType}</Text>
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
          <Text style={styles.sectionTitle}>{t('coachAdvice')}</Text>
          <View style={styles.geminiTag}>
            <Text style={styles.geminiTagText}>{profile?.groqApiKey ? 'Groq' : 'Gemini'}</Text>
          </View>
        </View>
        {loadingAdvice ? (
          <View style={styles.adviceCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={[styles.adviceText, { marginTop: Spacing.sm, color: Colors.textMuted }]}>{t('gettingAdvice')}</Text>
          </View>
        ) : advice ? (
          <View style={styles.adviceCard}>
            <Text style={styles.adviceText}>{advice}</Text>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => router.push('/(tabs)/trainer')}
            >
              <Text style={styles.chatBtnText}>{t('chatWithCoach')}</Text>
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
              {t('noApiKeyAdvice')}
            </Text>
            <Text style={[styles.chatBtnText, { marginTop: Spacing.sm }]}>{t('configureBtn')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Log Button */}
      <TouchableOpacity
        style={styles.bigLogBtn}
        onPress={() => router.push('/workout/log')}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFF" />
        <Text style={styles.bigLogBtnText}>{t('logTraining')}</Text>
      </TouchableOpacity>

      {/* Water Reminder Range Modal */}
      <Modal visible={reminderSettingsVisible} transparent animationType="fade">
        <View style={styles.wbOverlay}>
          <View style={styles.wbCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
              <Text style={styles.wbTitle}>Час нагадувань</Text>
              <TouchableOpacity onPress={() => setReminderSettingsVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.wbLabel}>Початок</Text>
            <View style={styles.hourRow}>
              <TouchableOpacity style={styles.hourBtn} onPress={() => setEditStart(Math.max(0, editStart - 1))}>
                <Ionicons name="remove" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.hourVal}>{String(editStart).padStart(2, '0')}:00</Text>
              <TouchableOpacity style={styles.hourBtn} onPress={() => setEditStart(Math.min(editEnd - 1, editStart + 1))}>
                <Ionicons name="add" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.wbLabel, { marginTop: Spacing.md }]}>Кінець</Text>
            <View style={styles.hourRow}>
              <TouchableOpacity style={styles.hourBtn} onPress={() => setEditEnd(Math.max(editStart + 1, editEnd - 1))}>
                <Ionicons name="remove" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.hourVal}>{String(editEnd).padStart(2, '0')}:00</Text>
              <TouchableOpacity style={styles.hourBtn} onPress={() => setEditEnd(Math.min(23, editEnd + 1))}>
                <Ionicons name="add" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.hourHint}>
              Нагадування розподіляться рівномірно між {String(editStart).padStart(2, '0')}:00 і {String(editEnd).padStart(2, '0')}:00
            </Text>

            <TouchableOpacity style={styles.wbSaveBtn} onPress={() => saveReminderRange(editStart, editEnd)}>
              <Text style={styles.wbSaveBtnText}>Зберегти</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Wellbeing Modal */}
      <Modal visible={wellbeingModalVisible} transparent animationType="fade">
        <View style={styles.wbOverlay}>
          <View style={styles.wbCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
              <Text style={styles.wbTitle}>Як ти себе почуваєш?</Text>
              <TouchableOpacity onPress={() => setWellbeingModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.wbLabel}>Настрій</Text>
            <View style={styles.wbRow}>
              {(['😞','😕','😐','🙂','😄'] as const).map((emoji, i) => {
                const val = (i + 1) as 1|2|3|4|5;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.wbOption, wbMood === val && styles.wbOptionActive]}
                    onPress={() => setWbMood(val)}
                  >
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.wbLabel, { marginTop: Spacing.sm }]}>Сон (годин)</Text>
            <TextInput
              style={styles.wbInput}
              value={wbSleep}
              onChangeText={setWbSleep}
              keyboardType="decimal-pad"
              placeholder="7"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.wbLabel, { marginTop: Spacing.sm }]}>Стрес</Text>
            <View style={styles.wbRow}>
              {(['Немає','Мало','Середній','Багато','Дуже'] as const).map((label, i) => {
                const val = (i + 1) as 1|2|3|4|5;
                const color = ['#2ECC71','#A3D977','#F4A261','#E67E22','#E63946'][i];
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.wbStressBtn, wbStress === val && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setWbStress(val)}
                  >
                    <Text style={[styles.wbStressBtnText, wbStress === val && { color: '#FFF' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.wbSaveBtn} onPress={handleSaveWellbeing}>
              <Text style={styles.wbSaveBtnText}>Зберегти</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Recovery Widget ──────────────────────────────────────────────────────────

const RECOVERY_LEVEL_LABELS: Record<string, string> = {
  rest: 'Відпочинок', easy: 'Легке', moderate: 'Помірне', hard: 'Важке', peak: 'Пік',
};
const RECOVERY_LEVEL_SUBLABELS: Record<string, string> = {
  rest: 'Тілу потрібен відпочинок',
  easy: 'Підійде легке кардіо або йога',
  moderate: 'Можна тренуватись помірно',
  hard: 'Готовий до важкого тренування',
  peak: 'Відмінна форма — максимум!',
};

function RecoveryWidget({ recovery }: { recovery: RecoveryScoreResult }) {
  const pct = recovery.score;
  return (
    <View style={styles.recoveryCard}>
      <View style={styles.recoveryLeft}>
        <Text style={styles.recoveryTitle}>Готовність</Text>
        <Text style={[styles.recoveryLevel, { color: recovery.color }]}>
          {RECOVERY_LEVEL_LABELS[recovery.level]}
        </Text>
        <Text style={styles.recoverySub}>{RECOVERY_LEVEL_SUBLABELS[recovery.level]}</Text>
      </View>
      <View style={styles.recoveryRight}>
        <Text style={[styles.recoveryScore, { color: recovery.color }]}>{pct}</Text>
        <Text style={styles.recoveryScoreLabel}>/ 100</Text>
        <View style={styles.recoveryBar}>
          <View style={[styles.recoveryFill, { width: `${pct}%` as any, backgroundColor: recovery.color }]} />
        </View>
      </View>
    </View>
  );
}

// ─── Wellbeing Card ───────────────────────────────────────────────────────────

const MOOD_EMOJIS = ['😞','😕','😐','🙂','😄'];
const STRESS_LABELS = ['', 'Немає', 'Мало', 'Середній', 'Багато', 'Дуже'];

function WellbeingCard({ wellbeing, onOpen }: { wellbeing: WellbeingEntry | null; onOpen: () => void }) {
  return (
    <TouchableOpacity style={styles.wbSummaryCard} onPress={onOpen} activeOpacity={0.8}>
      <View style={{ flex: 1 }}>
        <Text style={styles.wbSummaryTitle}>Самопочуття сьогодні</Text>
        {wellbeing ? (
          <Text style={styles.wbSummaryText}>
            {MOOD_EMOJIS[wellbeing.mood - 1]}  Сон: {wellbeing.sleep}г  ·  Стрес: {STRESS_LABELS[wellbeing.stress]}
          </Text>
        ) : (
          <Text style={styles.wbSummaryHint}>Як спалось? Як самопочуття? — впливає на готовність</Text>
        )}
      </View>
      <Ionicons name={wellbeing ? 'create-outline' : 'add-circle-outline'} size={20} color={Colors.primary} />
    </TouchableOpacity>
  );
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
// availableDays uses 0=Sun,1=Mon,...,6=Sat — convert to Mon-first index
const JS_TO_MON_FIRST: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

function WeeklyTracker({ availableDays, workoutDates }: {
  availableDays: number[];
  workoutDates: Set<string>;
}) {
  const { t } = useLocale();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const todayStr = getLocalDateString(new Date());

  return (
    <View style={styles.weekCard}>
      <Text style={styles.weekTitle}>{t('thisWeekTracker')}</Text>
      <View style={styles.weekDays}>
        {DAY_LABELS.map((label, idx) => {
          const dayDate = addDays(weekStart, idx);
          const dateStr = getLocalDateString(dayDate);
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const isDone = workoutDates.has(dateStr);
          // idx 0=Mon,1=Tue,...,6=Sun → js day: Mon=1,Tue=2,...,Sun=0
          const jsDay = idx === 6 ? 0 : idx + 1;
          const isPlanned = availableDays.includes(jsDay);

          return (
            <View key={idx} style={styles.weekDay}>
              <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelToday]}>{label}</Text>
              <View style={[
                styles.weekDayDot,
                isDone && styles.weekDayDotDone,
                !isDone && isPlanned && !isFuture && styles.weekDayDotMissed,
                !isDone && isPlanned && isFuture && styles.weekDayDotPlanned,
                isToday && !isDone && styles.weekDayDotToday,
              ]}>
                {isDone
                  ? <Ionicons name="checkmark" size={12} color="#FFF" />
                  : isPlanned && !isFuture
                  ? <Ionicons name="close" size={11} color={Colors.textMuted} />
                  : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
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
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  recoveryCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  recoveryLeft: { flex: 1 },
  recoveryTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  recoveryLevel: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  recoverySub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  recoveryRight: { alignItems: 'flex-end', gap: 2 },
  recoveryScore: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  recoveryScoreLabel: { color: Colors.textMuted, fontSize: 12 },
  recoveryBar: {
    width: 80, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, marginTop: 4, overflow: 'hidden',
  },
  recoveryFill: { height: '100%', borderRadius: 2 },
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
  weekCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  weekTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: Spacing.sm },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 6 },
  weekDayLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '500' },
  weekDayLabelToday: { color: Colors.primary, fontWeight: '700' },
  weekDayDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  weekDayDotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  weekDayDotMissed: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border },
  weekDayDotPlanned: { borderColor: Colors.primary, borderStyle: 'dashed' },
  weekDayDotToday: { borderColor: Colors.primary, borderWidth: 2 },
  waterCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md, gap: Spacing.sm,
  },
  waterHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  waterTitle: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14, flex: 1 },
  waterCount: { color: Colors.textMuted, fontSize: 13 },
  glassesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  waterDone: { color: Colors.success, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  waterFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: Spacing.sm, marginTop: 2,
  },
  waterReminderLabel: { color: Colors.textSecondary, fontSize: 13 },
  waterReminderRange: { color: '#4285F4', fontSize: 11, fontWeight: '600', marginTop: 1 },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, marginTop: 4 },
  hourBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  hourVal: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, minWidth: 80, textAlign: 'center' },
  hourHint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  bigLogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  bigLogBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  // Wellbeing
  wbSummaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md, gap: Spacing.sm,
  },
  wbSummaryTitle: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  wbSummaryText: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  wbSummaryHint: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  wbOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  wbCard: {
    backgroundColor: Colors.surface, borderRadius: 20,
    padding: Spacing.lg, width: '90%',
    borderWidth: 1, borderColor: Colors.border,
  },
  wbTitle: { ...Typography.h3, fontSize: 17 },
  wbLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  wbRow: { flexDirection: 'row', gap: 8 },
  wbOption: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  wbOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  wbInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 16, padding: Spacing.sm,
  },
  wbStressBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 7,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  wbStressBtnText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '600' },
  wbSaveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md,
  },
  wbSaveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
