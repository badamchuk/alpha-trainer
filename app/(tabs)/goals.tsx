import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getGoals, addGoal, updateGoal, deleteGoal } from '../../services/storage';
import { Goal } from '../../types';
import DatePickerField from '../../components/DatePickerField';

const GOAL_TYPES = [
  { id: 'strength', label: 'Сила', icon: 'barbell-outline', color: '#E63946' },
  { id: 'endurance', label: 'Витривалість', icon: 'bicycle-outline', color: '#2EC4B6' },
  { id: 'weight_loss', label: 'Схуднення', icon: 'trending-down-outline', color: '#F4A261' },
  { id: 'muscle_gain', label: 'М\'язова маса', icon: 'fitness-outline', color: '#9B59B6' },
  { id: 'flexibility', label: 'Гнучкість', icon: 'body-outline', color: '#3498DB' },
  { id: 'custom', label: 'Власна', icon: 'star-outline', color: '#95A5A6' },
];

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState({
    title: '', type: 'strength' as Goal['type'],
    target: '', deadline: '', currentValue: '',
  });

  useFocusEffect(useCallback(() => { loadGoals(); }, []));

  async function loadGoals() {
    setGoals(await getGoals());
  }

  function openNew() {
    setEditGoal(null);
    setForm({ title: '', type: 'strength', target: '', deadline: '', currentValue: '' });
    setModalVisible(true);
  }

  function openEdit(goal: Goal) {
    setEditGoal(goal);
    setForm({
      title: goal.title,
      type: goal.type,
      target: goal.target,
      deadline: goal.deadline || '',
      currentValue: goal.currentValue || '',
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.target.trim()) {
      Alert.alert('Заповни назву та ціль');
      return;
    }
    if (editGoal) {
      await updateGoal({
        ...editGoal,
        title: form.title.trim(),
        type: form.type,
        target: form.target.trim(),
        deadline: form.deadline || undefined,
        currentValue: form.currentValue || undefined,
      });
    } else {
      await addGoal({
        id: Date.now().toString(),
        title: form.title.trim(),
        type: form.type,
        target: form.target.trim(),
        deadline: form.deadline || undefined,
        currentValue: form.currentValue || undefined,
        createdAt: new Date().toISOString(),
        completed: false,
      });
    }
    setModalVisible(false);
    await loadGoals();
  }

  async function handleToggle(goal: Goal) {
    await updateGoal({ ...goal, completed: !goal.completed });
    await loadGoals();
  }

  async function handleDelete(id: string) {
    Alert.alert('Видалити ціль?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: async () => { await deleteGoal(id); await loadGoals(); } },
    ]);
  }

  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Мої цілі</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={[...active, ...completed]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={goals.length === 0 ? styles.emptyContainer : styles.listContent}
        ListHeaderComponent={goals.length > 0 && completed.length > 0 ? (
          <>
            {active.length > 0 && <Text style={styles.groupLabel}>Активні ({active.length})</Text>}
          </>
        ) : null}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="flag-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Немає цілей</Text>
            <Text style={styles.emptyText}>Поставь свою першу ціль — і AI-тренер допоможе її досягти</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
              <Text style={styles.emptyBtnText}>Додати ціль</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item, index }) => {
          const showDivider = index === active.length && completed.length > 0 && active.length > 0;
          return (
            <>
              {showDivider && <Text style={[styles.groupLabel, { marginTop: Spacing.md }]}>Завершені ({completed.length})</Text>}
              <GoalCard
                goal={item}
                onEdit={() => openEdit(item)}
                onToggle={() => handleToggle(item)}
                onDelete={() => handleDelete(item.id)}
              />
            </>
          );
        }}
      />

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtn}>Скасувати</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editGoal ? 'Редагувати ціль' : 'Нова ціль'}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.saveBtn}>Зберегти</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Назва цілі</Text>
            <TextInput
              style={styles.textInput}
              placeholder="наприклад: 20 підтягувань"
              placeholderTextColor={Colors.textMuted}
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
            />

            <Text style={styles.fieldLabel}>Тип</Text>
            <View style={styles.typeGrid}>
              {GOAL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeBtn, form.type === t.id && { backgroundColor: t.color + '20', borderColor: t.color + '60' }]}
                  onPress={() => setForm((f) => ({ ...f, type: t.id as Goal['type'] }))}
                >
                  <Ionicons name={t.icon as any} size={20} color={form.type === t.id ? t.color : Colors.textMuted} />
                  <Text style={[styles.typeBtnText, form.type === t.id && { color: t.color }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Ціль (що хочеш досягти)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="наприклад: Підтягуватися 20 разів без зупинки"
              placeholderTextColor={Colors.textMuted}
              value={form.target}
              onChangeText={(t) => setForm((f) => ({ ...f, target: t }))}
              multiline
            />

            <Text style={styles.fieldLabel}>Поточний стан (необов'язково)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="наприклад: зараз 8 разів"
              placeholderTextColor={Colors.textMuted}
              value={form.currentValue}
              onChangeText={(t) => setForm((f) => ({ ...f, currentValue: t }))}
            />

            <DatePickerField
              label="Дедлайн (необов'язково)"
              value={form.deadline}
              onChange={(d) => setForm((f) => ({ ...f, deadline: d }))}
              minimumDate={new Date()}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function GoalCard({ goal, onEdit, onToggle, onDelete }: {
  goal: Goal; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const typeInfo = GOAL_TYPES.find((t) => t.id === goal.type) || GOAL_TYPES[5];

  return (
    <TouchableOpacity
      style={[styles.card, goal.completed && styles.cardCompleted]}
      onPress={onEdit}
      onLongPress={onDelete}
      activeOpacity={0.8}
    >
      <View style={[styles.cardIcon, { backgroundColor: typeInfo.color + '15' }]}>
        <Ionicons name={typeInfo.icon as any} size={22} color={goal.completed ? Colors.textMuted : typeInfo.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, goal.completed && styles.textCompleted]}>{goal.title}</Text>
        <Text style={styles.cardTarget} numberOfLines={2}>{goal.target}</Text>
        {goal.currentValue && (
          <Text style={styles.cardCurrent}>Зараз: {goal.currentValue}</Text>
        )}
        {goal.deadline && (
          <View style={styles.deadlineRow}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.deadlineText}>{goal.deadline}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={onToggle} style={styles.checkBtn}>
        <Ionicons
          name={goal.completed ? 'checkmark-circle' : 'ellipse-outline'}
          size={26}
          color={goal.completed ? Colors.success : Colors.textMuted}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { ...Typography.h2 },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  listContent: { padding: Spacing.md, gap: Spacing.sm },
  emptyContainer: { flex: 1 },
  groupLabel: { ...Typography.label, marginBottom: Spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.sm },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary },
  emptyText: { ...Typography.bodySmall, textAlign: 'center', maxWidth: 260 },
  emptyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginTop: Spacing.md,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  cardCompleted: { opacity: 0.6 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { ...Typography.body, fontWeight: '600', marginBottom: 3 },
  textCompleted: { textDecorationLine: 'line-through', color: Colors.textMuted },
  cardTarget: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardCurrent: { color: Colors.success, fontSize: 12, marginTop: 3, fontWeight: '500' },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  deadlineText: { color: Colors.textMuted, fontSize: 12 },
  checkBtn: { padding: 4 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.h3 },
  cancelBtn: { color: Colors.textSecondary, fontSize: 16 },
  saveBtn: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  modalContent: { padding: Spacing.md },
  fieldLabel: { ...Typography.label, marginBottom: Spacing.xs, marginTop: Spacing.md },
  textInput: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.textPrimary, fontSize: 15, minHeight: 48,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, minWidth: 100,
  },
  typeBtnText: { color: Colors.textMuted, fontSize: 13 },
});
