// Картка вправи (ТЗ F3.6).
//
// Показує, як вправа виглядає й робиться, чим її замінити та що ти в ній уже
// робив. Історія береться через резолвер, тому «front squad» із записів
// потрапляє в ту саму картку, що й «Фронтальні присідання».

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import ExerciseImage from '../../components/ExerciseImage';
import { cuesOf, exerciseName, getExercise, modificationsOf, muscleGroupOf } from '../../services/library';
import { LibraryExercise, MUSCLE_GROUP_LABELS } from '../../services/library/types';
import { equipmentList, equipmentOf } from '../../services/equipment';
import { useLocale } from '../../services/i18n';
import { formatPrescription, prescribe } from '../../services/prescriptions';
import { findSubstitutions, reasonText, SubstitutionOption } from '../../services/substitutions';
import { buildResolver } from '../../services/exerciseLinks';
import { getUserProfile, getWorkouts } from '../../services/storage';
import { ExerciseProgressPoint, getExerciseProgress } from '../../services/analytics';

const LEVEL_KEY: Record<number, string> = { 1: 'levelEasy', 2: 'levelMedium', 3: 'levelHard' };

const INTENT_KEY: Record<string, string> = {
  max_strength: 'intentMaxStrength',
  hypertrophy: 'intentHypertrophy',
  power: 'intentPower',
  conditioning: 'intentConditioning',
  isometric: 'intentIsometric',
  mobility: 'intentMobility',
};

export default function ExerciseCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [exercise, setExercise] = useState<LibraryExercise | null>(null);
  const [history, setHistory] = useState<ExerciseProgressPoint[]>([]);
  const [subs, setSubs] = useState<{ easier: SubstitutionOption[]; variations: SubstitutionOption[] }>(
    { easier: [], variations: [] },
  );
  const [harder, setHarder] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, lang } = useLocale();

  useEffect(() => {
    async function load() {
      const ex = id ? getExercise(id) : undefined;
      if (!ex) { setLoading(false); return; }
      setExercise(ex);

      const [profile, workouts, resolver] = await Promise.all([
        getUserProfile(), getWorkouts(), buildResolver(),
      ]);
      setHistory(getExerciseProgress(workouts, ex.nameUk, resolver).slice(-3).reverse());

      const result = findSubstitutions({
        exercise: ex,
        availableEquipment: equipmentOf(profile),
        protectZones: profile?.protectZones ?? [],
      });
      setSubs({ easier: result.easier, variations: result.variations });
      // «Складніше» — дзеркало зв'язку «простіша за»: ті, для кого ця вправа легша
      setHarder(
        findSubstitutions({ exercise: ex, maxVariations: 12 }).variations
          .map((o) => o.exercise)
          .filter((c) => ex.easierThan?.includes(c.id) || c.level > ex.level)
          .slice(0, 4),
      );
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!exercise) {
    return (
      <View style={styles.container}>
        <Header title={t('exerciseTitle')} onBack={() => router.back()} top={insets.top} />
        <View style={styles.center}>
          <Text style={styles.muted}>{t('exerciseNotFound')}</Text>
        </View>
      </View>
    );
  }

  const best = history.reduce((b, p) => Math.max(b, p.estimated1RM || 0), 0);

  return (
    <View style={styles.container}>
      <Header title={exerciseName(exercise)} onBack={() => router.back()} top={insets.top} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ExerciseImage
            slug={exercise.imageSlug}
            pattern={exercise.pattern}
            size={180}
            animated
          />
          <Text style={styles.nameEn}>{exercise.nameEn}</Text>
          <Text style={styles.meta}>
            {MUSCLE_GROUP_LABELS[muscleGroupOf(exercise)][lang]}
            {' · '}{t(LEVEL_KEY[exercise.level])}
            {' · '}{t(INTENT_KEY[exercise.intent] ?? exercise.intent)}
          </Text>
          <Text style={styles.meta}>
            {exercise.equipment.length === 0
              ? t('bodyweightLabel')
              : equipmentList(exercise.equipment, lang)}
          </Text>
          <Text style={styles.scheme}>{t('schemeLabel', formatPrescription(prescribe(exercise), t))}</Text>
        </View>

        <Section title={t('techniqueTitle')}>
          {cuesOf(exercise).map((c) => (
            <View key={c} style={styles.bullet}>
              <Ionicons name="ellipse" size={6} color={Colors.primary} style={{ marginTop: 7 }} />
              <Text style={styles.text}>{c}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={styles.videoBtn}
            onPress={() => Linking.openURL(
              `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.nameEn} technique`)}`,
            )}
          >
            <Ionicons name="logo-youtube" size={16} color={Colors.primary} />
            <Text style={styles.videoText}>{t('watchVideo')}</Text>
          </TouchableOpacity>
        </Section>

        {modificationsOf(exercise).length > 0 && (
          <Section title={t('sameButTitle')}>
            {modificationsOf(exercise).map((m) => (
              <View key={m} style={styles.bullet}>
                <Ionicons name="bulb-outline" size={14} color={Colors.accent} style={{ marginTop: 3 }} />
                <Text style={styles.text}>{m}</Text>
              </View>
            ))}
          </Section>
        )}

        {history.length > 0 && (
          <Section title={t('myHistoryTitle')}>
            {history.map((p) => (
              <View key={p.date} style={styles.historyRow}>
                <Text style={styles.text}>{p.date}</Text>
                <Text style={styles.muted}>
                  {p.weight ? t('weightByReps', p.weight, p.reps) : t('setsShort', p.sets, p.reps)}
                </Text>
              </View>
            ))}
            {best > 0 && <Text style={styles.muted}>{t('bestE1rm', Math.round(best))}</Text>}
          </Section>
        )}

        {subs.easier.length > 0 && (
          <Section title={t('easierBlock')}>
            {subs.easier.map((o) => (
              <Related key={o.exercise.id} ex={o.exercise} note={reasonText(o.reasonCode, t)} onPress={() => router.push(`/exercises/${o.exercise.id}`)} />
            ))}
          </Section>
        )}

        {subs.variations.length > 0 && (
          <Section title={t('variationsBlock')}>
            {subs.variations.map((o) => (
              <Related key={o.exercise.id} ex={o.exercise} note={reasonText(o.reasonCode, t)} onPress={() => router.push(`/exercises/${o.exercise.id}`)} />
            ))}
          </Section>
        )}

        {harder.length > 0 && (
          <Section title={t('harderBlock')}>
            {harder.map((ex) => (
              <Related key={ex.id} ex={ex} note={t('nextStepNote')} onPress={() => router.push(`/exercises/${ex.id}`)} />
            ))}
          </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Related({ ex, note, onPress }: { ex: LibraryExercise; note: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.relatedRow} onPress={onPress}>
      <ExerciseImage slug={ex.imageSlug} pattern={ex.pattern} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{exerciseName(ex)}</Text>
        <Text style={styles.muted}>{note}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  hero: {
    alignItems: 'center', gap: 4, padding: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  nameEn: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: Spacing.sm },
  meta: { ...Typography.bodySmall, color: Colors.textSecondary },
  scheme: { ...Typography.bodySmall, color: Colors.primary, marginTop: 4 },
  section: {
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, gap: Spacing.sm,
  },
  sectionTitle: { ...Typography.label },
  bullet: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  text: { ...Typography.bodySmall, flex: 1, lineHeight: 19 },
  muted: { ...Typography.bodySmall, color: Colors.textMuted },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  relatedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  videoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  videoText: { ...Typography.bodySmall, color: Colors.primary },
});
