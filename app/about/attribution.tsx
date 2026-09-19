// Джерела ілюстрацій (ТЗ F6.4).
//
// CC BY-SA 4.0 вимагає назвати автора, ліцензію, джерело й перелічити зміни —
// і поширювати похідні на тих самих умовах. Екран існує саме для цього, тому
// текст тут навмисно повний, а не «і т. д.».

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { EXERCISE_IMAGES } from '../../services/exerciseImages';
import { useLocale } from '../../services/i18n';

const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const SOURCE_URL = 'https://github.com/bryllim/workout-guide';
const BASE_URL = 'https://github.com/everkinetic/data';
const AUTHOR_URL = 'https://bryllim.com';
const OFF_URL = 'https://world.openfoodfacts.org';
const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';

const CHANGE_KEYS = ['attrChange1', 'attrChange2', 'attrChange3'];

export default function AttributionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();

  const exercises = Object.keys(EXERCISE_IMAGES).length;
  const frames = Object.values(EXERCISE_IMAGES).reduce((s, f) => s + f.length, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('attributionTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('attrImagesTitle')}</Text>
          <Text style={styles.text}>{t('attrImagesText', exercises, frames)}</Text>

          <Link label={t('attrAuthorLink')} url={AUTHOR_URL} />
          <Link label={t('attrSourceLink')} url={SOURCE_URL} />
          <Link label={t('attrBaseLink')} url={BASE_URL} />
          <Link label={t('attrLicenseLink')} url={LICENSE_URL} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('attrChangesTitle')}</Text>
          {CHANGE_KEYS.map((k) => (
            <View key={k} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.text}>{t(k)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('attrFoodTitle')}</Text>
          <Text style={styles.text}>{t('attrFoodText')}</Text>
          <Link label="Open Food Facts" url={OFF_URL} />
          <Link label={t('attrOdblLink')} url={ODBL_URL} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('attrMedicalTitle')}</Text>
          <Text style={styles.text}>{t('attrMedicalText')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('attrShareTitle')}</Text>
          <Text style={styles.text}>{t('attrShareText')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Link({ label, url }: { label: string; url: string }) {
  return (
    <TouchableOpacity style={styles.link} onPress={() => Linking.openURL(url)}>
      <Ionicons name="open-outline" size={15} color={Colors.primary} />
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
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
  content: { padding: Spacing.md, gap: Spacing.md },
  card: {
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, gap: Spacing.sm,
  },
  cardTitle: { ...Typography.h3, fontSize: 16 },
  text: { ...Typography.bodySmall, flex: 1, lineHeight: 19 },
  bullet: { flexDirection: 'row', gap: Spacing.sm },
  bulletDot: { ...Typography.bodySmall, color: Colors.textMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  linkText: { ...Typography.bodySmall, color: Colors.primary },
});
