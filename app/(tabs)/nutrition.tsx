import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ActivityIndicator, RefreshControl, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getUserProfile } from '../../services/storage';
import { getLocalDateString } from '../../services/storage';
import {
  getDailyNutrition, getNutritionGoals, saveNutritionGoals,
  addMeal, removeMeal, updateMeal, getDailyTotals, getNutritionHistory,
  calculateNutritionGoals, getFoodLibrary, saveToFoodLibrary, removeFromFoodLibrary,
  DailyNutrition, NutritionGoals, MealEntry, ParsedFoodItem, SavedMeal, NutritionMode,
} from '../../services/nutrition';
import {
  parseNutritionText as geminiParse,
  nutritionistChatStream as geminiNutritionistStream,
  NutritionParseResult,
  initGemini,
} from '../../services/gemini';
import {
  parseNutritionText as groqParse,
  nutritionistChatStream as groqNutritionistStream,
  initGroq,
} from '../../services/groq';
import {
  getNutritionistChatHistory, saveNutritionistChatHistory, clearNutritionistChatHistory,
  getRecentWorkouts,
} from '../../services/storage';
import { getMemoryEntries, buildMemoryContext } from '../../services/aiMemory';
import { ChatMessage } from '../../types';

const MODE_LABELS: Record<NutritionMode, string> = {
  cut: 'Схуднення', maintain: 'Підтримка', bulk: 'Набір',
};
const MODE_COLORS: Record<NutritionMode, string> = {
  cut: '#E63946', maintain: '#2ECC71', bulk: '#3498DB',
};

function formatDateLabel(dateStr: string): string {
  const today = getLocalDateString(new Date());
  if (dateStr === today) return 'Сьогодні';
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yesterday = getLocalDateString(yd);
  if (dateStr === yesterday) return 'Вчора';
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return getLocalDateString(d);
}

