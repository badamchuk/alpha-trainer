// Ілюстрація вправи (ТЗ F6.3, F6.5).
//
// Кадри перемикає звичайний таймер, а не reanimated: рух тут — три пози по
// 0.7 с, заради цього не варто тягнути нову залежність у застосунок.
//
// Це єдиний компонент, який знає про мапу ассетів (F6.6) — сервіси й тести
// імпортують лише слаг із бібліотеки.

import { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../constants/theme';
import { framesFor } from '../services/exerciseImages';
import { MovementPattern } from '../services/library/types';

/** Запасна іконка, коли картинки немає: хоч якось показати характер руху. */
const PATTERN_ICON: Partial<Record<MovementPattern, keyof typeof Ionicons.glyphMap>> = {
  squat: 'body-outline',
  hinge: 'body-outline',
  lunge: 'walk-outline',
  hip_thrust: 'body-outline',
  push_horizontal: 'barbell-outline',
  push_vertical: 'barbell-outline',
  pull_horizontal: 'barbell-outline',
  pull_vertical: 'fitness-outline',
  carry: 'walk-outline',
  olympic: 'barbell-outline',
  jump: 'trending-up-outline',
  burpee: 'flash-outline',
  core_flexion: 'ellipse-outline',
  core_stability: 'ellipse-outline',
  core_rotation: 'sync-outline',
  monostructural: 'pulse-outline',
  mobility: 'accessibility-outline',
};

interface Props {
  slug?: string;
  pattern?: MovementPattern;
  size?: number;
  /** true — кадри змінюються по колу; false — лише перша поза (для списків). */
  animated?: boolean;
  style?: ViewStyle;
}

const FRAME_MS = 700;

export default function ExerciseImage({
  slug, pattern, size = 72, animated = false, style,
}: Props) {
  const frames = framesFor(slug);
  const [index, setIndex] = useState(0);
  // Якщо файл не відкрився (напр. мапа й ассети розійшлись), більше не пробуємо
  const [broken, setBroken] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIndex(0);
    setBroken(false);
  }, [slug]);

  useEffect(() => {
    if (!animated || frames.length < 2) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [animated, frames.length]);

  const box = [styles.box, { width: size, height: size, borderRadius: BorderRadius.md }, style];

  if (frames.length === 0 || broken) {
    return (
      <View style={box}>
        <Ionicons
          name={(pattern && PATTERN_ICON[pattern]) || 'barbell-outline'}
          size={size * 0.42}
          color={Colors.textMuted}
        />
      </View>
    );
  }

  return (
    <View style={box}>
      <Image
        source={frames[Math.min(index, frames.length - 1)]}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => setBroken(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    overflow: 'hidden',
  },
});
