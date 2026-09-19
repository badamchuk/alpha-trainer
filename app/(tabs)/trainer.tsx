import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { exerciseName } from '../../services/library';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Modal, ScrollView, Linking,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import {
  getUserProfile, getGoals, getRecentWorkouts,
  getChatHistory, saveChatHistory, clearChatHistory, saveTrainingPlan,
  getWeightLog, getPersonalRecords,
  getCachedTrainerContext, saveTrainerContextCache,
} from '../../services/storage';
import { buildResolver } from '../../services/exerciseLinks';
import { buildAIContext, parseExerciseIds, stripExerciseIds } from '../../services/aiContext';
import { askProvider, isProviderDead, switchNote } from '../../services/aiProvider';
import { getNutritionHistory, getDailyTotals, getNutritionGoals } from '../../services/nutrition';
import { chatStream as geminiChatStream, initGemini, generateTrainingPlan as geminiGeneratePlan, extractMemoryNote as geminiExtractNote, generateTrainerContext as geminiGenerateContext } from '../../services/gemini';
import { chatStream as groqChatStream, initGroq, generateTrainingPlan as groqGeneratePlan, extractMemoryNote as groqExtractNote, generateTrainerContext as groqGenerateContext } from '../../services/groq';
import { getMemoryEntries, addMemoryEntry, buildMemoryContext } from '../../services/aiMemory';
import { createPlanFromAIText } from '../../services/planParser';
import { ChatMessage, ExerciseLog, UserProfile } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ExerciseImage from '../../components/ExerciseImage';
import RichText from '../../components/RichText';
import { prescribe } from '../../services/prescriptions';
import { tFor, translate, useLocale } from '../../services/i18n';

const QUICK_PROMPTS = [
  { key: 'quickPlanPrompt', icon: 'calendar-outline', isPlan: true },
  { key: 'quickWhatToday', icon: 'today-outline', isPlan: false },
  { key: 'quickImprove', icon: 'trending-up-outline', isPlan: false },
  { key: 'quickWeightLoss', icon: 'flame-outline', isPlan: false },
  { key: 'quickRecovery', icon: 'bed-outline', isPlan: false },
];

/**
 * Префікси помилок обома мовами.
 *
 * Історію чистимо від власних повідомлень про збій, а користувач міг
 * перемкнути мову між запитами — тож перевіряємо обидва варіанти.
 */
const ERROR_PREFIXES = [tFor('uk')('errorPrefix'), tFor('en')('errorPrefix')];

// Detect if AI response contains a training plan
// (JS \b не працює після кирилиці — короткі назви днів матчимо з явними межами)
function looksLikePlan(text: string): boolean {
  const dayKeywords = /понеділок|вівторок|середа|четвер|п.ятниця|субота|неділя|(?:^|[^а-щьюяіїєґa-z])(?:пн|вт|ср|чт|пт|сб|нд)(?:[^а-щьюяіїєґa-z]|$)/gim;
  const matches = text.match(dayKeywords);
  return (matches?.length ?? 0) >= 3;
}

