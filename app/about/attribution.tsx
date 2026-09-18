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

const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const SOURCE_URL = 'https://github.com/bryllim/workout-guide';
const BASE_URL = 'https://github.com/everkinetic/data';
const AUTHOR_URL = 'https://bryllim.com';
const OFF_URL = 'https://world.openfoodfacts.org';
const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';

const CHANGES = [
  'PNG 512×512 перетворено у WebP 256 px, щоб не роздувати розмір застосунку',
  'залишено лише кадри вправ, які є в бібліотеці «Гарт»',
  'файли перейменовано за схемою «слаг-номер кадру»',
];

export default function AttributionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const exercises = Object.keys(EXERCISE_IMAGES).length;
  const frames = Object.values(EXERCISE_IMAGES).reduce((s, f) => s + f.length, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Джерела й умови</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Малюнки вправ</Text>
          <Text style={styles.text}>
            {exercises} вправ, {frames} кадрів. Автор графіки — Bryl Lim, проєкт Workout Guide.
            Основа — Everkinetic. Усе під ліцензією CC BY-SA 4.0.
          </Text>

          <Link label="Автор — bryllim.com" url={AUTHOR_URL} />
          <Link label="Джерело — bryllim/workout-guide" url={SOURCE_URL} />
          <Link label="Першоджерело — everkinetic/data" url={BASE_URL} />
          <Link label="Ліцензія CC BY-SA 4.0" url={LICENSE_URL} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Що ми змінили</Text>
          {CHANGES.map((c) => (
            <View key={c} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.text}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Дані про продукти</Text>
          <Text style={styles.text}>
            Пошук за штрихкодом бере дані з Open Food Facts — відкритої бази,
            яку наповнюють люди з усього світу. База поширюється за ліцензією
            ODbL: нею можна користуватись, зазначивши джерело.
          </Text>
          <Link label="Open Food Facts" url={OFF_URL} />
          <Link label="Ліцензія ODbL 1.0" url={ODBL_URL} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Це не медична порада</Text>
          <Text style={styles.text}>
            Додаток рахує й підказує, але не знає твого здоров'я. Поради AI-тренера,
            схеми підходів і оцінки калорій — орієнтир, а не призначення лікаря.
            Гострий чи тривалий біль, хронічні хвороби, вагітність, відновлення після
            травми — це привід спершу поговорити з лікарем, а не з додатком.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Умови поширення</Text>
          <Text style={styles.text}>
            Ліцензія вимагає, щоб похідні роботи поширювались на тих самих умовах,
            тож наші перероблені зображення теж під CC BY-SA 4.0. Повний перелік —
            у файлі assets/exercises/ATTRIBUTION.md у репозиторії додатку.
          </Text>
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
