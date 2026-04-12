import { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { useLocale } from '../services/i18n';
import {
  EXERCISES, MUSCLE_GROUP_LABELS, MuscleGroup,
  searchExercises, getExerciseName, Exercise,
} from '../services/exercises';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  chest:      '#E63946',
  back:       '#2EC4B6',
  shoulders:  '#F4A261',
  biceps:     '#9B59B6',
  triceps:    '#3498DB',
  legs:       '#2ECC71',
  hamstrings: '#E67E22',
  glutes:     '#FF6B6B',
  core:       '#F1C40F',
  calves:     '#1ABC9C',
  cardio:     '#E91E63',
  fullbody:   '#607D8B',
};

const ALL_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
}

export default function ExercisePicker({ visible, onClose, onSelect }: Props) {
  const { lang, exerciseLang, t } = useLocale();
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<MuscleGroup | null>(null);

  // Search matches both languages; display uses exerciseLang
  const filtered = useMemo(
    () => searchExercises(query, exerciseLang, activeGroup),
    [query, exerciseLang, activeGroup],
  );

  function handleSelect(exercise: Exercise) {
    const name = getExerciseName(exercise, exerciseLang);
    onSelect(name);
    onClose();
    setQuery('');
    setActiveGroup(null);
  }

  function handleClose() {
    onClose();
    setQuery('');
    setActiveGroup(null);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{t('exerciseLibrary')}</Text>
              <Text style={styles.subtitle}>
                {filtered.length} {lang === 'uk' ? 'вправ' : 'exercises'}
                {'  '}
                <Text style={styles.langBadge}>
                  {exerciseLang === 'en' ? 'EN' : 'УК'}
                </Text>
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={lang === 'uk' ? 'Пошук вправи (UK або EN)...' : 'Search exercise (UK or EN)...'}
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Muscle group chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipList}
          >
            {/* "All" chip */}
            <TouchableOpacity
              style={[styles.chip, activeGroup === null && styles.chipActive]}
              onPress={() => setActiveGroup(null)}
            >
              <Text style={[styles.chipText, activeGroup === null && styles.chipTextActive]}>
                {t('allMusclesFilter')}
              </Text>
            </TouchableOpacity>

            {ALL_GROUPS.map((group) => {
              const color = MUSCLE_GROUP_COLORS[group];
              const isActive = activeGroup === group;
              return (
                <TouchableOpacity
                  key={group}
                  style={[
                    styles.chip,
                    isActive && { backgroundColor: color + '30', borderColor: color },
                  ]}
                  onPress={() => setActiveGroup(isActive ? null : group)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isActive && { color },
                    ]}
                  >
                    {MUSCLE_GROUP_LABELS[group][lang]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Exercise list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={() => (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>
                  {lang === 'uk' ? 'Нічого не знайдено' : 'Nothing found'}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const name = getExerciseName(item, exerciseLang);
              const color = MUSCLE_GROUP_COLORS[item.muscleGroup];
              const groupLabel = MUSCLE_GROUP_LABELS[item.muscleGroup][lang];
              return (
                <TouchableOpacity
                  style={styles.exerciseItem}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.exerciseLeft}>
                    <Text style={styles.exerciseName}>{name}</Text>
                    <Text style={[styles.exerciseGroup, { color }]}>{groupLabel}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    height: SCREEN_HEIGHT * 0.70,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerLeft: { flex: 1 },
  title: { ...Typography.h3, fontSize: 17 },
  subtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  langBadge: { color: Colors.primary, fontWeight: '700' },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  searchIcon: { paddingHorizontal: 4 },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },
  chipList: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: Colors.primary,
  },
  list: {
    flex: 1,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  exerciseLeft: { flex: 1 },
  exerciseName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  exerciseGroup: {
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});
