// Панель заміни вправи (ТЗ F4.2).
//
// Обмеження тут — на цю сесію: «сьогодні немає штанги», «береже плече».
// Постійні обмеження живуть у профілі й підставляються початково.

import { useMemo, useState } from 'react';
import { exerciseName } from '../services/library';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import ExerciseImage from './ExerciseImage';
import { openVideo } from './ExerciseHowTo';
import {
  cautionText, findSubstitutions, reasonText, subsEmptyText, SubstitutionOption,
} from '../services/substitutions';
import { useLocale } from '../services/i18n';
import { EQUIPMENT_LABELS } from '../services/equipment';
import { Equipment, JointZone, LibraryExercise } from '../services/library/types';

/** Зони підписуємо через i18n: ці слова бачить користувач. */
const ZONE_KEYS: { id: JointZone; key: string }[] = [
  { id: 'shoulder', key: 'zoneShoulder' },
  { id: 'lower_back', key: 'zoneLowerBack' },
  { id: 'knee', key: 'zoneKnee' },
  { id: 'wrist', key: 'zoneWrist' },
  { id: 'elbow', key: 'zoneElbow' },
  { id: 'impact', key: 'zoneImpact' },
];

interface Props {
  visible: boolean;
  exercise: LibraryExercise | null;
  /** Обладнання користувача; undefined — фільтр не застосовується. */
  equipment?: Equipment[];
  /** Постійні обмеження з профілю. */
  protectZones?: JointZone[];
  familiarity?: Map<string, number>;
  onClose: () => void;
  onPick: (ex: LibraryExercise) => void;
}

/** Код причини → фраза мовою інтерфейсу. */

export default function SubstitutionSheet({
  visible, exercise, equipment, protectZones = [], familiarity, onClose, onPick,
}: Props) {
  const router = useRouter();
  const { t } = useLocale();
  const [noEquipment, setNoEquipment] = useState(false);
  const [zones, setZones] = useState<JointZone[]>(protectZones);

  const result = useMemo(() => {
    if (!exercise) return null;
    return findSubstitutions({
      exercise,
      availableEquipment: noEquipment ? [] : equipment,
      protectZones: zones,
      familiarity,
    });
  }, [exercise, noEquipment, zones, equipment, familiarity]);

  function toggleZone(z: JointZone) {
    setZones((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
  }

  function close() {
    onClose();
    setNoEquipment(false);
    setZones(protectZones);
  }

  /** Картку показуємо ПІСЛЯ закриття панелі — інакше вона відкриється під модалкою. */
  function openCard(id: string) {
    close();
    router.push(`/exercises/${id}`);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={close} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('substituteTitle')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {exercise && (
          <View style={styles.origin}>
            <ExerciseImage slug={exercise.imageSlug} pattern={exercise.pattern} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.originName}>{exerciseName(exercise)}</Text>
              <Text style={styles.originMeta}>{t('substituteFor')}</Text>
            </View>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.chips} contentContainerStyle={styles.chipsContent}>
          <TouchableOpacity
            style={[styles.chip, noEquipment && styles.chipActive]}
            onPress={() => setNoEquipment((v) => !v)}
          >
            <Text style={[styles.chipText, noEquipment && styles.chipTextActive]}>
              {t('noEquipmentChip')}
            </Text>
          </TouchableOpacity>
          {ZONE_KEYS.map((z) => (
            <TouchableOpacity
              key={z.id}
              style={[styles.chip, zones.includes(z.id) && styles.chipActive]}
              onPress={() => toggleZone(z.id)}
            >
              <Text style={[styles.chipText, zones.includes(z.id) && styles.chipTextActive]}>
                {t(z.key)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.disclaimer}>{t('painDisclaimer')}</Text>

        <ScrollView contentContainerStyle={styles.list}>
          {result?.modifications && result.modifications.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('sameButBlock')}</Text>
              {result.modifications.map((m) => (
                <View key={m} style={styles.modRow}>
                  <Ionicons name="bulb-outline" size={15} color={Colors.accent} />
                  <Text style={styles.modText}>{m}</Text>
                </View>
              ))}
            </View>
          )}

          {result && result.easier.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('easierBlock')}</Text>
              {result.easier.map((o) => (
                <OptionRow key={o.exercise.id} option={o}
                  onPick={() => { onPick(o.exercise); close(); }}
                  onInfo={() => openCard(o.exercise.id)} />
              ))}
            </View>
          )}

          {result && result.variations.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('variationsBlock')}</Text>
              {result.variations.map((o) => (
                <OptionRow key={o.exercise.id} option={o}
                  onPick={() => { onPick(o.exercise); close(); }}
                  onInfo={() => openCard(o.exercise.id)} />
              ))}
            </View>
          )}

          {result?.emptyReason && (
            <View style={styles.empty}>
              <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>{subsEmptyText(result.emptyReason, t)}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function OptionRow(
  { option, onPick, onInfo }: { option: SubstitutionOption; onPick: () => void; onInfo: () => void },
) {
  const { exercise, reasonCode, cautionCode } = option;
  const { t } = useLocale();
  // текст збирається тут: сервіс віддає лише код причини
  const reason = reasonText(reasonCode, t);
  const caution = cautionCode ? cautionText(cautionCode, t) : undefined;
  return (
    <TouchableOpacity style={styles.row} onPress={onPick}>
      <ExerciseImage slug={exercise.imageSlug} pattern={exercise.pattern} size={48} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{exerciseName(exercise)}</Text>
        <Text style={styles.rowReason}>{reason}</Text>
        {caution && (
          <View style={styles.cautionRow}>
            <Ionicons name="warning-outline" size={12} color={Colors.warning} />
            <Text style={styles.cautionText}>{caution}</Text>
          </View>
        )}
        {/* подивитись, як це робиться, не виходячи з вибору */}
        <TouchableOpacity
          style={styles.videoRow}
          onPress={() => openVideo(exercise)}
          hitSlop={6}
        >
          <Ionicons name="logo-youtube" size={13} color={Colors.primary} />
          <Text style={styles.videoText}>{t('video')}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity hitSlop={8} onPress={onInfo}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  origin: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, margin: Spacing.md, marginBottom: 0,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  originName: { ...Typography.body },
  originMeta: { ...Typography.bodySmall, color: Colors.textMuted },
  chips: { maxHeight: 44, flexGrow: 0, marginTop: Spacing.md },
  chipsContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, height: 32, justifyContent: 'center',
    borderRadius: BorderRadius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}18` },
  chipText: { ...Typography.bodySmall, color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  disclaimer: {
    ...Typography.bodySmall, color: Colors.textMuted,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
  },
  list: { padding: Spacing.md, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  block: { gap: Spacing.sm },
  blockTitle: { ...Typography.label },
  modRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  modText: { ...Typography.bodySmall, flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.sm, paddingRight: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  rowName: { ...Typography.body },
  rowReason: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  cautionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cautionText: { ...Typography.bodySmall, color: Colors.warning, fontSize: 12 },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  videoText: { ...Typography.bodySmall, color: Colors.primary, fontSize: 11 },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  emptyText: { ...Typography.bodySmall, textAlign: 'center', color: Colors.textMuted },
});
