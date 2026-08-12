import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Vibration,
  ScrollView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import {
  getTimerPrefs, saveScheme, deleteScheme, recordRestUsed,
  recordWorkUsed, recordBreakUsed, TimerScheme,
} from '../services/timerPrefs';

type TimerMode = 'rest' | 'interval';
type IvPhase = 'idle' | 'work' | 'rest' | 'done';

interface Props {
  visible: boolean;
  onClose: () => void;
  autoStart?: boolean;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function secLabel(s: number) {
  return s < 60 ? `${s}с` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function parseTimeInput(raw: string): number | null {
  const s = raw.trim();
  const mmss = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mmss) {
    const mins = parseInt(mmss[1]);
    const secs = parseInt(mmss[2]);
    if (secs >= 60) return null;
    const v = mins * 60 + secs;
    return v > 0 ? v : null;
  }
  const n = parseInt(s);
  return !isNaN(n) && n > 0 ? n : null;
}
function stepFor(secs: number) {
  if (secs <= 30) return 5;
  if (secs <= 90) return 5;
  if (secs <= 300) return 15;
  return 30;
}

// ─── Repeat-press hook ───────────────────────────────────────────────────────
function useRepeat(fn: () => void) {
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    fn();
    longTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(fn, 80);
    }, 350);
  }, [fn]);

  const stop = useCallback(() => {
    clearTimeout(longTimer.current!);
    clearInterval(repeatTimer.current!);
  }, []);

  return { onPressIn: start, onPressOut: stop };
}

