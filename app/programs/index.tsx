// Каталог програм.
//
// Показуємо чесно: скільки тижнів, скільки днів на тиждень і чи вистачає
// обладнання. Програму, під яку інвентарю бракує, не ховаємо — пишемо, чого
// саме немає, бо заміну однаково підбере рушій.

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { PROGRAMS } from '../../services/programs/data';
import { getActiveProgram } from '../../services/programs/storage';
import { ActiveProgram } from '../../services/programs/types';
import { getUserProfile } from '../../services/storage';
import { EQUIPMENT_LABELS, equipmentOf } from '../../services/equipment';
import { Equipment } from '../../services/library/types';
import { useLocale } from '../../services/i18n';

const FOCUS_LABEL: Record<string, string> = {
  strength: 'сила',
  hypertrophy: 'маса',
  endurance: 'витривалість',
};

export default function ProgramsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();
  const [equipment, setEquipment] = useState<Equipment[] | undefined>(undefined);
  const [active, setActive] = useState<ActiveProgram | null>(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      const [profile, a] = await Promise.all([getUserProfile(), getActiveProgram()]);
      setEquipment(equipmentOf(profile));
      setActive(a);
    }
    load();
  }, []));

  function missingFor(need: Equipment[]): Equipment[] {
    if (!equipment) return [];
    return need.filter((e) => !equipment.includes(e));
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Програми</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.intro}>
          Програма веде тижнями й сама піднімає навантаження. Обери одну — і на
          головному екрані щоразу буде видно, що робити сьогодні.
        </Text>

        {PROGRAMS.map((p) => {
          const missing = missingFor(p.equipment);
          const isActive = active?.templateId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => router.push(`/programs/${p.id}`)}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{lang === 'en' ? p.nameEn : p.nameUk}</Text>
                {isActive && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>активна</Text>
                  </View>
                )}
              </View>

              <Text style={styles.meta}>
                {p.weeks} тижнів · {p.days.length} дні на тиждень · {FOCUS_LABEL[p.focus]}
              </Text>
              <Text style={styles.summary} numberOfLines={3}>
                {lang === 'en' ? p.summaryEn : p.summaryUk}
              </Text>

              {p.equipment.length === 0 ? (
                <View style={styles.equipRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                  <Text style={styles.equipOk}>без інвентарю</Text>
                </View>
              ) : missing.length === 0 ? (
                <View style={styles.equipRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                  <Text style={styles.equipOk}>обладнання є</Text>
                </View>
              ) : (
                <View style={styles.equipRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                  <Text style={styles.equipMiss}>
                    бракує: {missing.map((e) => EQUIPMENT_LABELS[e] ?? e).join(', ')} — підберемо заміну
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  list: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  intro: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 19 },
  card: {
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, gap: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  cardActive: { borderColor: Colors.primary },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { ...Typography.h3, fontSize: 16, flex: 1 },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.full, backgroundColor: `${Colors.primary}22`,
  },
  badgeText: { ...Typography.bodySmall, color: Colors.primary, fontSize: 11 },
  meta: { ...Typography.bodySmall, color: Colors.textMuted },
  summary: { ...Typography.bodySmall, lineHeight: 18 },
  equipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  equipOk: { ...Typography.bodySmall, color: Colors.success, fontSize: 12 },
  equipMiss: { ...Typography.bodySmall, color: Colors.warning, fontSize: 12, flex: 1 },
});