export default function TrainerScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPlanRequestInFlight, setIsPlanRequestInFlight] = useState(false);
  // Хто саме відповідає і чи довелось перемикатись
  const [activeProvider, setActiveProvider] = useState<'groq' | 'gemini' | null>(null);
  const [providerNote, setProviderNote] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memoryBlock, setMemoryBlock] = useState('');
  const [nutritionSummary, setNutritionSummary] = useState('');
  const [planMessage, setPlanMessage] = useState<ChatMessage | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Trainer context card
  const [ctxText, setCtxText]         = useState<string | null>(null);
  const [ctxTs, setCtxTs]             = useState<number | null>(null);
  const [ctxLoading, setCtxLoading]   = useState(false);
  const ctxExpandedRef                = useRef(true);
  const [ctxExpanded, setCtxExpanded] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setCtxExpanded(ctxExpandedRef.current);
      async function load() {
        // Рекорди зводимо за бібліотекою: інакше AI бачить три «присідання» замість однієї вправи
        const resolver = await buildResolver();
        const [p, history, memEntries, allWorkouts, wl, recs, nutHist, nutGoals] = await Promise.all([
          getUserProfile(), getChatHistory(), getMemoryEntries(),
          getRecentWorkouts(100), getWeightLog(), getPersonalRecords(undefined, resolver),
          getNutritionHistory(5), getNutritionGoals(),
        ]);
        setProfile(p);
        setMessages(history);
        const mem = buildMemoryContext(memEntries, allWorkouts, wl, recs);
        setMemoryBlock(mem);

        if (nutHist.length > 0) {
          const summary = nutHist.map((d) => {
            const t = getDailyTotals(d);
            return translate('nutritionDayLine', d.date, t.calories, t.protein, t.carbs, t.fat);
          }).join('\n');
          setNutritionSummary(summary);
        }
        if (p?.geminiApiKey) initGemini(p.geminiApiKey);
        if (p?.groqApiKey) initGroq(p.groqApiKey);

        // Load or generate trainer context
        if (p?.geminiApiKey || p?.groqApiKey) {
          const cached = await getCachedTrainerContext();
          if (cached) {
            setCtxText(cached.text);
            setCtxTs(cached.ts);
          } else {
            setCtxLoading(true);
            try {
              const recent7 = allWorkouts.slice(0, 7);
              const nutDays = nutHist.map((d) => { const t = getDailyTotals(d); return { date: d.date, ...t }; });
              const goalCal = nutGoals?.calories ?? null;
              const goalsNow = await getGoals();
              const attempt = await askProvider(p, {
                groq: () => groqGenerateContext(p!, goalsNow, recent7, nutDays, wl, goalCal, mem),
                gemini: () => geminiGenerateContext(p!, goalsNow, recent7, nutDays, wl, goalCal, mem),
              });
              const text = attempt.result;
              setActiveProvider(attempt.provider);
              // якщо перемкнулись — скажемо чому, інакше «Gemini» у шапці виглядає загадково
              if (attempt.switchedFrom) {
                setProviderNote(switchNote(attempt.switchedFrom, attempt.provider, t));
              }
              setCtxText(text);
              setCtxTs(Date.now());
              await saveTrainerContextCache(text);
            } catch { /* silently skip if API unavailable */ }
            finally { setCtxLoading(false); }
          }
        }
      }
      load();
    }, [])
  );

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  /** Запит до AI з перемиканням між провайдерами (services/aiProvider.ts). */
  async function askAI<T>(groq: () => Promise<T>, gemini: () => Promise<T>): Promise<T> {
    const attempt = await askProvider(profile, { groq, gemini });
    setActiveProvider(attempt.provider);
    if (attempt.switchedFrom) {
      setProviderNote(switchNote(attempt.switchedFrom, attempt.provider, t));
    }
    return attempt.result;
  }

  async function sendMessage(text: string, isPlanRequest = false) {
    if (!text.trim() || loading) return;
    const hasGroq = !!profile?.groqApiKey;
    const hasGemini = !!profile?.geminiApiKey;
    if (!hasGroq && !hasGemini) {
      Alert.alert(
        t('trainerNoApiKey'),
        t('trainerNoApiKeyText'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('trainerGoToProfile'), onPress: () => router.push('/onboarding') },
        ]
      );
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setIsPlanRequestInFlight(isPlanRequest);
    setPlanMessage(null);
    setPlanSaved(false);

    try {
      const goals = await getGoals();
      const recent = await getRecentWorkouts(7);
      // Те саме, що бачать заміни й конструктор: доступні вправи з урахуванням
      // обладнання й зон, які треба берегти. Без цього тренер радить навмання.
      const resolver = await buildResolver();
      const library = buildAIContext({
        profile, workouts: await getRecentWorkouts(100), recentWorkouts: recent, resolver,
      });

      const streamingMsgId = (Date.now() + 1).toString();
      const streamingMsg: ChatMessage = {
        id: streamingMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      setMessages([...updatedMessages, streamingMsg]);

      let reply: string;

      if (isPlanRequest) {
        // Plans don't stream — they use the structured generation function
        reply = await askAI(
          () => groqGeneratePlan(profile, goals),
          () => geminiGeneratePlan(profile, goals),
        );
        setMessages((prev) =>
          prev.map((m) => m.id === streamingMsgId ? { ...m, content: reply } : m)
        );
      } else {
        // Не передаємо моделі повідомлення-помилки ("Помилка: ...") з минулих збоїв
        const cleanHistory = messages.filter(
          (m) => !(m.role === 'assistant' && ERROR_PREFIXES.some((p) => m.content.startsWith(p)))
        );
        const groqHistory = cleanHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        const geminiHistory = cleanHistory.map((m) => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }],
        }));

        const onChunk = (text: string) => {
          setMessages((prev) =>
            prev.map((m) => m.id === streamingMsgId ? { ...m, content: text } : m)
          );
        };

        reply = await askAI(
          () => groqChatStream(
            text.trim(), profile, goals, recent, groqHistory, onChunk,
            memoryBlock, nutritionSummary, library,
          ),
          () => geminiChatStream(
            text.trim(), profile, goals, recent, geminiHistory, onChunk,
            memoryBlock, nutritionSummary, library,
          ),
        );
      }

      const finalMessages = [...updatedMessages, { ...streamingMsg, content: reply }];
      setMessages(finalMessages);
      await saveChatHistory(finalMessages);

      // Extract and save memory note in background (no await — doesn't block UI)
      if (!isPlanRequest) {
        const extractFn = activeProvider === 'groq' ? groqExtractNote : geminiExtractNote;
        extractFn(text.trim(), reply)
          .then((note) => { if (note) addMemoryEntry(note); })
          .catch(() => {});
      }

      // Auto-detect if response looks like a training plan
      if (looksLikePlan(reply) || isPlanRequest) {
        setPlanMessage({ ...streamingMsg, content: reply });
      }
    } catch (error: any) {
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('errorWithText', error.message || t('couldNotAnswer')),
        timestamp: new Date().toISOString(),
      };
      setMessages([...updatedMessages, errMsg]);
    } finally {
      setLoading(false);
      setIsPlanRequestInFlight(false);
    }
  }

  async function handleSavePlan() {
    if (!planMessage) return;
    setSavingPlan(true);
    try {
      const goals = await getGoals();
      const goalTitles = goals.filter((g) => !g.completed).map((g) => g.title);
      // з резолвером вправи плану отримають id: картинку, заміну й калорії
      const plan = createPlanFromAIText(planMessage.content, goalTitles, await buildResolver());
      await saveTrainingPlan(plan);
      setPlanSaved(true);
      Alert.alert(
        t('planSavedTitle'),
        t('planSavedText'),
        [{ text: t('greatBtn') }]
      );
    } catch {
      Alert.alert(t('planSaveError'));
    } finally {
      setSavingPlan(false);
    }
  }

  async function refreshContext() {
    if (!profile || ctxLoading) return;
    setCtxLoading(true);
    try {
      const resolver = await buildResolver();
      const [goals, recent7, wl, nutHist, nutGoals, memEntries, allWorkouts, recs] = await Promise.all([
        getGoals(), getRecentWorkouts(7), getWeightLog(),
        getNutritionHistory(5), getNutritionGoals(),
        getMemoryEntries(), getRecentWorkouts(100), getPersonalRecords(undefined, resolver),
      ]);
      const mem = buildMemoryContext(memEntries, allWorkouts, wl, recs);
      const nutDays = nutHist.map((d) => { const t = getDailyTotals(d); return { date: d.date, ...t }; });
      const goalCal = nutGoals?.calories ?? null;
      const ctxAttempt = await askProvider(profile, {
        groq: () => groqGenerateContext(profile, goals, recent7, nutDays, wl, goalCal, mem),
        gemini: () => geminiGenerateContext(profile, goals, recent7, nutDays, wl, goalCal, mem),
      });
      const text = ctxAttempt.result;
      setActiveProvider(ctxAttempt.provider);
      if (ctxAttempt.switchedFrom) {
        setProviderNote(switchNote(ctxAttempt.switchedFrom, ctxAttempt.provider, t));
      }
      setCtxText(text);
      setCtxTs(Date.now());
      await saveTrainerContextCache(text);
    } catch { /* ignore */ }
    finally { setCtxLoading(false); }
  }

  const handleClear = () => {
    Alert.alert(t('trainerClear'), t('trainerClearConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive', onPress: async () => {
          await clearChatHistory();
          setMessages([]);
          setPlanMessage(null);
          setPlanSaved(false);
        }
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{t('trainerTitle')}</Text>
            <Text style={styles.headerSub}>
              {/* показуємо того, хто реально відповів, а не того, чий ключ перший */}
              {activeProvider === 'groq' ? 'Groq'
                : activeProvider === 'gemini' ? 'Gemini'
                : profile?.groqApiKey && !isProviderDead('groq') ? 'Groq' : 'Gemini'}
              {' · '}{profile?.name || t('setUpProfile')}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Trainer context card */}
      {(ctxText || ctxLoading) && (profile?.geminiApiKey || profile?.groqApiKey) && (
        <View style={styles.ctxCard}>
          <TouchableOpacity style={[styles.ctxHeader, ctxExpanded && styles.ctxHeaderExpanded]} onPress={() => { const next = !ctxExpanded; ctxExpandedRef.current = next; setCtxExpanded(next); }} activeOpacity={0.7}>
            <View style={styles.ctxBadge}>
              <Ionicons name="sparkles" size={11} color={Colors.primary} />
              <Text style={styles.ctxBadgeText}>{t('aiAnalysis')}</Text>
            </View>
            <View style={styles.ctxHeaderRight}>
              {ctxTs && !ctxLoading && ctxExpanded && (
                <Text style={styles.ctxTime}>
                  {Math.round((Date.now() - ctxTs) / 60000) < 2
                    ? t('justNow')
                    : t('minutesAgo', Math.round((Date.now() - ctxTs) / 60000))}
                </Text>
              )}
              {ctxExpanded && (
                <TouchableOpacity onPress={refreshContext} disabled={ctxLoading} style={styles.ctxRefreshBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  {ctxLoading
                    ? <ActivityIndicator size={13} color={Colors.textMuted} />
                    : <Ionicons name="refresh-outline" size={15} color={Colors.textMuted} />}
                </TouchableOpacity>
              )}
              <Ionicons
                name={ctxExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={15} color={Colors.textMuted}
              />
            </View>
          </TouchableOpacity>
          {ctxExpanded && (
            ctxLoading && !ctxText
              ? <Text style={styles.ctxLoading}>{t('analysingActivity')}</Text>
              : <Text style={styles.ctxText}>{ctxText}</Text>
          )}
        </View>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyChat} showsVerticalScrollIndicator={false}>
          <View style={styles.aiAvatarLarge}>
            <Ionicons name="sparkles" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.emptyChatTitle}>{t('trainerHello')}</Text>
          <Text style={styles.emptyChatSub}>
            {(profile?.groqApiKey || profile?.geminiApiKey)
              ? t('trainerIntroHint')
              : t('addApiKeyHint')}
          </Text>
          {!profile?.groqApiKey && !profile?.geminiApiKey && (
            <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/onboarding')}>
              <Text style={styles.setupBtnText}>{t('trainerGoToProfile')}</Text>
            </TouchableOpacity>
          )}

          {/* Plan CTA */}
          <TouchableOpacity
            style={styles.planCTA}
            onPress={() => sendMessage(t('fullPlanPrompt'), true)}
          >
            <View style={styles.planCTAIcon}>
              <Ionicons name="calendar-outline" size={24} color={Colors.primary} />
            </View>
            <View style={styles.planCTAText}>
              <Text style={styles.planCTATitle}>{t('buildPlanBtn')}</Text>
              <Text style={styles.planCTASub}>{t('buildPlanHint')}</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
          </TouchableOpacity>

          {/* Те саме без AI: конструктор працює без ключа й без інтернету */}
          <TouchableOpacity
            style={styles.planCTA}
            onPress={() => router.push('/workout/builder')}
          >
            <View style={styles.planCTAIcon}>
              <Ionicons name="construct-outline" size={24} color={Colors.success} />
            </View>
            <View style={styles.planCTAText}>
              <Text style={styles.planCTATitle}>{t('buildWithoutAi')}</Text>
              <Text style={styles.planCTASub}>
                {t('buildWithoutAiHint')}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={Colors.success} />
          </TouchableOpacity>

          <View style={styles.quickPromptsContainer}>
            {QUICK_PROMPTS.slice(1).map((p) => (
              <TouchableOpacity
                key={p.key}
                style={styles.quickPrompt}
                onPress={() => sendMessage(t(p.key), p.isPlan)}
              >
                <Ionicons name={p.icon as any} size={16} color={Colors.textMuted} />
                <Text style={styles.quickPromptText}>{t(p.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={15}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isPlanMessage={planMessage?.id === item.id}
              planSaved={planSaved && planMessage?.id === item.id}
              onSavePlan={handleSavePlan}
              savingPlan={savingPlan && planMessage?.id === item.id}
            />
          )}
        />
      )}

      {/* Loading — shown only while plan is being generated (no stream) */}
      {loading && isPlanRequestInFlight && (
        <View style={styles.thinkingRow}>
          <View style={styles.thinkingBubble}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.thinkingText}>{t('trainerThinking')}</Text>
          </View>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        {/* Пояснення, чому відповідає інший провайдер */}
        {providerNote && (
          <TouchableOpacity style={styles.providerNote} onPress={() => setProviderNote(null)}>
            <Ionicons name="swap-horizontal" size={13} color={Colors.warning} />
            <Text style={styles.providerNoteText}>{providerNote}</Text>
            <Ionicons name="close" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Quick prompts row */}
        <FlatList
          horizontal
          data={QUICK_PROMPTS}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickPromptsRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.miniPrompt, item.isPlan && styles.miniPromptPlan]}
              onPress={() => sendMessage(t(item.key), item.isPlan)}
            >
              <Ionicons name={item.icon as any} size={13} color={item.isPlan ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.miniPromptText, item.isPlan && { color: Colors.primary }]}>{t(item.key)}</Text>
            </TouchableOpacity>
          )}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={t('trainerPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, isPlanMessage, planSaved, onSavePlan, savingPlan }: {
  message: ChatMessage;
  isPlanMessage: boolean;
  planSaved: boolean;
  onSavePlan: () => void;
  savingPlan: boolean;
}) {
  const { t } = useLocale();
  const isUser = message.role === 'user';
  const time = format(new Date(message.timestamp), 'HH:mm');

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser && (
        <View style={styles.messagAvatar}>
          <Ionicons name="sparkles" size={14} color={Colors.primary} />
        </View>
      )}
      <View style={{ maxWidth: '78%' }}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          {isUser ? (
            <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{message.content}</Text>
          ) : (
            <RichText style={styles.bubbleText} boldColor={Colors.textPrimary}>
              {stripExerciseIds(message.content)}
            </RichText>
          )}
          <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>{time}</Text>
        </View>

        {/* Вправи, які тренер назвав: із бібліотеки, з картинкою й кнопкою «почати» */}
        {!isUser && <AiExercises text={message.content} />}
        {!isUser && message.content.length > 0 && <ReportAnswer text={message.content} />}

        {/* Save plan button — shown below AI message if it's a plan */}
        {isPlanMessage && !isUser && (
          <View style={styles.savePlanContainer}>
            {!planSaved ? (
              <TouchableOpacity
                style={styles.savePlanBtn}
                onPress={onSavePlan}
                disabled={savingPlan}
              >
                {savingPlan
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="bookmark-outline" size={16} color={Colors.primary} />
                }
                <Text style={styles.savePlanText}>
                  {t(savingPlan ? 'savingEllipsis' : 'saveAsMyPlan')}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.planSavedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.planSavedText}>{t('planSavedToApp')}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Вправи з відповіді тренера.
 *
 * Модель називає їх ідентифікаторами бібліотеки, тож ми показуємо саме ті
 * вправи, які реально є в додатку: з малюнком, карткою і кнопкою почати
 * тренування. Вигадані ідентифікатори просто не знаходяться й не показуються.
 */
function AiExercises({ text }: { text: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const found = useMemo(() => parseExerciseIds(text), [text]);
  if (found.length === 0) return null;

  async function start() {
    const exercises: ExerciseLog[] = found.map((ex) => {
      const p = prescribe(ex);
      return {
        name: exerciseName(ex),
        exerciseId: ex.id,
        sets: p.sets,
        reps: p.reps,
        duration: p.seconds ? Math.round(p.seconds / 6) / 10 : undefined,
      };
    });
    // той самий шлях, що в конструктора — без третього механізму передачі
    await AsyncStorage.setItem('@alpha_trainer:builder_started', JSON.stringify({
      workoutType: 'strength',
      duration: 45,
      exercises,
    }));
    router.push('/workout/log?fromBuilder=1');
  }

  return (
    <View style={aiExStyles.box}>
      {found.map((ex) => (
        <TouchableOpacity
          key={ex.id}
          style={aiExStyles.row}
          onPress={() => router.push(`/exercises/${ex.id}`)}
        >
          <ExerciseImage slug={ex.imageSlug} pattern={ex.pattern} size={36} />
          <Text style={aiExStyles.name} numberOfLines={1}>{exerciseName(ex)}</Text>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={aiExStyles.startBtn} onPress={start}>
        <Ionicons name="play" size={14} color={Colors.primary} />
        <Text style={aiExStyles.startText}>{t('startFromTheseExercises')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Скарга на відповідь AI.
 *
 * Модель може написати дурницю або щось недоречне. Користувач має бачити, що
 * з цим можна щось зробити: позначити відповідь і надіслати її розробнику.
 * Цього ж вимагають правила магазинів для додатків із генеративним AI.
 */
function ReportAnswer({ text }: { text: string }) {
  const { t } = useLocale();
  const [sent, setSent] = useState(false);

  function report() {
    Alert.alert(
      t('reportAnswerTitle'),
      t('reportAnswerText'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('justMarkBtn'),
          onPress: async () => {
            await addMemoryEntry(t('reportMemoryNote'));
            setSent(true);
          },
        },
        {
          text: t('sendBtn'),
          onPress: async () => {
            await addMemoryEntry(t('reportMemoryNote'));
            setSent(true);
            const body = encodeURIComponent(`Скарга на відповідь AI:\n\n${text.slice(0, 1500)}`);
            Linking.openURL(
              `https://github.com/badamchuk/alpha-trainer/issues/new?title=${
                encodeURIComponent(t('badAnswerSubject'))}&body=${body}`,
            ).catch(() => {});
          },
        },
      ],
    );
  }

  if (sent) {
    return (
      <View style={reportStyles.row}>
        <Ionicons name="checkmark-circle-outline" size={13} color={Colors.success} />
        <Text style={reportStyles.done}>{t('markedTrainerWillNote')}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={reportStyles.row} onPress={report} hitSlop={6}>
      <Ionicons name="flag-outline" size={13} color={Colors.textMuted} />
      <Text style={reportStyles.text}>{t('badAnswerBtn')}</Text>
    </TouchableOpacity>
  );
}

const reportStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingLeft: 2 },
  text: { ...Typography.bodySmall, color: Colors.textMuted, fontSize: 11 },
  done: { ...Typography.bodySmall, color: Colors.success, fontSize: 11 },
});

const aiExStyles = StyleSheet.create({
  box: { marginTop: Spacing.sm, gap: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: 6, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  name: { ...Typography.bodySmall, flex: 1 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.primary,
  },
  startText: { ...Typography.bodySmall, color: Colors.primary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerRight: { flexDirection: 'row', gap: Spacing.xs },
  aiAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(230,57,70,0.15)', borderWidth: 1, borderColor: 'rgba(230,57,70,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...Typography.h3, fontSize: 16 },
  headerSub: { ...Typography.bodySmall, fontSize: 12 },
  iconBtn: { padding: Spacing.sm },
  emptyChat: { padding: Spacing.lg, alignItems: 'center', paddingTop: 32 },
  aiAvatarLarge: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(230,57,70,0.1)', borderWidth: 2, borderColor: 'rgba(230,57,70,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  emptyChatTitle: { ...Typography.h2, textAlign: 'center', marginBottom: Spacing.sm },
  emptyChatSub: { ...Typography.bodySmall, textAlign: 'center', maxWidth: 280, marginBottom: Spacing.lg },
  setupBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginBottom: Spacing.lg,
  },
  setupBtnText: { color: '#FFF', fontWeight: '700' },
  planCTA: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(230,57,70,0.08)', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.25)',
    padding: Spacing.md, width: '100%', marginBottom: Spacing.md,
  },
  planCTAIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(230,57,70,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  planCTAText: { flex: 1 },
  planCTATitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: 15 },
  planCTASub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  quickPromptsContainer: { width: '100%', gap: Spacing.sm },
  quickPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickPromptText: { color: Colors.textSecondary, fontSize: 13 },
  messagesList: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.lg },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  messageRowUser: { flexDirection: 'row-reverse' },
  messagAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  bubble: { borderRadius: BorderRadius.lg, padding: Spacing.sm, paddingHorizontal: Spacing.md },
  bubbleAI: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  bubbleUser: { backgroundColor: Colors.primary },
  bubbleText: { ...Typography.body, lineHeight: 22 },
  bubbleTextUser: { color: '#FFF' },
  bubbleTime: { color: Colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  bubbleTimeUser: { color: 'rgba(255,255,255,0.6)' },
  savePlanContainer: { marginTop: Spacing.xs },
  savePlanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(230,57,70,0.1)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.3)',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  savePlanText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  planSavedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(46,196,182,0.1)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(46,196,182,0.3)',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  planSavedText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
  thinkingRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  thinkingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.border,
  },
  thinkingText: { color: Colors.textMuted, fontSize: 13 },
  providerNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  providerNoteText: { ...Typography.bodySmall, color: Colors.warning, flex: 1, fontSize: 12 },
  inputContainer: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.tabBar, paddingBottom: 8,
  },
  quickPromptsRow: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm },
  miniPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  miniPromptPlan: { borderColor: 'rgba(230,57,70,0.4)', backgroundColor: 'rgba(230,57,70,0.06)' },
  miniPromptText: { color: Colors.textSecondary, fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
  },
  input: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.textPrimary, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },

  // Trainer context card
  ctxCard: {
    marginHorizontal: Spacing.md, marginTop: Spacing.sm, marginBottom: 2,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  ctxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctxHeaderExpanded: { marginBottom: 8 },
  ctxBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(230,57,70,0.1)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  ctxBadgeText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  ctxHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctxTime: { color: Colors.textMuted, fontSize: 11 },
  ctxRefreshBtn: { padding: 2 },
  ctxText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  ctxLoading: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
});