// ─── TimePicker ──────────────────────────────────────────────────────────────
function TimePicker({
  label, value, onChange, recent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  recent: number[];
}) {
  const [editVisible, setEditVisible] = useState(false);
  const [draft, setDraft] = useState('');

  function adjust(delta: number) {
    onChange(Math.max(5, value + delta));
  }

  const dec = useRepeat(() => onChange(Math.max(5, value - stepFor(value))));
  const inc = useRepeat(() => onChange(value + stepFor(value)));

  function openEdit() {
    setDraft(fmt(value));
    setEditVisible(true);
  }
  function applyEdit() {
    const v = parseTimeInput(draft);
    if (v) onChange(v);
    setEditVisible(false);
  }

  return (
    <View style={tp.wrap}>
      <Text style={tp.label}>{label}</Text>
      <View style={tp.row}>
        <TouchableOpacity style={tp.adjBtn} {...dec}>
          <Text style={tp.adjTxt}>−</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openEdit} style={tp.timeBtn}>
          <Text style={tp.timeText}>{fmt(value)}</Text>
          <Text style={tp.editHint}>↑ натисни</Text>
        </TouchableOpacity>

        <TouchableOpacity style={tp.adjBtn} {...inc}>
          <Text style={tp.adjTxt}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Secondary quick-add row */}
      <View style={tp.quickRow}>
        {[-30, -15, +15, +30].map((d) => (
          value + d >= 5 && (
            <TouchableOpacity key={d} style={tp.quickBtn} onPress={() => adjust(d)}>
              <Text style={tp.quickTxt}>{d > 0 ? `+${d}с` : `${d}с`}</Text>
            </TouchableOpacity>
          )
        ))}
      </View>

      {/* Recent row */}
      {recent.length > 0 && (
        <View style={tp.recentRow}>
          <Text style={tp.recentLabel}>Останні:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {recent.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[tp.recentChip, r === value && tp.recentChipOn]}
                  onPress={() => onChange(r)}
                >
                  <Text style={[tp.recentChipTxt, r === value && tp.recentChipTxtOn]}>
                    {secLabel(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Manual edit modal */}
      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={tp.editOverlay}>
          <View style={tp.editCard}>
            <Text style={tp.editTitle}>Встанови {label.toLowerCase()}</Text>
            <Text style={tp.editHintText}>Формат: М:СС або секунди</Text>
            <TextInput
              style={tp.editInput}
              value={draft}
              onChangeText={setDraft}
              keyboardType="numbers-and-punctuation"
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={applyEdit}
              placeholder="1:30 або 90"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={tp.editActions}>
              <TouchableOpacity style={tp.editCancel} onPress={() => setEditVisible(false)}>
                <Text style={tp.editCancelTxt}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={tp.editConfirm} onPress={applyEdit}>
                <Text style={tp.editConfirmTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RestTimer({ visible, onClose, autoStart }: Props) {
  const [mode, setMode] = useState<TimerMode>('rest');

  // Prefs loaded from storage
  const [recentRest,  setRecentRest]  = useState<number[]>([60, 90, 120]);
  const [recentWork,  setRecentWork]  = useState<number[]>([40, 30, 20]);
  const [recentBreak, setRecentBreak] = useState<number[]>([20, 15, 10]);
  const [schemes,     setSchemes]     = useState<TimerScheme[]>([]);

  // Scheme save modal
  const [schemeName,    setSchemeName]    = useState('');
  const [savingScheme,  setSavingScheme]  = useState(false);
  const [schemesOpen,   setSchemesOpen]   = useState(false);

  // ── REST ───────────────────────────────────────────────────────────────────
  const [restSecs,  setRestSecs]  = useState(90);
  const [restLeft,  setRestLeft]  = useState(90);
  const [restOn,    setRestOn]    = useState(false);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── INTERVAL ───────────────────────────────────────────────────────────────
  const [rounds,    setRounds]    = useState(5);
  const [workSecs,  setWorkSecs]  = useState(40);
  const [breakSecs, setBreakSecs] = useState(20);
  const [ivPhase,   setIvPhase]   = useState<IvPhase>('idle');
  const [ivRound,   setIvRound]   = useState(1);
  const [ivLeft,    setIvLeft]    = useState(0);
  const [ivPaused,  setIvPaused]  = useState(false);
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iv = useRef({ phase: 'idle' as IvPhase, round: 1, work: 40, rest: 20, total: 5, left: 0 });

  // ── Load prefs on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    getTimerPrefs().then((p) => {
      if (p.recentRest.length)  setRecentRest(p.recentRest);
      if (p.recentWork.length)  setRecentWork(p.recentWork);
      if (p.recentBreak.length) setRecentBreak(p.recentBreak);
      setSchemes(p.schemes);
    });
  }, [visible]);

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      clearInterval(restRef.current!);
      setRestOn(false);
      setRestLeft(restSecs);
      if (iv.current.phase !== 'idle') resetIv();
    } else if (autoStart) {
      setRestLeft(restSecs);
      setRestOn(true);
    }
  }, [visible]);

  // ── Rest interval ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (restOn) {
      restRef.current = setInterval(() => {
        setRestLeft((r) => {
          if (r <= 1) {
            clearInterval(restRef.current!);
            setRestOn(false);
            Vibration.vibrate([0, 400, 100, 400, 100, 400]);
            recordRestUsed(restSecs);
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

  function pickRest(s: number) {
    clearInterval(restRef.current!);
    setRestOn(false);
    setRestSecs(s);
    setRestLeft(s);
  }
  function toggleRest() {
    if (restLeft === 0) { setRestLeft(restSecs); setRestOn(true); }
    else setRestOn((r) => !r);
  }

  // ── Interval logic ────────────────────────────────────────────────────────
  function startIv() {
    iv.current = { phase: 'work', round: 1, work: workSecs, rest: breakSecs, total: rounds, left: workSecs };
    setIvPhase('work'); setIvRound(1); setIvLeft(workSecs); setIvPaused(false);
    clearInterval(ivRef.current!);
    ivRef.current = setInterval(ivTick, 1000);
    recordWorkUsed(workSecs);
    recordBreakUsed(breakSecs);
  }
  function ivTick() {
    const s = iv.current;
    const next = s.left - 1;
    if (next <= 0) {
      if (s.phase === 'work') {
        if (s.round >= s.total) {
          clearInterval(ivRef.current!);
          iv.current = { ...s, phase: 'done', left: 0 };
          setIvPhase('done'); setIvLeft(0);
          Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500]);
        } else {
          iv.current = { ...s, phase: 'rest', left: s.rest };
          setIvPhase('rest'); setIvLeft(s.rest);
          Vibration.vibrate([0, 200, 100, 200]);
        }
      } else if (s.phase === 'rest') {
        const nr = s.round + 1;
        iv.current = { ...s, phase: 'work', round: nr, left: s.work };
        setIvPhase('work'); setIvRound(nr); setIvLeft(s.work);
        Vibration.vibrate([0, 400]);
      }
    } else {
      iv.current = { ...s, left: next };
      setIvLeft(next);
    }
  }
  function toggleIvPause() {
    if (ivPaused) { ivRef.current = setInterval(ivTick, 1000); setIvPaused(false); }
    else { clearInterval(ivRef.current!); setIvPaused(true); }
  }
  function resetIv() {
    clearInterval(ivRef.current!);
    iv.current = { phase: 'idle', round: 1, work: workSecs, rest: breakSecs, total: rounds, left: 0 };
    setIvPhase('idle'); setIvRound(1); setIvLeft(0); setIvPaused(false);
  }

  // ── Scheme actions ────────────────────────────────────────────────────────
  async function handleSaveScheme() {
    const name = schemeName.trim();
    if (!name) return;
    const scheme: TimerScheme = {
      id: Date.now().toString(),
      name,
      mode,
      restSecs: mode === 'rest' ? restSecs : 90,
      rounds,
      workSecs,
      breakSecs,
    };
    await saveScheme(scheme);
    const p = await getTimerPrefs();
    setSchemes(p.schemes);
    setSchemeName('');
    setSavingScheme(false);
  }
  function applyScheme(s: TimerScheme) {
    setMode(s.mode);
    if (s.mode === 'rest') pickRest(s.restSecs);
    else {
      setRounds(s.rounds);
      setWorkSecs(s.workSecs);
      setBreakSecs(s.breakSecs);
      resetIv();
    }
    setSchemesOpen(false);
  }
  async function handleDeleteScheme(id: string) {
    await deleteScheme(id);
    setSchemes((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const restDone   = restLeft === 0;
  const phaseColor = ivPhase === 'rest' ? '#2ECC71' : Colors.primary;
  const ivMax      = ivPhase === 'work' ? workSecs : ivPhase === 'rest' ? breakSecs : 1;
  const ivPct      = ivMax > 0 ? ivLeft / ivMax : 0;
  const totalSec   = rounds * workSecs + (rounds - 1) * breakSecs;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Mode tabs */}
          <View style={s.tabs}>
            {(['rest', 'interval'] as TimerMode[]).map((m) => (
              <TouchableOpacity key={m} style={[s.tab, mode === m && s.tabOn]} onPress={() => setMode(m)}>
                <Text style={[s.tabTxt, mode === m && s.tabTxtOn]}>
                  {m === 'rest' ? 'Відпочинок' : 'Інтервали'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Schemes bar */}
          <View style={s.schemeBar}>
            <TouchableOpacity style={s.schemeBtn} onPress={() => setSchemesOpen(true)}>
              <Ionicons name="list-outline" size={14} color={Colors.primary} />
              <Text style={s.schemeBtnTxt}>Схеми {schemes.length > 0 ? `(${schemes.length})` : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.schemeBtn} onPress={() => setSavingScheme(true)}>
              <Ionicons name="bookmark-outline" size={14} color={Colors.textSecondary} />
              <Text style={[s.schemeBtnTxt, { color: Colors.textSecondary }]}>Зберегти</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }} bounces={false}>

            {mode === 'rest' ? (
              // ─── REST ─────────────────────────────────────────────────────
              <>
                <TimePicker
                  label="Час відпочинку"
                  value={restSecs}
                  onChange={pickRest}
                  recent={recentRest}
                />

                {/* Active timer display */}
                {(restOn || restLeft !== restSecs) && (
                  <View style={[s.circle, restDone && s.circleDone]}>
                    <Text style={[s.timeText, restDone && s.timeDone]}>{fmt(restLeft)}</Text>
                    {restDone && <Text style={s.doneLabel}>Готово!</Text>}
                  </View>
                )}
                {restOn && !restDone && (
                  <View style={s.bar}>
                    <View style={[s.barFill, { width: `${(restLeft / restSecs) * 100}%` as any }]} />
                  </View>
                )}

                <View style={[s.actions, { marginTop: Spacing.md }]}>
                  <TouchableOpacity
                    style={[s.btnPrimary, restOn && s.btnPause]}
                    onPress={toggleRest}
                  >
                    <Text style={s.btnPrimaryTxt}>
                      {restOn ? 'Пауза' : restDone ? 'Ще раз' : 'Старт'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnSec} onPress={onClose}>
                    <Text style={s.btnSecTxt}>Закрити</Text>
                  </TouchableOpacity>
                </View>
              </>

            ) : ivPhase === 'idle' ? (
              // ─── INTERVAL SETUP ───────────────────────────────────────────
              <>
                {/* Rounds */}
                <View style={s.roundRow}>
                  <Text style={s.roundLabel}>Раунди</Text>
                  <View style={s.counter}>
                    <TouchableOpacity style={s.cBtn} onPress={() => setRounds((r) => Math.max(1, r - 1))}>
                      <Text style={s.cBtnTxt}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.cVal}>{rounds}</Text>
                    <TouchableOpacity style={s.cBtn} onPress={() => setRounds((r) => Math.min(99, r + 1))}>
                      <Text style={s.cBtnTxt}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TimePicker
                  label="Робота"
                  value={workSecs}
                  onChange={setWorkSecs}
                  recent={recentWork}
                />

                <TimePicker
                  label="Відпочинок між раундами"
                  value={breakSecs}
                  onChange={setBreakSecs}
                  recent={recentBreak}
                />

                <View style={s.summary}>
                  <Text style={s.summaryTxt}>{rounds} × {secLabel(workSecs)} + {secLabel(breakSecs)}</Text>
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
              </>

            ) : ivPhase === 'done' ? (
              // ─── INTERVAL DONE ────────────────────────────────────────────
              <>
                <View style={[s.circle, s.circleDone]}>
                  <Text style={[s.timeText, s.timeDone]}>Готово!</Text>
                </View>
                <Text style={s.doneRounds}>{rounds} раундів завершено</Text>
                <View style={[s.actions, { marginTop: Spacing.md }]}>
                  <TouchableOpacity style={s.btnPrimary} onPress={resetIv}>
                    <Text style={s.btnPrimaryTxt}>Ще раз</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnSec} onPress={onClose}>
                    <Text style={s.btnSecTxt}>Закрити</Text>
                  </TouchableOpacity>
                </View>
              </>

            ) : (
              // ─── INTERVAL RUNNING ─────────────────────────────────────────
              <>
                <View style={s.phaseRow}>
                  <View style={[s.phaseDot, { backgroundColor: phaseColor }]} />
                  <Text style={[s.phaseLabel, { color: phaseColor }]}>
                    {ivPhase === 'work' ? 'РОБОТА' : 'ВІДПОЧИНОК'}
                  </Text>
                </View>
                <Text style={s.roundLabelRunning}>Раунд {ivRound} / {rounds}</Text>
                <View style={[s.circle, { borderColor: phaseColor }]}>
                  <Text style={s.timeText}>{fmt(ivLeft)}</Text>
                  {ivPaused && <Text style={s.pausedLabel}>ПАУЗА</Text>}
                </View>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${ivPct * 100}%` as any, backgroundColor: phaseColor }]} />
                </View>
                <View style={[s.actions, { marginTop: Spacing.md }]}>
                  <TouchableOpacity
                    style={[s.btnPrimary, ivPaused && { backgroundColor: Colors.accent }]}
                    onPress={toggleIvPause}
                  >
                    <Text style={s.btnPrimaryTxt}>{ivPaused ? 'Продовжити' : 'Пауза'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnSec, { borderColor: Colors.primary }]} onPress={resetIv}>
                    <Text style={[s.btnSecTxt, { color: Colors.primary }]}>Зупинити</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </ScrollView>
        </View>
      </View>

      {/* ── Save scheme modal ── */}
      <Modal visible={savingScheme} transparent animationType="fade" onRequestClose={() => setSavingScheme(false)}>
        <View style={s.overlay}>
          <View style={s.miniCard}>
            <Text style={s.miniTitle}>Назва схеми</Text>
            <TextInput
              style={s.miniInput}
              value={schemeName}
              onChangeText={setSchemeName}
              placeholder="Наприклад: Присідання 90с"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveScheme}
            />
            <View style={s.actions}>
              <TouchableOpacity style={s.btnSec} onPress={() => { setSavingScheme(false); setSchemeName(''); }}>
                <Text style={s.btnSecTxt}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleSaveScheme} disabled={!schemeName.trim()}>
                <Text style={s.btnPrimaryTxt}>Зберегти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Schemes list modal ── */}
      <Modal visible={schemesOpen} transparent animationType="slide" onRequestClose={() => setSchemesOpen(false)}>
        <View style={s.overlay}>
          <View style={[s.card, { maxHeight: '70%' }]}>
            <View style={s.schemesHeader}>
              <Text style={s.schemesTitle}>Збережені схеми</Text>
              <TouchableOpacity onPress={() => setSchemesOpen(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {schemes.length === 0 ? (
              <Text style={s.schemesEmpty}>Немає збережених схем.{'\n'}Налаштуй таймер і натисни «Зберегти».</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {schemes.map((sc) => (
                  <View key={sc.id} style={s.schemeItem}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => applyScheme(sc)}>
                      <Text style={s.schemeItemName}>{sc.name}</Text>
                      <Text style={s.schemeItemMeta}>
                        {sc.mode === 'rest'
                          ? `Відпочинок · ${secLabel(sc.restSecs)}`
                          : `${sc.rounds} раундів · ${secLabel(sc.workSecs)} / ${secLabel(sc.breakSecs)}`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Видалити схему?', sc.name, [
                        { text: 'Скасувати', style: 'cancel' },
                        { text: 'Видалити', style: 'destructive', onPress: () => handleDeleteScheme(sc.id) },
                      ])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={17} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tp = StyleSheet.create({
  wrap: { width: '100%', marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  adjBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  adjTxt: { fontSize: 26, color: Colors.textPrimary, lineHeight: 30 },
  timeBtn: { alignItems: 'center', minWidth: 100 },
  timeText: { fontSize: 42, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  editHint: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  quickBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickTxt: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  recentLabel: { color: Colors.textMuted, fontSize: 11, flexShrink: 0 },
  recentChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  recentChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  recentChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  recentChipTxtOn: { color: '#FFF' },
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  editCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: Spacing.lg, width: '80%', borderWidth: 1, borderColor: Colors.border },
  editTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  editHintText: { color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.md },
  editInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 22, fontWeight: '700',
    padding: Spacing.md, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  editActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  editCancel: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  editCancelTxt: { color: Colors.textSecondary, fontWeight: '600' },
  editConfirm: { flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  editConfirmTxt: { color: '#FFF', fontWeight: '700' },
});

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 24,
    padding: Spacing.lg, width: '90%', maxHeight: '88%',
    alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },

  tabs: { flexDirection: 'row', width: '100%', backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md, padding: 3 },
  tab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: BorderRadius.sm },
  tabOn: { backgroundColor: Colors.primary },
  tabTxt: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTxtOn: { color: '#FFF' },

  schemeBar: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  schemeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingVertical: 6, backgroundColor: Colors.surfaceElevated,
  },
  schemeBtnTxt: { color: Colors.primary, fontSize: 12, fontWeight: '600' },

  circle: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.surfaceElevated, borderWidth: 3, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', gap: 2, alignSelf: 'center',
    marginVertical: Spacing.sm,
  },
  circleDone: { borderColor: '#2ECC71', backgroundColor: 'rgba(46,204,113,0.08)' },
  timeText: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  timeDone: { color: '#2ECC71', fontSize: 26 },
  doneLabel: { fontSize: 13, color: '#2ECC71', fontWeight: '700' },

  bar: { width: '100%', height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },

  actions: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  btnPrimary: { flex: 2, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
  btnPause: { backgroundColor: Colors.accent },
  btnPrimaryTxt: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  btnSec: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingVertical: 13, alignItems: 'center' },
  btnSecTxt: { color: Colors.textSecondary, fontWeight: '600' },

  roundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: Spacing.sm },
  roundLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cBtnTxt: { fontSize: 20, color: Colors.textPrimary, lineHeight: 24 },
  cVal: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, minWidth: 36, textAlign: 'center' },

  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: Spacing.xs, padding: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm },
  summaryTxt: { color: Colors.textSecondary, fontSize: 13 },
  summaryTotal: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  phaseDot: { width: 8, height: 8, borderRadius: 4 },
  phaseLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  roundLabelRunning: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  pausedLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },
  doneRounds: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center' },

  miniCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: Spacing.lg, width: '85%', borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  miniTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  miniInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 15, padding: Spacing.md,
  },

  schemesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: Spacing.md },
  schemesTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: 17 },
  schemesEmpty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingVertical: Spacing.lg },
  schemeItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  schemeItemName: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  schemeItemMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
});
