// Екран «Розпізнавання вправ» (ТЗ F2.6–F2.7).
//
// Тут користувач каже додатку, що саме він мав на увазі під «присіданнями» чи
// «мази гирею». Записи при цьому не переписуються — зберігається лише зв'язок
// назва → вправа, тож будь-яку прив'язку можна зняти без втрат.

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import LibraryPicker from '../../components/LibraryPicker';
import { getWorkouts } from '../../services/storage';
import { exportBackup } from '../../services/backup';
import {
  UnresolvedName, addCustomExercise, countByName, describeLinks, getLinks,
  linkName, loadCustomExercises, unlinkName,
} from '../../services/exerciseLinks';
import { MatchResult, matchName } from '../../services/exerciseMatch';
import { LibraryExercise, getExercise } from '../../services/library';

interface Row extends UnresolvedName {
  key: string;
  match: MatchResult;
  suggestion?: LibraryExercise;
}

const CONFIDENCE_HINT: Record<string, string> = {
  ambiguous: 'кілька варіантів',
  fuzzy: 'схоже на',
  none: 'не впізнали',
};

export default function UnresolvedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Map<string, UnresolvedName>>(new Map());
  const [resolvedCount, setResolvedCount] = useState(0);
  const [picking, setPicking] = useState<Row | null>(null);
  const [backupOffered, setBackupOffered] = useState(false);
  const [tab, setTab] = useState<'todo' | 'links'>('todo');

  const load = useCallback(async () => {
    await loadCustomExercises();
    const [workouts, savedLinks] = await Promise.all([getWorkouts(), getLinks()]);
    const byName = countByName(workouts);

    const todo: Row[] = [];
    let auto = 0;
    for (const [key, info] of byName) {
      const match = matchName(key, savedLinks);
      if (match.confidence === 'link' || match.confidence === 'exact' || match.confidence === 'alias') {
        auto++;
        continue;
      }
      todo.push({
        ...info,
        key,
        match,
        suggestion: match.candidates[0] ? getExercise(match.candidates[0]) : undefined,
      });
    }
    todo.sort((a, b) => b.records - a.records);

    setCounts(byName);
    setLinks(savedLinks);
    setRows(todo);
    setResolvedCount(auto);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const linkRows = useMemo(() => describeLinks(links, counts), [links, counts]);

  /** Перед першою прив'язкою пропонуємо зберегти копію: зміна зачіпає всю історію. */
  async function offerBackupOnce(): Promise<void> {
    if (backupOffered || Object.keys(links).length > 0) return;
    setBackupOffered(true);
    await new Promise<void>((resolve) => {
      Alert.alert(
        'Спершу резервна копія?',
        'Прив’язка змінює те, як рахується прогрес і калорії по всій історії. '
        + 'Записи лишаються цілі, але копію краще мати.',
        [
          { text: 'Пропустити', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Зберегти копію',
            onPress: async () => {
              try { await exportBackup(); } catch { /* користувач скасував — не заважаємо */ }
              resolve();
            },
          },
        ],
      );
    });
  }

  async function apply(row: Row, ex: LibraryExercise) {
    await offerBackupOnce();
    Alert.alert(
      'Прив’язати назву?',
      `«${row.name}» → ${ex.nameUk}\n\nВплине на ${row.records} ${plural(row.records)}. `
      + 'Назву в записах не змінюємо — це можна відв’язати будь-коли.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Прив’язати',
          onPress: async () => {
            await linkName(row.key, ex.id);
            await load();
          },
        },
      ],
    );
  }

  async function createCustom(row: Row, query: string) {
    const name = (query || row.name).trim();
    Alert.alert(
      'Моя власна вправа',
      `Створити «${name}» як власну вправу й прив’язати до неї ${row.records} ${plural(row.records)}?`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Створити',
          onPress: async () => {
            await offerBackupOnce();
            const custom = await addCustomExercise(name);
            await linkName(row.key, custom.id);
            await load();
          },
        },
      ],
    );
  }

  async function removeLink(key: string, name: string) {
    Alert.alert('Відв’язати?', `«${name}» знову стане нерозпізнаною назвою.`, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Відв’язати',
        style: 'destructive',
        onPress: async () => { await unlinkName(key); await load(); },
      },
    ]);
  }

  const total = resolvedCount + rows.length;
  const pct = total > 0 ? Math.round((resolvedCount / total) * 100) : 100;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Розпізнавання вправ</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'todo' && styles.tabActive]}
          onPress={() => setTab('todo')}
        >
          <Text style={[styles.tabText, tab === 'todo' && styles.tabTextActive]}>
            Нерозпізнані {rows.length > 0 ? `(${rows.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'links' && styles.tabActive]}
          onPress={() => setTab('links')}
        >
          <Text style={[styles.tabText, tab === 'links' && styles.tabTextActive]}>
            Зв’язки {linkRows.length > 0 ? `(${linkRows.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tab === 'todo' && (
            <>
              <View style={styles.summary}>
                <Text style={styles.summaryValue}>{pct}%</Text>
                <Text style={styles.summaryText}>
                  назв впізнано автоматично ({resolvedCount} з {total}).
                  {rows.length > 0 ? ' Решту підкажи сам — це разова робота.' : ' Усе розібрано.'}
                </Text>
              </View>

              {rows.map((row) => (
                <View key={row.key} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{row.name}</Text>
                    <Text style={styles.cardCount}>{row.records} {plural(row.records)}</Text>
                  </View>
                  <Text style={styles.cardHint}>
                    {CONFIDENCE_HINT[row.match.confidence] ?? row.match.confidence}
                    {row.suggestion ? `: ${row.suggestion.nameUk}` : ''}
                  </Text>

                  {row.match.confidence === 'ambiguous' ? (
                    <View style={styles.choices}>
                      {row.match.candidates.map((id) => {
                        const ex = getExercise(id);
                        if (!ex) return null;
                        return (
                          <TouchableOpacity key={id} style={styles.choice} onPress={() => apply(row, ex)}>
                            <Text style={styles.choiceText}>{ex.nameUk}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : row.suggestion ? (
                    <TouchableOpacity
                      style={[styles.choice, styles.choicePrimary]}
                      onPress={() => apply(row, row.suggestion!)}
                    >
                      <Ionicons name="checkmark" size={16} color={Colors.primary} />
                      <Text style={[styles.choiceText, styles.choiceTextPrimary]}>
                        Це воно: {row.suggestion.nameUk}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={styles.secondary} onPress={() => setPicking(row)}>
                    <Ionicons name="search" size={15} color={Colors.textSecondary} />
                    <Text style={styles.secondaryText}>Обрати іншу</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {rows.length === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
                  <Text style={styles.emptyText}>Усі назви розпізнано</Text>
                </View>
              )}
            </>
          )}

          {tab === 'links' && (
            <>
              {linkRows.map((l) => (
                <View key={l.key} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{l.name}</Text>
                    <Text style={styles.cardCount}>{l.records} {plural(l.records)}</Text>
                  </View>
                  <Text style={[styles.cardHint, l.orphan && { color: Colors.warning }]}>
                    {l.orphan ? 'вправи більше немає — зв’язок не діє' : `→ ${l.target?.nameUk}`}
                  </Text>
                  <TouchableOpacity style={styles.secondary} onPress={() => removeLink(l.key, l.name)}>
                    <Ionicons name="unlink-outline" size={15} color={Colors.textSecondary} />
                    <Text style={styles.secondaryText}>Відв’язати</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {linkRows.length === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="link-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>Ще нічого не прив’язано</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <LibraryPicker
        visible={picking !== null}
        title={picking ? `«${picking.name}» — це…` : ''}
        onClose={() => setPicking(null)}
        onSelect={(ex) => { const row = picking; setPicking(null); if (row) apply(row, ex); }}
        footerAction={{
          label: 'Моя власна вправа',
          onPress: (query) => { const row = picking; setPicking(null); if (row) createCustom(row, query); },
        }}
      />
    </View>
  );
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'запис';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'записи';
  return 'записів';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  tabs: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}18` },
  tabText: { ...Typography.bodySmall },
  tabTextActive: { color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  summaryValue: { ...Typography.h2, color: Colors.success },
  summaryText: { ...Typography.bodySmall, flex: 1 },
  card: {
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, gap: Spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardName: { ...Typography.body, flex: 1 },
  cardCount: { ...Typography.bodySmall, color: Colors.textMuted },
  cardHint: { ...Typography.bodySmall, color: Colors.textMuted },
  choices: { gap: Spacing.sm },
  choice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
  },
  choicePrimary: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}14` },
  choiceText: { ...Typography.bodySmall, color: Colors.textSecondary },
  choiceTextPrimary: { color: Colors.primary },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 2 },
  secondaryText: { ...Typography.bodySmall, color: Colors.textSecondary },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyText: { ...Typography.body, color: Colors.textMuted },
});
