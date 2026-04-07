import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

export default function DatePickerField({ label, value, onChange, minimumDate, maximumDate }: Props) {
  const [show, setShow] = useState(false);

  const date = value ? parseISO(value) : new Date();
  const displayDate = value
    ? format(parseISO(value), 'd MMMM yyyy', { locale: uk })
    : 'Вибрати дату';

  function handleChange(_: DateTimePickerEvent, selected?: Date) {
    setShow(Platform.OS === 'ios');
    if (selected) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    }
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={value ? Colors.textPrimary : Colors.textMuted} />
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{displayDate}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {show && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          locale="uk-UA"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  fieldText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  placeholder: {
    color: Colors.textMuted,
  },
});
