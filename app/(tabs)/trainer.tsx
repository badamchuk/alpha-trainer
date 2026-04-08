import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import {
  getUserProfile, getGoals, getRecentWorkouts,
  getChatHistory, saveChatHistory, clearChatHistory, saveTrainingPlan,
  getWeightLog, getPersonalRecords,
} from '../../services/storage';
import { chatStream as geminiChatStream, initGemini, generateTrainingPlan as geminiGeneratePlan, extractMemoryNote as geminiExtractNote } from '../../services/gemini';
import { chatStream as groqChatStream, initGroq, generateTrainingPlan as groqGeneratePlan, extractMemoryNote as groqExtractNote } from '../../services/groq';
import { getMemoryEntries, addMemoryEntry, buildMemoryContext } from '../../services/aiMemory';
import { createPlanFromAIText } from '../../services/planParser';
import { ChatMessage, UserProfile } from '../../types';

const QUICK_PROMPTS = [
  { text: 'Розроби план тренувань', icon: 'calendar-outline', isPlan: true },
  { text: 'Що тренувати сьогодні?', icon: 'today-outline', isPlan: false },
  { text: 'Як покращити результати?', icon: 'trending-up-outline', isPlan: false },
  { text: 'Порадь вправи для схуднення', icon: 'flame-outline', isPlan: false },
  { text: 'Як правильно відновлюватись?', icon: 'bed-outline', isPlan: false },
];

// Detect if AI response contains a training plan
function looksLikePlan(text: string): boolean {
  const dayKeywords = /понеділок|вівторок|середа|четвер|п.ятниця|субота|неділя|пн\b|вт\b|ср\b|чт\b|пт\b|сб\b|нд\b/gi;
  const matches = text.match(dayKeywords);
  return (matches?.length ?? 0) >= 3;
}