export default function NutritionScreen() {
  const today = getLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [daily, setDaily] = useState<DailyNutrition>({ date: today, meals: [] });
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [library, setLibrary] = useState<SavedMeal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<import('../../types').UserProfile | null>(null);

  // Add / Edit meal modal
  const [addVisible, setAddVisible] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null); // null = adding new
  const [foodText, setFoodText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<NutritionParseResult | null>(null);
  const [mealName, setMealName] = useState('');

  // Goals modal
  const [goalsVisible, setGoalsVisible] = useState(false);
  const [editMode, setEditMode] = useState<NutritionMode>('maintain');

  // Library modal
  const [libraryVisible, setLibraryVisible] = useState(false);

  // Weekly chart
  const [weekHistory, setWeekHistory] = useState<{ date: string; calories: number }[]>([]);

  // Nutritionist chat modal
  const [nutritionistVisible, setNutritionistVisible] = useState(false);
  const [nutMessages, setNutMessages] = useState<ChatMessage[]>([]);
  const [nutInput, setNutInput] = useState('');
  const [nutLoading, setNutLoading] = useState(false);
  const nutListRef = useRef<FlatList>(null);

  async function loadData(date?: string) {
    const targetDate = date ?? selectedDate;
    const [d, g, lib, profile, hist] = await Promise.all([
      getDailyNutrition(targetDate),
      getNutritionGoals(),
      getFoodLibrary(),
      getUserProfile(),
      getNutritionHistory(7),
    ]);
    setWeekHistory(hist.map((h) => ({ date: h.date, calories: getDailyTotals(h).calories })));
    setDaily(d);
    setLibrary(lib);

    if (profile?.groqApiKey) initGroq(profile.groqApiKey);
    else if (profile?.geminiApiKey) initGemini(profile.geminiApiKey);

    setProfile(profile);

    if (g) {
      setGoals(g);
    } else if (profile?.weight && profile?.height && profile?.age) {
      const computed = calculateNutritionGoals(profile, 'maintain');
      await saveNutritionGoals(computed);
      setGoals(computed);
    }
  }

  useFocusEffect(useCallback(() => { loadData(selectedDate); }, [selectedDate]));

  function goToDate(newDate: string) {
    setSelectedDate(newDate);
    loadData(newDate);
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(selectedDate);
    setRefreshing(false);
  };

  async function handleParse() {
    if (!foodText.trim()) return;
    setParsing(true);
    setParsed(null);
    try {
      const profile = await getUserProfile();
      let result: NutritionParseResult;
      if (profile?.groqApiKey) {
        result = await groqParse(foodText);
      } else {
        result = await geminiParse(foodText);
      }
      setParsed(result);
      if (!mealName) {
        const hour = new Date().getHours();
        const autoName = hour < 11 ? 'Сніданок' : hour < 15 ? 'Обід' : hour < 19 ? 'Перекус' : 'Вечеря';
        setMealName(autoName);
      }
    } catch (e: any) {
      Alert.alert('Помилка AI', e?.message ?? 'Не вдалось розрахувати. Перевір API ключ.');
    } finally {
      setParsing(false);
    }
  }

  function openRepeatMeal(meal: MealEntry) {
    // Like edit but creates a NEW entry — user can tweak text/name before saving
    setEditingMeal(null);
    setFoodText(meal.rawText || meal.name);
    setMealName(meal.name);
    setParsed({
      meals: meal.items.map((it) => ({
        name: it.name, qty: it.qty,
        calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat, fiber: it.fiber ?? 0,
      })),
      total: {
        calories: meal.calories, protein: meal.protein, carbs: meal.carbs,
        fat: meal.fat, fiber: meal.fiber ?? 0,
      },
    });
    setAddVisible(true);
  }

  function openEditMeal(meal: MealEntry) {
    setEditingMeal(meal);
    setFoodText(meal.rawText || meal.name);
    setMealName(meal.name);
    // Pre-fill parsed so user can save without re-running AI (only required if they change text)
    setParsed({
      meals: meal.items.map((it) => ({
        name: it.name, qty: it.qty,
        calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat, fiber: it.fiber ?? 0,
      })),
      total: {
        calories: meal.calories, protein: meal.protein, carbs: meal.carbs,
        fat: meal.fat, fiber: meal.fiber ?? 0,
      },
    });
    setAddVisible(true);
  }

  function closeAddModal() {
    setAddVisible(false);
    setEditingMeal(null);
    setFoodText('');
    setParsed(null);
    setMealName('');
  }

  async function handleSaveMeal() {
    if (!parsed) return;
    const now = new Date();
    const time = editingMeal?.time ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const meal: MealEntry = {
      id: editingMeal?.id ?? Date.now().toString(),
      time,
      name: mealName || 'Прийом їжі',
      rawText: foodText,
      calories: parsed.total.calories,
      protein: parsed.total.protein,
      carbs: parsed.total.carbs,
      fat: parsed.total.fat,
      fiber: parsed.total.fiber ?? 0,
      items: parsed.meals.map((m) => ({
        name: m.name, qty: m.qty,
        calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
        fiber: m.fiber ?? 0,
      })),
    };

    if (editingMeal) {
      const updated = await updateMeal(selectedDate, meal);
      setDaily(updated);
    } else {
      const updated = await addMeal(selectedDate, meal);
      setDaily(updated);
      // Save to library for quick reuse
      await saveToFoodLibrary({
        name: meal.name,
        calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
        fiber: meal.fiber, items: meal.items,
      });
    }

    closeAddModal();
    await loadData(selectedDate);
  }

  async function handleQuickAdd(saved: SavedMeal) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const meal: MealEntry = {
      id: Date.now().toString(),
      time,
      name: saved.name,
      rawText: '',
      calories: saved.calories, protein: saved.protein, carbs: saved.carbs, fat: saved.fat,
      items: saved.items,
    };
    const updated = await addMeal(selectedDate, meal);
    setDaily(updated);
    setLibraryVisible(false);
    await loadData(selectedDate);
  }

  async function handleDeleteMeal(mealId: string) {
    Alert.alert('Видалити прийом?', '', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити', style: 'destructive',
        onPress: async () => {
          const updated = await removeMeal(selectedDate, mealId);
          setDaily(updated);
        },
      },
    ]);
  }

  async function handleSaveGoals() {
    if (!profile) { Alert.alert('Заповни профіль спочатку'); return; }
    const computed = calculateNutritionGoals(profile, editMode);
    await saveNutritionGoals(computed);
    setGoals(computed);
    setGoalsVisible(false);
  }

  async function openNutritionist() {
    const history = await getNutritionistChatHistory();
    setNutMessages(history);
    setNutritionistVisible(true);
  }

  async function sendNutritionistMessage() {
    if (!nutInput.trim() || nutLoading) return;
    if (!profile?.groqApiKey && !profile?.geminiApiKey) {
      Alert.alert('Потрібен API ключ', 'Додай Gemini або Groq API ключ у профілі.');
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: nutInput.trim(),
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...nutMessages, userMsg];
    setNutMessages(updatedMessages);
    setNutInput('');
    setNutLoading(true);

    const streamingId = (Date.now() + 1).toString();
    const streamingMsg: ChatMessage = { id: streamingId, role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setNutMessages([...updatedMessages, streamingMsg]);

    try {
      const [nutHist, recentWorkouts, memEntries] = await Promise.all([
        getNutritionHistory(7),
        getRecentWorkouts(5),
        getMemoryEntries(),
      ]);

      const nutHistSummary = nutHist.map((d) => {
        const t = getDailyTotals(d);
        return { date: d.date, calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat };
      });

      const memBlock = buildMemoryContext(memEntries, recentWorkouts, [], []);
      const chatHistory = nutMessages.map((m) =>
        profile?.groqApiKey
          ? { role: m.role as 'user' | 'assistant', content: m.content }
          : { role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: m.content }] }
      );

      const onChunk = (text: string) => {
        setNutMessages((prev) => prev.map((m) => m.id === streamingId ? { ...m, content: text } : m));
        setTimeout(() => nutListRef.current?.scrollToEnd({ animated: false }), 50);
      };

      let reply: string;
      if (profile?.groqApiKey) {
        reply = await groqNutritionistStream(
          userMsg.content, profile, goals, nutHistSummary, recentWorkouts,
          chatHistory as { role: 'user' | 'assistant'; content: string }[],
          onChunk, memBlock
        );
      } else {
        reply = await geminiNutritionistStream(
          userMsg.content, profile!, goals, nutHistSummary, recentWorkouts,
          chatHistory as { role: 'user' | 'model'; parts: { text: string }[] }[],
          onChunk, memBlock
        );
      }

      const finalMessages = [...updatedMessages, { ...streamingMsg, content: reply }];
      setNutMessages(finalMessages);
      await saveNutritionistChatHistory(finalMessages);
    } catch (e: any) {
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: `Помилка: ${e?.message || 'Не вдалося отримати відповідь.'}`,
        timestamp: new Date().toISOString(),
      };
      setNutMessages([...updatedMessages, errMsg]);
    } finally {
      setNutLoading(false);
    }
  }

  const totals = getDailyTotals(daily);
  const calPct = goals ? Math.min(100, Math.round((totals.calories / goals.calories) * 100)) : 0;
  const proteinPct = goals ? Math.min(100, Math.round((totals.protein / goals.protein) * 100)) : 0;
  const carbsPct = goals ? Math.min(100, Math.round((totals.carbs / goals.carbs) * 100)) : 0;
  const fatPct = goals ? Math.min(100, Math.round((totals.fat / goals.fat) * 100)) : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Харчування</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={openNutritionist} style={styles.headerBtn}>
              <Ionicons name="sparkles-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLibraryVisible(true)} style={styles.headerBtn}>
              <Ionicons name="bookmark-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditMode(goals?.mode ?? 'maintain'); setGoalsVisible(true); }} style={styles.headerBtn}>
              <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Date navigation */}
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => goToDate(addDays(selectedDate, -1))} style={styles.dateNavBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dateNavLabel}>{formatDateLabel(selectedDate)}</Text>
          <TouchableOpacity
            onPress={() => goToDate(addDays(selectedDate, 1))}
            style={[styles.dateNavBtn, selectedDate >= today && { opacity: 0.3 }]}
            disabled={selectedDate >= today}
          >
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Weekly calorie chart */}
        {weekHistory.length > 1 && goals && (
          <WeeklyCalChart history={weekHistory} goal={goals.calories} selectedDate={selectedDate} onSelectDate={goToDate} />
        )}

        {/* Calorie ring / summary */}
        {goals ? (
          <View style={styles.summaryCard}>
            <View style={styles.calRow}>
              <View style={styles.calLeft}>
                <Text style={styles.calNum}>{totals.calories}</Text>
                <Text style={styles.calOf}>/ {goals.calories} ккал</Text>
              </View>
              <View style={[styles.modeBadge, { backgroundColor: MODE_COLORS[goals.mode] + '22', borderColor: MODE_COLORS[goals.mode] + '44' }]}>
                <Text style={[styles.modeText, { color: MODE_COLORS[goals.mode] }]}>{MODE_LABELS[goals.mode]}</Text>
              </View>
            </View>
            <View style={styles.calBar}>
              <View style={[styles.calBarFill, {
                width: `${calPct}%` as any,
                backgroundColor: calPct >= 100 ? '#E63946' : calPct >= 85 ? '#F4A261' : Colors.primary,
              }]} />
            </View>

            <View style={styles.macroRow}>
              <MacroBar label="Білки" value={totals.protein} goal={goals.protein} pct={proteinPct} color="#E63946" unit="г" />
              <MacroBar label="Вугл." value={totals.carbs} goal={goals.carbs} pct={carbsPct} color="#F4A261" unit="г" />
              <MacroBar label="Жири" value={totals.fat} goal={goals.fat} pct={fatPct} color="#3498DB" unit="г" />
              {totals.fiber > 0 && (
                <FiberBar value={totals.fiber} />
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.setupCard}
            onPress={() => { setEditMode('maintain'); setGoalsVisible(true); }}
          >
            <Ionicons name="calculator-outline" size={24} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>Налаштуй цілі харчування</Text>
              <Text style={styles.setupSub}>Калорії та макро розраховуються автоматично з профілю</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Add meal button */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>Додати прийом їжі</Text>
        </TouchableOpacity>

        {/* Meals list */}
        {daily.meals.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Прийоми їжі</Text>
            {daily.meals.map((meal) => (
              <View key={meal.id} style={styles.mealCard}>
                <View style={styles.mealHeader}>
                  <View style={styles.mealHeaderLeft}>
                    <Text style={styles.mealTime}>{meal.time}</Text>
                    <Text style={styles.mealName}>{meal.name}</Text>
                  </View>
                  <View style={styles.mealHeaderRight}>
                    <Text style={styles.mealCal}>{meal.calories} ккал</Text>
                    <TouchableOpacity onPress={() => openRepeatMeal(meal)} style={{ padding: 4 }}>
                      <Ionicons name="copy-outline" size={17} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEditMeal(meal)} style={{ padding: 4 }}>
                      <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteMeal(meal.id)} style={{ padding: 4 }}>
                      <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.mealMacros}>
                  <Text style={styles.mealMacroText}>Б: {meal.protein}г</Text>
                  <Text style={styles.mealMacroDivider}>·</Text>
                  <Text style={styles.mealMacroText}>В: {meal.carbs}г</Text>
                  <Text style={styles.mealMacroDivider}>·</Text>
                  <Text style={styles.mealMacroText}>Ж: {meal.fat}г</Text>
                  {(meal.fiber ?? 0) > 0 && (
                    <>
                      <Text style={styles.mealMacroDivider}>·</Text>
                      <Text style={[styles.mealMacroText, { color: '#2ECC71' }]}>Кл: {meal.fiber}г</Text>
                    </>
                  )}
                </View>
                {meal.items.length > 0 && (
                  <View style={styles.mealItems}>
                    {meal.items.map((item, i) => (
                      <Text key={i} style={styles.mealItem}>
                        · {item.name} {item.qty} — {item.calories} ккал
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Ще нічого не додано</Text>
            <Text style={styles.emptyHint}>Напиши що їв — AI порахує калорії</Text>
          </View>
        )}
      </ScrollView>

      {/* ── ADD / EDIT MEAL MODAL ── */}
      <Modal visible={addVisible} transparent animationType="slide" onRequestClose={closeAddModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMeal ? 'Редагувати прийом' : 'Що ти їв?'}</Text>
              <TouchableOpacity onPress={closeAddModal}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <TextInput
                style={styles.foodInput}
                placeholder={'Наприклад: 2 яйця, жменя шпинату, хліб з хумусом...'}
                placeholderTextColor={Colors.textMuted}
                value={foodText}
                onChangeText={setFoodText}
                multiline
                numberOfLines={3}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.parseBtn, (parsing || !foodText.trim()) && { opacity: 0.5 }]}
                onPress={handleParse}
                disabled={parsing || !foodText.trim()}
              >
                {parsing ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons name="sparkles-outline" size={16} color="#FFF" />
                )}
                <Text style={styles.parseBtnText}>
                  {parsing ? 'Рахую...' : editingMeal ? 'Перерахувати (AI)' : 'Розрахувати КБЖУ (AI)'}
                </Text>
              </TouchableOpacity>

              {parsed && (
                <View style={styles.parsedResult}>
                  <View style={styles.parsedTotals}>
                    <PillStat label="ккал" value={parsed.total.calories} color={Colors.primary} />
                    <PillStat label="Білки" value={`${parsed.total.protein}г`} color="#E63946" />
                    <PillStat label="Вугл." value={`${parsed.total.carbs}г`} color="#F4A261" />
                    <PillStat label="Жири" value={`${parsed.total.fat}г`} color="#3498DB" />
                    {(parsed.total.fiber ?? 0) > 0 && (
                      <PillStat label="Клітк." value={`${parsed.total.fiber}г`} color="#2ECC71" />
                    )}
                  </View>

                  {parsed.meals.map((item, i) => (
                    <View key={i} style={styles.parsedItem}>
                      <Text style={styles.parsedItemName}>{item.name}</Text>
                      <Text style={styles.parsedItemQty}>{item.qty}</Text>
                      <Text style={styles.parsedItemCal}>{item.calories} ккал</Text>
                    </View>
                  ))}

                  <TextInput
                    style={styles.mealNameInput}
                    placeholder="Назва (Сніданок, Обід...)"
                    placeholderTextColor={Colors.textMuted}
                    value={mealName}
                    onChangeText={setMealName}
                    returnKeyType="done"
                  />

                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMeal}>
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                    <Text style={styles.saveBtnText}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── GOALS MODAL ── */}
      <Modal visible={goalsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: Spacing.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ціль харчування</Text>
              <TouchableOpacity onPress={() => setGoalsVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.goalsHint}>
              Калорії та макронутрієнти розраховуються автоматично на основі твого профілю (вага, зріст, вік, активність).
            </Text>

            <Text style={styles.modeLabel}>Режим</Text>
            <View style={styles.modeRow}>
              {(['cut', 'maintain', 'bulk'] as NutritionMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, editMode === m && { backgroundColor: MODE_COLORS[m] + '22', borderColor: MODE_COLORS[m] }]}
                  onPress={() => setEditMode(m)}
                >
                  <Text style={[styles.modeBtnText, editMode === m && { color: MODE_COLORS[m], fontWeight: '700' }]}>
                    {MODE_LABELS[m]}
                  </Text>
                  <Text style={styles.modeBtnSub}>
                    {m === 'cut' ? '−350 ккал' : m === 'bulk' ? '+275 ккал' : '= TDEE'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {profile && (() => {
              const preview = calculateNutritionGoals(profile, editMode);
              return (
                <View style={styles.goalsPreview}>
                  <View style={styles.goalsPreviewRow}>
                    <Text style={styles.goalsPreviewLabel}>Калорії</Text>
                    <Text style={styles.goalsPreviewVal}>{preview.calories} ккал</Text>
                  </View>
                  <View style={styles.goalsPreviewRow}>
                    <Text style={styles.goalsPreviewLabel}>Білки</Text>
                    <Text style={[styles.goalsPreviewVal, { color: '#E63946' }]}>{preview.protein}г</Text>
                  </View>
                  <View style={styles.goalsPreviewRow}>
                    <Text style={styles.goalsPreviewLabel}>Вуглеводи</Text>
                    <Text style={[styles.goalsPreviewVal, { color: '#F4A261' }]}>{preview.carbs}г</Text>
                  </View>
                  <View style={styles.goalsPreviewRow}>
                    <Text style={styles.goalsPreviewLabel}>Жири</Text>
                    <Text style={[styles.goalsPreviewVal, { color: '#3498DB' }]}>{preview.fat}г</Text>
                  </View>
                </View>
              );
            })()}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGoals}>
              <Text style={styles.saveBtnText}>Зберегти</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── NUTRITIONIST CHAT MODAL ── */}
      <Modal visible={nutritionistVisible} transparent animationType="slide" onRequestClose={() => setNutritionistVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.nutModal}>
            <View style={styles.nutHeader}>
              <View style={styles.nutHeaderLeft}>
                <Ionicons name="sparkles" size={18} color={Colors.primary} />
                <Text style={styles.nutTitle}>AI Нутріціолог</Text>
              </View>
              <View style={styles.nutHeaderRight}>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Очистити чат?', '', [
                      { text: 'Скасувати', style: 'cancel' },
                      { text: 'Очистити', style: 'destructive', onPress: async () => {
                        await clearNutritionistChatHistory();
                        setNutMessages([]);
                      }},
                    ]);
                  }}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setNutritionistVisible(false)} style={{ padding: 6 }}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              ref={nutListRef}
              data={nutMessages}
              keyExtractor={(m) => m.id}
              style={styles.nutList}
              contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
              onContentSizeChange={() => nutListRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <View style={styles.nutEmpty}>
                  <Ionicons name="nutrition-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.nutEmptyText}>Запитай свого нутріціолога</Text>
                  <Text style={styles.nutEmptyHint}>Він бачить твою 7-денну історію харчування та тренувань</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.nutBubble, item.role === 'user' ? styles.nutBubbleUser : styles.nutBubbleAI]}>
                  <Text style={[styles.nutBubbleText, item.role === 'user' && { color: '#FFF' }]}>
                    {item.content || '...'}
                  </Text>
                </View>
              )}
            />

            <View style={styles.nutInputRow}>
              <TextInput
                style={styles.nutInput}
                placeholder="Запитай про харчування..."
                placeholderTextColor={Colors.textMuted}
                value={nutInput}
                onChangeText={setNutInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={sendNutritionistMessage}
              />
              <TouchableOpacity
                style={[styles.nutSendBtn, (!nutInput.trim() || nutLoading) && { opacity: 0.4 }]}
                onPress={sendNutritionistMessage}
                disabled={!nutInput.trim() || nutLoading}
              >
                {nutLoading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="send" size={18} color="#FFF" />
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── LIBRARY MODAL ── */}
      <Modal visible={libraryVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Збережені прийоми</Text>
              <TouchableOpacity onPress={() => setLibraryVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {library.length === 0 ? (
              <View style={styles.libraryEmpty}>
                <Ionicons name="bookmark-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Ще немає збережених страв</Text>
                <Text style={styles.emptyHint}>Після першого збереження прийому їжі він з'явиться тут</Text>
              </View>
            ) : (
              <FlatList
                data={library}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.libraryItem} onPress={() => handleQuickAdd(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.libraryName}>{item.name}</Text>
                      <Text style={styles.libraryMeta}>
                        {item.calories} ккал · Б:{item.protein}г В:{item.carbs}г Ж:{item.fat}г
                      </Text>
                    </View>
                    <View style={styles.libraryRight}>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert('Видалити зі збережених?', '', [
                            { text: 'Скасувати', style: 'cancel' },
                            { text: 'Видалити', style: 'destructive', onPress: async () => {
                              await removeFromFoodLibrary(item.id);
                              setLibrary(library.filter((l) => l.id !== item.id));
                            }},
                          ]);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                      <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WeeklyCalChart({ history, goal, selectedDate, onSelectDate }: {
  history: { date: string; calories: number }[];
  goal: number;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const maxCal = Math.max(goal, ...history.map((d) => d.calories));
  const BAR_H = 48;
  return (
    <View style={styles.weekChart}>
      {history.map((d) => {
        const pct = maxCal > 0 ? d.calories / maxCal : 0;
        const isSelected = d.date === selectedDate;
        const overGoal = d.calories > goal;
        const barColor = overGoal ? '#E63946' : d.calories >= goal * 0.85 ? Colors.primary : Colors.primary + '70';
        const dayLabel = days[new Date(d.date + 'T12:00:00').getDay()];
        return (
          <TouchableOpacity key={d.date} style={styles.weekChartCol} onPress={() => onSelectDate(d.date)}>
            <Text style={[styles.weekChartCal, isSelected && { color: Colors.primary, fontWeight: '700' }]}>
              {d.calories > 0 ? d.calories : ''}
            </Text>
            <View style={[styles.weekChartBarBg, { height: BAR_H }]}>
              <View style={[
                styles.weekChartBarFill,
                { height: pct * BAR_H, backgroundColor: barColor },
                isSelected && { backgroundColor: overGoal ? '#E63946' : Colors.primary },
              ]} />
            </View>
            <Text style={[styles.weekChartDay, isSelected && { color: Colors.primary, fontWeight: '700' }]}>
              {dayLabel}
            </Text>
            {isSelected && <View style={styles.weekChartDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MacroBar({ label, value, goal, pct, color, unit }: {
  label: string; value: number; goal: number; pct: number; color: string; unit: string;
}) {
  return (
    <View style={styles.macroItem}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={[styles.macroValue, { color }]}>{value}<Text style={styles.macroUnit}>{unit}</Text></Text>
      <Text style={styles.macroGoal}>/ {goal}{unit}</Text>
      <View style={styles.macroBarBg}>
        <View style={[styles.macroBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function FiberBar({ value }: { value: number }) {
  // Daily fiber goal: ~25g (general recommendation)
  const goal = 25;
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <View style={styles.macroItem}>
      <Text style={styles.macroLabel}>Клітк.</Text>
      <Text style={[styles.macroValue, { color: '#2ECC71' }]}>{value}<Text style={styles.macroUnit}>г</Text></Text>
      <Text style={styles.macroGoal}>/ {goal}г</Text>
      <View style={styles.macroBarBg}>
        <View style={[styles.macroBarFill, { width: `${pct}%` as any, backgroundColor: '#2ECC71' }]} />
      </View>
    </View>
  );
}

function PillStat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={[styles.pillStat, { borderColor: color + '40', backgroundColor: color + '12' }]}>
      <Text style={[styles.pillStatVal, { color }]}>{value}</Text>
      <Text style={styles.pillStatLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingTop: 56, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  title: { ...Typography.h1, fontSize: 26 },
  headerActions: { flexDirection: 'row', gap: Spacing.xs },
  headerBtn: { padding: 6 },

  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md, gap: Spacing.sm,
  },
  dateNavBtn: { padding: 6 },
  dateNavLabel: {
    ...Typography.h3, fontSize: 15, minWidth: 120, textAlign: 'center',
    color: Colors.textPrimary,
  },

  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md, gap: Spacing.sm,
  },
  calRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  calLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  calNum: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary },
  calOf: { color: Colors.textMuted, fontSize: 14 },
  modeBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  modeText: { fontSize: 12, fontWeight: '700' },
  calBar: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  calBarFill: { height: '100%', borderRadius: 3 },
  macroRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  macroItem: { flex: 1, gap: 2 },
  macroLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  macroValue: { fontSize: 16, fontWeight: '700' },
  macroUnit: { fontSize: 11 },
  macroGoal: { color: Colors.textMuted, fontSize: 10 },
  macroBarBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },

  setupCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: 'rgba(230,57,70,0.06)', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)', padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  setupTitle: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  setupSub: { color: Colors.primary, fontSize: 12, marginTop: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, paddingVertical: 13,
    marginBottom: Spacing.md,
  },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  section: { marginBottom: Spacing.lg },
  sectionTitle: { ...Typography.h3, fontSize: 15, marginBottom: Spacing.sm },

  mealCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mealTime: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  mealName: { color: Colors.textPrimary, fontWeight: '700', fontSize: 15 },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealCal: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  mealMacros: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealMacroText: { color: Colors.textSecondary, fontSize: 12 },
  mealMacroDivider: { color: Colors.textMuted },
  mealItems: { gap: 2 },
  mealItem: { color: Colors.textMuted, fontSize: 12 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: Spacing.sm },
  emptyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40,
    borderWidth: 1, borderColor: Colors.border,
    maxHeight: '92%',
    flexShrink: 1,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { ...Typography.h3, fontSize: 18 },

  foodInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 15,
    padding: Spacing.md, textAlignVertical: 'top',
    minHeight: 80, marginBottom: Spacing.md,
  },
  parseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: '#4285F4',
    borderRadius: BorderRadius.md, paddingVertical: 12, marginBottom: Spacing.md,
  },
  parseBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  parsedResult: { gap: Spacing.sm },
  parsedTotals: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  parsedItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  parsedItemName: { flex: 1, color: Colors.textPrimary, fontSize: 13 },
  parsedItemQty: { color: Colors.textMuted, fontSize: 12, marginHorizontal: 8 },
  parsedItemCal: { color: Colors.primary, fontSize: 13, fontWeight: '600', minWidth: 60, textAlign: 'right' },

  mealNameInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 14,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.sm,
  },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  goalsHint: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: Spacing.md },
  modeLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  modeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  modeBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  modeBtnSub: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },

  goalsPreview: {
    backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md,
    padding: Spacing.md, gap: 8, marginBottom: Spacing.sm,
  },
  goalsPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalsPreviewLabel: { color: Colors.textSecondary, fontSize: 14 },
  goalsPreviewVal: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },

  libraryEmpty: { alignItems: 'center', paddingVertical: 32, gap: Spacing.sm },
  libraryItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  libraryName: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  libraryMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  libraryRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  pillStat: {
    borderRadius: BorderRadius.sm, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center',
  },
  pillStatVal: { fontSize: 15, fontWeight: '700' },
  pillStatLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },

  // Weekly chart
  weekChart: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, paddingBottom: 6, marginBottom: Spacing.md,
  },
  weekChartCol: { flex: 1, alignItems: 'center', gap: 3 },
  weekChartCal: { fontSize: 9, color: Colors.textMuted },
  weekChartBarBg: {
    width: '70%', backgroundColor: Colors.border, borderRadius: 3,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  weekChartBarFill: { width: '100%', borderRadius: 3 },
  weekChartDay: { fontSize: 11, color: Colors.textMuted },
  weekChartDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary,
  },

  // Nutritionist modal
  nutModal: {
    flex: 1, backgroundColor: Colors.background,
    marginTop: 60, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  nutHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  nutHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  nutHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  nutTitle: { ...Typography.h3, fontSize: 16, color: Colors.textPrimary },
  nutList: { flex: 1 },
  nutEmpty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: Spacing.sm },
  nutEmptyText: { ...Typography.h3, color: Colors.textSecondary, fontSize: 15 },
  nutEmptyHint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: Spacing.lg },
  nutBubble: {
    maxWidth: '85%', borderRadius: BorderRadius.lg, padding: Spacing.sm,
  },
  nutBubbleUser: {
    alignSelf: 'flex-end', backgroundColor: Colors.primary,
  },
  nutBubbleAI: {
    alignSelf: 'flex-start', backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  nutBubbleText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  nutInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  nutInput: {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
    paddingVertical: 10, color: Colors.textPrimary, fontSize: 14, maxHeight: 100,
  },
  nutSendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
