// Екран замість білого нічого, коли щось таки впало.
//
// Без цього збій у React-дереві гасить увесь інтерфейс: людина бачить порожній
// екран і не має що розповісти, крім «не працює». Тут вона бачить, що саме
// сталося, може надіслати звіт — і, головне, повернутись у додаток, бо дані
// нікуди не поділись: вони в сховищі, а не в зламаному екрані.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { translate } from '../services/i18n';

/** Останній збій лежить у сховищі: звіт можна надіслати й пізніше, з профілю. */
export const LAST_CRASH_KEY = '@alpha_trainer:last_crash';

export interface CrashRecord {
  at: string;
  message: string;
  stack?: string;
  componentStack?: string;
  version?: string;
}

interface Props {
  children: React.ReactNode;
  /** Версія збірки — без неї звіт майже нічого не вартий. */
  version?: string;
}

interface State {
  crash: CrashRecord | null;
}

export function crashReportText(c: CrashRecord): string {
  return [
    `Гарт ${c.version ?? '?'} — збій ${c.at}`,
    '',
    c.message,
    c.stack ?? '',
    c.componentStack ? `\nДе саме:${c.componentStack}` : '',
  ].join('\n').slice(0, 4000);
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { crash: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      crash: {
        at: new Date().toISOString(),
        message: String(error?.message ?? error),
        stack: error?.stack,
      },
    };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    const crash: CrashRecord = {
      at: new Date().toISOString(),
      message: String(error?.message ?? error),
      stack: error?.stack,
      componentStack: info?.componentStack,
      version: this.props.version,
    };
    this.setState({ crash });
    // Записуємо мовчки: якщо і це впаде, екран збою має лишитись на місці.
    AsyncStorage.setItem(LAST_CRASH_KEY, JSON.stringify(crash)).catch(() => {});
  }

  render() {
    const { crash } = this.state;
    if (!crash) return this.props.children;

    const report = crashReportText({ ...crash, version: this.props.version });
    return (
      <View style={styles.container}>
        <Ionicons name="warning-outline" size={48} color={Colors.warning} />
        <Text style={styles.title}>{translate('crashTitle')}</Text>
        <Text style={styles.text}>{translate('crashText')}</Text>

        <ScrollView style={styles.box} contentContainerStyle={{ padding: Spacing.sm }}>
          <Text style={styles.mono}>{report}</Text>
        </ScrollView>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => Share.share({ message: report }).catch(() => {})}
        >
          <Ionicons name="share-outline" size={18} color="#FFF" />
          <Text style={styles.primaryText}>{translate('crashSend')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => this.setState({ crash: null })}>
          <Text style={styles.secondaryText}>{translate('crashBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background,
    padding: Spacing.lg, paddingTop: Spacing.xxl, gap: Spacing.md, alignItems: 'center',
  },
  title: { ...Typography.h2, textAlign: 'center' },
  text: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  box: {
    alignSelf: 'stretch', maxHeight: 220,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
  },
  mono: { ...Typography.bodySmall, fontSize: 11, color: Colors.textSecondary },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md, alignSelf: 'stretch', justifyContent: 'center',
  },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { paddingVertical: Spacing.sm },
  secondaryText: { ...Typography.body, color: Colors.textSecondary },
});
