import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Vibration, ScrollView } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

type TimerMode = 'rest' | 'interval';
type IvPhase = 'idle' | 'work' | 'rest' | 'done';

interface Props {
  visible: boolean;
  onClose: () => void;
  autoStart?: boolean;
}

const REST_PRESETS = [30, 60, 90, 120, 180];
const WORK_OPTS   = [20, 30, 40, 45, 60, 90];
const BREAK_OPTS  = [10, 15, 20, 30, 45, 60];

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function secLabel(s: number) {
  return s < 60 ? `${s}с` : `${s / 60}хв`;
}

export default function RestTimer({ visible, onClose, autoStart }: Props) {
  const [mode, setMode] = useState<TimerMode>('rest');

  // ── REST ─────────────────────────────────────────────────────────────────────
  const [restPreset, setRestPreset] = useState(90);
  const [restLeft,   setRestLeft]   = useState(90);
  const [restOn,     setRestOn]     = useState(false);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      clearInterval(restRef.current!);
      setRestOn(false);
      setRestLeft(restPreset);
      // Use iv.current.phase (mutable ref) — not stale ivPhase state
      if (iv.current.phase !== 'idle') resetIv();
    } else if (autoStart) {
      setRestLeft(restPreset);
      setRestOn(true);
    }
  }, [visible]);

  useEffect(() => {
    if (restOn) {
      restRef.current = setInterval(() => {
        setRestLeft(r => {
          if (r <= 1) {
            clearInterval(restRef.current!);
            setRestOn(false);
            Vibration.vibrate([0, 400, 100, 400, 100, 400]);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      clearInterval(restRef.current!);
    }
    return () => clearInterval(restRef.current!);
  }, [restOn]);

  function pickRestPreset(s: number) {
    clearInterval(restRef.current!);
    setRestOn(false);
    setRestPreset(s);
    setRestLeft(s);
  }
  function toggleRest() {
    if (restLeft === 0) { setRestLeft(restPreset); setRestOn(true); }
    else setRestOn(r => !r);
  }

  // ── INTERVAL ─────────────────────────────────────────────────────────────────
  const [rounds,    setRounds]    = useState(5);
  const [workSecs,  setWorkSecs]  = useState(40);
  const [breakSecs, setBreakSecs] = useState(20);

  const [ivPhase,   setIvPhase]   = useState<IvPhase>('idle');
  const [ivRound,   setIvRound]   = useState(1);
  const [ivLeft,    setIvLeft]    = useState(0);
  const [ivPaused,  setIvPaused]  = useState(false);

  const ivRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mutable state for setInterval closure
  const iv = useRef({ phase: 'idle' as IvPhase, round: 1, work: 40, rest: 20, total: 5, left: 0 });

  function startIv() {
    iv.current = { phase: 'work', round: 1, work: workSecs, rest: breakSecs, total: rounds, left: workSecs };
    setIvPhase('work');
    setIvRound(1);
    setIvLeft(workSecs);
    setIvPaused(false);
    clearInterval(ivRef.current!);
    ivRef.current = setInterval(ivTick, 1000);
  }

  function ivTick() {
    const s = iv.current;
    const next = s.left - 1;
    if (next <= 0) {
      if (s.phase === 'work') {
        if (s.round >= s.total) {
          clearInterval(ivRef.current!);
          iv.current = { ...s, phase: 'done', left: 0 };
          setIvPhase('done');
          setIvLeft(0);
          Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500]);
        } else {
          iv.current = { ...s, phase: 'rest', left: s.rest };
          setIvPhase('rest');
          setIvLeft(s.rest);
          Vibration.vibrate([0, 200, 100, 200]);
        }
      } else if (s.phase === 'rest') {
        const nr = s.round + 1;
        iv.current = { ...s, phase: 'work', round: nr, left: s.work };
        setIvPhase('work');
        setIvRound(nr);
        setIvLeft(s.work);
        Vibration.vibrate([0, 400]);
      }
    } else {
      iv.current = { ...s, left: next };
      setIvLeft(next);
    }
  }

  function toggleIvPause() {
    if (ivPaused) {
      ivRef.current = setInterval(ivTick, 1000);
      setIvPaused(false);
    } else {
      clearInterval(ivRef.current!);
      setIvPaused(true);
    }
  }

  function resetIv() {
    clearInterval(ivRef.current!);
    iv.current = { phase: 'idle', round: 1, work: workSecs, rest: breakSecs, total: rounds, left: 0 };
    setIvPhase('idle');
    setIvRound(1);
    setIvLeft(0);
    setIvPaused(false);
  }

  // Derived
  const restDone   = restLeft === 0;
  const phaseColor = ivPhase === 'rest' ? '#2ECC71' : Colors.primary;
  const ivMax      = ivPhase === 'work' ? workSecs : ivPhase === 'rest' ? breakSecs : 1;
  const ivPct      = ivMax > 0 ? ivLeft / ivMax : 0;
  const totalSec   = rounds * workSecs + (rounds - 1) * breakSecs;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Mode tabs */}
          <View style={s.tabs}>
            {(['rest', 'interval'] as TimerMode[]).map(m => (
              <TouchableOpacity key={m} style={[s.tab, mode === m && s.tabOn]} onPress={() => setMode(m)}>
                <Text style={[s.tabTxt, mode === m && s.tabTxtOn]}>
                  {m === 'rest' ? 'Відпочинок' : 'Інтервали'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'rest' ? (
            // ─── REST ────────────────────────────────────────────
            <>
              <View style={[s.circle, restDone && s.circleDone]}>
                <Text style={[s.timeText, restDone && s.timeDone]}>{fmt(restLeft)}</Text>
                {restDone && <Text style={s.doneLabel}>Готово!</Text>}
              </View>
              {!restDone && (
                <View style={s.bar}><View style={[s.barFill, { width: `${(restLeft / restPreset) * 100}%` }]} /></View>
              )}
              <View style={s.chips}>
                {REST_PRESETS.map(p => (
                  <TouchableOpacity key={p} style={[s.chip, restPreset === p && s.chipOn]} onPress={() => pickRestPreset(p)}>
                    <Text style={[s.chipTxt, restPreset === p && s.chipTxtOn]}>{secLabel(p)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.actions}>
                <TouchableOpacity style={[s.btnPrimary, restOn && s.btnPause]} onPress={toggleRest}>
                  <Text style={s.btnPrimaryTxt}>{restOn ? 'Пауза' : restDone ? 'Ще раз' : 'Старт'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSec} onPress={onClose}>
                  <Text style={s.btnSecTxt}>Закрити</Text>
                </TouchableOpacity>
              </View>
            </>

          ) : ivPhase === 'idle' ? (
            // ─── INTERVAL SETUP ──────────────────────────────────
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <View style={s.setupRow}>
                <Text style={s.setupLabel}>Раунди</Text>
                <View style={s.counter}>
                  <TouchableOpacity style={s.cBtn} onPress={() => setRounds(r => Math.max(1, r - 1))}>
                    <Text style={s.cBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.cVal}>{rounds}</Text>
                  <TouchableOpacity style={s.cBtn} onPress={() => setRounds(r => Math.min(99, r + 1))}>
                    <Text style={s.cBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={s.setupLabel}>Робота</Text>
              <View style={s.chips}>
                {WORK_OPTS.map(v => (
                  <TouchableOpacity key={v} style={[s.chip, workSecs === v && s.chipOn]} onPress={() => setWorkSecs(v)}>
                    <Text style={[s.chipTxt, workSecs === v && s.chipTxtOn]}>{secLabel(v)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.setupLabel, { marginTop: Spacing.sm }]}>Відпочинок між раундами</Text>
              <View style={s.chips}>
                {BREAK_OPTS.map(v => (
                  <TouchableOpacity key={v} style={[s.chip, breakSecs === v && s.chipOn]} onPress={() => setBreakSecs(v)}>
                    <Text style={[s.chipTxt, breakSecs === v && s.chipTxtOn]}>{secLabel(v)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.summary}>
                <Text style={s.summaryTxt}>{rounds} × {workSecs}с + {breakSecs}с відп.</Text>
                <Text style={s.summaryTotal}>≈ {(totalSec / 60).toFixed(1)} хв</Text>
              </View>

              <View style={[s.actions, { marginTop: Spacing.sm }]}>
                <TouchableOpacity style={s.btnPrimary} onPress={startIv}>
                  <Text style={s.btnPrimaryTxt}>Старт</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSec} onPress={onClose}>
                  <Text style={s.btnSecTxt}>Закрити</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

          ) : ivPhase === 'done' ? (
            // ─── INTERVAL DONE ───────────────────────────────────
            <>
              <View style={[s.circle, s.circleDone]}>
                <Text style={[s.timeText, s.timeDone]}>Готово!</Text>
              </View>
              <Text style={s.doneRounds}>{rounds} раундів завершено 💪</Text>
              <View style={s.actions}>
                <TouchableOpacity style={s.btnPrimary} onPress={resetIv}>
                  <Text style={s.btnPrimaryTxt}>Ще раз</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSec} onPress={onClose}>
                  <Text style={s.btnSecTxt}>Закрити</Text>
                </TouchableOpacity>
              </View>
            </>

          ) : (
            // ─── INTERVAL RUNNING ────────────────────────────────
            <>
              <View style={s.phaseRow}>
                <View style={[s.phaseDot, { backgroundColor: phaseColor }]} />
                <Text style={[s.phaseLabel, { color: phaseColor }]}>
                  {ivPhase === 'work' ? 'РОБОТА' : 'ВІДПОЧИНОК'}
                </Text>
              </View>
              <Text style={s.roundLabel}>Раунд {ivRound} / {rounds}</Text>
              <View style={[s.circle, { borderColor: phaseColor }]}>
                <Text style={s.timeText}>{fmt(ivLeft)}</Text>
                {ivPaused && <Text style={s.pausedLabel}>ПАУЗА</Text>}
              </View>
              <View style={s.bar}>
                <View style={[s.barFill, { width: `${ivPct * 100}%`, backgroundColor: phaseColor }]} />
              </View>
              <View style={s.actions}>
                <TouchableOpacity style={[s.btnPrimary, ivPaused && { backgroundColor: Colors.accent }]} onPress={toggleIvPause}>
                  <Text style={s.btnPrimaryTxt}>{ivPaused ? 'Продовжити' : 'Пауза'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnSec, { borderColor: '#E63946' }]} onPress={resetIv}>
                  <Text style={[s.btnSecTxt, { color: '#E63946' }]}>Зупинити</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: 24,
    padding: Spacing.lg, width: '86%', maxHeight: '85%',
    alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },

  // Tabs
  tabs: { flexDirection: 'row', width: '100%', backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md, padding: 3 },
  tab:  { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: BorderRadius.sm },
  tabOn: { backgroundColor: Colors.primary },
  tabTxt: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTxtOn: { color: '#FFF' },

  // Circle
  circle: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 3, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  circleDone: { borderColor: '#2ECC71', backgroundColor: 'rgba(46,204,113,0.08)' },
  timeText: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  timeDone: { color: '#2ECC71', fontSize: 26 },
  doneLabel: { fontSize: 13, color: '#2ECC71', fontWeight: '700' },

  // Progress bar
  bar: { width: '100%', height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },

  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 13, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: '#FFF' },

  // Buttons
  actions: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  btnPrimary: { flex: 2, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center' },
  btnPause:   { backgroundColor: Colors.accent },
  btnPrimaryTxt: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  btnSec: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center' },
  btnSecTxt: { color: Colors.textSecondary, fontWeight: '600' },

  // Setup
  setupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: Spacing.sm },
  setupLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cBtnTxt: { fontSize: 20, color: Colors.textPrimary, lineHeight: 24 },
  cVal: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, minWidth: 36, textAlign: 'center' },

  // Summary
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm },
  summaryTxt: { color: Colors.textSecondary, fontSize: 13 },
  summaryTotal: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  // Running
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phaseDot: { width: 8, height: 8, borderRadius: 4 },
  phaseLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  roundLabel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  pausedLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },
  doneRounds: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center' },
});