export default function TrainerScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPlanRequestInFlight, setIsPlanRequestInFlight] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memoryBlock, setMemoryBlock] = useState('');
  const [planMessage, setPlanMessage] = useState<ChatMessage | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [p, history, memEntries, allWorkouts, wl, recs] = await Promise.all([
          getUserProfile(), getChatHistory(), getMemoryEntries(),
          getRecentWorkouts(100), getWeightLog(), getPersonalRecords(),
        ]);
        setProfile(p);
        setMessages(history);
        setMemoryBlock(buildMemoryContext(memEntries, allWorkouts, wl, recs));
        if (p?.geminiApiKey) initGemini(p.geminiApiKey);
        if (p?.groqApiKey) initGroq(p.groqApiKey);
      }
      load();
    }, [])
  );

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function sendMessage(text: string, isPlanRequest = false) {
    if (!text.trim() || loading) return;
    const hasGroq = !!profile?.groqApiKey;
    const hasGemini = !!profile?.geminiApiKey;
    if (!hasGroq && !hasGemini) {
      Alert.alert(
        'API ключ не налаштовано',
        'Щоб спілкуватися з AI-тренером, потрібен Groq або Gemini API ключ.',
        [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Налаштувати', onPress: () => router.push('/onboarding') },
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

      const useGroq = !!profile.groqApiKey;
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
        reply = useGroq
          ? await groqGeneratePlan(profile, goals)
          : await geminiGeneratePlan(profile, goals);
        setMessages((prev) =>
          prev.map((m) => m.id === streamingMsgId ? { ...m, content: reply } : m)
        );
      } else {
        const groqHistory = messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        const geminiHistory = messages.map((m) => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }],
        }));

        const onChunk = (text: string) => {
          setMessages((prev) =>
            prev.map((m) => m.id === streamingMsgId ? { ...m, content: text } : m)
          );
        };

        reply = useGroq
          ? await groqChatStream(text.trim(), profile, goals, recent, groqHistory, onChunk, memoryBlock)
          : await geminiChatStream(text.trim(), profile, goals, recent, geminiHistory, onChunk, memoryBlock);
      }

      const finalMessages = [...updatedMessages, { ...streamingMsg, content: reply }];
      setMessages(finalMessages);
      await saveChatHistory(finalMessages);

      // Extract and save memory note in background (no await — doesn't block UI)
      if (!isPlanRequest) {
        const extractFn = useGroq ? groqExtractNote : geminiExtractNote;
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
        content: `Помилка: ${error.message || 'Не вдалося отримати відповідь.'}`,
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
      const plan = createPlanFromAIText(planMessage.content, goalTitles);
      await saveTrainingPlan(plan);
      setPlanSaved(true);
      Alert.alert(
        'План збережено!',
        'Тижневий план тепер доступний на головному екрані та у вкладці "План".',
        [{ text: 'Чудово' }]
      );
    } catch {
      Alert.alert('Помилка збереження плану');
    } finally {
      setSavingPlan(false);
    }
  }

  const handleClear = () => {
    Alert.alert('Очистити чат', 'Видалити всю історію розмови?', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Очистити', style: 'destructive', onPress: async () => {
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Тренер</Text>
            <Text style={styles.headerSub}>{profile?.groqApiKey ? 'Groq' : 'Gemini'} · {profile?.name || 'Налаштуй профіль'}</Text>
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

      {/* Messages */}
      {messages.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyChat} showsVerticalScrollIndicator={false}>
          <View style={styles.aiAvatarLarge}>
            <Ionicons name="sparkles" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.emptyChatTitle}>Привіт! Я твій AI-тренер</Text>
          <Text style={styles.emptyChatSub}>
            {(profile?.groqApiKey || profile?.geminiApiKey)
              ? 'Запитай про тренування або попроси скласти персональний план'
              : 'Додай Groq або Gemini API ключ у налаштуваннях профілю'}
          </Text>
          {!profile?.groqApiKey && !profile?.geminiApiKey && (
            <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/onboarding')}>
              <Text style={styles.setupBtnText}>Налаштувати профіль</Text>
            </TouchableOpacity>
          )}

          {/* Plan CTA */}
          <TouchableOpacity
            style={styles.planCTA}
            onPress={() => sendMessage('Розроби для мене детальний тижневий план тренувань, враховуючи мій рівень підготовки, цілі та доступні дні', true)}
          >
            <View style={styles.planCTAIcon}>
              <Ionicons name="calendar-outline" size={24} color={Colors.primary} />
            </View>
            <View style={styles.planCTAText}>
              <Text style={styles.planCTATitle}>Розробити план тренувань</Text>
              <Text style={styles.planCTASub}>AI складе програму під твої цілі та збереже в додаток</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
          </TouchableOpacity>

          <View style={styles.quickPromptsContainer}>
            {QUICK_PROMPTS.slice(1).map((p) => (
              <TouchableOpacity
                key={p.text}
                style={styles.quickPrompt}
                onPress={() => sendMessage(p.text, p.isPlan)}
              >
                <Ionicons name={p.icon as any} size={16} color={Colors.textMuted} />
                <Text style={styles.quickPromptText}>{p.text}</Text>
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
            <Text style={styles.thinkingText}>Складаю план...</Text>
          </View>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        {/* Quick prompts row */}
        <FlatList
          horizontal
          data={QUICK_PROMPTS}
          keyExtractor={(item) => item.text}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickPromptsRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.miniPrompt, item.isPlan && styles.miniPromptPlan]}
              onPress={() => sendMessage(item.text, item.isPlan)}
            >
              <Ionicons name={item.icon as any} size={13} color={item.isPlan ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.miniPromptText, item.isPlan && { color: Colors.primary }]}>{item.text}</Text>
            </TouchableOpacity>
          )}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Напиши питання тренеру..."
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
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content}</Text>
          <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>{time}</Text>
        </View>

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
                  {savingPlan ? 'Зберігаю...' : 'Зберегти як мій план'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.planSavedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.planSavedText}>План збережено в додаток</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.md,
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
});
