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
import { LibraryExercise, exerciseName, getExercise } from '../../services/library';
import { useLocale } from '../../services/i18n';

interface Row extends UnresolvedName {
  key: string;
  match: MatchResult;
  suggestion?: LibraryExercise;
}

const CONFIDENCE_KEY: Record<string, string> = {
  ambiguous: 'confidenceAmbiguous',
  fuzzy: 'confidenceFuzzy',
  none: 'confidenceNone',
};

export default function UnresolvedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const { t } = useLocale();
  /** «3 записи» — множина різна в мовах, тому лежить у словнику. */
  const records = (n: number) => `${n} ${t('recordsPlural', n)}`;
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
        t('backupFirstTitle'),
        t('backupFirstText'),
        [
          { text: t('skipBtn'), style: 'cancel', onPress: () => resolve() },
          {
            text: t('saveBackupBtn'),
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
      t('linkNameTitle'),
      t('linkNameText', row.name, exerciseName(ex), records(row.records)),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('linkBtn'),
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
      t('myOwnExercise'),
      t('createCustomText', name, records(row.records)),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('createBtn'),
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
    Alert.alert(t('unlinkTitle'), t('unlinkText', name), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unlinkBtn'),
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
        <Text style={styles.headerTitle}>{t('unresolvedTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'todo' && styles.tabActive]}
          onPress={() => setTab('todo')}
        >
          <Text style={[styles.tabText, tab === 'todo' && styles.tabTextActive]}>
            {t('unresolvedTab')} {rows.length > 0 ? `(${rows.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'links' && styles.tabActive]}
          onPress={() => setTab('links')}
        >
          <Text style={[styles.tabText, tab === 'links' && styles.tabTextActive]}>
            {t('linksTab')} {linkRows.length > 0 ? `(${linkRows.length})` : ''}
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
                  {t('recognizedSummary', resolvedCount, total)}
                  {t(rows.length > 0 ? 'recognizedRest' : 'recognizedAllDone')}
                </Text>
              </View>

              {rows.map((row) => (
                <View key={row.key} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardName}>{row.name}</Text>
                    <Text style={styles.cardCount}>{records(row.records)}</Text>
                  </View>
                  <Text style={styles.cardHint}>
                    {t(CONFIDENCE_KEY[row.match.confidence] ?? row.match.confidence)}
                    {row.suggestion ? `: ${exerciseName(row.suggestion)}` : ''}
                  </Text>

                  {row.match.confidence === 'ambiguous' ? (
                    <View style={styles.choices}>
                      {row.match.candidates.map((id) => {
                        const ex = getExercise(id);
                        if (!ex) return null;
                        return (
                          <TouchableOpacity key={id} style={styles.choice} onPress={() => apply(row, ex)}>
                            <Text style={styles.choiceText}>{exerciseName(ex)}</Text>
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
                        {t('thatsIt', exerciseName(row.suggestion))}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={styles.secondary} onPress={() => setPicking(row)}>
                    <Ionicons name="search" size={15} color={Colors.textSecondary} />
                    <Text style={styles.secondaryText}>{t('pickAnother')}</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {rows.length === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
                  <Text style={styles.emptyText}>{t('allNamesResolved')}</Text>
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
                    <Text style={styles.cardCount}>{records(l.records)}</Text>
                  </View>
                  <Text style={[styles.cardHint, l.orphan && { color: Colors.warning }]}>
                    {l.orphan ? t('linkOrphan') : `→ ${l.target ? exerciseName(l.target) : ''}`}
                  </Text>
                  <TouchableOpacity style={styles.secondary} onPress={() => removeLink(l.key, l.name)}>
                    <Ionicons name="unlink-outline" size={15} color={Colors.textSecondary} />
                    <Text style={styles.secondaryText}>{t('unlinkBtn')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {linkRows.length === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="link-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>{t('nothingLinkedYet')}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <LibraryPicker
        visible={picking !== null}
        title={picking ? t('whatIsThis', picking.name) : ''}
        onClose={() => setPicking(null)}
        onSelect={(ex) => { const row = picking; setPicking(null); if (row) apply(row, ex); }}
        footerAction={{
          label: t('myOwnExercise'),
          onPress: (query) => { const row = picking; setPicking(null); if (row) createCustom(row, query); },
        }}
      />
    </View>
  );
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
