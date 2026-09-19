// Вибір вправи з нової бібліотеки (ТЗ F3.1–F3.2).
//
// Окремо від старого ExercisePicker: той віддає назву рядком зі списку
// services/exercises.ts, а тут потрібна сама вправа з id, патерном і м'язами —
// на неї спираються прив'язка назв, заміни й конструктор.

import { useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import ExerciseImage from './ExerciseImage';
import { exerciseName, getExercise, searchLibrary } from '../services/library';
import { useLocale } from '../services/i18n';
import {
  Equipment, LibraryExercise, MUSCLE_GROUP_LABELS, MuscleGroup,
} from '../services/library/types';

const GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

const LEVEL_KEY: Record<number, string> = { 1: 'levelEasy', 2: 'levelMediumShort', 3: 'levelHard' };

interface Props {
  visible: boolean;
  title?: string;
  /** Останні вправи користувача — показуються першими, поки не почався пошук. */
  recentIds?: string[];
  /** Показувати лише те, що можна зробити цим обладнанням. */
  availableEquipment?: Equipment[];
  onClose: () => void;
  onSelect: (exercise: LibraryExercise) => void;
  /** Додаткова дія внизу — напр. «Моя власна вправа». */
  footerAction?: { label: string; onPress: (query: string) => void };
}

export default function LibraryPicker({
  visible, title, recentIds, availableEquipment, onClose, onSelect, footerAction,
}: Props) {
  const router = useRouter();
  const { t, lang } = useLocale();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const results = useMemo(
    () => searchLibrary({
      query,
      muscleGroup: group ?? undefined,
      availableEquipment: onlyMine ? availableEquipment : undefined,
    }),
    [query, group, onlyMine, availableEquipment],
  );

  // «Нещодавні» мають сенс лише поки людина не почала шукати чи фільтрувати:
  // інакше вони заважали б результатам пошуку
  const recent = useMemo(() => {
    if (query || group || !recentIds?.length) return [];
    return recentIds
      .map((id) => getExercise(id))
      .filter((ex): ex is NonNullable<typeof ex> => !!ex)
      .slice(0, 8);
  }, [recentIds, query, group]);

  function close() {
    onClose();
    setQuery('');
    setGroup(null);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={close} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title ?? t('chooseExercise')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('exerciseNameSearch')}
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}
          contentContainerStyle={styles.chipsContent}>
          {availableEquipment && (
            <TouchableOpacity
              style={[styles.chip, onlyMine && styles.chipActive]}
              onPress={() => setOnlyMine((v) => !v)}
            >
              <Ionicons name="barbell-outline" size={14}
                color={onlyMine ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.chipText, onlyMine && styles.chipTextActive]}>{t('myEquipment')}</Text>
            </TouchableOpacity>
          )}
          {GROUPS.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.chip, group === g && styles.chipActive]}
              onPress={() => setGroup(group === g ? null : g)}
            >
              <Text style={[styles.chipText, group === g && styles.chipTextActive]}>
                {MUSCLE_GROUP_LABELS[g].uk}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          data={results}
          keyExtractor={(e) => e.id}
          ListHeaderComponent={recent.length > 0 ? (
            <View style={styles.recentBox}>
              <Text style={styles.recentTitle}>{t('recentExercises')}</Text>
              {recent.map((item) => (
                <TouchableOpacity
                  key={`recent-${item.id}`}
                  style={styles.row}
                  onPress={() => { onSelect(item); close(); }}
                >
                  <ExerciseImage slug={item.imageSlug} pattern={item.pattern} size={44} />
                  <Text style={[styles.rowName, { flex: 1 }]}>{exerciseName(item)}</Text>
                  <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
              <Text style={styles.recentTitle}>{t('wholeLibrary')}</Text>
            </View>
          ) : null}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => { onSelect(item); close(); }}>
              <ExerciseImage slug={item.imageSlug} pattern={item.pattern} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{exerciseName(item)}</Text>
                <Text style={styles.rowMeta}>
                  {MUSCLE_GROUP_LABELS[item.displayGroup ?? 'fullbody'][lang]}
                  {' · '}{t(LEVEL_KEY[item.level])}
                  {item.equipment.length === 0 ? ` · ${t('bodyweightLabel')}` : ''}
                  {item.custom ? ` · ${t('myExerciseTag')}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => { close(); router.push(`/exercises/${item.id}`); }}
              >
                <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('nothingFound')}</Text>
            </View>
          }
        />

        {footerAction && (
          <TouchableOpacity
            style={styles.footerBtn}
            onPress={() => { footerAction.onPress(query); close(); }}
          >
            <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.footerBtnText}>{footerAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
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
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    margin: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  search: { flex: 1, ...Typography.body, paddingVertical: 4 },
  chips: { maxHeight: 44, flexGrow: 0 },
  chipsContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, height: 32,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}18` },
  chipText: { ...Typography.bodySmall, color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },
  recentBox: { gap: Spacing.sm, marginBottom: Spacing.sm },
  recentTitle: { ...Typography.label, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  rowName: { ...Typography.body },
  rowMeta: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { ...Typography.body, color: Colors.textMuted },
  footerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerBtnText: { ...Typography.body, color: Colors.primary },
});
