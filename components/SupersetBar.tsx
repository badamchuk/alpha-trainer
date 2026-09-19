import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { useLocale } from '../services/i18n';

/**
 * Панель вибору вправ для суперсету, закріплена внизу екрана.
 *
 * Раніше «Об'єднати» стояла над списком: у тренуванні на 10+ вправ, поки
 * відмічаєш нижні, кнопка виїжджала за верх екрана — вибір робився, а
 * застосувати його було нічим.
 */
export default function SupersetBar({ count, onCancel, onApply, cancelLabel }: {
  count: number;
  onCancel: () => void;
  onApply: () => void;
  cancelLabel?: string;
}) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const ready = count >= 2;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
      <Ionicons name="link-outline" size={16} color={Colors.primary} />
      <Text style={styles.hint} numberOfLines={1}>
        {ready ? t('selectedCount', count) : t('markTwoExercises')}
      </Text>
      <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} hitSlop={6}>
        <Text style={styles.cancelText}>{cancelLabel ?? t('cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onApply}
        disabled={!ready}
        style={[styles.applyBtn, !ready && { opacity: 0.4 }]}
      >
        <Text style={styles.applyText}>{t('mergeSuperset')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  hint: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  cancelBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  cancelText: { color: Colors.textSecondary, fontSize: 14 },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  applyText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
