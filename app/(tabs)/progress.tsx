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
import { getWorkouts, getStats, getPersonalRecords, PersonalRecord, getWeightLog, addWeightEntry, WeightEntry, getLocalDateString, getMeasurements, addMeasurement, getUserProfile } from '../../services/storage';
import { useLocale } from '../../services/i18n';
import { WorkoutEntry, BodyMeasurement } from '../../types';
import {
  getRunStats, getStrengthStats, formatPace, RunStats, StrengthStats,
  getWeeklyTonnage, WeeklyTonnage,
  getExerciseProgress, getAllExerciseNames, ExerciseProgressPoint, estimate1RM,
  estimateCalories,
  getHRZoneSummary, HRZoneSummary,
  getMuscleGroupBalance, MuscleGroupData,
  getStrengthScore, StrengthScoreResult,
  getVolumeLandmarks, VolumeLandmark,
  getPersonalRecords as getPersonalRecordsAnalytics,
} from '../../services/analytics';
import { startOfWeek, endOfWeek } from 'date-fns';
import { getLocalDateString as toDateStr } from '../../services/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProgressScreen() {
  const { t } = useLocale();
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [stats, setStats] = useState({ totalWorkouts: 0, weeklyWorkouts: 0, monthlyWorkouts: 0, totalDuration: 0, streak: 0 });
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [weightLog, setWeightLog] = useState<WeightEntry[]>([]);
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [strengthStats, setStrengthStats] = useState<StrengthStats | null>(null);
  const [tonnage, setTonnage] = useState<WeeklyTonnage[]>([]);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgressPoint[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [hrZones, setHrZones] = useState<HRZoneSummary[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroupData[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measureModalVisible, setMeasureModalVisible] = useState(false);
  const [measureForm, setMeasureForm] = useState({ waist: '', chest: '', hips: '', bicep: '', thigh: '' });
  const [profile, setProfile] = useState<any>(null);
  const [strengthScore, setStrengthScore] = useState<StrengthScoreResult | null>(null);
  const [volumeLandmarks, setVolumeLandmarks] = useState<VolumeLandmark[]>([]);

  async function loadData() {
    const [w, s, r, wl, ms, p] = await Promise.all([
      getWorkouts(), getStats(), getPersonalRecords(),
      getWeightLog(), getMeasurements(), getUserProfile(),
    ]);
    setWorkouts(w);
    setStats(s);
    setRecords(r);
    setWeightLog(wl);
    setMeasurements(ms);
    setProfile(p);
    const rs = getRunStats(w);
    setRunStats(rs.totalRuns > 0 ? rs : null);
    const ss = getStrengthStats(w);
    setStrengthStats(ss.totalSessions > 0 ? ss : null);
    setTonnage(getWeeklyTonnage(w));
    setExerciseNames(getAllExerciseNames(w));
    if (p?.age) setHrZones(getHRZoneSummary(w, p.age));
    setMuscleGroups(getMuscleGroupBalance(w));
    if (p?.weight) {
      const ss = getStrengthScore(w, p.weight);
      setStrengthScore(ss.lifts.length > 0 ? ss : null);
    }
    // Volume landmarks for current week
    const weekStart = toDateStr(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const weekEnd = toDateStr(endOfWeek(new Date(), { weekStartsOn: 1 }));
    setVolumeLandmarks(getVolumeLandmarks(w, weekStart, weekEnd));
  }

  function selectExercise(name: string) {
    setSelectedExercise(name);
    setExerciseSearch(name);
    setExerciseProgress(getExerciseProgress(workouts, name));
  }

  async function handleSaveMeasurement() {
    function parseMeasure(v: string): number | undefined {
      const n = parseFloat(v);
      return !isNaN(n) && n > 0 ? n : undefined;
    }
    const entry: BodyMeasurement = {
      date: getLocalDateString(new Date()),
      waist: parseMeasure(measureForm.waist),
      chest: parseMeasure(measureForm.chest),
      hips: parseMeasure(measureForm.hips),
      bicep: parseMeasure(measureForm.bicep),
      thigh: parseMeasure(measureForm.thigh),
    };
    if (!Object.values(entry).slice(1).some((v) => v !== undefined)) {
      Alert.alert('Введи хоча б один вимір');
      return;
    }
    await addMeasurement(entry);
    setMeasureForm({ waist: '', chest: '', hips: '', bicep: '', thigh: '' });
    setMeasureModalVisible(false);
    await loadData();
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
      return w.date >= format(weekStart, 'yyyy-MM-dd') && w.date <= format(weekEnd, 'yyyy-MM-dd');
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
      <Text style={[styles.title, { marginBottom: Spacing.lg }]}>{t('progressTitle')}</Text>

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
          <Text style={styles.sectionTitle}>{t('weeklyLoad')}</Text>
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

      {/* Run stats */}
      {runStats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('runStatsTitle')}</Text>
          <View style={styles.runStatsGrid}>
            <RunStatCard label="Всього пробіжок" value={`${runStats.totalRuns}`} icon="walk-outline" color="#2ECC71" />
            <RunStatCard label="Загальна дистанція" value={`${runStats.totalDistanceKm} км`} icon="navigate-outline" color="#2ECC71" />
            <RunStatCard label="Цього місяця" value={`${runStats.monthlyDistanceKm} км`} icon="calendar-outline" color="#2ECC71" />
            <RunStatCard label="Найдовший біг" value={`${runStats.longestRunKm} км`} icon="trophy-outline" color="#F4A261" />
            {runStats.bestPaceSec > 0 && (
              <RunStatCard label="Кращий темп" value={formatPace(runStats.bestPaceSec)} icon="flash-outline" color="#E63946" />
            )}
            {runStats.avgPaceSec > 0 && (
              <RunStatCard label="Середній темп" value={formatPace(runStats.avgPaceSec)} icon="speedometer-outline" color="#3498DB" />
            )}
          </View>

          {/* Last runs */}
          {runStats.recentRuns.length > 0 && (
            <View style={styles.runList}>
              <Text style={styles.subSectionTitle}>Останні пробіжки</Text>
              {runStats.recentRuns.slice(0, 6).map((r, i) => (
                <View key={i} style={styles.runRow}>
                  <Text style={styles.runDate}>{r.date}</Text>
                  <Text style={styles.runDist}>{r.distanceKm > 0 ? `${r.distanceKm} км` : `${r.durationMin} хв`}</Text>
                  {r.paceSec > 0 && <Text style={styles.runPace}>{formatPace(r.paceSec)}</Text>}
                  <Text style={styles.runDur}>{r.durationMin} хв</Text>
                </View>
              ))}
            </View>
          )}

          {/* Pace trend chart */}
          {runStats.recentRuns.filter(r => r.paceSec > 0).length >= 3 && (() => {
            const paceRuns = runStats.recentRuns.filter(r => r.paceSec > 0).slice(0, 8).reverse();
            const minP = Math.min(...paceRuns.map(r => r.paceSec));
            const maxP = Math.max(...paceRuns.map(r => r.paceSec));
            const range = maxP - minP || 1;
            const chartH = 48;
            const chartW = SCREEN_WIDTH - Spacing.md * 4 - Spacing.md * 2;
            const step = chartW / Math.max(paceRuns.length - 1, 1);
            return (
              <View style={[styles.weightChartContainer, { marginTop: Spacing.sm }]}>
                <Text style={styles.subSectionTitle}>Динаміка темпу (менше = краще)</Text>
                <View style={{ height: chartH, position: 'relative' }}>
                  {paceRuns.map((r, i) => {
                    const x = i * step;
                    // Invert: faster pace (lower sec) = higher dot
                    const y = ((r.paceSec - minP) / range) * (chartH - 8);
                    return <View key={i} style={[styles.weightDot, { left: x - 4, top: y }]} />;
                  })}
                </View>
                <View style={styles.weightChartLabels}>
                  <Text style={styles.weightChartLabel}>{formatPace(minP)} (кращий)</Text>
                  <Text style={styles.weightChartLabel}>{formatPace(maxP)}</Text>
                </View>
              </View>
            );
          })()}
        </View>
      )}

      {/* Strength stats */}
      {strengthStats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Статистика силових</Text>
          <View style={styles.runStatsGrid}>
            <RunStatCard label="Тренувань" value={`${strengthStats.totalSessions}`} icon="barbell-outline" color="#E63946" />
            <RunStatCard label="Цього місяця" value={`${strengthStats.monthSessions}`} icon="calendar-outline" color="#E63946" />
            <RunStatCard label="Всього підходів" value={`${strengthStats.totalSets}`} icon="repeat-outline" color="#9B59B6" />
            <RunStatCard label="Сер. тривалість" value={`${strengthStats.avgDurationMin} хв`} icon="time-outline" color="#3498DB" />
            {strengthStats.avgRating > 0 && (
              <RunStatCard label="Сер. оцінка" value={`${strengthStats.avgRating}/5`} icon="star-outline" color="#F4A261" />
            )}
          </View>
        </View>
      )}

      {/* Strength Score */}
      {strengthScore && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Strength Score</Text>
          <View style={styles.strengthScoreCard}>
            <View style={styles.strengthScoreLeft}>
              <Text style={styles.strengthScoreNum}>{strengthScore.score}</Text>
              <Text style={styles.strengthScoreMax}>/1000</Text>
            </View>
            <View style={styles.strengthScoreRight}>
              <Text style={[styles.strengthScoreLevel, { color: SCORE_COLORS[strengthScore.level] }]}>
                {SCORE_LEVEL_LABELS[strengthScore.level]}
              </Text>
              {strengthScore.lifts.map((lift) => (
                <Text key={lift.name} style={styles.strengthLiftRow}>
                  {lift.name}: <Text style={styles.strengthLiftVal}>{lift.estimated1RM} кг 1RM</Text>
                </Text>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Volume Landmarks */}
      {volumeLandmarks.some((v) => v.weeklySets > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Об'єм цього тижня</Text>
          <Text style={styles.sectionHint}>MEV = мінімум · MAV = ціль · MRV = максимум</Text>
          {volumeLandmarks.filter((v) => v.weeklySets > 0).map((v) => (
            <View key={v.group} style={styles.volumeRow}>
              <View style={styles.volumeRowLeft}>
                <Text style={styles.volumeLabel}>{v.label}</Text>
                <Text style={styles.volumeSets}>{v.weeklySets} підх.</Text>
              </View>
              <View style={styles.volumeBarContainer}>
                <View style={styles.volumeBarBg}>
                  <View style={[styles.volumeBarFill, {
                    width: `${v.pct}%` as any,
                    backgroundColor: v.status === 'low' ? '#95A5A6' : v.status === 'optimal' ? '#2ECC71' : v.status === 'high' ? '#F4A261' : '#E63946',
                  }]} />
                  {/* MEV marker */}
                  <View style={[styles.volumeMarker, { left: `${Math.round((v.mev / v.mrv) * 100)}%` as any }]} />
                  {/* MAV marker */}
                  <View style={[styles.volumeMarker, { left: `${Math.round((v.mav / v.mrv) * 100)}%` as any, backgroundColor: Colors.textSecondary }]} />
                </View>
                <Text style={[styles.volumeStatus, {
                  color: v.status === 'low' ? Colors.textMuted : v.status === 'optimal' ? '#2ECC71' : v.status === 'high' ? '#F4A261' : '#E63946',
                }]}>
                  {v.status === 'low' ? 'Мало' : v.status === 'optimal' ? 'Норма' : v.status === 'high' ? 'Багато' : 'Перевантаж'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tonnage chart */}
      {tonnage.some((t) => t.tonnage > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Тоннаж (підх × повт × вага)</Text>
          <View style={styles.barChart}>
            {(() => {
              const maxT = Math.max(...tonnage.map((t) => t.tonnage), 1);
              return tonnage.map((item, i) => (
                <View key={i} style={styles.barColumn}>
                  <Text style={styles.barValue}>{item.tonnage > 0 ? `${Math.round(item.tonnage / 1000)}т` : ''}</Text>
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: Math.max((item.tonnage / maxT) * 80, item.tonnage > 0 ? 4 : 0), backgroundColor: '#9B59B6' }]} />
                  </View>
                  <Text style={styles.barLabel}>{item.weekLabel}</Text>
                </View>
              ));
            })()}
          </View>
        </View>
      )}

      {/* Exercise progress */}
      {exerciseNames.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('exerciseProgress')}</Text>
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={{ paddingHorizontal: 6 }} />
            <TextInput
              style={styles.exSearchInput}
              placeholder={t('searchExercise')}
              placeholderTextColor={Colors.textMuted}
              value={exerciseSearch}
              onChangeText={(t) => { setExerciseSearch(t); if (!t) setSelectedExercise(null); }}
            />
          </View>
          {exerciseSearch.length > 0 && !selectedExercise && (
            <View style={styles.exSuggestions}>
              {exerciseNames.filter((n) => n.toLowerCase().includes(exerciseSearch.toLowerCase())).slice(0, 5).map((name) => (
                <TouchableOpacity key={name} style={styles.exSuggestionItem} onPress={() => selectExercise(name)}>
                  <Text style={styles.exSuggestionText}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {selectedExercise && exerciseProgress.length > 0 && (() => {
            const withWeight = exerciseProgress.filter((p) => p.weight > 0);
            const best = exerciseProgress.reduce((b, p) => p.estimated1RM > b.estimated1RM ? p : b, exerciseProgress[0]);
            return (
              <View style={styles.exProgressContainer}>
                <View style={styles.exBestRow}>
                  <View style={styles.exBestCard}>
                    <Text style={styles.exBestLabel}>Макс. вага</Text>
                    <Text style={styles.exBestValue}>{Math.max(...exerciseProgress.map(p => p.weight))} кг</Text>
                  </View>
                  <View style={styles.exBestCard}>
                    <Text style={styles.exBestLabel}>Розрах. 1RM</Text>
                    <Text style={[styles.exBestValue, { color: Colors.primary }]}>{best.estimated1RM} кг</Text>
                  </View>
                  <View style={styles.exBestCard}>
                    <Text style={styles.exBestLabel}>Сесій</Text>
                    <Text style={styles.exBestValue}>{exerciseProgress.length}</Text>
                  </View>
                </View>
                {withWeight.length >= 2 && (() => {
                  const pts = withWeight.slice(-10);
                  const minW = Math.min(...pts.map((p) => p.weight));
                  const maxW = Math.max(...pts.map((p) => p.weight));
                  const range = maxW - minW || 1;
                  const chartH = 56;
                  const chartW = SCREEN_WIDTH - Spacing.md * 4 - Spacing.md * 2;
                  const step = chartW / Math.max(pts.length - 1, 1);
                  return (
                    <View style={styles.weightChartContainer}>
                      <Text style={styles.subSectionTitle}>Вага (кг) за останні {pts.length} сесій</Text>
                      <View style={{ height: chartH, position: 'relative' }}>
                        {pts.map((p, i) => {
                          const x = i * step;
                          const y = chartH - 8 - ((p.weight - minW) / range) * (chartH - 16);
                          return (
                            <View key={i}>
                              <View style={[styles.weightDot, { left: x - 4, top: y - 4 }]} />
                              {i === pts.length - 1 && (
                                <Text style={[styles.exDotLabel, { left: x - 12, top: y - 20 }]}>{p.weight}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                      <View style={styles.weightChartLabels}>
                        <Text style={styles.weightChartLabel}>{pts[0].date}</Text>
                        <Text style={styles.weightChartLabel}>{pts[pts.length - 1].date}</Text>
                      </View>
                    </View>
                  );
                })()}
                <View style={styles.exHistoryList}>
                  {exerciseProgress.slice(-5).reverse().map((p, i) => (
                    <View key={i} style={styles.exHistoryRow}>
                      <Text style={styles.exHistoryDate}>{p.date}</Text>
                      {p.weight > 0 && <Text style={styles.exHistoryWeight}>{p.weight} кг</Text>}
                      {p.reps > 0 && <Text style={styles.exHistoryReps}>× {p.reps}</Text>}
                      {p.sets > 0 && <Text style={styles.exHistorySets}>{p.sets} підх.</Text>}
                      {p.estimated1RM > 0 && <Text style={styles.exHistory1rm}>~{p.estimated1RM} 1RM</Text>}
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}
        </View>
      )}

      {/* Muscle group balance */}
      {muscleGroups.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('muscleGroupsTitle')}</Text>
          {(() => {
            const maxCount = muscleGroups[0].count;
            return muscleGroups.map((mg) => (
              <View key={mg.group} style={styles.typeRow}>
                <Text style={[styles.typeLabel, { color: mg.color }]}>{mg.label}</Text>
                <View style={styles.typeBar}>
                  <View style={[styles.typeBarFill, { width: `${(mg.count / maxCount) * 100}%`, backgroundColor: mg.color }]} />
                </View>
                <Text style={[styles.typeCount, { color: mg.color }]}>{mg.count}</Text>
              </View>
            ));
          })()}
          <Text style={styles.muscleNote}>підходів всього</Text>
        </View>
      )}

      {/* HR Zones */}
      {hrZones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('hrZonesTitle')}</Text>
          <Text style={styles.hrNote}>Макс. ЧСС: {220 - (profile?.age || 30)} уд/хв (220 − вік)</Text>
          {hrZones.map((z) => (
            <View key={z.zone} style={styles.hrZoneRow}>
              <View style={[styles.hrZoneDot, { backgroundColor: z.color }]} />
              <Text style={styles.hrZoneLabel}>{z.label}</Text>
              <Text style={styles.hrZoneCount}>{z.count} трен.</Text>
              <Text style={styles.hrZoneMin}>{z.totalMinutes} хв</Text>
            </View>
          ))}
        </View>
      )}

      {/* Calorie estimation */}
      {workouts.length > 0 && profile?.weight && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('caloriesByMonthTitle')}</Text>
          {(() => {
            const monthCutoff = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
            const recentW = workouts.filter((w) => w.date >= monthCutoff);
            const totalCal = recentW.reduce((sum, w) => {
              if (w.totalCalories) return sum + w.totalCalories;
              return sum + estimateCalories(w.workoutType, w.duration, profile.weight);
            }, 0);
            const TYPE_LABELS_UA: Record<string, string> = {
              strength: 'Силове', cardio: 'Кардіо', crossfit: 'CrossFit',
              hiit: 'HIIT', yoga: 'Йога', recovery: 'Відновлення',
              run: 'Біг', cycling: 'Велосипед', swimming: 'Плавання', custom: 'Інше',
            };
            const byType: Record<string, number> = {};
            recentW.forEach((w) => {
              const cal = w.totalCalories || estimateCalories(w.workoutType, w.duration, profile.weight);
              byType[w.workoutType] = (byType[w.workoutType] || 0) + cal;
            });
            return (
              <>
                <View style={styles.calTotalRow}>
                  <Ionicons name="flame-outline" size={22} color={Colors.accent} />
                  <Text style={styles.calTotal}>{Math.round(totalCal).toLocaleString()} ккал</Text>
                  <Text style={styles.calTotalLabel}>за останній місяць</Text>
                </View>
                {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, cal]) => (
                  <View key={type} style={styles.calRow}>
                    <Text style={styles.calType}>{TYPE_LABELS_UA[type] || type}</Text>
                    <Text style={styles.calValue}>{Math.round(cal)} ккал</Text>
                  </View>
                ))}
                <Text style={styles.calNote}>* Оцінка на основі MET-значень. Точні значення вноси вручну при записі тренування.</Text>
              </>
            );
          })()}
        </View>
      )}

      {/* Body Measurements */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('measurementsTitle')}</Text>
          <TouchableOpacity style={styles.logWeightBtn} onPress={() => setMeasureModalVisible(true)}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.logWeightBtnText}>{t('addMeasurementBtn')}</Text>
          </TouchableOpacity>
        </View>
        {measurements.length === 0 ? (
          <TouchableOpacity style={styles.weightEmpty} onPress={() => setMeasureModalVisible(true)}>
            <Ionicons name="body-outline" size={28} color={Colors.textMuted} />
            <Text style={styles.weightEmptyText}>Записуй заміри — відстежуй зміни складу тіла</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Latest vs previous */}
            {measurements.length >= 1 && (() => {
              const latest = measurements[measurements.length - 1];
              const prev = measurements.length >= 2 ? measurements[measurements.length - 2] : null;
              const fields: { key: keyof BodyMeasurement; label: string }[] = [
                { key: 'waist', label: 'Талія' }, { key: 'chest', label: 'Груди' },
                { key: 'hips', label: 'Стегна' }, { key: 'bicep', label: 'Біцепс' },
                { key: 'thigh', label: 'Стегно' },
              ];
              return (
                <View style={styles.measureCard}>
                  <Text style={styles.measureDate}>{latest.date}</Text>
                  <View style={styles.measureGrid}>
                    {fields.filter((f) => latest[f.key] != null).map((f) => {
                      const val = latest[f.key] as number;
                      const prevVal = prev ? prev[f.key] as number : null;
                      const diff = prevVal != null ? val - prevVal : null;
                      return (
                        <View key={f.key} style={styles.measureCell}>
                          <Text style={styles.measureLabel}>{f.label}</Text>
                          <Text style={styles.measureVal}>{val} <Text style={styles.measureUnit}>см</Text></Text>
                          {diff != null && diff !== 0 && (
                            <Text style={[styles.measureDiff, { color: diff < 0 ? Colors.success : Colors.error }]}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
            {measurements.length > 1 && (
              <Text style={styles.weightMore}>Всього {measurements.length} записів</Text>
            )}
          </>
        )}
      </View>

      {/* Weight History */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('weightHistoryTitle')}</Text>
          <TouchableOpacity style={styles.logWeightBtn} onPress={() => setWeightModalVisible(true)}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.logWeightBtnText}>{t('addWeightBtn')}</Text>
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
          <Text style={styles.sectionTitle}>{t('personalRecordsTitle')}</Text>
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
          <Text style={styles.emptyTitle}>{t('noData')}</Text>
          <Text style={styles.emptyText}>{t('noWorkouts')}</Text>
        </View>
      )}

      {/* Measurements modal */}
      <Modal visible={measureModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: '90%' }]}>
            <Text style={styles.modalTitle}>Заміри тіла (см)</Text>
            {[
              { key: 'waist', label: 'Талія' }, { key: 'chest', label: 'Груди' },
              { key: 'hips', label: 'Стегна' }, { key: 'bicep', label: 'Біцепс' },
              { key: 'thigh', label: 'Стегно (обхват)' },
            ].map((f) => (
              <View key={f.key} style={styles.measureModalRow}>
                <Text style={styles.measureModalLabel}>{f.label}</Text>
                <TextInput
                  style={styles.measureModalInput}
                  placeholder="–"
                  placeholderTextColor={Colors.textMuted}
                  value={measureForm[f.key as keyof typeof measureForm]}
                  onChangeText={(v) => setMeasureForm((prev) => ({ ...prev, [f.key]: v }))}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
            <View style={[styles.modalActions, { marginTop: Spacing.md }]}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setMeasureModalVisible(false); setMeasureForm({ waist: '', chest: '', hips: '', bicep: '', thigh: '' }); }}>
                <Text style={styles.modalCancelText}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveMeasurement}>
                <Text style={styles.modalSaveText}>Зберегти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

const SCORE_COLORS: Record<string, string> = {
  beginner: '#95A5A6', novice: '#3498DB', intermediate: '#2ECC71', advanced: '#F4A261', elite: '#E63946',
};
const SCORE_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Початківець', novice: 'Новачок', intermediate: 'Середній', advanced: 'Просунутий', elite: 'Еліта',
};

function RunStatCard({ icon, color, value, label }: {
  icon: any; color: string; value: string; label: string;
}) {
  return (
    <View style={styles.runStatCard}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.runStatValue, { color }]}>{value}</Text>
      <Text style={styles.runStatLabel}>{label}</Text>
    </View>
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
  sectionTitle: { ...Typography.h3, fontSize: 16, marginBottom: Spacing.xs },
  sectionHint: { color: Colors.textMuted, fontSize: 11, marginBottom: Spacing.md },
  strengthScoreCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.lg,
  },
  strengthScoreLeft: { alignItems: 'center', justifyContent: 'center' },
  strengthScoreNum: { fontSize: 48, fontWeight: '800', color: Colors.textPrimary, lineHeight: 52 },
  strengthScoreMax: { color: Colors.textMuted, fontSize: 13 },
  strengthScoreRight: { flex: 1, justifyContent: 'center', gap: 4 },
  strengthScoreLevel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  strengthLiftRow: { color: Colors.textSecondary, fontSize: 13 },
  strengthLiftVal: { color: Colors.textPrimary, fontWeight: '600' },
  volumeRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  volumeRowLeft: { width: 80 },
  volumeLabel: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  volumeSets: { color: Colors.textMuted, fontSize: 11 },
  volumeBarContainer: { flex: 1, gap: 2 },
  volumeBarBg: {
    height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', position: 'relative',
  },
  volumeBarFill: { height: '100%', borderRadius: 4 },
  volumeMarker: {
    position: 'absolute', top: 0, width: 2, height: '100%',
    backgroundColor: Colors.textMuted, opacity: 0.6,
  },
  volumeStatus: { fontSize: 10, fontWeight: '600', alignSelf: 'flex-end' },
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
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm,
  },
  exSearchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: 9 },
  exSuggestions: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  exSuggestionItem: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exSuggestionText: { color: Colors.textPrimary, fontSize: 14 },
  exProgressContainer: { gap: Spacing.sm },
  exBestRow: { flexDirection: 'row', gap: Spacing.sm },
  exBestCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  exBestLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 3 },
  exBestValue: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  exHistoryList: { marginTop: Spacing.xs },
  exHistoryRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exHistoryDate: { color: Colors.textMuted, fontSize: 12, width: 90 },
  exHistoryWeight: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14, width: 52 },
  exHistoryReps: { color: Colors.textSecondary, fontSize: 13, width: 40 },
  exHistorySets: { color: Colors.textMuted, fontSize: 12, width: 56 },
  exHistory1rm: { color: Colors.primary, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  exDotLabel: { position: 'absolute', color: Colors.primary, fontSize: 10, fontWeight: '700' },
  muscleNote: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
  hrNote: { color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.sm },
  hrZoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  hrZoneDot: { width: 12, height: 12, borderRadius: 6 },
  hrZoneLabel: { flex: 1, color: Colors.textSecondary, fontSize: 14 },
  hrZoneCount: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14, width: 60, textAlign: 'right' },
  hrZoneMin: { color: Colors.textMuted, fontSize: 13, width: 48, textAlign: 'right' },
  calTotalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  calTotal: { fontSize: 26, fontWeight: '800', color: Colors.accent },
  calTotalLabel: { color: Colors.textMuted, fontSize: 13 },
  calRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  calType: { color: Colors.textSecondary, fontSize: 14 },
  calValue: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  calNote: { color: Colors.textMuted, fontSize: 11, marginTop: Spacing.sm, fontStyle: 'italic' },
  measureCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  measureDate: { color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.sm },
  measureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  measureCell: {
    minWidth: 80, backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md, padding: Spacing.sm, alignItems: 'center',
  },
  measureLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 2 },
  measureVal: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  measureUnit: { color: Colors.textMuted, fontWeight: '400', fontSize: 12 },
  measureDiff: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  measureModalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  measureModalLabel: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  measureModalInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    color: Colors.textPrimary, fontSize: 16, fontWeight: '600',
    textAlign: 'center', width: 80,
  },
  subSectionTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: Spacing.sm },
  runStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  runStatCard: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  runStatValue: { fontSize: 16, fontWeight: '800' },
  runStatLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  runList: { marginTop: Spacing.sm },
  runRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  runDate: { color: Colors.textMuted, fontSize: 12, width: 88 },
  runDist: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14, flex: 1 },
  runPace: { color: Colors.primary, fontSize: 13, fontWeight: '600', width: 72, textAlign: 'center' },
  runDur: { color: Colors.textMuted, fontSize: 12, width: 40, textAlign: 'right' },
});
