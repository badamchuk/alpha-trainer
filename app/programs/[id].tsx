// Картка програми: що всередині, як росте навантаження, і кнопка «почати».
//
// Найважливіше тут — прев'ю прогресії. Людина має бачити наперед, до чого
// прийде за вісім тижнів, інакше програма — це кіт у мішку.

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import ExerciseImage from '../../components/ExerciseImage';
import { getProgram } from '../../services/programs/data';
import { prescriptionFor, progressionPreview } from '../../services/programs/engine';
import {
  getActiveProgram, startProgram, stopProgram, suggestBaseWeights,
} from '../../services/programs/storage';
import { ActiveProgram } from '../../services/programs/types';
import { exerciseName, getExercise } from '../../services/library';
import { getUserProfile, getWorkouts } from '../../services/storage';
import { buildResolver } from '../../services/exerciseLinks';
import { equipmentOf, EQUIPMENT_LABELS } from '../../services/equipment';
import { Equipment } from '../../services/library/types';
import { useLocale } from '../../services/i18n';

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();

  const template = id ? getProgram(id) : undefined;
  const [active, setActive] = useState<ActiveProgram | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [equipment, setEquipment] = useState<Equipment[] | undefined>(undefined);
  const [openWeek, setOpenWeek] = useState<number | null>(1);

  useFocusEffect(useCallback(() => {
    async function load() {
      if (!template) return;
      const [profile, workouts, resolver, a] = await Promise.all([
        getUserProfile(), getWorkouts(), buildResolver(), getActiveProgram(),
      ]);
      setEquipment(equipmentOf(profile));
      setActive(a);
      const suggested = a?.templateId === template.id
        ? a.baseWeights
        : suggestBaseWeights(template.id, workouts, resolver);
      setWeights(Object.fromEntries(
        Object.entries(suggested).map(([k, v]) => [k, String(v)])
      ));
    }
    load();
  }, [template]));

  if (!template) {
    return (
      <View style={styles.container}>
        <Header title="Програма" onBack={() => router.back()} top={insets.top} />
        <View style={styles.center}><Text style={styles.muted}>Програму не знайдено</Text></View>
      </View>
    );
  }

  const isActive = active?.templateId === template.id;
  const mainIds = [...new Set(
    template.days.flatMap((d) => d.slots.filter((s) => s.role === 'main').map((s) => s.exerciseId))
  )];
  const missing = equipment ? template.equipment.filter((e) => !equipment.includes(e)) : [];

  async function handleStart() {
    if (!template) return;
    const base: Record<string, number> = {};
    for (const [exId, raw] of Object.entries(weights)) {
      const kg = parseFloat(raw.replace(',', '.'));
      if (!Number.isNaN(kg) && kg > 0) base[exId] = kg;
    }

    const begin = async () => {
      await startProgram(template.id, base);
      setActive(await getActiveProgram());
      Alert.alert(
        'Програму почато',
        'Наступне тренування зʼявиться на головному екрані.',
        [{ text: 'Добре', onPress: () => router.push('/') }],
      );
    };

    if (active && active.templateId !== template.id) {
      Alert.alert(
        'Замінити активну програму?',
        'Поточний прогрес по ній буде втрачено. Дві програми одночасно проходити не вийде.',
        [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Замінити', style: 'destructive', onPress: async () => { await stopProgram(); await begin(); } },
        ],
      );
      return;
    }
    await begin();
  }

  async function handleStop() {
    Alert.alert('Зупинити програму?', 'Прогрес по ній буде стерто.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Зупинити',
        style: 'destructive',
        onPress: async () => { await stopProgram(); setActive(null); },
      },
    ]);
  }

  const preview = progressionPreview(
    template,
    parseFloat(weights[mainIds[0]] ?? '') || 100,
  );

  return (
    <View style={styles.container}>
      <Header
        title={lang === 'en' ? template.nameEn : template.nameUk}
        onBack={() => router.back()}
        top={insets.top}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.summary}>
            {lang === 'en' ? template.summaryEn : template.summaryUk}
          </Text>
          <Text style={styles.meta}>
            {template.weeks} тижнів · {template.days.length} дні на тиждень
            {' · '}{template.weeks * template.days.length} тренувань
          </Text>
          {missing.length > 0 && (
            <View style={styles.warnRow}>
              <Ionicons name="alert-circle-outline" size={15} color={Colors.warning} />
              <Text style={styles.warn}>
                Бракує: {missing.map((e) => EQUIPMENT_LABELS[e] ?? e).join(', ')}.
                Замінити вправу можна прямо в тренуванні.
              </Text>
            </View>
          )}
        </View>

        {/* Робочі ваги — від них рахується вся прогресія */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Робочі ваги</Text>
          <Text style={styles.hint}>
            З чого починаємо. Підставили з твоєї історії — виправ, якщо не збігається.
            Порожнє поле означає «працюю за відчуттям».
          </Text>
          {mainIds.map((exId) => {
            const ex = getExercise(exId);
            if (!ex) return null;
            return (
              <View key={exId} style={styles.weightRow}>
                <ExerciseImage slug={ex.imageSlug} pattern={ex.pattern} size={36} />
                <Text style={styles.weightName}>{exerciseName(ex)}</Text>
                <TextInput
                  style={styles.weightInput}
                  value={weights[exId] ?? ''}
                  onChangeText={(v) => setWeights((p) => ({ ...p, [exId]: v }))}
                  keyboardType="numeric"
                  placeholder="кг"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            );
          })}
        </View>

        {/* Прев'ю прогресії — головне, заради чого цей екран */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Як росте навантаження</Text>
          <Text style={styles.hint}>
            {getExercise(mainIds[0]) ? exerciseName(getExercise(mainIds[0])!) : ''} по тижнях
          </Text>
          {preview.map((w) => (
            <View key={w.week} style={styles.weekRow}>
              <Text style={[
                styles.weekNum,
                { color: w.deload ? Colors.success : Colors.textMuted },
              ]}>
                {w.week}
              </Text>
              <Text style={styles.weekLabel}>{w.label}</Text>
              {w.deload && <Text style={styles.deload}>розвантаження</Text>}
            </View>
          ))}
        </View>

        {/* Тиждень у деталях */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Тиждень</Text>
          {template.days.map((day, i) => {
            const open = openWeek === i + 1;
            return (
              <View key={day.titleUk}>
                <TouchableOpacity
                  style={styles.dayHead}
                  onPress={() => setOpenWeek(open ? null : i + 1)}
                >
                  <Text style={styles.dayTitle}>
                    {lang === 'en' ? day.titleEn : day.titleUk}
                  </Text>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
                {open && day.slots.map((slot) => {
                  const ex = getExercise(slot.exerciseId);
                  if (!ex) return null;
                  const base = parseFloat(weights[slot.exerciseId] ?? '') || undefined;
                  const p = prescriptionFor(template, slot, 1, base);
                  return (
                    <TouchableOpacity
                      key={slot.exerciseId + slot.role}
                      style={styles.slotRow}
                      onPress={() => router.push(`/exercises/${ex.id}`)}
                    >
                      <ExerciseImage slug={ex.imageSlug} pattern={ex.pattern} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.slotName}>{exerciseName(ex)}</Text>
                        <Text style={styles.slotMeta}>
                          {p.sets}×{p.reps}{p.weight ? ` · ${p.weight} кг` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>

        {isActive ? (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/')}>
              <Ionicons name="play" size={18} color="#FFF" />
              <Text style={styles.primaryText}>До наступного тренування</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
              <Text style={styles.stopText}>Зупинити програму</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
            <Ionicons name="flag-outline" size={18} color="#FFF" />
            <Text style={styles.primaryText}>Почати програму</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack, top }: { title: string; onBack: () => void; top: number }) {
  return (
    <View style={[styles.header, { paddingTop: top + 8 }]}>
      <TouchableOpacity onPress={onBack} hitSlop={10}>
        <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...Typography.bodySmall, color: Colors.textMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, gap: Spacing.sm,
  },
  cardTitle: { ...Typography.label },
  summary: { ...Typography.bodySmall, lineHeight: 19 },
  meta: { ...Typography.bodySmall, color: Colors.textMuted },
  hint: { ...Typography.bodySmall, color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  warnRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  warn: { ...Typography.bodySmall, color: Colors.warning, flex: 1, fontSize: 12 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  weightName: { ...Typography.bodySmall, flex: 1 },
  weightInput: {
    ...Typography.body,
    width: 84, textAlign: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.sm,
    paddingVertical: 6,
  },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  weekNum: { ...Typography.bodySmall, width: 20 },
  weekLabel: { ...Typography.bodySmall, flex: 1 },
  deload: { ...Typography.bodySmall, color: Colors.success, fontSize: 11 },
  dayHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  dayTitle: { ...Typography.body, fontSize: 14 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 4, paddingLeft: Spacing.sm,
  },
  slotName: { ...Typography.bodySmall },
  slotMeta: { ...Typography.bodySmall, color: Colors.textMuted, fontSize: 12 },
  actions: { gap: Spacing.sm },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.primary,
  },
  primaryText: { ...Typography.body, color: '#FFF', fontWeight: '600' },
  stopBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  stopText: { ...Typography.bodySmall, color: Colors.textMuted },
});
