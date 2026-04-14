import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Vibration } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  autoStart?: boolean;
}

const PRESETS = [
  { label: '60с', secs: 60 },
  { label: '90с', secs: 90 },
  { label: '2хв', secs: 120 },
  { label: '3хв', secs: 180 },
];

export default function RestTimer({ visible, onClose, autoStart }: Props) {
  const [preset, setPreset] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRunning(false);
      setRemaining(preset);
    } else if (autoStart) {
      setRemaining(preset);
      setRunning(true);
    }
  }, [visible]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            Vibration.vibrate([0, 400, 100, 400, 100, 400]);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  function choosePreset(secs: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    setPreset(secs);
    setRemaining(secs);
  }

  function handleToggle() {
    if (remaining === 0) {
      setRemaining(preset);
      setRunning(true);
    } else {
      setRunning((r) => !r);
    }
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const done = remaining === 0;
  const pct = remaining / preset;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Відпочинок</Text>

          {/* Time display */}
          <View style={[styles.timerCircle, done && styles.timerCircleDone]}>
            <Text style={[styles.timeText, done && styles.timeTextDone]}>
              {`${mins}:${String(secs).padStart(2, '0')}`}
            </Text>
            {done && <Text style={styles.doneEmoji}>💪</Text>}
          </View>

          {/* Progress bar */}
          {!done && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
            </View>
          )}

          {/* Presets */}
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.secs}
                style={[styles.presetBtn, preset === p.secs && styles.presetBtnActive]}
                onPress={() => choosePreset(p.secs)}
              >
                <Text style={[styles.presetText, preset === p.secs && styles.presetTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.startBtn, running && styles.pauseBtn]}
              onPress={handleToggle}
            >
              <Text style={styles.startBtnText}>
                {running ? 'Пауза' : done ? 'Ще раз' : 'Старт'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Закрити</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: 24,
    padding: Spacing.lg, width: '82%',
    alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  timerCircle: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 3, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    gap: 4,
  },
  timerCircleDone: { borderColor: Colors.success, backgroundColor: 'rgba(46,196,182,0.1)' },
  timeText: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  timeTextDone: { color: Colors.success },
  doneEmoji: { fontSize: 20 },
  progressBar: {
    width: '100%', height: 4, backgroundColor: Colors.border,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  presets: { flexDirection: 'row', gap: Spacing.sm },
  presetBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  presetBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  presetText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  presetTextActive: { color: '#FFF' },
  actions: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  startBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 12, alignItems: 'center',
  },
  pauseBtn: { backgroundColor: Colors.accent },
  startBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  closeBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center',
  },
  closeBtnText: { color: Colors.textSecondary, fontWeight: '600' },
});
