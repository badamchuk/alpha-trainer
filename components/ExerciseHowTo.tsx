// Підказка «як це робити» просто в списку вправ.
//
// Коли конструктор пропонує «Розминку з грифом», людина в залі не має йти
// шукати, що це таке: техніка й відео мають бути під рукою — інакше вправу
// просто пропустять.

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { LibraryExercise } from '../services/library/types';

/**
 * Пошук на YouTube англійською назвою: технічних відео нею на порядок більше,
 * а руки в залі однакові незалежно від мови.
 */
export function youtubeSearchUrl(ex: LibraryExercise): string {
  return `https://www.youtube.com/results?search_query=${
    encodeURIComponent(`${ex.nameEn} exercise technique`)}`;
}

export function openVideo(ex: LibraryExercise): void {
  Linking.openURL(youtubeSearchUrl(ex)).catch(() => {});
}

interface Props {
  exercise: LibraryExercise;
  /** Показати одразу розгорнутим (напр. у картці вправи). */
  open?: boolean;
  onOpenCard?: () => void;
}

export default function ExerciseHowTo({ exercise, open = false, onOpenCard }: Props) {
  const [expanded, setExpanded] = useState(open);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setExpanded((v) => !v)}
          hitSlop={6}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'help-circle-outline'}
            size={14}
            color={Colors.textMuted}
          />
          <Text style={styles.toggleText}>{expanded ? 'Згорнути' : 'Як робити'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toggle} onPress={() => openVideo(exercise)} hitSlop={6}>
          <Ionicons name="logo-youtube" size={14} color={Colors.primary} />
          <Text style={[styles.toggleText, { color: Colors.primary }]}>Відео</Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.body}>
          {exercise.cues.map((c) => (
            <View key={c} style={styles.cue}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.cueText}>{c}</Text>
            </View>
          ))}
          {exercise.modifications?.slice(0, 1).map((m) => (
            <View key={m} style={styles.cue}>
              <Ionicons name="bulb-outline" size={13} color={Colors.accent} style={{ marginTop: 2 }} />
              <Text style={styles.cueText}>{m}</Text>
            </View>
          ))}
          {onOpenCard && (
            <TouchableOpacity style={styles.more} onPress={onOpenCard}>
              <Text style={styles.moreText}>Докладніше про вправу</Text>
              <Ionicons name="chevron-forward" size={13} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 2 },
  row: { flexDirection: 'row', gap: Spacing.md },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleText: { ...Typography.bodySmall, color: Colors.textMuted, fontSize: 11 },
  body: {
    marginTop: 6, padding: Spacing.sm, gap: 4,
    backgroundColor: Colors.background, borderRadius: BorderRadius.sm,
  },
  cue: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  dot: { ...Typography.bodySmall, color: Colors.primary, fontSize: 11, lineHeight: 17 },
  cueText: { ...Typography.bodySmall, flex: 1, fontSize: 12, lineHeight: 17 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  moreText: { ...Typography.bodySmall, color: Colors.textSecondary, fontSize: 11 },
});
